import * as fs from 'fs';
import * as path from 'path';

export interface TestResult {
  scenario: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
}

const REPORT_DIR = path.join(__dirname, '../../output');

/**
 * Persist a JSON summary of test results to output/test-results.json.
 */
export function saveTestResults(results: TestResult[]): void {
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  const report = {
    timestamp: new Date().toISOString(),
    total: results.length,
    passed: results.filter((r) => r.status === 'passed').length,
    failed: results.filter((r) => r.status === 'failed').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    results,
  };

  const reportPath = path.join(REPORT_DIR, 'test-results.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}
