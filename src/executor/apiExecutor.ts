import { APIRequestContext } from '@playwright/test';
import { ApiRequest, ApiResponse } from '../contracts/types';
import { loadAppConfig } from '../config/configLoader';
import { logger } from '../utils/logger';

/**
 * Generic API Executor — the single engine that handles all HTTP requests.
 *
 * @param request   Normalised API request descriptor built in step definitions
 * @param context   Playwright APIRequestContext (provided by the Before hook)
 * @param appName   Optional app profile name to resolve base URL & auth
 */
export async function executeAPI(
  request: ApiRequest,
  context: APIRequestContext,
  appName?: string
): Promise<ApiResponse> {
  const config = loadAppConfig(appName);
  const url = `${config.baseURL}${sanitizeEndpoint(request.endpoint)}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(config.headers ?? {}),
    ...(request.headers ?? {}),
  };

  // Inject auth headers from app config
  if (config.auth) {
    switch (config.auth.type) {
      case 'Bearer':
        if (config.auth.token) {
          headers['Authorization'] = `Bearer ${config.auth.token}`;
        }
        break;
      case 'Basic': {
        const credentials = Buffer.from(
          `${config.auth.username}:${config.auth.password}`
        ).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
        break;
      }
      case 'ApiKey':
        if (config.auth.headerName && config.auth.headerValue) {
          headers[config.auth.headerName] = config.auth.headerValue;
        }
        break;
    }
  }

  const method = request.method.toUpperCase();
  logger.info(`[EXECUTOR] ${method} ${url}`);

  const startTime = Date.now();
  let playwrightResponse;

  switch (method) {
    case 'GET':
      playwrightResponse = await context.get(url, {
        headers,
        params: request.queryParams,
      });
      break;
    case 'POST':
      playwrightResponse = await context.post(url, {
        headers,
        data: request.payload,
      });
      break;
    case 'PUT':
      playwrightResponse = await context.put(url, {
        headers,
        data: request.payload,
      });
      break;
    case 'PATCH':
      playwrightResponse = await context.patch(url, {
        headers,
        data: request.payload,
      });
      break;
    case 'DELETE':
      playwrightResponse = await context.delete(url, { headers });
      break;
    default:
      throw new Error(`[EXECUTOR] Unsupported HTTP method: ${method}`);
  }

  const duration = Date.now() - startTime;
  const status = playwrightResponse.status();
  const body = await playwrightResponse.json().catch(() => null);
  const responseHeaders = playwrightResponse.headers() as Record<string, string>;

  logger.info(`[EXECUTOR] Response: ${status} (${duration}ms)`);
  logger.debug(`[EXECUTOR] Body: ${JSON.stringify(body, null, 2)}`);

  return { status, body, headers: responseHeaders, duration };
}

function sanitizeEndpoint(endpoint: string): string {
  return endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
}
