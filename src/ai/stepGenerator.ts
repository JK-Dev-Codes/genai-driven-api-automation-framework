import * as fs from 'fs';
import * as path from 'path';
import { callAI } from './aiEngine';
import { reuseEngine } from '../reuse/reuseEngine';
import { GherkinStep, GherkinFeature } from './gherkinParser';
import { logger } from '../utils/logger';

const SYSTEM_PROMPT = `You are a TypeScript + Cucumber expert.
Generate ONLY the TypeScript body of a single Cucumber step definition function.
Use \`executeAPI\` from '../executor/apiExecutor' and the CustomWorld \`this\` context.
Do NOT include imports. Output only the step function.`;

const OUTPUT_DIR = path.join(__dirname, '../../output/generated-steps');

/**
 * Attempt to generate or reuse a step definition for a single Gherkin step.
 * Returns the TypeScript code snippet, or null if the step is already covered.
 */
export async function generateStepDefinition(
  step: GherkinStep,
  featureName: string
): Promise<string | null> {
  const fullPattern = `${step.keyword} ${step.text}`;
  const reuseResult = reuseEngine.checkReuse(fullPattern);

  if (reuseResult.matched) {
    return null; // Covered by an existing step definition
  }

  logger.info(`[STEP GEN] Generating new step: "${fullPattern}"`);

  const code = await callAI(
    SYSTEM_PROMPT,
    `Feature: ${featureName}\nStep: ${step.keyword}('${step.text}', async function(this: CustomWorld) { ... })`
  );

  // Register so future scenarios can reuse it
  const slug = featureName.toLowerCase().replace(/\s+/g, '-');
  reuseEngine.registerStep({
    pattern: fullPattern,
    type: step.keyword as 'Given' | 'When' | 'Then' | 'And' | 'But',
    file: `output/generated-steps/${slug}.steps.ts`,
  });

  return code;
}

/**
 * Process all steps in a parsed feature, generating TypeScript step definition
 * files in output/generated-steps/ for any steps not already covered.
 */
export async function generateStepsForFeature(feature: GherkinFeature): Promise<void> {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const slug = feature.name.toLowerCase().replace(/\s+/g, '-');
  const outputFile = path.join(OUTPUT_DIR, `${slug}.steps.ts`);
  const generated: string[] = [];

  const allSteps = feature.scenarios.flatMap((s) => s.steps);

  for (const step of allSteps) {
    const code = await generateStepDefinition(step, feature.name);
    if (code) generated.push(code);
  }

  if (generated.length > 0) {
    const fileContent = [
      `import { Given, When, Then } from '@cucumber/cucumber';`,
      `import { executeAPI } from '../../src/executor/apiExecutor';`,
      `import { CustomWorld } from '../../src/types/world';`,
      '',
      ...generated,
    ].join('\n\n');

    fs.writeFileSync(outputFile, fileContent, 'utf-8');
    logger.info(`[STEP GEN] Wrote ${generated.length} new step(s) → ${outputFile}`);
  } else {
    logger.info(`[STEP GEN] All steps reused — no new file generated`);
  }
}
