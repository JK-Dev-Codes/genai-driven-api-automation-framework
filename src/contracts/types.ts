/** Supported HTTP methods */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * API Contract — describes a single API operation.
 * Stored as JSON in src/contracts/definitions/.
 */
export interface ApiContract {
  name: string;
  method: HttpMethod;
  endpoint: string;
  headers?: Record<string, string>;
  payload?: Record<string, unknown>;
  queryParams?: Record<string, string>;
  expectedStatus: number;
  responseSchema?: Record<string, unknown>;
}

/**
 * Runtime request built from a step definition.
 */
export interface ApiRequest {
  method: string;
  endpoint: string;
  payload?: Record<string, unknown>;
  headers?: Record<string, string>;
  queryParams?: Record<string, string | number | boolean>;
}

/**
 * Normalised response returned by the executor.
 */
export interface ApiResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  duration: number;
}
