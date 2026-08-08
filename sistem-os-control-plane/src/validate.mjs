const SENSITIVE_KEY = /(?:api[_-]?key|authorization|contact|email|message|password|phone|prompt|secret|session|telefono|token)/i;
const EMAIL_VALUE = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/;
const PHONE_VALUE = /\+?\d[\d\s().-]{7,}\d/;
const JWT_VALUE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/;
const SECRET_VALUE = /(?:sk|pk|rk|sbp)_[A-Za-z0-9_-]{12,}/;
const REQUIRED_CLAIM_FIELDS = [
  'confidence',
  'freshness_class',
  'id',
  'observed_at',
  'predicate',
  'source',
  'source_date',
  'status_kind',
  'subject_id',
  'valid_until',
  'value',
];

function finding(code, details = {}) {
  return { code, ...details };
}

function occurrenceKey({ root_id: rootId, relative_path: relativePath }) {
  return `${rootId}:${relativePath}`;
}

function containsSensitiveValue(value) {
  if (typeof value !== 'string') {
    return false;
  }
  if (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}Z)?$/.test(value)) {
    return false;
  }
  return EMAIL_VALUE.test(value)
    || PHONE_VALUE.test(value)
    || JWT_VALUE.test(value)
    || SECRET_VALUE.test(value);
}

function findSensitiveFields(value, path = '$', findings = []) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => findSensitiveFields(child, `${path}[${index}]`, findings));
    return findings;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (SENSITIVE_KEY.test(key) || containsSensitiveValue(child)) {
        findings.push(finding('SENSITIVE_FIELD', { path: childPath }));
      }
      findSensitiveFields(child, childPath, findings);
    }
  }
  return findings;
}

function hasRequiredFields(value, fields) {
  return fields.every((field) => Object.hasOwn(value, field));
}

function validateClaims(registry, now) {
  const errors = [];
  const claims = registry.claims ?? [];
  const claimIds = new Set();
  const entityIds = new Set((registry.entities ?? []).map((entity) => entity.id));
  for (const claim of claims) {
    if (!hasRequiredFields(claim, REQUIRED_CLAIM_FIELDS)) {
      errors.push(finding('CLAIM_FIELDS_MISSING', { id: claim.id ?? null }));
      continue;
    }
    if (claimIds.has(claim.id)) {
      errors.push(finding('DUPLICATE_CLAIM_ID', { id: claim.id }));
    }
    claimIds.add(claim.id);
    if (!entityIds.has(claim.subject_id)) {
      errors.push(finding('CLAIM_SUBJECT_MISSING', { id: claim.id, subject_id: claim.subject_id }));
    }
    if (claim.predicate === 'runtime_state' && claim.value === 'active'
      && (claim.status_kind !== 'observed' || !claim.observed_at)) {
      errors.push(finding('LIVE_RUNTIME_NOT_OBSERVED', { id: claim.id }));
    }
  }

  const drift = claims
    .filter((claim) => claim.valid_until && Date.parse(claim.valid_until) < Date.parse(now))
    .map((claim) => finding('CLAIM_EXPIRED', { id: claim.id, subject_id: claim.subject_id }));
  return { errors, drift };
}

function validateEntitiesAndRelations(registry) {
  const errors = [];
  const entityIds = new Set();
  for (const entity of registry.entities ?? []) {
    if (!entity?.id || !entity.kind || !entity.label) {
      errors.push(finding('ENTITY_FIELDS_MISSING', { id: entity?.id ?? null }));
      continue;
    }
    if (entityIds.has(entity.id)) {
      errors.push(finding('DUPLICATE_ENTITY_ID', { id: entity.id }));
    }
    entityIds.add(entity.id);
  }
  const relationIds = new Set();
  for (const relation of registry.relations ?? []) {
    if (!relation?.id || !relation.from || !relation.to || !relation.type || !relation.allowed_data
      || !relation.approval || !relation.source || !relation.source_date || !relation.confidence || !relation.status_kind) {
      errors.push(finding('RELATION_FIELDS_MISSING', { id: relation?.id ?? null }));
      continue;
    }
    if (relationIds.has(relation.id)) {
      errors.push(finding('DUPLICATE_RELATION_ID', { id: relation.id }));
    }
    relationIds.add(relation.id);
    if (!entityIds.has(relation.from) || !entityIds.has(relation.to)) {
      errors.push(finding('RELATION_ENDPOINT_MISSING', { id: relation.id }));
    }
    if (!['A', 'B', 'C', 'D'].includes(relation.approval)) {
      errors.push(finding('RELATION_APPROVAL_INVALID', { id: relation.id }));
    }
  }
  return errors;
}

function detectClaimContradictions(registry, manifest) {
  const drift = [];
  const claims = registry.claims ?? [];
  for (const observation of manifest.observations ?? []) {
    const relatedClaims = claims.filter((claim) => (
      claim.subject_id === observation.subject_id && claim.predicate === observation.predicate
    ));
    if (relatedClaims.length > 0 && !relatedClaims.some((claim) => claim.value === observation.value)) {
      drift.push(finding('CLAIM_CONTRADICTION', {
        subject_id: observation.subject_id,
        predicate: observation.predicate,
        canonical_values: [...new Set(relatedClaims.map((claim) => claim.value))].sort(),
        observed_value: observation.value,
        source: observation.source,
      }));
    }
  }
  return drift;
}

function detectWorkflowDrift(registry, manifest) {
  const expected = new Set((registry.workflow_occurrences ?? []).map(occurrenceKey));
  const actual = new Set((manifest.occurrences ?? []).map(occurrenceKey));
  const drift = [];
  for (const occurrence of manifest.occurrences ?? []) {
    if (!expected.has(occurrenceKey(occurrence))) {
      drift.push(finding('WORKFLOW_UNREGISTERED', {
        root_id: occurrence.root_id,
        relative_path: occurrence.relative_path,
      }));
    }
  }
  for (const occurrence of registry.workflow_occurrences ?? []) {
    if (!actual.has(occurrenceKey(occurrence))) {
      drift.push(finding('WORKFLOW_REGISTRY_STALE', {
        root_id: occurrence.root_id,
        relative_path: occurrence.relative_path,
      }));
    }
  }
  return drift;
}

export function validateRegistry({ registry, manifest, now }) {
  const errors = [];
  if (registry?.schema_version !== 'agent-registry.v1') {
    errors.push(finding('REGISTRY_SCHEMA_INVALID'));
  }
  if (manifest?.schema_version !== 'source-manifest.v1') {
    errors.push(finding('MANIFEST_SCHEMA_INVALID'));
  }
  errors.push(...validateEntitiesAndRelations(registry ?? {}));
  errors.push(...findSensitiveFields(registry ?? {}));
  const claimValidation = validateClaims(registry ?? {}, now);
  errors.push(...claimValidation.errors);

  const drift = [
    ...detectClaimContradictions(registry ?? {}, manifest ?? {}),
    ...detectWorkflowDrift(registry ?? {}, manifest ?? {}),
    ...claimValidation.drift,
  ];
  return { valid: errors.length === 0 && drift.length === 0, errors, drift };
}

export const internals = { occurrenceKey, findSensitiveFields, containsSensitiveValue };
