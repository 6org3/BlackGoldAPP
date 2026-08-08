import { readFile } from 'node:fs/promises';
import { parseDocument } from 'yaml';

export function parseRegistry(source) {
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new Error(`YAML registry parse error: ${document.errors[0].message}`);
  }
  const registry = document.toJS();
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new Error('YAML registry must contain a mapping at its root');
  }
  return registry;
}

export async function loadRegistry(registryPath) {
  return parseRegistry(await readFile(registryPath, 'utf8'));
}
