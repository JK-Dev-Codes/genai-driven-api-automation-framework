import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

const MOCK_MODE =
  !process.env.OPENAI_API_KEY ||
  process.env.OPENAI_API_KEY === 'mock' ||
  process.env.OPENAI_API_KEY === '';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    });
  }
  return client;
}

/**
 * Send a prompt to the configured LLM and return the text response.
 * Falls back to a mock implementation when OPENAI_API_KEY is absent / "mock".
 */
export async function callAI(systemPrompt: string, userMessage: string): Promise<string> {
  if (MOCK_MODE) {
    console.warn('[AI ENGINE] ⚠️  Running in MOCK mode. Set OPENAI_API_KEY for real AI responses.');
    return mockResponse(userMessage);
  }

  const response = await getClient().chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMessage },
    ],
    temperature: 0.2,
  });

  return response.choices[0]?.message?.content ?? '';
}

/**
 * Mock responses used when no API key is configured (POC / offline mode).
 */
function mockResponse(input: string): string {
  // If the input already looks like Gherkin, return it unchanged
  if (/^\s*Feature:/m.test(input)) {
    return input;
  }

  // Otherwise return a minimal generated feature stub
  return `Feature: Auto-Generated Feature
  Scenario: Generated from natural language prompt
    Given the API base URL is configured
    When I send a "GET" request to "/mock"
    Then the response status should be 200
    And the response body should not be empty`;
}
