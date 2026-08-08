import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { collectSources, internals } from '../src/collect.mjs';

async function writeJson(root, relativePath, value) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeText(root, relativePath, value) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value, 'utf8');
}

const mapWorkflow = {
  active: false,
  connections: {},
  name: '01 Mapa',
  nodes: [{
    id: 'map',
    name: 'Mapa',
    parameters: {},
    position: [0, 0],
    type: 'n8n-nodes-base.noOp',
    typeVersion: 1,
  }],
};

test('collector stores root-relative workflow occurrences and reuses artifacts by SHA-256', async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), 'sistem-os-collector-'));
  const vault = path.join(sandbox, 'vault');
  const repo = path.join(sandbox, 'repo');
  await writeJson(vault, 'Proyectos/Black Gold/Infraestructura/n8n-hibrido/workflows/01-mapa.json', mapWorkflow);
  await writeJson(vault, 'tmp/black-gold-vault-staging/workflows/01-mapa.json', mapWorkflow);
  await writeJson(repo, 'n8n-blackgold-knowledge/workflows/04-sync.json', {
    ...mapWorkflow,
    name: '04 Sync',
    nodes: [{ ...mapWorkflow.nodes[0], type: 'n8n-nodes-base.httpRequest' }],
  });
  await writeJson(repo, 'graphify-out/not-a-workflow.json', { nodes: [] });

  const manifest = await collectSources({
    roots: [
      { id: 'vault', path: vault },
      { id: 'repo', path: repo },
    ],
  });

  assert.equal(manifest.schema_version, 'source-manifest.v1');
  assert.equal(manifest.artifacts.length, 2);
  assert.equal(manifest.occurrences.length, 3);
  assert.deepEqual(
    manifest.occurrences.map(({ root_id, relative_path, authority, intent }) => ({ root_id, relative_path, authority, intent })),
    [
      {
        root_id: 'repo',
        relative_path: 'n8n-blackgold-knowledge/workflows/04-sync.json',
        authority: 'authoritative',
        intent: 'automation',
      },
      {
        root_id: 'vault',
        relative_path: 'Proyectos/Black Gold/Infraestructura/n8n-hibrido/workflows/01-mapa.json',
        authority: 'authoritative',
        intent: 'map',
      },
      {
        root_id: 'vault',
        relative_path: 'tmp/black-gold-vault-staging/workflows/01-mapa.json',
        authority: 'staging-copy',
        intent: 'map',
      },
    ],
  );
  assert.equal(manifest.rejected_json.length, 1);
  assert.equal(manifest.occurrences[1].artifact_sha256, manifest.occurrences[2].artifact_sha256);
  assert.equal(JSON.stringify(manifest).includes(sandbox), false);
});

test('collector validates the n8n signature, documents exclusions and extracts canonical observations', async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), 'sistem-os-collector-observations-'));
  const vault = path.join(sandbox, 'vault');
  const repo = path.join(sandbox, 'repo');
  await mkdir(repo, { recursive: true });
  await writeJson(vault, 'tmp/automation.json', { ...mapWorkflow, name: 'Temporal' });
  await writeJson(vault, 'node_modules/ignored.json', mapWorkflow);
  await writeJson(vault, 'not-workflow.json', { nodes: [] });
  await writeText(vault, 'invalid.json', '{bad json');
  await writeText(vault, '\u00c1reas/Sistem OS/Estado Operativo.md', 'actualizado: 2026-08-07\n| Orquestaci\u00f3n visual n8n | activo | evidencia |\n');
  await writeText(vault, 'tmp/notas/Estado Operativo.md', '# copia\n');
  await writeText(vault, 'Proyectos/Black Gold/Infraestructura/n8n-hibrido/inventario-servicios.yaml', [
    'actualizado: 2026-08-08',
    'servicios_servidor:',
    '  - nombre: blackgold-n8n',
    '    estado: activo',
    '  - nombre: otro',
  ].join('\n'));

  const manifest = await collectSources({ roots: [{ id: 'vault', path: vault }, { id: 'repo', path: repo }] });

  assert.equal(manifest.occurrences[0].authority, 'temporary');
  assert.equal(manifest.occurrences.some((item) => item.relative_path.includes('node_modules')), false);
  assert.deepEqual(manifest.rejected_json.map((item) => item.reason), ['invalid-json', 'not-n8n-workflow.v1']);
  assert.equal(manifest.rejected_json[0].sha256.length, 64);
  assert.deepEqual(manifest.observations.map((item) => item.value), ['active', 'active']);
  assert.deepEqual(manifest.link_index.notes.map((item) => item.canonical).sort(), [false, true]);

  const invalidNodes = [
    null,
    true,
    { active: true },
    { active: true, connections: null },
    { active: true, connections: {}, name: 1 },
    { active: true, connections: {}, name: 'n', nodes: {} },
    { active: true, connections: {}, name: 'n', nodes: [null] },
    { active: true, connections: {}, name: 'n', nodes: [{ parameters: null }] },
    { active: true, connections: {}, name: 'n', nodes: [{ parameters: {}, position: [] }] },
    { active: true, connections: {}, name: 'n', nodes: [{ parameters: {}, position: [0, 0], type: 1 }] },
    { active: true, connections: {}, name: 'n', nodes: [{ parameters: {}, position: [0, 0], type: 'n', typeVersion: '1' }] },
  ];
  for (const value of invalidNodes) {
    assert.equal(internals.isN8nWorkflow(value), false);
  }
  assert.equal(internals.isN8nWorkflow(mapWorkflow), true);
  assert.equal(internals.classifyAuthority('a/tmp/b.json'), 'temporary');
  assert.equal(internals.classifyAuthority('normal.json'), 'authoritative');
  assert.equal(internals.classifyIntent({ node_types: ['n8n-nodes-base.noOp'] }), 'map');
  assert.equal(internals.classifyIntent({ node_types: ['n8n-nodes-base.httpRequest'] }), 'automation');
  assert.equal(internals.analyseArtifact(mapWorkflow, 'f'.repeat(64)).node_count, 1);
  assert.equal(internals.stateN8nObservation('actualizado: 2026-08-08\n', 'state.md'), null);
  assert.equal(internals.stateN8nObservation('| Orquestaci\u00f3n visual n8n | pausado |', 'state.md').value, 'pausado');
  assert.equal(internals.inventoryN8nObservation('  - nombre: otro\n    estado: activo', 'inventory.yaml'), null);
  assert.equal(internals.inventoryN8nObservation('  - nombre: blackgold-n8n\n  - nombre: otro', 'inventory.yaml'), null);
  assert.equal(internals.inventoryN8nObservation('  - nombre: blackgold-n8n\n    estado: pausado', 'inventory.yaml').value, 'pausado');
  assert.deepEqual((await collectSources({ roots: [{ id: 'repo', path: repo }] })).observations, []);
  await assert.rejects(() => collectSources({ roots: [] }), /at least one/);
  await assert.rejects(() => collectSources({ roots: [{ id: 'vault', path: vault }, { id: 'vault', path: repo }] }), /unique id/);

  const unreadable = path.join(sandbox, 'unreadable');
  await mkdir(path.join(unreadable, '\u00c1reas/Sistem OS/Estado Operativo.md'), { recursive: true });
  await assert.rejects(() => collectSources({ roots: [{ id: 'vault', path: unreadable }] }), /EISDIR|illegal operation/i);
});
