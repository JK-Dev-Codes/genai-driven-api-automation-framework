import { Given } from '@cucumber/cucumber';
import { CustomWorld } from '../types/world';
import { logger } from '../utils/logger';

/**
 * Auth steps set runtime credentials on the World.
 * The apiExecutor reads auth from the app config; these steps override it
 * for scenarios that need per-test credentials.
 */

