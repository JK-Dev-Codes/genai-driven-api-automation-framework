/**
 * Traverse a nested object using a dot-separated path string.
 * e.g. deepGet({ user: { name: "Alice" } }, "user.name") → "Alice"
 */
export function deepGet(obj: unknown, path: string): unknown {
  return path.split('.').reduce((current: unknown, key: string) => {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, obj);
}

/**
 * Safely parse a JSON string. Returns null on failure.
 */
export function safeParseJSON(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

/**
 * Ensure an endpoint string starts with a leading slash.
 */
export function sanitizeEndpoint(endpoint: string): string {
  return endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
}

/**
 * Return true if the value is a non-null, non-array object.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
