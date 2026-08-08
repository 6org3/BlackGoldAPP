import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { internals, run } from '../src/cli.mjs';

const workflow = {
  active: false,
  connections: {},
  name: 'Workflow fixture',
  nodes: [{
    parameters: {},
    position: [0, 0],
    type: 'n8n-nodes-base.noOp',
    typeVersion: 1,
  }],
};

async function fixture() {
  const base = await mkdtemp(path.join(os.tmpdir(), 'sistem-os-cli-'));
  const vault = path.join(base, 'vault');
  const repo = path.join(base, 'repo');
  await mkdir(path.join(base, 'data'), { recursive: true });
  await mkdir(vault, { recursive: true });
  await mkdir(path.join(repo, 'workflows'), { recursive: true });
  await writeFile(path.join(repo, 'workflows', 'fixture.json'), `${JSON.stringify(workflow)}\n`, 'utf8');
  await writeFile(path.join(base, 'data', 'system-registry.yaml'), [
    'schema_version: agent-registry.v1',
    'entities: []',
    'relations: []',
    'claims: []',
    'workflow_occurrences:',
    '  - root_id: repo',
    '    relative_path: workflows/fixture.json',
  ].join('\n'), 'utf8');
  await writeFile(path.join(base, 'data', 'invalid-registry.yaml'), 'schema_version: wrong\nentities: []\nrelations: []\nclaims: []\nworkflow_occurrences: []\n', 'utf8');
  return { base, repo, vault };
}

test('CLI runs collect, validate, render and all with only declared roots', async () => {
  const { base, repo, vault } = await fixture();
  const rootArgs = ['--vault-root', vault, '--repo-root', repo];
  const all = await run(['all', ...rootArgs], base);
  assert.deepEqual(all, { code: 0, summary: 'pipeline: 1 occurrence(s), 0 drift finding(s), 4 artifact(s)' });
  assert.match(await readFile(path.join(base, 'reports', 'source-reconciliation.md'), 'utf8'), /1 ocurrencias/);
  assert.match(await readFile(path.join(vault, 'Áreas', 'Sistem OS', 'Mapa Visual de Sistem OS.md'), 'utf8'), /Mapa Visual/);
  assert.equal((await run(['all', ...rootArgs, '--registry', path.join(base, 'data', 'invalid-registry.yaml')], base)).code, 1);

  assert.equal((await run(['collect', ...rootArgs], base)).code, 0);
  assert.equal((await run(['validate'], base)).code, 0);
  assert.equal((await run(['render', '--vault-root', vault], base)).code, 0);
  assert.equal((await run(['validate', '--registry', path.join(base, 'data', 'invalid-registry.yaml')], base)).code, 1);
  await assert.rejects(() => run(['collect', '--vault-root', vault], base), /Usage/);
  const brokenLinkRegistry = path.join(base, 'data', 'broken-link-registry.yaml');
  await writeFile(brokenLinkRegistry, [
    'schema_version: agent-registry.v1',
    'entities:',
    '  - id: only',
    '    kind: service',
    '    label: Only',
    'relations:',
    '  - id: broken-source',
    '    from: only',
    '    to: only',
    '    type: reads',
    '    allowed_data: none',
    '    approval: A',
    '    source: Missing.md',
    '    source_date: 2026-08-08',
    '    confidence: high',
    '    status_kind: declared',
    'claims: []',
    'workflow_occurrences:',
    '  - root_id: repo',
    '    relative_path: workflows/fixture.json',
  ].join('\n'), 'utf8');
  await assert.rejects(() => run(['render', '--vault-root', vault, '--registry', brokenLinkRegistry], base), /unresolved Obsidian links/);
  await assert.rejects(() => run(['render'], base), /Usage/);
  await assert.rejects(() => run(['unknown'], base), /Usage/);
});

test('CLI parser rejects incomplete and unsupported arguments and reports deterministic reconciliation', () => {
  assert.throws(() => internals.parseArguments(['collect', 'vault']), /Usage/);
  assert.throws(() => internals.parseArguments(['collect', '--nope', 'value']), /Usage/);
  assert.deepEqual(internals.parseArguments(['validate', '--manifest', 'report.json']), {
    command: 'validate',
    options: { manifest: 'report.json' },
  });
  assert.match(internals.reconciliationReport({
    source_roots: [{ root_id: 'vault' }],
    declared_exclusions: ['tmp'],
    occurrences: [{ authority: 'temporary' }],
    artifacts: [],
    rejected_json: [],
  }), /Copias no autoritativas: 1/);
});
