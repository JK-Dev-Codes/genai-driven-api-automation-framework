import * as stringSimilarity from 'string-similarity';
import { StepEntry, stepRegistry } from './stepRegistry';

/** Minimum similarity score (0–1) to treat a step as "similar enough" to reuse. */
const SIMILARITY_THRESHOLD = 0.8;

export interface MatchResult {
  matched: boolean;
  step?: StepEntry;
  similarity?: number;
  isExact?: boolean;
}

/**
 * Find the closest existing step for a given pattern.
 * Returns an exact match first; falls back to similarity match above the threshold.
 */
export function findSimilarStep(newPattern: string): MatchResult {
  const allSteps = stepRegistry.getAll();

  if (allSteps.length === 0) {
    return { matched: false };
  }

  const patterns = allSteps.map((s) => s.pattern);
  const result = stringSimilarity.findBestMatch(newPattern, patterns);
  const { rating } = result.bestMatch;

  if (rating >= 1.0) {
    return {
      matched: true,
      step: allSteps[result.bestMatchIndex],
      similarity: rating,
      isExact: true,
    };
  }

  if (rating >= SIMILARITY_THRESHOLD) {
    return {
      matched: true,
      step: allSteps[result.bestMatchIndex],
      similarity: rating,
      isExact: false,
    };
  }

  return { matched: false };
}
