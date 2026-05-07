import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

export interface StepEntry {
  pattern: string;
  type: 'Given' | 'When' | 'Then' | 'And' | 'But';
  file: string;
  description?: string;
}

const REGISTRY_PATH = path.join(__dirname, '../../output/step-registry.json');

/**
 * StepRegistry — persists all known step patterns so the Reuse Engine
 * can detect duplicates before generating new step definitions.
 */
export class StepRegistry {
  private steps: StepEntry[] = [];

  constructor() {
    this.load();
  }

  private load(): void {
    if (fs.existsSync(REGISTRY_PATH)) {
      try {
        const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
        this.steps = JSON.parse(raw) as StepEntry[];
      } catch {
        this.steps = [];
      }
    }
  }

  private save(): void {
    const dir = path.dirname(REGISTRY_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(this.steps, null, 2));
  }

  /** Register a new step entry. Silently skips if the pattern already exists. */
  register(entry: StepEntry): void {
    if (!this.exists(entry.pattern)) {
      this.steps.push(entry);
      this.save();
      logger.debug(`[REGISTRY] Registered: "${entry.pattern}"`);
    }
  }

  /** Returns true when an exact pattern is already in the registry. */
  exists(pattern: string): boolean {
    return this.steps.some((s) => s.pattern === pattern);
  }

  findByPattern(pattern: string): StepEntry | undefined {
    return this.steps.find((s) => s.pattern === pattern);
  }

  getAll(): StepEntry[] {
    return [...this.steps];
  }

  /** Clear all entries (useful between test runs in development). */
  clear(): void {
    this.steps = [];
    this.save();
  }
}

export const stepRegistry = new StepRegistry();
