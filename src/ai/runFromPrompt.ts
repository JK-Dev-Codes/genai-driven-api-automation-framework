import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import { parsePromptToGherkin } from './promptParser';
import { callAI } from './aiEngine';
import { listContracts, loadContract } from '../contracts/contractLoader';
import { stepRegistry } from '../reuse/stepRegistry';
import { logger } from '../utils/logger';

dotenv.config();

const DEFAULT_PROMPT_FILE = path.join(__dirname, '../../prompts/createUser.prompt.txt');
const FEATURES_DIR        = path.join(__dirname, '../features');
const GENERATED_FEATURE   = path.join(FEATURES_DIR, 'generated.feature');
const DATA_DIR_GLOBAL     = path.join(__dirname, '../../src/data');

/** Maximum times to attempt AI-driven Gherkin repair on a runtime failure. */
const MAX_HEALING_RETRIES = 3;

// ─── Step registry helpers ────────────────────────────────────────────────────

/**
 * Scan all TypeScript step definition files in src/steps/ and register their
 * patterns into the StepRegistry. This ensures the reuse engine has complete
 * knowledge of every step that already exists — including hand-written ones —
 * without relying solely on previously auto-generated entries.
 */
function scanAndRegisterExistingSteps(root: string): void {
  const stepsDir = path.join(root, 'src/steps');
  if (!fs.existsSync(stepsDir)) return;

  const files = fs.readdirSync(stepsDir).filter((f) => f.endsWith('.ts'));
  // Matches:  Given('pattern',  When('pattern',  Then('pattern',
  const patternRegex = /(?:Given|When|Then)\s*\(\s*'([^']+)'/g;

  for (const file of files) {
    const content = fs.readFileSync(path.join(stepsDir, file), 'utf-8');
    patternRegex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = patternRegex.exec(content)) !== null) {
      // Skip Cucumber expression parameters like {string}, {int} — they are
      // structural parts of the pattern, not user-provided values.
      const pattern = m[1];
      if (!stepRegistry.exists(pattern)) {
        stepRegistry.register({
          pattern,
          type: 'When',          // approximation; keyword not critical for reuse lookup
          file: `src/steps/${file}`,
        });
      }
    }
  }

  const total = stepRegistry.getAll().length;
  logger.info(`[REGISTRY] ✅ Registered ${total} existing step pattern(s) from src/steps/`);
}

// ─── Self-healing helpers ─────────────────────────────────────────────────────

/** Run cucumber in dry-run mode (no real execution) and capture the text output. */
function runCucumberDryRun(featureFile: string, root: string): string {
  try {
    return execSync(
      `npx cucumber-js --profile single --dry-run "${featureFile}"`,
      { cwd: root, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    return (e.stdout ?? '') + '\n' + (e.stderr ?? '');
  }
}

/** Parse the dry-run output and return undefined step patterns with their metadata. */
function parseUndefinedPatterns(
  dryRunOutput: string
): Array<{ keyword: string; pattern: string; params: string }> {
  // Cucumber prints snippets like: When('pattern', function (p1, p2) {
  const snippetRegex = /(Given|When|Then)\('([^']+)',\s*function\s*\(([^)]*)\)/g;
  const results: Array<{ keyword: string; pattern: string; params: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = snippetRegex.exec(dryRunOutput)) !== null) {
    results.push({ keyword: m[1], pattern: m[2], params: m[3].trim() });
  }
  return results;
}

/** Strip markdown code fences that AI sometimes wraps its response in. */
function stripFences(code: string): string {
  return code
    .replace(/^```(?:typescript|ts)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();
}

/** Ask AI to generate a TypeScript Cucumber step implementation. */
async function generateStepImpl(
  step: { keyword: string; pattern: string; params: string },
  existingStepsContext: string
): Promise<string> {
  const systemPrompt = `You are a TypeScript + Cucumber.js expert.
Generate a single complete Cucumber step definition implementation.
Output ONLY raw TypeScript — no markdown fences, no imports, no explanation.

The file already has these imports available (do NOT re-import):
  Given, When, Then  — from '@cucumber/cucumber'
  fs, path           — Node.js built-ins
  CustomWorld        — '../types/world'  (fields: dataMap: Map<string,string>, response: any, request: any, appName: string)
  executeAPI         — '../executor/apiExecutor'
  logger             — '../utils/logger'
  deepGet            — '../utils/helpers'
  DATA_DIR           — path.join(__dirname, '../../src/data')

Study these existing implementations carefully and follow the same patterns:
\`\`\`typescript
${existingStepsContext}
\`\`\``;

  const userPrompt = `Generate the TypeScript Cucumber step for:

  Keyword : ${step.keyword}
  Pattern : '${step.pattern}'
  Params  : ${step.params || '(none)'}

Implementation rules:
- "POST from file" → read JSON from DATA_DIR/<fileName>, replace {{key}} tokens using this.dataMap.get(key) (throw if missing), append Date.now() to payload.name, call executeAPI({method:'POST', endpoint, payload}, this.request, this.appName), extract body[responseField], call this.dataMap.set(mapKey, String(value)), log with [STEP] prefix.
- "verify map contains key" → const val = this.dataMap.get(mapKey); if (!val) throw new Error(...); log with [STEP] ✅ prefix.
- For other patterns, infer the most reasonable API testing implementation from the pattern text.
- Wrap the step body in async function if it contains await calls.`;

  const raw = await callAI(systemPrompt, userPrompt);
  return stripFences(raw);
}

/**
 * Detect undefined steps in the generated feature file and automatically
 * generate + append TypeScript implementations to src/steps/generated.steps.ts.
 */
async function selfHealUndefinedSteps(featureFile: string, root: string): Promise<void> {
  logger.console('[SELF-HEAL] 🔍 Scanning for undefined steps...');

  const dryRunOutput = runCucumberDryRun(featureFile, root);
  const missing = parseUndefinedPatterns(dryRunOutput);

  if (missing.length === 0) {
    logger.info('[SELF-HEAL] ✅ All steps are already implemented — no healing needed.');
    return;
  }

  logger.info(`[SELF-HEAL] ⚠️  Found ${missing.length} undefined step(s).`);

  const generatedFile = path.join(root, 'src/steps/generated.steps.ts');
  const existingGenerated = fs.existsSync(generatedFile)
    ? fs.readFileSync(generatedFile, 'utf-8')
    : '';

  // Filter to patterns not already present in generated.steps.ts
  const toGenerate = missing.filter((s) => !existingGenerated.includes(`'${s.pattern}'`));

  if (toGenerate.length === 0) {
    logger.info('[SELF-HEAL] ✅ All undefined steps are already in generated.steps.ts.');
    return;
  }

  // Read existing step files to use as AI context
  const apiStepsPath = path.join(root, 'src/steps/api.steps.ts');
  const existingContext = fs.existsSync(apiStepsPath)
    ? fs.readFileSync(apiStepsPath, 'utf-8')
    : '';

  logger.info(`[SELF-HEAL] 🔧 Generating ${toGenerate.length} new step implementation(s) via AI...`);

  for (const step of toGenerate) {
    logger.info(`[SELF-HEAL]    → ${step.keyword}('${step.pattern}')`);
    const impl = await generateStepImpl(step, existingContext);
    fs.appendFileSync(generatedFile, '\n\n' + impl + '\n');
    logger.info(`[SELF-HEAL] ✅ Appended: '${step.pattern}'`);
  }

  logger.info('[SELF-HEAL] ✅ Self-healing complete. All steps are now implemented.\n');
}

// ─── Runtime execution helpers ────────────────────────────────────────────────

/** Parsed representation of a single HTTP call captured from the debug log. */
interface ApiCall {
  method: string;
  url: string;
  status: number;
  responseBody: string;
}

/**
/**
 * Ensure the generated Gherkin has a valid Feature: / Scenario: wrapper.
 * GPT-4o sometimes outputs raw steps with no wrapper, which causes a Cucumber
 * parse error on line 1. This function detects that and adds the wrapper so
 * every downstream step (dry-run, execution, self-heal) always gets a valid file.
 */
function sanitizeGherkin(gherkin: string, featureName: string): string {
  const trimmed = gherkin.trim();

  // Already has Feature: — nothing to do
  if (/^\s*Feature:/m.test(trimmed)) return trimmed;

  logger.info('[PROMPT RUNNER] ⚠️  Generated Gherkin missing Feature:/Scenario: wrapper — auto-wrapping...');

  // Indent every line by 4 spaces (Scenario body indentation)
  const indentedSteps = trimmed
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : `    ${line}`))
    .join('\n');

  return `Feature: ${featureName}\n\n  Scenario: ${featureName}\n${indentedSteps}\n`;
}

/**
 * Run cucumber with LOG_LEVEL=debug so every HTTP request/response body is
 * captured in the output. This gives the AI healer full diagnostic context.
 */
function runCucumberFull(
  featureFile: string,
  root: string
): { success: boolean; output: string } {
  try {
    const output = execSync(
      `npx cucumber-js --profile single "${featureFile}"`,
      {
        cwd: root,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, LOG_LEVEL: 'debug' },
      }
    );
    return { success: true, output };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    return { success: false, output: (e.stdout ?? '') + '\n' + (e.stderr ?? '') };
  }
}

/**
 * Parse the debug-level cucumber output and extract every HTTP call made
 * during the run — method, URL, status code, and full response body.
 * This gives the AI the same information a human engineer would inspect
 * when diagnosing a test failure.
 */
function extractApiCalls(output: string): ApiCall[] {
  const calls: ApiCall[] = [];
  const lines = output.split('\n');
  const requestRegex = /\[EXECUTOR\]\s+(GET|POST|PUT|PATCH|DELETE)\s+(https?:\/\/\S+)/;
  const statusRegex = /\[EXECUTOR\]\s+Response:\s+(\d+)/;
  const bodyStartRegex = /\[EXECUTOR\].*Body:\s*(\{|\[)/;

  let i = 0;
  while (i < lines.length) {
    const reqMatch = requestRegex.exec(lines[i]);
    if (reqMatch) {
      const method = reqMatch[1];
      const url = reqMatch[2];
      let status = 0;
      let responseBody = '';

      for (let j = i + 1; j < Math.min(i + 60, lines.length); j++) {
        if (!status) {
          const sm = statusRegex.exec(lines[j]);
          if (sm) status = parseInt(sm[1], 10);
        }
        if (!responseBody && bodyStartRegex.test(lines[j])) {
          const bodyIdx = lines[j].indexOf('Body:');
          const firstLine = lines[j].slice(bodyIdx + 5).trim();
          const bodyLines = [firstLine];
          let depth = (firstLine.match(/\{|\[/g) ?? []).length -
                      (firstLine.match(/\}|\]/g) ?? []).length;
          let k = j + 1;
          while (depth > 0 && k < lines.length) {
            const bl = lines[k];
            bodyLines.push(bl);
            depth += (bl.match(/\{|\[/g) ?? []).length;
            depth -= (bl.match(/\}|\]/g) ?? []).length;
            k++;
          }
          responseBody = bodyLines.join('\n').trim();
          break;
        }
      }
      calls.push({ method, url, status, responseBody });
    }
    i++;
  }
  return calls;
}

/**
 * Read the data files and step implementations so the AI has full knowledge
 * of the framework internals — the same context a human engineer would have.
 */
function buildFrameworkContext(root: string): string {
  const sections: string[] = [];

  // Payload data files (alliance.json, fleet.json, squad.json, …)
  const dataDir = path.join(root, 'src/data');
  if (fs.existsSync(dataDir)) {
    const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
    const dataSection = files
      .map((f) => `### src/data/${f}\n${fs.readFileSync(path.join(dataDir, f), 'utf-8')}`)
      .join('\n\n');
    if (dataSection) sections.push(`## Payload data files\n${dataSection}`);
  }

  // Step implementations (api.steps.ts + assertion.steps.ts — trimmed to keep tokens manageable)
  const stepsDir = path.join(root, 'src/steps');
  const stepFiles = ['api.steps.ts', 'assertion.steps.ts'];
  const stepsSection = stepFiles
    .filter((f) => fs.existsSync(path.join(stepsDir, f)))
    .map((f) => {
      const content = fs.readFileSync(path.join(stepsDir, f), 'utf-8');
      return `### src/steps/${f}\n${content.slice(0, 3500)}`;
    })
    .join('\n\n');
  if (stepsSection) sections.push(`## Step implementations\n${stepsSection}`);

  return sections.join('\n\n---\n\n');
}

/**
 * Ask the AI to repair a Gherkin feature that failed at runtime.
 *
 * Sends the AI three sources of truth that Copilot-level diagnosis requires:
 *   1. Every actual HTTP request + response body from the run
 *   2. The framework data files and step implementation code
 *   3. The full Cucumber failure output
 *
 * This allows root-cause diagnosis instead of symptom masking.
 */
async function fixGherkinFromErrors(
  currentGherkin: string,
  failureOutput: string,
  root: string
): Promise<string> {
  const apiCalls = extractApiCalls(failureOutput);
  const frameworkContext = buildFrameworkContext(root);

  const apiCallsSummary = apiCalls.length
    ? apiCalls
        .map(
          (c, i) =>
            `### Call ${i + 1}: ${c.method} ${c.url}\nStatus: ${c.status}\nResponse body:\n${c.responseBody.slice(0, 1500)}`
        )
        .join('\n\n')
    : '(no API calls captured)';

  const systemPrompt = `You are an expert API test automation engineer specialising in BDD.
You are given a Gherkin feature that failed, the actual HTTP request/response pairs from the run,
the framework payload data files, and the step implementation code.
Your task: diagnose the ROOT CAUSE from the real responses and fix the Gherkin.
Output ONLY valid Gherkin — no markdown fences, no explanation, no extra text.

## HOW TO DIAGNOSE
Read the "Actual HTTP calls" section. It contains the real API responses.
- If a response body shows a field does NOT exist → remove any assertion for that field
- If status is 4xx, read the response body message to understand WHY → fix the request, not the assertion
- If status 409 with "must be unique" → a name was duplicated. The PUT/PATCH step already appends a timestamp automatically; do NOT add a timestamp manually in the Gherkin name value
- If a PUT or PATCH returns 4xx (400, 409, 422) → the inline payload is likely INCOMPLETE (missing required fields like leaders, draft, etc.). Replace the inline payload step with: When I send a PUT request to "<endpoint>" with payload from file "<file.json>" appending timestamp to name. This loads the full data file and guarantees all required fields are present.
- NEVER remove or skip a failing step to make the test pass. Fix the root cause instead — wrong file name, wrong endpoint, incomplete payload, etc.
- If a step references a data file that doesn't exist (ENOENT error), replace it with the correct file name from this list: alliances → "alliance_update.json", tribes → "fleet.json", squads → "squad.json"
- If status 422 with "invalid" → the endpoint path is likely wrong or a {{placeholder}} was sent literally. Fix the path
- If status 404 → wrong endpoint path
- If the response body of a GET shows the top-level fields → only assert on fields that actually appear there

## ABSOLUTE RULES
- NEVER change "the response status should be 200" to a non-2xx value. Fix the cause instead.
- NEVER assert on fields that are absent from the actual API response body shown below.
- RESPONSE WINDOW RULE: Each API call replaces the previous response in memory. A field assertion MUST appear immediately after the step whose response contains that field — before any subsequent When step. If a field (e.g. "leaders") appears in a POST response but not in a later GET response, move the assertion to directly after the POST step.
- If a field assertion fails with "got undefined" on a GET step, move it to the preceding POST step instead of removing it — unless the POST response below also lacks the field, in which case remove it.
- NEVER invent new step patterns. ONLY use these:
    Given the API base URL is configured
    Given I set the app to "<appName>"
    When I send a "GET" request to "<endpoint>"
    When I send a "DELETE" request to "<endpoint>"
    When I send a POST request to "<endpoint>" with payload:
    When I send a PUT request to "<endpoint>" with payload:
    When I send a PATCH request to "<endpoint>" with payload:
    When I send a POST request to "<endpoint>" with payload from file "<file.json>" appending timestamp to name and save response "<field>" as "<mapKey>"
    When I send a PUT request to "<endpoint>" with payload from file "<file.json>" appending timestamp to name
    When I verify the map contains key "<mapKey>"
    Then the response status should be <int>
    Then the response body should not be empty
    Then the response array should not be empty
    Then the response should contain "<field>" as "<value>"
    Then the response should contain "<field>" with value <int>
    Then the response field "<field>" should not be empty
    Then the response time should be less than <int> milliseconds
    Then the response header "<name>" should be "<value>"
    Then the map should contain key "<mapKey>"
    Then the response body should contain the name saved as "<mapKey>"
- Preserve the overall test intent (same endpoints, same scenario flow).
- {{placeholder}} tokens in endpoint paths are resolved automatically from the dataMap.
  The PUT and PATCH steps also resolve {{placeholder}} in the endpoint. Do NOT hardcode IDs.`;

  const userPrompt = `## Current Gherkin (that failed)
${currentGherkin}

---

## Actual HTTP calls made during this run
${apiCallsSummary}

---

## Framework context (data files + step implementations)
${frameworkContext}

---

## Cucumber failure output (last 3000 chars)
${failureOutput.slice(-3000)}

---

Output ONLY the corrected Gherkin.`;

  const raw = await callAI(systemPrompt, userPrompt);
  return raw
    .replace(/^```(?:gherkin)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();
}

// ─── Data file auto-generation ───────────────────────────────────────────────

/**
 * Scan the generated Gherkin for `from file "xxx.json"` references.
 * For any file that doesn't exist in src/data/, try to generate it automatically:
 *   1. If a matching contract exists → derive the payload shape from its requiredFields
 *   2. Otherwise → ask the AI to produce a minimal JSON payload from the file name alone
 *
 * This prevents ENOENT failures on the first run for any new entity.
 */
async function ensureDataFilesExist(gherkin: string, root: string, promptText: string): Promise<void> {
  const dataDir   = path.join(root, 'src/data');
  const fileRefs  = [...gherkin.matchAll(/from file "([^"]+\.json)"/g)].map((m) => m[1]);
  const missing   = fileRefs.filter((f) => !fs.existsSync(path.join(dataDir, f)));

  if (missing.length === 0) return;

  logger.console(`[DATA-GEN] ⚠️  Missing data file(s): ${missing.join(', ')} — generating via AI...`);

  // Build a map of entity → contract for lookup
  const contractMap = new Map<string, ReturnType<typeof loadContract>>();
  for (const name of listContracts()) {
    try {
      const c = loadContract(name);
      if (c.payloadFile)       contractMap.set(c.payloadFile, c);
      if (c.updatePayloadFile) contractMap.set(c.updatePayloadFile, c);
    } catch { /* skip invalid contracts */ }
  }

  fs.mkdirSync(dataDir, { recursive: true });

  for (const fileName of missing) {
    logger.info(`[DATA-GEN]    Generating: ${fileName}`);

    const contract = contractMap.get(fileName);

    const systemPrompt = `You are a test data engineer.
Generate a JSON payload file for API testing.
Output ONLY valid JSON — no markdown, no explanation.

Rules:
- Include all required fields
- For "name" fields: use a short descriptive name ending with underscore (e.g. "Auto Test Entity_")
  The framework appends a timestamp at runtime — do NOT include one now
- For ID fields that reference another entity, use {{mapKey}} placeholder (e.g. {{allianceId}})
- Keep boolean and numeric fields realistic
- Do NOT include server-generated fields (id, createdAt, updatedAt, enabled)`;

    if (!contract) {
      // No contract exists — extract the payload directly from the prompt text.
      // The prompt was written by the user and already contains the real API payload.
      logger.info(`[DATA-GEN] ℹ️  No contract for "${fileName}" — extracting payload from prompt text...`);

      const entityName = fileName.replace(/[_-]?(update|updated)?\.json$/i, '');

      // Step 1: Extract the payload from the prompt for this entity
      // Extract the mapKeys already defined in the Gherkin so placeholders match exactly
      const mapKeysInGherkin = [...gherkin.matchAll(/save response "[^"]+" as "([^"]+)"/g)].map((m) => m[1]);

      const extractPrompt = `The user wrote this test prompt:\n---\n${promptText}\n---\n\nThe generated Gherkin uses these dataMap keys (saved from previous POST responses): ${JSON.stringify(mapKeysInGherkin)}\n\nExtract the JSON payload intended for the entity "${entityName}" (file "${fileName}").\n\nRules:\n- Output ONLY valid JSON — no markdown fences, no explanation.\n- For "name" fields: keep the value but ensure it ends with underscore _ (framework appends timestamp at runtime)\n- CRITICAL — ID fields that reference another entity (e.g. allianceId, tribeId, parentId):\n  The prompt may contain a hardcoded GUID for that field (e.g. "allianceId": "30460127-39ad-..."). IGNORE that GUID.\n  Replace the value with the matching {{mapKey}} placeholder from this list: ${JSON.stringify(mapKeysInGherkin)}\n  Pick the mapKey whose name most closely matches the field name:\n    allianceId → {{allianceId}}, tribeId → {{fleetId}}, squadId → {{squadId}}\n  NEVER output a raw UUID for any foreign-key field.\n- Remove server-generated fields (id, createdAt, updatedAt, enabled)\n- If no payload found for this entity, output: {}`;

      try {
        const extractedRaw = await callAI(
          'You are a test data engineer. Extract JSON payloads from test descriptions. Output ONLY raw JSON.',
          extractPrompt
        );
        const extractedJson = extractedRaw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
        const parsed = JSON.parse(extractedJson);

        if (Object.keys(parsed).length === 0) {
          logger.warn(`[DATA-GEN] ⚠️  Could not extract payload for "${fileName}" from prompt — skipping.`);
          continue;
        }

        fs.writeFileSync(path.join(dataDir, fileName), JSON.stringify(parsed, null, 2));
        logger.info(`[DATA-GEN] ✅ Created: src/data/${fileName} (extracted from prompt)`);

        // Step 2: Auto-generate the contract from the extracted payload + Gherkin
        const contractDir  = path.join(root, 'src/contracts/definitions');
        const contractFile = path.join(contractDir, `${entityName}.contract.json`);
        if (!fs.existsSync(contractFile)) {
          const contractPrompt = `Generate an ApiContract JSON for this entity.\n\nEntity name: "${entityName}"\nPayload file: "${fileName}"\nExtracted payload: ${JSON.stringify(parsed, null, 2)}\nGherkin context: ${gherkin}\nOriginal prompt (contains endpoint URLs — use them to determine the correct endpoint path): ${promptText}\n\nIMPORTANT: Look for the endpoint URL in the prompt text. Extract only the path (e.g. /tribes, /squads). Do NOT guess — use what is in the prompt.\n\nOutput a JSON object with this exact shape (no markdown, no explanation):\n{\n  "entity": "<entityName>",\n  "endpoint": "<path from prompt e.g. /tribes>",\n  "mapKey": "<entityName>Id",\n  "payloadFile": "${fileName}",\n  "updatePayloadFile": "${fileName}",\n  "operations": {\n    "POST": { "requiredFields": [...payload keys], "responseFields": ["id", ...payload keys, "enabled"] },\n    "GET": { "responseFields": ["id", ...payload keys, "enabled", "canEdit"], "responseIsArray": true },\n    "GET_BY_ID": { "responseFields": ["id", ...payload keys, "enabled", "canEdit"] },\n    "PUT": { "requiredFields": [...payload keys], "responseFields": ["id", ...payload keys, "enabled"] },\n    "DELETE": { "responseFields": [] }\n  }\n}`;

          const contractRaw  = await callAI(
            'You are an API contract engineer. Generate ApiContract JSON objects. Output ONLY valid JSON.',
            contractPrompt
          );
          const contractJson = contractRaw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
          JSON.parse(contractJson); // validate
          fs.mkdirSync(contractDir, { recursive: true });
          fs.writeFileSync(contractFile, contractJson);
          logger.info(`[DATA-GEN] ✅ Created contract: src/contracts/definitions/${entityName}.contract.json`);
        }
      } catch (err) {
        logger.warn(`[DATA-GEN] ⚠️  Could not extract payload for "${fileName}" from prompt: ${String(err)}`);
      }
      continue;
    }

    const userPrompt = `Generate a payload file called "${fileName}" for entity "${contract.entity}".
Required fields: ${JSON.stringify(contract.operations?.POST?.requiredFields ?? [])}
Entity mapKey: "${contract.mapKey}"
Other contract info: ${JSON.stringify(contract, null, 2)}`;

    try {
      const raw  = await callAI(systemPrompt, userPrompt);
      const json = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
      JSON.parse(json); // validate
      fs.writeFileSync(path.join(dataDir, fileName), json);
      logger.info(`[DATA-GEN] ✅ Created: src/data/${fileName}`);
    } catch (err) {
      logger.warn(`[DATA-GEN] ⚠️  Could not generate ${fileName}: ${String(err)}`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // argv[2] = optional prompt file path
  // argv[3] = optional output feature file name (e.g. PDS-18097.feature)
  const promptFile = process.argv[2]
    ? path.resolve(process.argv[2])
    : DEFAULT_PROMPT_FILE;

  const outputFeature = process.argv[3]
    ? path.join(FEATURES_DIR, path.basename(process.argv[3]))
    : GENERATED_FEATURE;

  if (!fs.existsSync(promptFile)) {
    logger.error(`[PROMPT RUNNER] Prompt file not found: ${promptFile}`);
    process.exit(1);
  }

  // Read prompt — strip comment lines and blank lines
  const raw = fs.readFileSync(promptFile, 'utf-8');
  const prompt = raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('#') && line.trim() !== '')
    .join('\n')
    .trim();

  if (!prompt) {
    logger.error('[PROMPT RUNNER] Prompt file is empty. Write your test description and re-run.');
    process.exit(1);
  }

  logger.console(`[PROMPT RUNNER] 🚀 Starting — ${path.basename(promptFile)}`);
  logger.info(`[PROMPT RUNNER] ▶  Prompt text :\n${prompt}\n`);

  const root = path.join(__dirname, '../..');

  // ── Step 0: Populate registry with all existing step patterns ──────────────
  scanAndRegisterExistingSteps(root);

  // ── Step 1: AI converts prompt → Gherkin ──────────────────────────────────
  const { featureName, gherkin: initialGherkin } = await parsePromptToGherkin(prompt);
  logger.console(`[PROMPT RUNNER] ✅ Gherkin generated: "${featureName}"`);
  logger.info(`[PROMPT RUNNER] Generated Gherkin:\n${'─'.repeat(60)}\n${initialGherkin}\n${'─'.repeat(60)}\n`);

  // ── Step 1b: Sanitize — ensure Feature:/Scenario: wrapper exists ───────────
  // GPT-4o sometimes outputs raw steps without the Gherkin structure wrapper.
  // Cucumber cannot parse such a file at all. Detect and fix it here before
  // any file is written, so all retry attempts start with a valid file.
  let currentGherkin = sanitizeGherkin(initialGherkin, featureName);

  // ── Self-healing retry loop ────────────────────────────────────────────────
  // Attempt 1  : run with AI-generated Gherkin (sanitized).
  // Attempt 2+ : if runtime failures occur, ask the AI to fix the Gherkin and retry.

  for (let attempt = 1; attempt <= MAX_HEALING_RETRIES; attempt++) {
    logger.info(`[PROMPT RUNNER] ─── Attempt ${attempt}/${MAX_HEALING_RETRIES} ───────────────────────────────`);

    // Step A: Write the current Gherkin to the feature file
    fs.writeFileSync(outputFeature, currentGherkin, 'utf-8');
    logger.info(`[PROMPT RUNNER] ✅ Feature written → ${outputFeature}`);

    // Step A2: Ensure all data files referenced in the Gherkin exist
    await ensureDataFilesExist(currentGherkin, root, prompt);

    // Step B: Dry-run — detect and auto-generate any undefined step implementations
    await selfHealUndefinedSteps(outputFeature, root);

    // Step C: Full execution — capture output for analysis
    logger.console('[PROMPT RUNNER] ▶  Running tests...');
    const result = runCucumberFull(outputFeature, root);

    // Print output the same way stdio: inherit would
    process.stdout.write(result.output);

    if (result.success) {
      logger.console(`[PROMPT RUNNER] ✅ All tests passed on attempt ${attempt}/${MAX_HEALING_RETRIES} 🎉`);
      return;
    }

    // Tests failed — decide whether to retry or give up
    if (attempt === MAX_HEALING_RETRIES) {
      logger.error(
        `[PROMPT RUNNER] ❌ Tests still failing after ${MAX_HEALING_RETRIES} attempt(s). Manual review required.`
      );
      process.exit(1);
    }

    // Step D: AI-driven Gherkin repair — with full HTTP context for root-cause diagnosis
    logger.info(
      `[PROMPT RUNNER] ⚠️  Attempt ${attempt} failed — asking AI to diagnose and fix the Gherkin...`
    );
    currentGherkin = await fixGherkinFromErrors(currentGherkin, result.output, root);
    logger.info(
      `[PROMPT RUNNER] 🔧 Repaired Gherkin (attempt ${attempt + 1}):\n${'─'.repeat(60)}\n${currentGherkin}\n${'─'.repeat(60)}\n`
    );
  }
}

main().catch((err: unknown) => {
  logger.error(
    `[PROMPT RUNNER] Fatal: ${err instanceof Error ? err.message : String(err)}`
  );
  process.exit(1);
});
