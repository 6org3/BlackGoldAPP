import assert from 'node:assert/strict';
import test from 'node:test';

import { renderObsidian, validateRenderedLinks } from '../src/render.mjs';

const registry = {
  schema_version: 'agent-registry.v1',
  entities: [
    { id: 'lily', kind: 'agent', label: 'Lily', boundary: 'Black Gold público' },
    { id: 'crm', kind: 'service', label: 'CRM privado', boundary: 'Black Gold privado' },
  ],
  relations: [{
    id: 'lily-crm',
    from: 'lily',
    to: 'crm',
    type: 'writes',
    allowed_data: 'structured-crm-fields',
    approval: 'C',
    source: 'Áreas/Sistem OS/Estado Operativo.md',
    source_date: '2026-08-07',
    confidence: 'high',
    status_kind: 'declared',
  }],
  claims: [{
    id: 'lily-state',
    subject_id: 'lily',
    predicate: 'lifecycle',
    value: 'active',
    source: 'Áreas/Sistem OS/Estado Operativo.md',
    source_date: '2026-08-07',
    observed_at: null,
    freshness_class: 'static',
    valid_until: null,
    confidence: 'high',
    status_kind: 'declared',
  }],
};

const manifest = {
  schema_version: 'source-manifest.v1',
  source_digest: 'sha256:manifest-digest',
  artifacts: [{
    sha256: 'a'.repeat(64),
    name: '01 mapa',
    declared_active: false,
    node_count: 1,
    node_types: ['n8n-nodes-base.noOp'],
  }],
  occurrences: [{
    root_id: 'vault',
    relative_path: 'Proyectos/Black Gold/Infraestructura/n8n-hibrido/workflows/01-mapa.json',
    artifact_sha256: 'a'.repeat(64),
    authority: 'authoritative',
    intent: 'map',
    observed_state: 'unknown',
  }],
  link_index: {
    notes: [{
      relative_path: 'Áreas/Sistem OS/Estado Operativo.md',
      title: 'Estado Operativo',
      canonical: true,
    }],
  },
};

test('renderer produces deterministic LF Obsidian artifacts with canonical links', () => {
  const files = renderObsidian({
    registry,
    manifest,
    validation: { errors: [], drift: [] },
  });

  assert.deepEqual(Object.keys(files), [
    'Catálogo Visual de Workflows.md',
    'Deriva de Sistem OS.md',
    'Mapa Visual de Sistem OS.canvas',
    'Mapa Visual de Sistem OS.md',
  ]);
  const map = files['Mapa Visual de Sistem OS.md'];
  assert.match(map, /^---\ntipo: generado\nautoridad: derivada\nfecha_fuentes: 2026-08-07\ninput_digest: sha256:/);
  assert.match(map, /\[\[Áreas\/Sistem OS\/Estado Operativo\|Estado Operativo\]\]/);
  assert.equal(map.includes('\r'), false);
  assert.equal(map.includes('fecha_ejecucion'), false);
  assert.deepEqual(validateRenderedLinks(files, manifest.link_index), []);
  assert.deepEqual(JSON.parse(files['Mapa Visual de Sistem OS.canvas']).edges.length, 1);
});

test('rendered link validation rejects a non-canonical or missing destination', () => {
  const errors = validateRenderedLinks({
    'broken.md': '[[Estado Operativo]]\n[[Áreas/Sistem OS/Faltante|Faltante]]\n',
  }, manifest.link_index);
  assert.deepEqual(errors.map((item) => item.code), ['LINK_NONCANONICAL', 'LINK_MISSING']);
});

test('renderer represents drift and unknown source/state values without inventing links', () => {
  const files = renderObsidian({
    registry: {
      schema_version: 'agent-registry.v1',
      entities: [{ id: 'unknown', kind: 'service', label: 'Unknown' }],
      relations: [{
        id: 'unknown-relation',
        from: 'unknown',
        to: 'absent',
        type: 'reads',
        allowed_data: 'none',
        approval: 'A',
        source: 'evidence.yaml',
        source_date: null,
        confidence: 'unknown',
        status_kind: 'unknown',
      }],
      claims: [],
    },
    manifest: { ...manifest, artifacts: [], occurrences: [] },
    validation: { errors: [{ code: 'TEST_ERROR', source: 'fixture' }], drift: [{ code: 'TEST_DRIFT' }] },
  });

  assert.match(files['Mapa Visual de Sistem OS.md'], /sin señal/);
  assert.match(files['Mapa Visual de Sistem OS.md'], /evidence.yaml/);
  assert.match(files['Deriva de Sistem OS.md'], /TEST_ERROR/);
  assert.match(files['Deriva de Sistem OS.md'], /TEST_DRIFT/);
  assert.match(files['Mapa Visual de Sistem OS.md'], /Sin frontera declarada/);
  assert.deepEqual(validateRenderedLinks(files, manifest.link_index), []);
});

test('renderer keeps structural fallbacks deterministic when optional collections are absent', () => {
  const files = renderObsidian({
    registry: {
      schema_version: 'agent-registry.v1',
      entities: [
        { id: 'one', kind: 'service', label: 'One', boundary: 'Shared' },
        { id: 'two', kind: 'service', label: 'Two', boundary: 'Shared' },
      ],
      relations: [
        {
          id: 'outside-two',
          from: 'missing-from',
          to: 'missing-to',
          type: 'reads',
          allowed_data: 'none',
          approval: 'A',
        },
        {
          id: 'outside-one',
          from: 'missing-from',
          to: 'missing-to',
          type: 'reads',
          allowed_data: 'none',
          approval: 'A',
        },
      ],
    },
    manifest: {
      schema_version: 'source-manifest.v1',
      source_digest: 'sha256:empty',
      occurrences: [{
        root_id: 'vault',
        relative_path: 'missing-artifact.json',
        artifact_sha256: 'z'.repeat(64),
        authority: 'temporary',
        intent: 'unknown',
        observed_state: 'unknown',
      }],
      link_index: { notes: [] },
    },
    validation: {},
  });

  assert.match(files['Mapa Visual de Sistem OS.md'], /sin fuente/);
  assert.match(files['Mapa Visual de Sistem OS.md'], /missing-from/);
  assert.match(files['Catálogo Visual de Workflows.md'], /desconocido/);
  assert.match(files['Catálogo Visual de Workflows.md'], /fecha_fuentes: sin-fecha/);
  assert.deepEqual(validateRenderedLinks({}, { notes: [] }), []);
});

test('renderer handles omitted optional lists and link indexes', () => {
  const files = renderObsidian({
    registry: { schema_version: 'agent-registry.v1' },
    manifest: { schema_version: 'source-manifest.v1', source_digest: 'sha256:none' },
    validation: {},
  });
  assert.match(files['Catálogo Visual de Workflows.md'], /0 ocurrencias y 0 artefactos/);
  assert.deepEqual(validateRenderedLinks({ 'missing.md': '[[No existe]]' }), [{
    code: 'LINK_MISSING',
    file: 'missing.md',
    destination: 'No existe',
  }]);
});
