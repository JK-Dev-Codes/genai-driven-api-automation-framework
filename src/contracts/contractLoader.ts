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

/**
 * Build a human-readable summary of all contract definitions.
 * Injected into the AI prompt so it has ground-truth API schema knowledge —
 * which fields are required per operation, and which fields appear in responses.
 */
export function buildContractContext(): string {
  const names = listContracts();
  if (names.length === 0) return '';

  return names
    .map((name) => {
      const c = loadContract(name);
      const lines: string[] = [
        `### ${c.entity} — endpoint: ${c.endpoint}`,
        `  mapKey: "${c.mapKey}"`,
        c.payloadFile ? `  POST data file: "${c.payloadFile}"` : '',
        c.updatePayloadFile ? `  PUT data file: "${c.updatePayloadFile}"` : '',
      ];

      for (const [op, contract] of Object.entries(c.operations)) {
        if (!contract) continue;
        lines.push(`  ${op}:`);
        if (contract.requiredFields?.length) {
          lines.push(`    required body fields: [${contract.requiredFields.join(', ')}]`);
        }
        if (contract.responseFields?.length) {
          lines.push(`    response fields: [${contract.responseFields.join(', ')}]`);
        }
        if (contract.responseIsArray) {
          lines.push(`    returns: bare JSON array`);
        }
      }

      return lines.filter(Boolean).join('\n');
    })
    .join('\n\n');
}
