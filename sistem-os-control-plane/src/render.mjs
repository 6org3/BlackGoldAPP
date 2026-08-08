import { createHash } from 'node:crypto';
import path from 'node:path';

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function inputDigest(registry, manifest) {
  const source = JSON.stringify(stableValue({ manifest, registry }));
  return `sha256:${createHash('sha256').update(source).digest('hex')}`;
}

function sourceDate(registry) {
  const dates = [
    ...(registry.claims ?? []).map((claim) => claim.source_date),
    ...(registry.relations ?? []).map((relation) => relation.source_date),
  ].filter(Boolean).sort();
  return dates.at(-1) ?? 'sin-fecha';
}

function sourceLink(source) {
  if (!source?.endsWith('.md')) {
    return source ?? 'sin fuente';
  }
  const destination = source.slice(0, -3);
  const title = path.posix.basename(destination);
  return `[[${destination}|${title}]]`;
}

function frontmatter(registry, manifest) {
  return [
    '---',
    'tipo: generado',
    'autoridad: derivada',
    `fecha_fuentes: ${sourceDate(registry)}`,
    `input_digest: ${inputDigest(registry, manifest)}`,
    '---',
    '',
    '> [!warning] Artefacto generado. No editar a mano; regenerar desde el control plane.',
    '',
  ].join('\n');
}

function stateFor(entity, registry) {
  const claims = (registry.claims ?? []).filter((claim) => (
    claim.subject_id === entity.id && claim.predicate === 'lifecycle'
  ));
  return claims.at(-1)?.value ?? 'sin señal';
}

function mermaidId(id) {
  return `node_${id.replace(/[^A-Za-z0-9_]/g, '_')}`;
}

function escapeMermaid(value) {
  return String(value).replaceAll('"', "'").replaceAll('\n', ' ');
}

function renderMermaid(registry) {
  const boundaries = new Map();
  for (const entity of registry.entities ?? []) {
    const boundary = entity.boundary ?? 'Sin frontera declarada';
    boundaries.set(boundary, [...(boundaries.get(boundary) ?? []), entity]);
  }
  const lines = ['```mermaid', 'flowchart LR'];
  for (const [boundary, entities] of [...boundaries.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    lines.push(`  subgraph ${mermaidId(boundary)}["${escapeMermaid(boundary)}"]`);
    for (const entity of [...entities].sort((left, right) => left.id.localeCompare(right.id))) {
      lines.push(`    ${mermaidId(entity.id)}["${escapeMermaid(entity.label)}\\n${stateFor(entity, registry)}"]`);
    }
    lines.push('  end');
  }
  for (const relation of [...(registry.relations ?? [])].sort((left, right) => left.id.localeCompare(right.id))) {
    lines.push(`  ${mermaidId(relation.from)} -->|${escapeMermaid(`${relation.type} · ${relation.approval}`)}| ${mermaidId(relation.to)}`);
  }
  lines.push('```', '');
  return lines.join('\n');
}

function renderMap(registry, manifest) {
  const lines = [
    frontmatter(registry, manifest),
    '# Mapa Visual de Sistem OS',
    '',
    'Proyección de `agent-registry.v1` y `source-manifest.v1`. El estado es declarado u observado según su procedencia; este mapa no controla ningún servicio.',
    '',
    '## Topología',
    '',
    renderMermaid(registry),
    '## Relaciones',
    '',
    '| Origen | Relación | Destino | Dato permitido | Aprobación | Fuente |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const relation of [...(registry.relations ?? [])].sort((left, right) => left.id.localeCompare(right.id))) {
    const from = registry.entities.find((entity) => entity.id === relation.from)?.label ?? relation.from;
    const to = registry.entities.find((entity) => entity.id === relation.to)?.label ?? relation.to;
    lines.push(`| ${from} | ${relation.type} | ${to} | ${relation.allowed_data} | ${relation.approval} | ${sourceLink(relation.source)} |`);
  }
  lines.push('', '## Procedencia de estados', '', '| Nodo | Estado | Clase | Fuente |', '| --- | --- | --- | --- |');
  for (const entity of [...(registry.entities ?? [])].sort((left, right) => left.id.localeCompare(right.id))) {
    const claim = (registry.claims ?? []).find((candidate) => (
      candidate.subject_id === entity.id && candidate.predicate === 'lifecycle'
    ));
    lines.push(`| ${entity.label} | ${claim?.value ?? 'sin señal'} | ${claim?.status_kind ?? 'desconocido'} | ${sourceLink(claim?.source)} |`);
  }
  return `${lines.join('\n')}\n`;
}

function renderCanvas(registry) {
  const nodes = [...(registry.entities ?? [])]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((entity, index) => ({
      id: entity.id,
      type: 'text',
      text: `${entity.label}\n${entity.boundary ?? 'Sin frontera declarada'}`,
      x: 80 + ((index % 3) * 320),
      y: 80 + (Math.floor(index / 3) * 180),
      width: 240,
      height: 100,
    }));
  const edges = [...(registry.relations ?? [])]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((relation) => ({
      id: relation.id,
      fromNode: relation.from,
      fromSide: 'right',
      toNode: relation.to,
      toSide: 'left',
      label: `${relation.type} · ${relation.approval}`,
    }));
  return `${JSON.stringify({ nodes, edges }, null, 2)}\n`;
}

function renderCatalog(registry, manifest) {
  const artifacts = new Map((manifest.artifacts ?? []).map((artifact) => [artifact.sha256, artifact]));
  const lines = [
    frontmatter(registry, manifest),
    '# Catálogo Visual de Workflows',
    '',
    `Total derivado: ${(manifest.occurrences ?? []).length} ocurrencias y ${(manifest.artifacts ?? []).length} artefactos por hash. No se infiere ejecución porque no existe fuente de runs.`,
    '',
    '| Raíz | Ruta relativa | Workflow | Activo declarado | Nodos | Tipos | Autoridad | Intención | Estado observado |',
    '| --- | --- | --- | --- | ---: | --- | --- | --- | --- |',
  ];
  for (const occurrence of manifest.occurrences ?? []) {
    const artifact = artifacts.get(occurrence.artifact_sha256);
    lines.push(`| ${occurrence.root_id} | \`${occurrence.relative_path}\` | ${artifact?.name ?? 'desconocido'} | ${artifact?.declared_active ?? 'desconocido'} | ${artifact?.node_count ?? 0} | ${(artifact?.node_types ?? []).join(', ')} | ${occurrence.authority} | ${occurrence.intent} | ${occurrence.observed_state} |`);
  }
  return `${lines.join('\n')}\n`;
}

function renderDrift(registry, manifest, validation) {
  const findings = [...(validation.errors ?? []), ...(validation.drift ?? [])];
  const lines = [
    frontmatter(registry, manifest),
    '# Deriva de Sistem OS',
    '',
    `Resultado: ${findings.length === 0 ? 'sin contradicciones abiertas' : `${findings.length} hallazgo(s)`}.`,
    '',
  ];
  if (findings.length === 0) {
    lines.push('No hay deriva detectada entre el registro y el manifiesto.', '');
  } else {
    lines.push('| Código | Detalle |', '| --- | --- |');
    for (const item of findings) {
      const { code, ...details } = item;
      lines.push(`| ${code} | \`${JSON.stringify(details)}\` |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

export function validateRenderedLinks(files, linkIndex) {
  const canonicalPaths = new Set((linkIndex?.notes ?? [])
    .filter((note) => note.canonical)
    .map((note) => note.relative_path.replace(/\.md$/, '')));
  const knownTitles = new Set((linkIndex?.notes ?? []).map((note) => note.title));
  const errors = [];
  for (const [file, content] of Object.entries(files)) {
    for (const match of content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
      const destination = match[1];
      if (canonicalPaths.has(destination)) {
        continue;
      }
      if (!destination.includes('/') && knownTitles.has(destination)) {
        errors.push({ code: 'LINK_NONCANONICAL', file, destination });
      } else {
        errors.push({ code: 'LINK_MISSING', file, destination });
      }
    }
  }
  return errors;
}

export function renderObsidian({ registry, manifest, validation }) {
  return {
    'Catálogo Visual de Workflows.md': renderCatalog(registry, manifest),
    'Deriva de Sistem OS.md': renderDrift(registry, manifest, validation),
    'Mapa Visual de Sistem OS.canvas': renderCanvas(registry),
    'Mapa Visual de Sistem OS.md': renderMap(registry, manifest),
  };
}

export const internals = { frontmatter, inputDigest, sourceLink, sourceDate, stableValue };
