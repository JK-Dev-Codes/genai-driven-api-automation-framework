import * as fs from 'fs';
import { logger } from '../utils/logger';

export interface GherkinStep {
  keyword: 'Given' | 'When' | 'Then' | 'And' | 'But';
  text: string;
  docString?: string;
}

export interface GherkinScenario {
  name: string;
  steps: GherkinStep[];
}

export interface GherkinFeature {
  name: string;
  scenarios: GherkinScenario[];
}

/**
 * Parse a .feature file from disk.
 */
export function parseFeatureFile(filePath: string): GherkinFeature {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Feature file not found: ${filePath}`);
  }
  return parseGherkinContent(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Parse raw Gherkin text into a structured GherkinFeature object.
 */
export function parseGherkinContent(content: string): GherkinFeature {
  const lines = content.split('\n').map((l) => l.trim());

  let featureName = '';
  const scenarios: GherkinScenario[] = [];
  let currentScenario: GherkinScenario | null = null;
  let inDocString = false;
  let docBuffer = '';

  for (const line of lines) {
    if (line.startsWith('Feature:')) {
      featureName = line.replace('Feature:', '').trim();
    } else if (line.startsWith('Scenario:') || line.startsWith('Scenario Outline:')) {
      if (currentScenario) scenarios.push(currentScenario);
      currentScenario = {
        name: line.replace(/^Scenario(?: Outline)?:\s*/, ''),
        steps: [],
      };
    } else if (line === '"""') {
      if (inDocString) {
        // Close docstring — attach to the last step
        if (currentScenario?.steps.length) {
          currentScenario.steps[currentScenario.steps.length - 1].docString = docBuffer.trim();
        }
        inDocString = false;
        docBuffer = '';
      } else {
        inDocString = true;
      }
    } else if (inDocString) {
      docBuffer += line + '\n';
    } else if (currentScenario) {
      const match = line.match(/^(Given|When|Then|And|But)\s+(.+)/);
      if (match) {
        currentScenario.steps.push({
          keyword: match[1] as GherkinStep['keyword'],
          text: match[2],
        });
      }
    }
  }

  if (currentScenario) scenarios.push(currentScenario);

  logger.debug(`[GHERKIN PARSER] "${featureName}" — ${scenarios.length} scenario(s)`);
  return { name: featureName, scenarios };
}
