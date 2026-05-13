import {
  Before,
  After,
  AfterStep,
  BeforeAll,
  AfterAll,
  setWorldConstructor,
  setDefaultTimeout,
} from '@cucumber/cucumber';
import { request } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path   from 'path';
import { CustomWorld } from '../types/world';
import { loadAppConfig } from '../config/configLoader';
import { logger } from '../utils/logger';
import { extractBearerToken } from '../utils/tokenExtractor';

// Load .env so LOG_LEVEL and other vars are set before any logger call.
// override:true ensures .env values win over stale shell environment variables.
dotenv.config({ path: path.join(__dirname, '../../.env'), override: true });

// Register our custom World so every step has access to typed `this`
setWorldConstructor(CustomWorld);

// Browser login can take 30-60s — raise the global hook/step timeout accordingly
setDefaultTimeout(120_000);

// ─── Keyword resolver ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveKeyword(pickleStep: any, gherkinDocument: any): string {
  const astNodeId: string | undefined = pickleStep?.astNodeIds?.[0];
  if (!astNodeId) return '';
  for (const child of gherkinDocument?.feature?.children ?? []) {
    const stepSets: any[][] = [
      child.scenario?.steps   ?? [],
      child.background?.steps ?? [],
      ...(child.rule?.children ?? []).flatMap((rc: any) => [
        rc.scenario?.steps   ?? [],
        rc.background?.steps ?? [],
      ]),
    ];
    for (const steps of stepSets) {
      for (const step of steps) {
        if (step.id === astNodeId) return String(step.keyword).trim();
      }
    }
  }
  return '';
}

// ─── Suite hooks ──────────────────────────────────────────────────────────────

BeforeAll({ timeout: 120_000 }, async function () {
  logger.info('[HOOKS] ▶  Test suite starting');

  // If SESSION_AUTH is configured, perform a headless browser login to extract
  // the id_token cookie — exactly as the existing WebdriverIO framework does.
  // The token is cached for the entire run and injected via CLIENT_API_TOKEN.
  if (process.env.SESSION_AUTH) {
    logger.info('[HOOKS] SESSION_AUTH detected — extracting Bearer token via browser login');
    process.env.CLIENT_API_TOKEN = await extractBearerToken();
    logger.info('[HOOKS] Bearer token ready — all API requests will be authenticated');
  }
});

AfterAll(async function () {
  logger.info('[HOOKS] ■  Test suite complete');
});

// ─── Scenario hooks ───────────────────────────────────────────────────────────

// Print scenario header before each scenario
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Before(async function (this: CustomWorld, params: any) {
  const name     = (params as any).pickle.name as string;
  const useColor = process.stdout.isTTY ?? false;
  const bold     = useColor ? '\x1b[1m'  : '';
  const cyan     = useColor ? '\x1b[36m' : '';
  const reset    = useColor ? '\x1b[0m'  : '';
  process.stdout.write(`\n${bold}${cyan}  Scenario: ${name}${reset}\n`);
});

// Set up Playwright API request context
Before(async function (this: CustomWorld) {
  const config = loadAppConfig(this.appName);
  this.request = await request.newContext({
    baseURL: config.baseURL,
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });
  logger.info(`[HOOKS] API context ready → ${config.baseURL} (app: ${this.appName ?? 'default'})`);
});

// Dispose API context + add blank line separator after scenario
After(async function (this: CustomWorld) {
  process.stdout.write('\n');
  if (this.request) {
    await this.request.dispose();
  }
});

// ─── Step result output ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
AfterStep(async function (this: CustomWorld, params: any) {
  const { pickleStep, gherkinDocument, result } = params as any;
  const keyword = resolveKeyword(pickleStep, gherkinDocument);
  const text    = String(pickleStep.text);
  const status  = String(result.status);

  const useColor = process.stdout.isTTY ?? false;
  const green    = useColor ? '\x1b[32m' : '';
  const red      = useColor ? '\x1b[31m' : '';
  const yellow   = useColor ? '\x1b[33m' : '';
  const reset    = useColor ? '\x1b[0m'  : '';

  let icon: string;
  let color: string;
  if (status === 'PASSED') {
    icon = '✅'; color = green;
  } else if (status === 'SKIPPED' || status === 'PENDING') {
    icon = '⏭ '; color = yellow;
  } else {
    icon = '❌'; color = red;
  }

  const kw = keyword ? `${keyword} ` : '';
  process.stdout.write(`    ${color}${icon}  ${kw}${text}${reset}\n`);

  // Print first 3 lines of the error message for failed steps
  if (['FAILED', 'UNDEFINED', 'AMBIGUOUS'].includes(status) && result.message) {
    const errLines = String(result.message)
      .split('\n')
      .filter((l: string) => l.trim())
      .slice(0, 3);
    for (const line of errLines) {
      process.stdout.write(`       ${red}${line}${reset}\n`);
    }
  }
});
