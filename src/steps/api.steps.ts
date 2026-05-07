import { Given, When } from '@cucumber/cucumber';
import { CustomWorld } from '../types/world';
import { executeAPI } from '../executor/apiExecutor';
import { logger } from '../utils/logger';

// ─── Configuration ────────────────────────────────────────────────────────────

Given('the API base URL is configured', async function (this: CustomWorld) {
  // Base URL is resolved by the executor via app config — nothing extra needed here
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
    this.response = await executeAPI({ method, endpoint }, this.request, this.appName);
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
    const payload = JSON.parse(docString) as Record<string, unknown>;
    this.response = await executeAPI(
      { method: 'PUT', endpoint, payload },
      this.request,
      this.appName
    );
  }
);

// ─── PATCH with JSON body ─────────────────────────────────────────────────────

When(
  'I send a PATCH request to {string} with payload:',
  async function (this: CustomWorld, endpoint: string, docString: string) {
    const payload = JSON.parse(docString) as Record<string, unknown>;
    this.response = await executeAPI(
      { method: 'PATCH', endpoint, payload },
      this.request,
      this.appName
    );
  }
);
