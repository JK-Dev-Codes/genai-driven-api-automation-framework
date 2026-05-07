import { Given } from '@cucumber/cucumber';
import { CustomWorld } from '../types/world';
import { logger } from '../utils/logger';

/**
 * Auth steps set runtime credentials on the World.
 * The apiExecutor reads auth from the app config; these steps override it
 * for scenarios that need per-test credentials.
 */

Given(
  'I am authenticated with bearer token {string}',
  function (this: CustomWorld, token: string) {
    this.authToken = token;
    logger.info('[AUTH] Bearer token configured for this scenario');
  }
);

Given(
  'I am authenticated as {string} with password {string}',
  function (this: CustomWorld, username: string, password: string) {
    // Store as base64 Basic auth header value
    const encoded = Buffer.from(`${username}:${password}`).toString('base64');
    this.authToken = `Basic ${encoded}`;
    logger.info(`[AUTH] Basic auth configured for user: ${username}`);
  }
);
