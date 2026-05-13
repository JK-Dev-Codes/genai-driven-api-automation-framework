/**
 * Bootstrap Command — Universal API discovery for any new application.
 *
 * Run ONCE per entity when onboarding a new API. This command:
 *   1. Makes a real HTTP call to the given endpoint with your sample payload
 *   2. Captures the actual response body
 *   3. Asks the AI to generate a contract JSON from the real request/response
 *   4. Asks the AI to generate a clean test data file
 *   5. Creates an app config file if the app is new
 *
 * Usage:
 *   npm run bootstrap -- --endpoint POST:/users --payload '{"name":"Test","email":"t@t.com"}'
 *   npm run bootstrap -- --app myapp --baseUrl https://api.example.com --auth bearer --endpoint POST:/orders --payload '{...}'
 *
 * Options:
 *   --app         App name (matches src/config/apps/<name>.config.json). Default: "default"
 *   --baseUrl     API base URL. Falls back to API_BASE_URL env var.
 *   --auth        Auth type: bearer | apikey | basic | none. Default: "none"
 *   --token       Bearer token value (or set API_TOKEN / CLIENT_API_TOKEN in .env)
 *   --headerName  Custom auth header name (for apikey auth)
 *   --headerValue Custom auth header value (for apikey auth)
 *   --endpoint    HTTP method + path, e.g. "POST:/users" or just "/users"
 *   --payload     JSON payload string for POST/PUT requests
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as dotenv from 'dotenv';
import { callAI } from './aiEngine';
import { listContracts } from '../contracts/contractLoader';
import { logger } from '../utils/logger';

dotenv.config();

const CONTRACT_DIR = path.join(__dirname, '../../src/contracts/definitions');
const DATA_DIR     = path.join(__dirname, '../../src/data');
const CONFIG_DIR   = path.join(__dirname, '../config/apps');

// ─── CLI argument parser ──────────────────────────────────────────────────────

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      args[key] = argv[i + 1] ?? '';
      i++;
    }
  }
  return args;
}

// ─── HTTP client (no Playwright dependency — runs before any test setup) ─────

async function makeRequest(opts: {
  method:   string;
  url:      string;
  payload?: Record<string, unknown>;
  headers?: Record<string, string>;
}): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const url     = new URL(opts.url);
    const isHttps = url.protocol === 'https:';
    const bodyStr = opts.payload ? JSON.stringify(opts.payload) : undefined;

    const reqOptions: http.RequestOptions = {
      hostname: url.hostname,
      port:     url.port ? parseInt(url.port, 10) : (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method:   opts.method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        ...opts.headers,
      },
    };

    const lib = isHttps ? https : http;
    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer | string) => { data += String(chunk); });
      res.on('end', () => {
        let parsed: unknown = data;
        try { parsed = JSON.parse(data); } catch { /* keep raw */ }
        resolve({ status: res.statusCode ?? 0, body: parsed });
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─── Derive entity name from endpoint path ────────────────────────────────────

function deriveEntity(endpointPath: string): string {
  // /alliances/{id}/members → alliances
  const segment = endpointPath.replace(/^\//, '').split('/')[0];
  // Simple depluralization: alliances→alliance, tribes→tribe, squads→squad
  if (segment.endsWith('ies'))  return segment.slice(0, -3) + 'y'; // activities→activity
  if (segment.endsWith('ses'))  return segment.slice(0, -2);        // statuses→status
  if (segment.endsWith('s'))    return segment.slice(0, -1);
  return segment;
}

// ─── AI contract generation ───────────────────────────────────────────────────

async function generateContract(
  entity:        string,
  endpoint:      string,
  method:        string,
  reqPayload:    Record<string, unknown> | null,
  resStatus:     number,
  resBody:       unknown
): Promise<string> {
  const systemPrompt = `You are an API contract engineering expert.
Given a REAL API request and its actual response, generate a contract JSON file.
Output ONLY valid JSON — no markdown fences, no explanation.

The JSON must conform to this exact schema:
{
  "entity": "<singular entity name>",
  "endpoint": "<path starting with /, e.g. /users>",
  "mapKey": "<camelCase entity Id, e.g. userId>",
  "payloadFile": "<entity>.json",
  "updatePayloadFile": "<entity>_update.json",
  "operations": {
    "POST":       { "requiredFields": ["field1","field2"], "responseFields": ["id","field1"] },
    "GET":        { "responseFields": ["id","field1"], "responseIsArray": true },
    "GET_BY_ID":  { "responseFields": ["id","field1"] },
    "PUT":        { "requiredFields": ["field1","field2"], "responseFields": ["id","field1"] }
  }
}

Rules:
- requiredFields = fields sent in the request payload
- responseFields = top-level keys visible in the response body for that operation
- For GET_BY_ID: infer from GET response shape — it is usually the same minus array wrapper
- For PUT: requiredFields matches POST (REST PUT replaces the whole resource)
- mapKey = entityName + "Id" (e.g. user → userId)
- DO NOT include server-generated fields (createdAt, updatedAt, __v) in requiredFields
- If the response is a bare JSON array, set responseIsArray: true for that operation`;

  const userPrompt = `Entity: ${entity}
Endpoint: ${endpoint}
Method used: ${method}
HTTP status returned: ${resStatus}

Request payload sent:
${reqPayload ? JSON.stringify(reqPayload, null, 2) : '(none — GET request)'}

Actual response body (truncated to 3000 chars):
${JSON.stringify(resBody, null, 2).slice(0, 3000)}`;

  const raw = await callAI(systemPrompt, userPrompt);
  return raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
}

// ─── AI data file generation ──────────────────────────────────────────────────

async function generateDataFile(
  entity:            string,
  samplePayload:     Record<string, unknown>,
  knownMapKeys:      string[]
): Promise<string> {
  const systemPrompt = `You are a test data engineer.
Given a sample API payload, produce a clean JSON test data file for reuse in automated tests.
Output ONLY valid JSON — no markdown, no explanation.

Rules:
- Keep all meaningful input fields
- For "name" fields: use a short readable name ending with an underscore, e.g. "Auto Test User_"
  The framework appends a timestamp at runtime for uniqueness — do NOT hardcode a timestamp
- If a field value looks like a UUID that references another entity, replace it with a {{mapKey}}
  placeholder where mapKey is the camelCase Id for that entity
  Known entity mapKeys available at runtime: [${knownMapKeys.join(', ')}]
- Remove server-managed fields: id, createdAt, updatedAt, enabled, __v
- Keep boolean and numeric fields exactly as-is`;

  const userPrompt = `Entity: ${entity}

Sample payload:
${JSON.stringify(samplePayload, null, 2)}`;

  const raw = await callAI(systemPrompt, userPrompt);
  return raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
}

// ─── App config generator ─────────────────────────────────────────────────────

function buildAppConfig(
  appName:  string,
  baseUrl:  string,
  authType: string,
  args:     Record<string, string>
): Record<string, unknown> {
  const config: Record<string, unknown> = {
    appName,
    baseURL: baseUrl,
    headers: {},
    timeout: 30000,
  };

  switch (authType.toLowerCase()) {
    case 'bearer':
      config.auth = { type: 'Bearer', token: `\${${args.envVar || 'API_TOKEN'}}` };
      break;
    case 'apikey':
      config.auth = {
        type: 'ApiKey',
        headerName:  args.headerName  || 'X-API-Key',
        headerValue: `\${${args.envVar || 'API_KEY'}}`,
      };
      break;
    case 'basic':
      config.auth = {
        type:     'Basic',
        username: `\${${args.usernameEnv || 'API_USERNAME'}}`,
        password: `\${${args.passwordEnv || 'API_PASSWORD'}}`,
      };
      break;
    default:
      config.auth = { type: 'None' };
  }

  return config;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();

  logger.info('[BOOTSTRAP] ─────────────────────────────────────────────────────────────');
  logger.info('[BOOTSTRAP] 🚀  Universal API Automation Framework — Bootstrap');
  logger.info('[BOOTSTRAP]     Auto-discover API schema → generate contracts + data files');
  logger.info('[BOOTSTRAP] ─────────────────────────────────────────────────────────────\n');

  // ── Resolve inputs ────────────────────────────────────────────────────────
  const baseUrl     = args.baseUrl   || process.env.API_BASE_URL || process.env.BASE_URL || '';
  const appName     = args.app       || 'default';
  const endpointArg = args.endpoint  || '';
  const payloadArg  = args.payload   || '{}';
  const authType    = args.auth      || 'none';

  if (!baseUrl) {
    logger.error('[BOOTSTRAP] ❌ Missing base URL. Set API_BASE_URL in .env or pass --baseUrl <url>');
    logger.error('[BOOTSTRAP]    Example: npm run bootstrap -- --baseUrl https://api.example.com --endpoint POST:/users --payload \'{"name":"Test"}\'');
    process.exit(1);
  }

  if (!endpointArg) {
    logger.error('[BOOTSTRAP] ❌ Missing --endpoint. Example: --endpoint POST:/users');
    process.exit(1);
  }

  // Parse "POST:/users" or "/users" (default method = POST)
  const colonIdx     = endpointArg.indexOf(':');
  const method       = colonIdx > 0 ? endpointArg.slice(0, colonIdx).toUpperCase() : 'POST';
  const endpointPath = colonIdx > 0 ? endpointArg.slice(colonIdx + 1) : endpointArg;
  const fullUrl      = `${baseUrl.replace(/\/$/, '')}${endpointPath}`;
  const entity       = deriveEntity(endpointPath);

  logger.info(`[BOOTSTRAP] Entity   : ${entity}`);
  logger.info(`[BOOTSTRAP] Endpoint : ${method} ${fullUrl}`);
  logger.info(`[BOOTSTRAP] App      : ${appName}\n`);

  // Parse payload
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(payloadArg) as Record<string, unknown>;
  } catch {
    logger.warn('[BOOTSTRAP] ⚠️  Could not parse --payload JSON. Using empty payload.');
  }

  // Build auth headers for the real API call
  const authHeaders: Record<string, string> = {};
  const token = args.token
    || process.env.API_TOKEN
    || process.env.CLIENT_API_TOKEN
    || '';

  if (token && authType.toLowerCase() !== 'none') {
    authHeaders['Authorization'] = `Bearer ${token}`;
  }
  if (args.headerName && args.headerValue) {
    authHeaders[args.headerName] = args.headerValue;
  }

  // ── Step 1: Real API call ──────────────────────────────────────────────────
  logger.info(`[BOOTSTRAP] 📡 Step 1 — Making real API call: ${method} ${fullUrl}`);

  let resStatus = 0;
  let resBody:   unknown = {};

  try {
    const result = await makeRequest({
      method,
      url:     fullUrl,
      payload: method !== 'GET' && method !== 'DELETE' ? payload : undefined,
      headers: authHeaders,
    });
    resStatus = result.status;
    resBody   = result.body;
    logger.info(`[BOOTSTRAP] ✅ Response ${resStatus}`);
    logger.info(`[BOOTSTRAP]    Body preview: ${JSON.stringify(resBody).slice(0, 300)}\n`);
  } catch (err) {
    logger.warn(`[BOOTSTRAP] ⚠️  Could not reach API: ${String(err)}`);
    logger.warn('[BOOTSTRAP]    Generating contract from payload shape only (no live response).\n');
  }

  // ── Step 2: AI generates contract ─────────────────────────────────────────
  logger.info('[BOOTSTRAP] 🤖 Step 2 — AI generating API contract...');

  const contractJson = await generateContract(
    entity,
    endpointPath,
    method,
    method !== 'GET' ? payload : null,
    resStatus,
    resBody
  );

  let contractObj: Record<string, unknown>;
  try {
    contractObj = JSON.parse(contractJson) as Record<string, unknown>;
  } catch {
    logger.error('[BOOTSTRAP] ❌ AI produced invalid JSON for contract:');
    logger.error(contractJson);
    process.exit(1);
  }

  // ── Step 3: AI generates data file ────────────────────────────────────────
  logger.info('[BOOTSTRAP] 🤖 Step 3 — AI generating test data file...');

  const knownMapKeys = listContracts().map((n) => n + 'Id');
  const dataFileJson = await generateDataFile(entity, payload, knownMapKeys);

  let dataObj: Record<string, unknown>;
  try {
    dataObj = JSON.parse(dataFileJson) as Record<string, unknown>;
  } catch {
    logger.warn('[BOOTSTRAP] ⚠️  AI data file JSON was invalid — using raw payload as fallback.');
    dataObj = payload;
  }

  // ── Step 4: Create app config if new app ──────────────────────────────────
  const configPath = path.join(CONFIG_DIR, `${appName}.config.json`);
  if (appName !== 'default' && !fs.existsSync(configPath)) {
    logger.info(`[BOOTSTRAP] 📝 Step 4 — Creating app config for "${appName}"...`);
    const config = buildAppConfig(appName, baseUrl, authType, args);
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    logger.info(`[BOOTSTRAP] ✅ Saved → src/config/apps/${appName}.config.json\n`);
  }

  // ── Step 5: Save contract ─────────────────────────────────────────────────
  fs.mkdirSync(CONTRACT_DIR, { recursive: true });
  const contractPath = path.join(CONTRACT_DIR, `${entity}.contract.json`);
  const contractAlreadyExisted = fs.existsSync(contractPath);
  fs.writeFileSync(contractPath, JSON.stringify(contractObj, null, 2));
  logger.info(`[BOOTSTRAP] ✅ Contract ${contractAlreadyExisted ? 'updated' : 'created'} → src/contracts/definitions/${entity}.contract.json`);

  // ── Step 6: Save data file (never overwrite existing) ─────────────────────
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const dataPath = path.join(DATA_DIR, `${entity}.json`);
  if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, JSON.stringify(dataObj, null, 2));
    logger.info(`[BOOTSTRAP] ✅ Data file  created → src/data/${entity}.json`);
  } else {
    logger.info(`[BOOTSTRAP] ℹ️  Data file  already exists (not overwritten): src/data/${entity}.json`);
    logger.info(`[BOOTSTRAP]    Delete it manually if you want it regenerated.`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  logger.info('\n[BOOTSTRAP] ─────────────────────────────────────────────────────────────');
  logger.info('[BOOTSTRAP] ✅ Bootstrap complete! The AI now has full schema knowledge for:');
  logger.info(`[BOOTSTRAP]   Entity   : ${entity}`);
  logger.info(`[BOOTSTRAP]   Endpoint : ${endpointPath}`);
  logger.info('\n[BOOTSTRAP] Next steps:');
  logger.info('[BOOTSTRAP]   1. Write your test scenario in a prompt file:');
  logger.info('[BOOTSTRAP]      prompts/myTest.prompt.txt');
  logger.info('[BOOTSTRAP]   2. Run: npm run prompt -- prompts/myTest.prompt.txt MyTest.feature');
  logger.info('[BOOTSTRAP]   3. The AI will generate correct Gherkin + pass on the first run.');
  logger.info('[BOOTSTRAP] ─────────────────────────────────────────────────────────────\n');
}

main().catch((err: unknown) => {
  logger.error(`[BOOTSTRAP] Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
