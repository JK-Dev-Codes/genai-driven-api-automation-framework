import { StepEntry, stepRegistry } from './stepRegistry';
import { findSimilarStep, MatchResult } from './similarityMatcher';
import { logger } from '../utils/logger';

/**
 * ReuseEngine — central deduplication controller.
 *
 * Before any step definition is generated, the engine checks whether
 * an identical or sufficiently similar step already exists and should
 * be reused instead of creating a duplicate.
 */
export class ReuseEngine {
  /**
   * Check whether an existing step can be reused for the given pattern.
   *
   * @returns MatchResult — { matched: true, step, isExact, similarity } if reusable,
   *                        { matched: false } if a new step must be generated.
   */
  checkReuse(pattern: string): MatchResult {
    // 1. Exact match
    const exact = stepRegistry.findByPattern(pattern);
    if (exact) {
      logger.info(`[REUSE] ✅ Exact match: "${pattern}"`);
      return { matched: true, step: exact, isExact: true, similarity: 1.0 };
    }

    // 2. Similarity match
    const similar = findSimilarStep(pattern);
    if (similar.matched) {
      const pct = ((similar.similarity ?? 0) * 100).toFixed(1);
      logger.info(`[REUSE] ~✅ Similar match (${pct}%): "${similar.step?.pattern}"`);
      return similar;
    }

    logger.info(`[REUSE] ❌ No match — new step required: "${pattern}"`);
    return { matched: false };
  }

  /** Register a newly generated step so future scenarios can reuse it. */
  registerStep(entry: StepEntry): void {
    stepRegistry.register(entry);
  }
}

export const reuseEngine = new ReuseEngine();
