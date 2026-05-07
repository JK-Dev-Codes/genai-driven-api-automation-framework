import { callAI } from './aiEngine';
import { logger } from '../utils/logger';

const SYSTEM_PROMPT = `You are an expert API test automation engineer specialising in BDD.
Convert the user's natural language description into a valid Gherkin feature file.
Output ONLY valid Gherkin syntax — no markdown code fences, no explanation.

Allowed step patterns:
- Given the API base URL is configured
- Given I set the app to {string}
- When I send a {string} request to {string}
- When I send a POST request to {string} with payload: (followed by a JSON docstring)
- When I send a PUT request to {string} with payload: (followed by a JSON docstring)
- When I send a PATCH request to {string} with payload: (followed by a JSON docstring)
- Then the response status should be {int}
- Then the response should contain {string} as {string}
- Then the response should contain {string} with value {int}
- Then the response body should not be empty
- Then the response array should not be empty
- Then the response time should be less than {int} milliseconds
- Then the response header {string} should be {string}`;

export interface ParsedScenario {
  featureName: string;
  gherkin: string;
}

/**
 * Use the AI engine to convert a natural language prompt into a Gherkin feature.
 */
export async function parsePromptToGherkin(prompt: string): Promise<ParsedScenario> {
  logger.info('[PROMPT PARSER] Converting prompt to Gherkin...');

  const gherkin = await callAI(SYSTEM_PROMPT, prompt);

  const featureMatch = gherkin.match(/Feature:\s*(.+)/);
  const featureName = featureMatch ? featureMatch[1].trim() : 'Generated Feature';

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
