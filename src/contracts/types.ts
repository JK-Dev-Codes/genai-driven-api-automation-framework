/** Supported HTTP methods */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Describes the contract for a single HTTP operation on an endpoint.
 */
export interface OperationContract {
  /** Fields that MUST be present in the request body for this operation */
  requiredFields?: string[];
  /** Top-level fields that appear in the response for this operation */
  responseFields?: string[];
  /** true when this operation returns a bare JSON array instead of an object */
  responseIsArray?: boolean;
}

/**
 * Full entity contract — describes all HTTP operations on one resource.
 * Stored as JSON in src/contracts/definitions/<entity>.contract.json
 *
 * Used by the AI prompt engine to:
 *   - Know which fields are required for POST/PUT (prevents incomplete payloads)
 *   - Know which fields appear in GET vs POST responses (prevents wrong assertions)
 *   - Determine the correct data file names
 */
export interface ApiContract {
  /** Entity name, e.g. "alliance" */
  entity: string;
  /** Base endpoint path, e.g. "/alliances" */
  endpoint: string;
  /** dataMap key to save the created entity's id under, e.g. "allianceId" */
  mapKey: string;
  /** Data file to use for POST, relative to src/data/ — e.g. "alliance.json" */
  payloadFile?: string;
  /** Data file to use for PUT, relative to src/data/ — e.g. "alliance_update.json" */
  updatePayloadFile?: string;
  /** Per-operation field contracts */
  operations: {
    POST?: OperationContract;
    GET?: OperationContract;
    GET_BY_ID?: OperationContract;
    PUT?: OperationContract;
    PATCH?: OperationContract;
    DELETE?: OperationContract;
  };
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
