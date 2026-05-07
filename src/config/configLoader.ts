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
  baseURL: process.env.BASE_URL || '',
  // Set BASE_URL in your .env file or via environment variable
  auth: { type: 'None' },
  headers: {},
  timeout: parseInt(process.env.TIMEOUT || '30000', 10),
};

/**
 * Loads an app-specific config from src/config/apps/<appName>.config.json.
 * Falls back to the default config if the file is not found.
 */
export function loadAppConfig(appName?: string): AppConfig {
  if (!appName || appName === 'default') {
    return { ...DEFAULT_CONFIG };
  }

  const configPath = path.join(__dirname, 'apps', `${appName}.config.json`);

  if (!fs.existsSync(configPath)) {
    console.warn(`[CONFIG] App config for "${appName}" not found — using default`);
    return { ...DEFAULT_CONFIG };
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  const loaded = JSON.parse(raw) as AppConfig;

  // Resolve env-variable placeholders like "${CLIENT_API_TOKEN}"
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
