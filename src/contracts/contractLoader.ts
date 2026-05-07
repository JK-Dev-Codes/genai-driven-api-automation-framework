import * as fs from 'fs';
import * as path from 'path';
import { ApiContract } from './types';

const CONTRACT_DIR = path.join(__dirname, 'definitions');

/**
 * Load a named API contract from src/contracts/definitions/<name>.contract.json
 */
export function loadContract(contractName: string): ApiContract {
  const contractPath = path.join(CONTRACT_DIR, `${contractName}.contract.json`);

  if (!fs.existsSync(contractPath)) {
    throw new Error(`Contract "${contractName}" not found at: ${contractPath}`);
  }

  const raw = fs.readFileSync(contractPath, 'utf-8');
  return JSON.parse(raw) as ApiContract;
}

/**
 * Return all registered contract names (without extension).
 */
export function listContracts(): string[] {
  if (!fs.existsSync(CONTRACT_DIR)) return [];
  return fs
    .readdirSync(CONTRACT_DIR)
    .filter((f) => f.endsWith('.contract.json'))
    .map((f) => f.replace('.contract.json', ''));
}
