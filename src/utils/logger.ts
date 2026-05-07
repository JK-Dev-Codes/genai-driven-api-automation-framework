const LOG_LEVELS: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const activeLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();

function log(level: string, message: string): void {
  if ((LOG_LEVELS[level] ?? 1) >= (LOG_LEVELS[activeLevel] ?? 1)) {
    const ts = new Date().toISOString();
    const line = `[${ts}] [${level.toUpperCase().padEnd(5)}] ${message}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }
}

export const logger = {
  debug: (msg: string) => log('debug', msg),
  info:  (msg: string) => log('info',  msg),
  warn:  (msg: string) => log('warn',  msg),
  error: (msg: string) => log('error', msg),
};
