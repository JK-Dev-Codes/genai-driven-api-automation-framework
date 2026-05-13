/**
 * Auto-generated step definitions.
 *
 * This file is managed by the self-healing mechanism in src/ai/runFromPrompt.ts.
 * When `npm run prompt` detects undefined steps in a generated feature file it
 * uses AI to generate TypeScript implementations and appends them here.
 *
 * ✅ DO: commit this file — accumulated implementations speed up future runs.
 * ⚠️  DON'T: manually delete implementations — the self-healer will re-add them.
 */

import { Given, When, Then } from '@cucumber/cucumber';
import * as fs from 'fs';
import * as path from 'path';
import { CustomWorld } from '../types/world';
import { executeAPI } from '../executor/apiExecutor';
import { logger } from '../utils/logger';
import { deepGet } from '../utils/helpers';

const DATA_DIR = path.join(__dirname, '../../src/data');

// ─── Auto-generated steps are appended below this line ───────────────────────
