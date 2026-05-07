import {
  Before,
  After,
  BeforeAll,
  AfterAll,
  setWorldConstructor,
} from '@cucumber/cucumber';
import { request } from '@playwright/test';
import { CustomWorld } from '../types/world';
import { loadAppConfig } from '../config/configLoader';
import { logger } from '../utils/logger';

// Register our custom World so every step has access to typed `this`
setWorldConstructor(CustomWorld);

BeforeAll(async function () {
  logger.info('[HOOKS] ▶  Test suite starting');
});

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

After(async function (this: CustomWorld) {
  if (this.request) {
    await this.request.dispose();
  }
});

AfterAll(async function () {
  logger.info('[HOOKS] ■  Test suite complete');
});
