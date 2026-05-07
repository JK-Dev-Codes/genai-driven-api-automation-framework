import { Then } from '@cucumber/cucumber';
import { CustomWorld } from '../types/world';
import { deepGet } from '../utils/helpers';
import { logger } from '../utils/logger';

// ─── Status ───────────────────────────────────────────────────────────────────

Then(
  'the response status should be {int}',
  function (this: CustomWorld, expectedStatus: number) {
    const actual = this.response?.status;
    if (actual !== expectedStatus) {
      throw new Error(`Expected HTTP ${expectedStatus} but received ${actual}`);
    }
    logger.info(`[ASSERT] ✅ Status: ${actual}`);
  }
);

// ─── Body field assertions ────────────────────────────────────────────────────

Then(
  'the response should contain {string} as {string}',
  function (this: CustomWorld, field: string, expected: string) {
    const actual = deepGet(this.response?.body, field);
    if (String(actual) !== expected) {
      throw new Error(`Expected "${field}" = "${expected}" but got "${actual}"`);
    }
    logger.info(`[ASSERT] ✅ ${field} = "${actual}"`);
  }
);

Then(
  'the response should contain {string} with value {int}',
  function (this: CustomWorld, field: string, expected: number) {
    const actual = deepGet(this.response?.body, field);
    if (Number(actual) !== expected) {
      throw new Error(`Expected "${field}" = ${expected} but got ${actual}`);
    }
    logger.info(`[ASSERT] ✅ ${field} = ${actual}`);
  }
);

// ─── Body presence ────────────────────────────────────────────────────────────

Then('the response body should not be empty', function (this: CustomWorld) {
  const body = this.response?.body;
  const isEmpty =
    body === null ||
    body === undefined ||
    (typeof body === 'object' && Object.keys(body as object).length === 0);

  if (isEmpty) throw new Error('Response body is empty');
  logger.info('[ASSERT] ✅ Body is not empty');
});

// ─── Array assertions ─────────────────────────────────────────────────────────

Then('the response array should not be empty', function (this: CustomWorld) {
  const body = this.response?.body;
  if (!Array.isArray(body) || body.length === 0) {
    throw new Error('Expected a non-empty array response');
  }
  logger.info(`[ASSERT] ✅ Array has ${body.length} item(s)`);
});

Then(
  'the response array should have {int} items',
  function (this: CustomWorld, expected: number) {
    const body = this.response?.body;
    if (!Array.isArray(body)) {
      throw new Error(`Expected array but got ${typeof body}`);
    }
    if (body.length !== expected) {
      throw new Error(`Expected ${expected} items but got ${body.length}`);
    }
    logger.info(`[ASSERT] ✅ Array length: ${body.length}`);
  }
);

// ─── Performance ──────────────────────────────────────────────────────────────

Then(
  'the response time should be less than {int} milliseconds',
  function (this: CustomWorld, maxMs: number) {
    const duration = this.response?.duration ?? Infinity;
    if (duration >= maxMs) {
      throw new Error(`Response time ${duration}ms exceeded limit of ${maxMs}ms`);
    }
    logger.info(`[ASSERT] ✅ Response time: ${duration}ms < ${maxMs}ms`);
  }
);

// ─── Headers ──────────────────────────────────────────────────────────────────

Then(
  'the response header {string} should be {string}',
  function (this: CustomWorld, header: string, expected: string) {
    const actual = (this.response?.headers ?? {})[header.toLowerCase()];
    if (actual !== expected) {
      throw new Error(`Header "${header}": expected "${expected}" but got "${actual}"`);
    }
    logger.info(`[ASSERT] ✅ Header ${header}: "${actual}"`);
  }
);
