import assert from 'node:assert/strict';
import test from 'node:test';

import { internals, validateRegistry } from '../src/validate.mjs';

function claim(overrides = {}) {
  return {
    id: 'claim-n8n-state',
    subject_id: 'blackgold-n8n',
    predicate: 'deployment_state',
    value: 'active',
    source: 'Áreas/Sistem OS/Estado Operativo.md',
    source_date: '2026-08-07',
    observed_at: null,
    freshness_class: 'deployment',
    valid_until: '2026-08-14T00:00:00Z',
    confidence: 'high',
    status_kind: 'declared',
    ...overrides,
  };
}

function registry(overrides = {}) {
  return {
    schema_version: 'agent-registry.v1',
    entities: [
      { id: 'blackgold-n8n', kind: 'service', label: 'n8n' },
      { id: 'lily', kind: 'agent', label: 'Lily' },
    ],
    relations: [{
      id: 'lily-writes-crm',
      from: 'lily',
      to: 'blackgold-n8n',
      type: 'writes',
      allowed_data: 'structured-crm-fields',
      approval: 'C',
      source: 'Áreas/Sistem OS/Estado Operativo.md',
      source_date: '2026-08-07',
      confidence: 'medium',
      status_kind: 'declared',
    }],
    claims: [claim()],
    workflow_occurrences: [{
      root_id: 'vault',
      relative_path: 'Proyectos/Black Gold/Infraestructura/n8n-hibrido/workflows/01-mapa.json',
    }],
    ...overrides,
  };
}

function manifest(overrides = {}) {
  return {
    schema_version: 'source-manifest.v1',
    occurrences: [{
      root_id: 'vault',
      relative_path: 'Proyectos/Black Gold/Infraestructura/n8n-hibrido/workflows/01-mapa.json',
      artifact_sha256: 'a'.repeat(64),
    }],
    observations: [{
      subject_id: 'blackgold-n8n',
      predicate: 'deployment_state',
      value: 'por_desplegar',
      source: 'Proyectos/Black Gold/Infraestructura/n8n-hibrido/inventario-servicios.yaml',
    }],
    ...overrides,
  };
}

test('validator reports the known n8n-state drift and unregistered workflow occurrences', () => {
  const result = validateRegistry({
    registry: registry(),
    manifest: manifest({
      occurrences: [
        ...manifest().occurrences,
        {
          root_id: 'repo',
          relative_path: 'n8n-blackgold-knowledge/workflows/04-sync.json',
          artifact_sha256: 'b'.repeat(64),
        },
      ],
    }),
    now: '2026-08-08T00:00:00Z',
  });

  assert.equal(result.errors.length, 0);
  assert.deepEqual(
    result.drift.map((item) => item.code),
    ['CLAIM_CONTRADICTION', 'WORKFLOW_UNREGISTERED'],
  );
});

test('validator rejects duplicate IDs, sensitive fields and a live runtime state without an observation', () => {
  const result = validateRegistry({
    registry: registry({
      entities: [
        ...registry().entities,
        { id: 'lily', kind: 'agent', label: 'Lily again', api_token: 'never-allowed' },
      ],
      claims: [claim({
        id: 'claim-lily-runtime',
        subject_id: 'lily',
        predicate: 'runtime_state',
        value: 'active',
        status_kind: 'declared',
        observed_at: null,
      })],
    }),
    manifest: manifest({ observations: [] }),
    now: '2026-08-08T00:00:00Z',
  });

  assert.deepEqual(
    result.errors.map((item) => item.code),
    ['DUPLICATE_ENTITY_ID', 'SENSITIVE_FIELD', 'LIVE_RUNTIME_NOT_OBSERVED'],
  );
});

test('validator covers malformed entities, relations, claims, expiry and stale registry occurrences', () => {
  const baseRelation = registry().relations[0];
  const result = validateRegistry({
    registry: registry({
      schema_version: 'wrong-version',
      entities: [
        {},
        { id: 'lily', kind: 'agent', label: 'Lily' },
        { id: 'lily', kind: 'agent', label: 'Lily duplicate' },
      ],
      relations: [
        {},
        { ...baseRelation, id: 'duplicate-relation', from: 'lily', to: 'missing', approval: 'Z' },
        { ...baseRelation, id: 'duplicate-relation' },
      ],
      claims: [
        {},
        { id: 'partial' },
        claim({ id: 'duplicate-claim', subject_id: 'missing', valid_until: '2026-08-01T00:00:00Z' }),
        claim({ id: 'duplicate-claim', subject_id: 'lily' }),
        claim({
          id: 'runtime-without-observed-at',
          subject_id: 'lily',
          predicate: 'runtime_state',
          value: 'active',
          status_kind: 'observed',
          observed_at: null,
        }),
      ],
      workflow_occurrences: [{ root_id: 'vault', relative_path: 'gone.json' }],
      api_key: 'sk_abcdefghijklmnop',
    }),
    manifest: manifest({ schema_version: 'wrong-manifest', observations: [{
      subject_id: 'blackgold-n8n',
      predicate: 'deployment_state',
      value: 'active',
      source: 'match.md',
    }] }),
    now: '2026-08-08T00:00:00Z',
  });
  const errorCodes = result.errors.map((item) => item.code);
  const driftCodes = result.drift.map((item) => item.code);
  for (const code of [
    'REGISTRY_SCHEMA_INVALID',
    'MANIFEST_SCHEMA_INVALID',
    'ENTITY_FIELDS_MISSING',
    'DUPLICATE_ENTITY_ID',
    'RELATION_FIELDS_MISSING',
    'DUPLICATE_RELATION_ID',
    'RELATION_ENDPOINT_MISSING',
    'RELATION_APPROVAL_INVALID',
    'CLAIM_FIELDS_MISSING',
    'DUPLICATE_CLAIM_ID',
    'CLAIM_SUBJECT_MISSING',
    'SENSITIVE_FIELD',
  ]) {
    assert.equal(errorCodes.includes(code), true, code);
  }
  assert.equal(driftCodes.includes('CLAIM_EXPIRED'), true);
  assert.equal(driftCodes.includes('WORKFLOW_REGISTRY_STALE'), true);
  assert.equal(result.valid, false);
});

test('privacy checks handle arrays, common secret forms and safe dates without retaining the value', () => {
  assert.equal(internals.containsSensitiveValue(7), false);
  assert.equal(internals.containsSensitiveValue('2026-08-08'), false);
  for (const value of [
    'person@example.com',
    '+593 99 123 4567',
    'eyJabc.def.ghi',
    'sk_abcdefghijklmnop',
  ]) {
    assert.equal(internals.containsSensitiveValue(value), true);
  }
  const findings = internals.findSensitiveFields([{ value: 'person@example.com' }, { phone: 'safe' }]);
  assert.deepEqual(findings.map((item) => item.code), ['SENSITIVE_FIELD', 'SENSITIVE_FIELD']);
  assert.equal(internals.occurrenceKey({ root_id: 'vault', relative_path: 'path.json' }), 'vault:path.json');
  assert.deepEqual(validateRegistry({ registry: null, manifest: null, now: '2026-08-08T00:00:00Z' }).errors.map((item) => item.code), [
    'REGISTRY_SCHEMA_INVALID',
    'MANIFEST_SCHEMA_INVALID',
  ]);
});

test('matching and unrelated observations do not create a contradiction', () => {
  const result = validateRegistry({
    registry: registry(),
    manifest: manifest({ observations: [
      {
        subject_id: 'blackgold-n8n',
        predicate: 'deployment_state',
        value: 'active',
        source: 'same.md',
      },
      {
        subject_id: 'not-registered',
        predicate: 'deployment_state',
        value: 'unknown',
        source: 'none.md',
      },
    ] }),
    now: '2026-08-08T00:00:00Z',
  });
  assert.equal(result.drift.some((item) => item.code === 'CLAIM_CONTRADICTION'), false);
});
