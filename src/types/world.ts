import { World, IWorldOptions } from '@cucumber/cucumber';
import { APIRequestContext } from '@playwright/test';
import { ApiResponse } from '../contracts/types';

/**
 * CustomWorld is the shared context object injected into every step definition.
 * It holds the Playwright API request context, last response, and runtime settings.
 */
export class CustomWorld extends World {
  /** Playwright API request context (initialized in Before hook) */
  request!: APIRequestContext;

  /** The last API response captured by a When step */
  response?: ApiResponse;

  /** Active app profile name (matches src/config/apps/<name>.config.json) */
  appName?: string;

  /** Optional bearer token set by auth steps */
  authToken?: string;

  constructor(options: IWorldOptions) {
    super(options);
    // Resolve appName from Cucumber world parameters (set via cucumber.js worldParameters)
    const params = options.parameters as Record<string, unknown>;
    this.appName = (params?.appName as string) || 'default';
  }
}
