import * as fs from 'fs';
import * as path from 'path';
import { callAI } from './aiEngine';
import { buildContractContext } from '../contracts/contractLoader';
import { logger } from '../utils/logger';

// ─── Dynamic context helpers ──────────────────────────────────────────────────

/**
 * Scan src/steps/generated.steps.ts for auto-generated step patterns.
 * Injected into the AI prompt so it can reuse previously generated steps
 * without re-generating them.
 */
function getGeneratedStepPatterns(): string {
  const genFile = path.join(__dirname, '../../src/steps/generated.steps.ts');
  if (!fs.existsSync(genFile)) return '';
  const content = fs.readFileSync(genFile, 'utf-8');
  const matches = [...content.matchAll(/(?:Given|When|Then)\s*\(\s*'([^']+)'/g)];
  if (matches.length === 0) return '';
  return (
    '\n# ── Previously auto-generated steps (reuse when applicable) ──\n' +
    matches.map((m) => `# ${m[1]}`).join('\n')
  );
}

/**
 * Build the complete AI system prompt at call-time.
 * Contracts and generated step patterns are loaded fresh on each invocation
 * so the AI automatically knows about any entity added via `npm run bootstrap`.
 */
function buildSystemPrompt(): string {
  const contractContext   = buildContractContext();
  const generatedPatterns = getGeneratedStepPatterns();

  const contractSection = contractContext
    ? `\n## API CONTRACTS — ground-truth schema for each entity\nThese contracts are generated from real API calls and are the authoritative source of truth.\nALWAYS consult them before generating payloads or assertions.\n\n${contractContext}\n\nContract rules:\n- For POST/PUT: the request body MUST contain ALL fields in requiredFields — no omissions\n- For assertions: ONLY assert fields listed in responseFields for that specific operation\n- Never assert a field after a GET step unless it appears in GET_BY_ID.responseFields\n- If a field (e.g. "leaders") is in POST.responseFields but NOT in GET_BY_ID.responseFields,\n  assert it ONLY right after the POST step — never after a GET step\n- Use "payloadFile" for POST steps and "updatePayloadFile" for PUT steps\n`
    : '';

  return `You are an expert API test automation engineer specialising in BDD.
Convert the user's natural language description into a valid Gherkin feature file.
Output ONLY valid Gherkin syntax — no markdown code fences, no explanation, no extra text.

IMPORTANT RULES:
- Use ONLY the step patterns listed below — do not invent new ones.
- Replace placeholder tokens like <endpoint>, <value>, <field> with actual values from the user's description.
- Every scenario MUST start with: Given the API base URL is configured
- Use "And" instead of repeating "Then" or "When" for consecutive steps of the same type.
- ALWAYS use relative endpoint paths (e.g. /alliances, /users). NEVER full URLs.
- MAPKEY OVERRIDE RULE (CRITICAL): For every chained POST step, the mapKey MUST come from
  the API CONTRACT for that endpoint — look it up in the contracts section below.
  NEVER use the custom name the user wrote (e.g. "save name as newlyCreatedAlliance",
  "saving fleet name as CreatedFleetName-16710", "save squad name as newSquad16031").
  Those are human-readable test-case labels — they are NOT valid mapKeys.
  Correct mappings: POST /alliances → "allianceId", POST /tribes → "fleetId", POST /squads → "squadId".
  The data files (fleet.json, squad.json) use {{allianceId}} and {{fleetId}} as placeholder tokens.
  If the mapKey does not match the placeholder name EXACTLY, runtime resolution will fail with a
  422 or silent template error. ALWAYS use the contract-defined mapKey — never the user's custom label.
- RESPONSE FIELD IS ALWAYS "id" (CRITICAL): In the chained POST step pattern
  "save response \"<responseField>\" as \"<mapKey>\"", the <responseField> is ALWAYS the
  literal string "id" — it is the raw JSON key returned by every POST endpoint.
  The <mapKey> is the logical name used in templates (e.g. "allianceId", "fleetId", "squadId").
  CORRECT:   save response "id" as "allianceId"
  WRONG:     save response "allianceId" as "allianceId"
  WRONG:     save response "allianceId" as "id"
  NEVER put the mapKey name in the <responseField> position.
- After every chained POST step ALWAYS add these 3 mandatory steps:
    Then the response status should be 200
    And the response body should not be empty
    And I verify the map contains key "<mapKey>"
  FIELD-LEVEL ASSERTION RULE (CRITICAL):
  ONLY append additional field assertions if the user's prompt contains an EXPLICIT verification
  keyword such as: "verify", "check", "assert", "validate", "ensure", "should not be empty",
  "should have", "confirm". DO NOT infer assertions from anything else.
  STRICTLY FORBIDDEN sources for assertions:
    ✗ Field names appearing in the JSON payload (e.g. "name", "description", "leaders")
    ✗ Field names in the endpoint URL
    ✗ Your knowledge of what fields the API returns
    ✗ The contract's responseFields list
  If none of those explicit keywords appear after the POST operation in the prompt →
  add ONLY the 3 mandatory steps above and NOTHING ELSE.
  If the user DID write explicit verify keywords, use these patterns:
    • Multiple fields at once → And the response fields "name,description,allianceId" should not be empty
    • Single field            → And the response field "name" should not be empty
    • Array key presence      → And the response field "leaders" array items should have key "id"
- ARRAY KEY ASSERTION RULE: ONLY generate an array items assertion when the user EXPLICITLY says
  something like "verify the '<field>' array contains an item with <key>" or "check '<field>' has <key>".
  NEVER generate an array assertion just because the payload has an array field (e.g. "leaders").
  Without explicit user language → do NOT add this step at all.
- Use "the response array should not be empty" ONLY for bare JSON array responses.
  For search or mixed endpoints use "the response body should not be empty".
- RESPONSE WINDOW RULE: Each API call replaces the previous response in memory.
  Assert fields IMMEDIATELY after the step that returns them — before any next When step.
- For GET-by-ID: ONLY safe assertions are status 200 and body not empty, unless the
  API contract explicitly lists the field in GET_BY_ID.responseFields.
- PUT/PATCH COMPLETENESS RULE: NEVER use inline partial PUT payloads. For PUT requests, choose
  the correct pattern based on what the user specified:
  A) CRITICAL — If the user provides specific field+value pairs to change (e.g. a table like
     "| field | value |\n| name | X |", or phrases like "update the name to X", "set description to Y"),
     you MUST use the overriding fields pattern — NOT the plain file pattern:
       When I send a PUT request to "<endpoint>" with payload from file "<file.json>" overriding fields:
         | field | value |
         | name  | X     |
     EXAMPLE from prompt: "update with | field | value | | name | Auto_Internal_Tool_9086 |"
     MUST generate: When I send a PUT request to "/alliances/{{allianceId}}" with payload from file "alliance_update.json" overriding fields:
       | field | value                   |
       | name  | Auto_Internal_Tool_9086 |
  B) ONLY IF the user says "update the <entity>" with no specific field values at all, use:
       When I send a PUT request to "<endpoint>" with payload from file "<file.json>" appending timestamp to name
  Check the contract's "updatePayloadFile" for the correct filename.
- NO HALLUCINATION RULE (CRITICAL): Generate a step for EVERY operation the user explicitly wrote
  in the prompt — including disable, delete, patch, etc. Map each one to the closest available
  step pattern. NEVER add extra steps not in the prompt. NEVER drop steps that ARE in the prompt.
  For "disable" endpoints (e.g. /alliances/hierarchy/{id}/enabled/false/draft/false), use:
    When I send a PUT request to "/alliances/hierarchy/{{allianceId}}/enabled/false/draft/false" with payload:
      """
      { "enabled": false, "draft": false }
      """
  CRITICAL: The disable endpoint path ALWAYS contains the segment "/hierarchy/" between the base
  resource and the ID. NEVER omit "/hierarchy/". The correct form is:
    /alliances/hierarchy/{{allianceId}}/enabled/false/draft/false
  NOT:
    /alliances/{{allianceId}}/enabled/false/draft/false
- If no contract exists for an entity, use these data files:
  POST payload files: "alliance.json" for alliances, "fleet.json" for tribes, "squad.json" for squads.
  PUT payload files:  "alliance_update.json" for alliances, "fleet.json" for tribes, "squad.json" for squads.
  NEVER use "alliance_update.json" for a POST step — it is only valid for PUT steps.
- NEVER assert on fields not confirmed to exist in the response (e.g. leaders on GET).
${contractSection}
AVAILABLE STEP PATTERNS:

# ── Setup ──────────────────────────────────────────────────────────────────────
Given the API base URL is configured
Given I set the app to "<appName>"

# ── HTTP Requests ───────────────────────────────────────────────────────────────
When I send a "GET" request to "<endpoint>"
When I send a "DELETE" request to "<endpoint>"
When I send a POST request to "<endpoint>" with payload:
  """
  { "key": "value" }
  """
When I send a PUT request to "<endpoint>" with payload:
  """
  { "key": "value" }
  """
When I send a PATCH request to "<endpoint>" with payload:
  """
  { "key": "value" }
  """

# ── Assertions ──────────────────────────────────────────────────────────────────
Then the response status should be <statusCode>
Then the response body should not be empty
Then the response array should not be empty
Then the response should contain "<field>" as "<value>"
Then the response should contain "<field>" with value <number>
Then the response time should be less than <milliseconds> milliseconds
Then the response header "<headerName>" should be "<headerValue>"
Then the response field "<field>" should contain an item with "<key>" equal to "<value>"
Then the response field "<field>" should not be empty
Then the response fields "<field1>,<field2>,<field3>" should not be empty
Then the response field "<field>" array items should have key "<key>"

# ── Chained POST from file ──────────────────────────────────────────────────────
# CRITICAL: <responseField> is ALWAYS "id" (the raw JSON key from the API response).
# <mapKey> is the logical name ("allianceId", "fleetId", "squadId"). They are DIFFERENT.
# CORRECT examples:
#   POST /alliances → save response "id" as "allianceId"
#   POST /tribes    → save response "id" as "fleetId"
#   POST /squads    → save response "id" as "squadId"
When I send a POST request to "<endpoint>" with payload from file "<filename.json>" appending timestamp to name and save response "id" as "<mapKey>"

# ── PUT from file — TWO variants, choose based on prompt content ─────────────────
# VARIANT A — USE THIS when the user gives specific field+value pairs to change
#   (table like "| field | value | | name | X |", or "update name to X", "set X to Y"):
When I send a PUT request to "<endpoint>" with payload from file "<filename.json>" overriding fields:
  | field       | value       |
  | <fieldName> | <newValue>  |
# VARIANT B — USE THIS only when no specific field values are given at all:
When I send a PUT request to "<endpoint>" with payload from file "<filename.json>" appending timestamp to name

# ── DataMap verification ────────────────────────────────────────────────────────
When I verify the map contains key "<mapKey>"
Then the map should contain key "<mapKey>"
Then the response body should contain the name saved as "<mapKey>"
${generatedPatterns}

## CONCRETE EXAMPLES — follow these EXACTLY when you see matching prompt patterns

### EXAMPLE 1 — "update with a field+value table"
Prompt says:
  And I update the alliance request payload with the following values:
  | field | value                   |
  | name  | Auto_Internal_Tool_9086 |
  Endpoint: .../alliances/{id}
MUST generate:
    When I send a PUT request to "/alliances/{{allianceId}}" with payload from file "alliance_update.json" overriding fields:
      | field | value                   |
      | name  | Auto_Internal_Tool_9086 |
    Then the response status should be 200
    And the response body should not be empty

### EXAMPLE 2 — "disable the created alliance"
Prompt says:
  And I disable the created alliance
  Endpoint: .../alliances/hierarchy/{id}/enabled/false/draft/false
MUST generate (note: /hierarchy/ segment is REQUIRED, NEVER omit it):
    When I send a PUT request to "/alliances/hierarchy/{{allianceId}}/enabled/false/draft/false" with payload:
      """
      { "enabled": false, "draft": false }
      """
    Then the response status should be 200
    And the response body should not be empty

### EXAMPLE 3 — "verify leaders array contains an item with id" (only when user says verify/check)
Prompt says:
  After creating the alliance, verify the response "leaders" array contains an item with id
MUST generate:
    And the response field "leaders" array items should have key "id"
If the prompt does NOT contain "verify", "check", or similar explicit keyword → do NOT generate this step.

### EXAMPLE 4 — "verify multiple fields not empty" (only when user says verify/check)
Prompt says:
  After creating the fleet, verify:
  - the response field "name" should not be empty
  - the response field "description" should not be empty
  - the response field "allianceId" should not be empty
MUST generate:
    And the response fields "name,description,allianceId" should not be empty
If the prompt does NOT contain explicit verify/check language → do NOT generate any field assertions.
`;
}

// ─── Public interface ─────────────────────────────────────────────────────────

export interface ParsedScenario {
  featureName: string;
  gherkin: string;
}

/**
 * Convert a natural language prompt into a Gherkin feature file using AI.
 * The system prompt is built dynamically — contracts and auto-generated step
 * patterns are included automatically without any code change.
 */
export async function parsePromptToGherkin(prompt: string): Promise<ParsedScenario> {
  logger.info('[PROMPT PARSER] Converting prompt to Gherkin...');

  const gherkin = await callAI(buildSystemPrompt(), prompt);

  const featureMatch = gherkin.match(/Feature:\s*(.+)/);
  const featureName  = featureMatch ? featureMatch[1].trim() : 'Generated Feature';

  logger.info(`[PROMPT PARSER] Generated: "${featureName}"`);
  return { featureName, gherkin };
}

// Allow direct CLI execution: ts-node src/ai/promptParser.ts
if (require.main === module) {
  const prompt = process.argv.slice(2).join(' ') || 'Test GET /users and verify status 200';
  parsePromptToGherkin(prompt).then(({ featureName, gherkin }) => {
    console.log(`\n=== Feature: ${featureName} ===\n`);
    console.log(gherkin);
  });
}
