import * as fs from 'fs';
import * as path from 'path';
import { Given, When } from '@cucumber/cucumber';
import { CustomWorld } from '../types/world';
import { executeAPI } from '../executor/apiExecutor';
import { logger } from '../utils/logger';

const DATA_DIR = path.join(__dirname, '../../src/data');

// ─── Configuration ────────────────────────────────────────────────────────────

Given('the API base URL is configured', async function (this: CustomWorld) {
  logger.info('[STEP] Base URL is configured');
});

Given('I set the app to {string}', async function (this: CustomWorld, appName: string) {
  this.appName = appName;
  logger.info(`[STEP] App set to: ${appName}`);
});

// ─── GET / DELETE (no body) ───────────────────────────────────────────────────

When(
  'I send a {string} request to {string}',
  async function (this: CustomWorld, method: string, endpoint: string) {
    // Resolve {{mapKey}} placeholders in the endpoint using dataMap values
    const resolvedEndpoint = endpoint.replace(/\{\{(\w[\w-]*)\}\}/g, (_, key) => {
      const val = this.dataMap.get(key);
      if (!val) throw new Error(`[STEP] dataMap key "{{${key}}}" not found for endpoint resolution`);
      return val;
    });
    this.response = await executeAPI({ method, endpoint: resolvedEndpoint }, this.request, this.appName);
  }
);

// ─── GET with query parameters (DataTable) ───────────────────────────────────

When(
  'I send a {string} request to {string} with query params:',
  async function (
    this: CustomWorld,
    method: string,
    endpoint: string,
    dataTable: { hashes: () => Array<{ key: string; value: string }> }
  ) {
    const queryParams = dataTable.hashes().reduce<Record<string, string>>((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});

    this.response = await executeAPI(
      { method, endpoint, queryParams },
      this.request,
      this.appName
    );
  }
);

// ─── POST with JSON body ──────────────────────────────────────────────────────

When(
  'I send a POST request to {string} with payload:',
  async function (this: CustomWorld, endpoint: string, docString: string) {
    const payload = JSON.parse(docString) as Record<string, unknown>;
    this.response = await executeAPI(
      { method: 'POST', endpoint, payload },
      this.request,
      this.appName
    );
  }
);

// ─── PUT with JSON body ───────────────────────────────────────────────────────

When(
  'I send a PUT request to {string} with payload:',
  async function (this: CustomWorld, endpoint: string, docString: string) {
    const resolvedEndpoint = endpoint.replace(/\{\{(\w[\w-]*)\}\}/g, (_, key) => {
      const val = this.dataMap.get(key);
      if (!val) throw new Error(`[STEP] dataMap key "{{${key}}}" not found for PUT endpoint resolution`);
      return val;
    });
    const payload = JSON.parse(docString) as Record<string, unknown>;
    // Append timestamp to name field to guarantee uniqueness across runs
    if (typeof payload.name === 'string') {
      payload.name = `${payload.name}_${Date.now()}`;
    }
    this.response = await executeAPI(
      { method: 'PUT', endpoint: resolvedEndpoint, payload },
      this.request,
      this.appName
    );
  }
);

// ─── PATCH with JSON body ─────────────────────────────────────────────────────

When(
  'I send a PATCH request to {string} with payload:',
  async function (this: CustomWorld, endpoint: string, docString: string) {
    const resolvedEndpoint = endpoint.replace(/\{\{(\w[\w-]*)\}\}/g, (_, key) => {
      const val = this.dataMap.get(key);
      if (!val) throw new Error(`[STEP] dataMap key "{{${key}}}" not found for PATCH endpoint resolution`);
      return val;
    });
    const payload = JSON.parse(docString) as Record<string, unknown>;
    // Append timestamp to name field to guarantee uniqueness across runs
    if (typeof payload.name === 'string') {
      payload.name = `${payload.name}_${Date.now()}`;
    }
    this.response = await executeAPI(
      { method: 'PATCH', endpoint: resolvedEndpoint, payload },
      this.request,
      this.appName
    );
  }
);

// ─── Chained POST: load file, resolve placeholders, append timestamp, save field ──

When(
  'I send a POST request to {string} with payload from file {string} appending timestamp to name and save response {string} as {string}',
  async function (
    this: CustomWorld,
    endpoint: string,
    fileName: string,
    responseField: string,
    mapKey: string
  ) {
    const filePath = path.join(DATA_DIR, fileName);
    let raw = fs.readFileSync(filePath, 'utf-8');

    // Replace {{placeholder}} tokens with values from dataMap
    raw = raw.replace(/\{\{(\w[\w-]*)\}\}/g, (_, key) => {
      const val = this.dataMap.get(key);
      if (!val) throw new Error(`[STEP] dataMap key "{{${key}}}" not found in payload file "${fileName}"`);
      return val;
    });

    const payload = JSON.parse(raw) as Record<string, unknown>;

    // Append timestamp to the name field for uniqueness
    if (typeof payload['name'] === 'string') {
      payload['name'] = payload['name'] + Date.now();
    }

    logger.info(`[STEP] POST ${endpoint} | file: ${fileName} | payload: ${JSON.stringify(payload)}`);

    this.response = await executeAPI(
      { method: 'POST', endpoint, payload },
      this.request,
      this.appName
    );

    const body = this.response?.body as Record<string, unknown>;
    const value = body?.[responseField];
    if (!value) throw new Error(`[STEP] Response field "${responseField}" not found or empty`);

    this.dataMap.set(mapKey, String(value));
    logger.console(`[STEP] ✅ Saved ${mapKey} = "${value}"`);
  }
);

// ─── PUT from file: load file, resolve placeholders, append timestamp ─────────

When(
  'I send a PUT request to {string} with payload from file {string} appending timestamp to name',
  async function (
    this: CustomWorld,
    endpoint: string,
    fileName: string
  ) {
    // Resolve {{placeholder}} tokens in the endpoint
    const resolvedEndpoint = endpoint.replace(/\{\{(\w[\w-]*)\}\}/g, (_, key) => {
      const val = this.dataMap.get(key);
      if (!val) throw new Error(`[STEP] dataMap key "{{${key}}}" not found for PUT endpoint resolution`);
      return val;
    });

    const filePath = path.join(DATA_DIR, fileName);
    let raw = fs.readFileSync(filePath, 'utf-8');

    // Replace {{placeholder}} tokens in the payload body
    raw = raw.replace(/\{\{(\w[\w-]*)\}\}/g, (_, key) => {
      const val = this.dataMap.get(key);
      if (!val) throw new Error(`[STEP] dataMap key "{{${key}}}" not found in payload file "${fileName}"`);
      return val;
    });

    const payload = JSON.parse(raw) as Record<string, unknown>;

    // Append timestamp to the name field to guarantee uniqueness on every run
    if (typeof payload['name'] === 'string') {
      payload['name'] = payload['name'] + Date.now();
    }

    logger.info(`[STEP] PUT ${resolvedEndpoint} | file: ${fileName} | payload: ${JSON.stringify(payload)}`);

    this.response = await executeAPI(
      { method: 'PUT', endpoint: resolvedEndpoint, payload },
      this.request,
      this.appName
    );
  }
);

// ─── PUT from file with DataTable field overrides ───────────────────────────

When(
  'I send a PUT request to {string} with payload from file {string} overriding fields:',
  async function (
    this: CustomWorld,
    endpoint: string,
    fileName: string,
    dataTable: { hashes: () => Array<{ field: string; value: string }> }
  ) {
    // Resolve {{placeholder}} tokens in the endpoint
    const resolvedEndpoint = endpoint.replace(/\{\{(\w[\w-]*)\}\}/g, (_, key) => {
      const val = this.dataMap.get(key);
      if (!val) throw new Error(`[STEP] dataMap key "{{${key}}}" not found for PUT endpoint resolution`);
      return val;
    });

    const filePath = path.join(DATA_DIR, fileName);
    let raw = fs.readFileSync(filePath, 'utf-8');

    // Replace {{placeholder}} tokens in the payload body
    raw = raw.replace(/\{\{(\w[\w-]*)\}\}/g, (_, key) => {
      const val = this.dataMap.get(key);
      if (!val) throw new Error(`[STEP] dataMap key "{{${key}}}" not found in payload file "${fileName}"`);
      return val;
    });

    const payload = JSON.parse(raw) as Record<string, unknown>;

    // Apply DataTable field overrides — each row replaces one payload field
    const overrides = dataTable.hashes();
    for (const row of overrides) {
      payload[row.field] = row.value;
      logger.info(`[STEP] Override: ${row.field} = "${row.value}"`);
    }

    // Append timestamp to name for uniqueness
    if (typeof payload['name'] === 'string') {
      payload['name'] = payload['name'] + '_' + Date.now();
    }

    logger.info(`[STEP] PUT ${resolvedEndpoint} | file: ${fileName} | overrides: ${JSON.stringify(overrides)} | payload: ${JSON.stringify(payload)}`);

    this.response = await executeAPI(
      { method: 'PUT', endpoint: resolvedEndpoint, payload },
      this.request,
      this.appName
    );
  }
);

// ─── Verify dataMap key ───────────────────────────────────────────────────────

When('I verify the map contains key {string}', function (this: CustomWorld, mapKey: string) {
  const val = this.dataMap.get(mapKey);
  if (!val) throw new Error(`[STEP] dataMap does not contain key "${mapKey}"`);
  logger.info(`[STEP] ✅ dataMap["${mapKey}"] = "${val}"`);
});