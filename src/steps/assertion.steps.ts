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
    (typeof body === 'string' && body.trim() === '') ||
    (typeof body === 'object' && Object.keys(body as object).length === 0);

  if (isEmpty) throw new Error('Response body is empty');
  logger.info('[ASSERT] ✅ Body is not empty');
});

// ─── Array presence ───────────────────────────────────────────────────────────

Then('the response array should not be empty', function (this: CustomWorld) {
  const body = this.response?.body;
  if (!Array.isArray(body) || body.length === 0) {
    throw new Error('Response body is not a non-empty array');
  }
  logger.info('[ASSERT] ✅ Array is not empty');
});

// ─── Response time ────────────────────────────────────────────────────────────

Then(
  'the response time should be less than {int} milliseconds',
  function (this: CustomWorld, maxMs: number) {
    const actual = this.response?.duration ?? 0;
    if (actual >= maxMs) {
      throw new Error(`Response time ${actual}ms exceeded limit of ${maxMs}ms`);
    }
    logger.info(`[ASSERT] ✅ Response time: ${actual}ms < ${maxMs}ms`);
  }
);

// ─── Response header ──────────────────────────────────────────────────────────

Then(
  'the response header {string} should be {string}',
  function (this: CustomWorld, headerName: string, expectedValue: string) {
    const headers = this.response?.headers as Record<string, string> | undefined;
    const actual = headers?.[headerName.toLowerCase()];
    if (actual !== expectedValue) {
      throw new Error(`Expected header "${headerName}" = "${expectedValue}" but got "${actual}"`);
    }
    logger.info(`[ASSERT] ✅ Header ${headerName} = "${actual}"`);
  }
);

// ─── Array field assertions ───────────────────────────────────────────────────

Then(
  'the response field {string} should contain an item with {string} equal to {string}',
  function (this: CustomWorld, field: string, itemKey: string, expectedValue: string) {
    const arr = deepGet(this.response?.body, field);
    if (!Array.isArray(arr)) {
      throw new Error(`Expected "${field}" to be an array but got ${typeof arr}`);
    }
    const found = arr.some((item: Record<string, unknown>) => String(item[itemKey]) === expectedValue);
    if (!found) {
      throw new Error(`Array "${field}" has no item where "${itemKey}" = "${expectedValue}"`);
    }
    logger.info(`[ASSERT] ✅ "${field}" contains item with ${itemKey} = "${expectedValue}"`);
  }
);

Then(
  'the response field {string} should not be empty',
  function (this: CustomWorld, field: string) {
    const val = deepGet(this.response?.body, field);
    const isEmpty =
      val === null ||
      val === undefined ||
      (typeof val === 'string' && val.trim() === '') ||
      (Array.isArray(val) && val.length === 0) ||
      (typeof val === 'object' && !Array.isArray(val) && Object.keys(val as object).length === 0);
    if (isEmpty) throw new Error(`Field "${field}" is empty`);
    logger.info(`[ASSERT] ✅ "${field}" is not empty`);
  }
);

// Validate multiple comma-separated fields from the last response in one step.
// Usage: Then the response fields "name,description,allianceId" should not be empty
Then(
  'the response fields {string} should not be empty',
  function (this: CustomWorld, fieldList: string) {
    const fields = fieldList.split(',').map((f) => f.trim());
    for (const field of fields) {
      const val = deepGet(this.response?.body, field);
      const isEmpty =
        val === null ||
        val === undefined ||
        (typeof val === 'string' && val.trim() === '') ||
        (Array.isArray(val) && val.length === 0) ||
        (typeof val === 'object' && !Array.isArray(val) && Object.keys(val as object).length === 0);
      if (isEmpty) throw new Error(`Field "${field}" is empty or missing in the response`);
      logger.info(`[ASSERT] ✅ "${field}" is not empty`);
    }
  }
);

// Validate that every item in a response array field has a given key present.
// Usage: Then the response field "leaders" array items should have key "id"
Then(
  'the response field {string} array items should have key {string}',
  function (this: CustomWorld, field: string, key: string) {
    const arr = deepGet(this.response?.body, field);
    if (!Array.isArray(arr) || arr.length === 0) {
      throw new Error(
        `Expected "${field}" to be a non-empty array but got ${Array.isArray(arr) ? 'empty array' : typeof arr}`
      );
    }
    const missing = (arr as Record<string, unknown>[]).filter(
      (item) => item[key] === null || item[key] === undefined
    );
    if (missing.length > 0) {
      throw new Error(`${missing.length} item(s) in "${field}" are missing key "${key}"`);
    }
    logger.info(`[ASSERT] ✅ All ${arr.length} item(s) in "${field}" have key "${key}"`);
  }
);

// ─── DataMap assertions ───────────────────────────────────────────────────────

Then('the map should contain key {string}', function (this: CustomWorld, mapKey: string) {
  const val = this.dataMap.get(mapKey);
  if (!val) throw new Error(`dataMap does not contain key "${mapKey}"`);
  logger.info(`[ASSERT] ✅ dataMap["${mapKey}"] = "${val}"`);
});

Then(
  'the response body should contain the name saved as {string}',
  function (this: CustomWorld, mapKey: string) {
    const savedName = this.dataMap.get(mapKey);
    if (!savedName) throw new Error(`dataMap does not contain key "${mapKey}"`);
    const body = JSON.stringify(this.response?.body ?? '');
    if (!body.includes(savedName)) {
      throw new Error(`Response body does not contain saved name "${savedName}"`);
    }
    logger.info(`[ASSERT] ✅ Response body contains name "${savedName}"`);
  }
);
