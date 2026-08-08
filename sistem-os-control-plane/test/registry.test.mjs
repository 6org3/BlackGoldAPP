import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadRegistry, parseRegistry } from '../src/registry.mjs';

test('registry parser accepts the public v1 YAML shape and preserves scalar values', () => {
  const registry = parseRegistry(`
schema_version: agent-registry.v1
entities:
  - id: york
    kind: agent
    label: York
claims: []
relations: []
workflow_occurrences: []
`);

  assert.equal(registry.entities[0].id, 'york');
  assert.equal(registry.schema_version, 'agent-registry.v1');
});

test('registry parser rejects malformed YAML', () => {
  assert.throws(() => parseRegistry('entities: [unterminated'), /YAML/);
  assert.throws(() => parseRegistry('[]'), /mapping/);
});

test('registry loader reads a YAML file', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sistem-os-registry-'));
  const registryPath = path.join(directory, 'registry.yaml');
  await writeFile(registryPath, 'schema_version: agent-registry.v1\nentities: []\nrelations: []\nclaims: []\nworkflow_occurrences: []\n', 'utf8');
  assert.equal((await loadRegistry(registryPath)).schema_version, 'agent-registry.v1');
});
