import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

export interface AuthConfig {
  type: 'Bearer' | 'Basic' | 'ApiKey' | 'None';
  token?: string;
  username?: string;
  password?: string;
  headerName?: string;
  headerValue?: string;
}

export interface AppConfig {
  appName: string;
  baseURL: string;
  auth?: AuthConfig;
  headers?: Record<string, string>;
  timeout?: number;
}

const DEFAULT_CONFIG: AppConfig = {
  appName: 'default',
  baseURL: process.env.API_BASE_URL || process.env.BASE_URL || '',
  // Set API_BASE_URL (preferred) or BASE_URL in your .env file
  auth: process.env.CLIENT_API_TOKEN
    ? { type: 'Bearer', token: process.env.CLIENT_API_TOKEN }
    : { type: 'None' },
  headers: {},
  timeout: parseInt(process.env.TIMEOUT || '30000', 10),
};

/**
 * Loads an app-specific config from src/config/apps/<appName>.config.json.
 * Env-variable placeholders (e.g. ${CLIENT_API_TOKEN}) are resolved at call
 * time so tokens set by BeforeAll hooks are always picked up correctly.
 * Falls back to DEFAULT_CONFIG if the file is not found.
 */
export function loadAppConfig(appName?: string): AppConfig {
  const name = appName || 'default';
  const configPath = path.join(__dirname, 'apps', `${name}.config.json`);

  if (!fs.existsSync(configPath)) {
    if (name !== 'default') {
      console.warn(`[CONFIG] App config for "${name}" not found — using default`);
    }
    // Resolve token at call time (not at module load time)
    return {
      ...DEFAULT_CONFIG,
      baseURL: process.env.API_BASE_URL || process.env.BASE_URL || '',
      auth: process.env.CLIENT_API_TOKEN
        ? { type: 'Bearer', token: process.env.CLIENT_API_TOKEN }
        : { type: 'None' },
    };
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  const loaded = JSON.parse(raw) as AppConfig;

  // Resolve env-variable placeholders like "${CLIENT_API_TOKEN}" at call time
  return resolveEnvPlaceholders(loaded) as AppConfig;
}

function resolveEnvPlaceholders(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] || '');
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvPlaceholders);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, resolveEnvPlaceholders(v)])
    );
  }
  return obj;
}
