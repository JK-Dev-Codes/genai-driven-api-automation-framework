import { chromium, Browser, Page } from '@playwright/test';
import * as dotenv from 'dotenv';
import { logger } from './logger';

dotenv.config();

// Cached token — extracted once per test run, reused across all scenarios
let cachedToken: string | null = null;

/**
 * Generic SSO configuration — every value comes from .env so this module
 * works with ANY application's login page.
 *
 * Required .env variables:
 *   BASE_URL            — The app URL that triggers the SSO redirect
 *   USER_EMAIL          — Login email / username
 *   USER_PASSWORD       — Login password
 *
 * Optional .env variables (sensible defaults for PingFederate / MyID style pages):
 *   SSO_EMAIL_SELECTOR       CSS selector for email input        (default: #login-username)
 *   SSO_NEXT_SELECTOR        CSS selector for the "Next" button  (default: #login-next)
 *   SSO_PASSWORD_SELECTOR    CSS selector for password input     (default: #login-password)
 *   SSO_SUBMIT_SELECTOR      CSS selector for submit button      (default: #login-submit)
 *   SSO_TWO_STEP             "true" = email+Next then password   (default: true)
 *                            "false" = email+password on one page
 *   SSO_TOKEN_COOKIE_NAME    Cookie name that holds the token    (default: id_token)
 *   SSO_SUCCESS_SELECTOR     CSS selector visible after login    (e.g. .dashboard)
 *   SSO_SUCCESS_URL_PATTERN  URL glob to wait for after login    (e.g. '**\/home**')
 */
const SSO = {
  emailSelector:     process.env.SSO_EMAIL_SELECTOR      || '#login-username',
  nextSelector:      process.env.SSO_NEXT_SELECTOR       || '#login-next',
  passwordSelector:  process.env.SSO_PASSWORD_SELECTOR   || '#login-password',
  submitSelector:    process.env.SSO_SUBMIT_SELECTOR     || '#login-submit',
  twoStep:           process.env.SSO_TWO_STEP            !== 'false',   // default: true
  tokenCookieName:   process.env.SSO_TOKEN_COOKIE_NAME   || 'id_token',
  successSelector:   process.env.SSO_SUCCESS_SELECTOR    || '',
  successUrlPattern: process.env.SSO_SUCCESS_URL_PATTERN || '',
};

/**
 * Launches a headless Playwright browser, logs into the configured app via SSO,
 * extracts the token cookie after login, and returns it as a Bearer token.
 *
 * Fully generic — behaviour controlled entirely via .env variables.
 */
export async function extractBearerToken(): Promise<string> {
  if (cachedToken) {
    logger.info('[AUTH] Reusing cached token for this run');
    return cachedToken;
  }

  const email    = process.env.USER_EMAIL;
  const password = process.env.USER_PASSWORD;
  const baseURL  = process.env.BASE_URL;

  if (!email || !password || !baseURL) {
    throw new Error(
      '[AUTH] USER_EMAIL, USER_PASSWORD, and BASE_URL must be set in your .env file'
    );
  }

  logger.info(`[AUTH] Launching browser → ${baseURL}`);

  const browser: Browser = await chromium.launch({ headless: true });
  const page: Page       = await browser.newPage();

  try {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    logger.info(`[AUTH] Page loaded: ${page.url()}`);

    await loginViaSSO(page, email, password);
    await waitForLoginSuccess(page, baseURL);

    logger.info('[AUTH] Login successful — extracting token cookie');

    const cookies      = await page.context().cookies();
    const tokenCookie  = cookies.find((c) => c.name === SSO.tokenCookieName);

    if (!tokenCookie) {
      const names = cookies.map((c) => c.name).join(', ');
      throw new Error(
        `[AUTH] Cookie "${SSO.tokenCookieName}" not found after login.\n` +
        `Available cookies: ${names}\n` +
        `Set SSO_TOKEN_COOKIE_NAME in .env to match the correct cookie name.`
      );
    }

    cachedToken = tokenCookie.value;
    logger.info('[AUTH] Token extracted and cached for this test run');
    return cachedToken;
  } finally {
    await browser.close();
  }
}

/**
 * Fills in SSO login credentials.
 *
 * Two-step flow (SSO_TWO_STEP=true, the default):
 *   1. Fill email → click Next
 *   2. Fill password → click Submit
 *
 * Single-step flow (SSO_TWO_STEP=false):
 *   1. Fill email + password on same page → click Submit
 */
async function loginViaSSO(page: Page, email: string, password: string): Promise<void> {
  logger.info('[AUTH] Filling SSO login form');

  await page.waitForSelector(SSO.emailSelector, { timeout: 20000 });
  await page.fill(SSO.emailSelector, email);

  if (SSO.twoStep) {
    await page.click(SSO.nextSelector);
    await page.waitForSelector(SSO.passwordSelector, { timeout: 20000 });
  }

  await page.fill(SSO.passwordSelector, password);
  await page.click(SSO.submitSelector);

  logger.info('[AUTH] Credentials submitted — waiting for redirect');
}

/**
 * Waits for post-login success state using the first matching strategy:
 *   1. SSO_SUCCESS_SELECTOR     — specific element appears (e.g. .nav-header)
 *   2. SSO_SUCCESS_URL_PATTERN  — URL matches a glob      (e.g. '**\/dashboard**')
 *   3. Default                  — browser returns to the BASE_URL domain
 */
async function waitForLoginSuccess(page: Page, baseURL: string): Promise<void> {
  if (SSO.successSelector) {
    logger.info(`[AUTH] Waiting for element: ${SSO.successSelector}`);
    await page.waitForSelector(SSO.successSelector, { timeout: 60000 });
  } else if (SSO.successUrlPattern) {
    logger.info(`[AUTH] Waiting for URL: ${SSO.successUrlPattern}`);
    await page.waitForURL(SSO.successUrlPattern, { timeout: 60000 });
  } else {
    const appDomain = new URL(baseURL).hostname;
    logger.info(`[AUTH] Waiting for redirect back to: ${appDomain}`);
    // Use waitForURL with a broad pattern — waits until the browser is back on the app domain
    await page.waitForURL(`**${appDomain}**`, { timeout: 60000 });
  }
}

/** Clears the cached token — call this to force re-authentication */
export function clearCachedToken(): void {
  cachedToken = null;
}

