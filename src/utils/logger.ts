import * as fs   from 'fs';
import * as path from 'path';

const LOG_LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };

// All framework internals are written here — the terminal stays clean for BDD step output.
const LOG_DIR  = path.join(__dirname, '../../output');
const LOG_FILE = path.join(LOG_DIR, 'run.log');
let   logFileReady = false;

function initLogFile(): void {
  if (logFileReady) return;
  logFileReady = true;
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(LOG_FILE, `── Run: ${new Date().toISOString()} ──\n`, 'utf-8');
  } catch { /* ignore */ }
}

function log(level: string, message: string): void {
  // Re-read LOG_LEVEL on every call so dotenv / env overrides are respected.
  // Framework runs cucumber internally with LOG_LEVEL=debug; we want 'info' for
  // direct cucumber runs where the shell might have a stale LOG_LEVEL in env.
  // The .env file sets LOG_LEVEL=info, which dotenv writes into process.env BEFORE
  // any log call inside step files.  We default to 'info' if not set.
  const activeLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
  if ((LOG_LEVELS[level] ?? 1) < (LOG_LEVELS[activeLevel] ?? 1)) return;

  const ts   = new Date().toISOString();
  const line = `[${ts}] [${level.toUpperCase().padEnd(5)}] ${message}`;

  // Always persist to log file
  try {
    initLogFile();
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8');
  } catch { /* ignore */ }

  // Only show on console in debug mode; errors always go to stderr
  const isDebugMode = activeLevel === 'debug';
  if (isDebugMode) {
    if (level === 'error') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
  } else if (level === 'error') {
    process.stderr.write(line + '\n');
  }
}

export const logger = {
  debug:   (msg: string) => log('debug', msg),
  info:    (msg: string) => log('info',  msg),
  warn:    (msg: string) => log('warn',  msg),
  error:   (msg: string) => log('error', msg),
  /** Always prints to stdout regardless of log level — use for key orchestration milestones. */
  console: (msg: string) => { log('info', msg); process.stdout.write(msg + '\n'); },
};
