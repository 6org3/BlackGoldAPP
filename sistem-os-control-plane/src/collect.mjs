import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_EXCLUDED_DIRECTORIES = Object.freeze([
  '.git',
  '.obsidian',
  '.trash',
  'node_modules',
]);

const MAP_NODE_TYPES = new Set([
  'n8n-nodes-base.manualTrigger',
  'n8n-nodes-base.noOp',
  'n8n-nodes-base.set',
  'n8n-nodes-base.stickyNote',
]);

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isN8nWorkflow(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof value.active === 'boolean'
    && typeof value.connections === 'object'
    && value.connections !== null
    && typeof value.name === 'string'
    && Array.isArray(value.nodes)
    && value.nodes.every((node) => (
      node
      && typeof node === 'object'
      && typeof node.parameters === 'object'
      && node.parameters !== null
      && Array.isArray(node.position)
      && node.position.length === 2
      && typeof node.type === 'string'
      && typeof node.typeVersion === 'number'
    )),
  );
}

function classifyAuthority(relativePath) {
  const lower = relativePath.toLowerCase();
  if (lower.includes('/tmp/black-gold-vault-staging/') || lower.startsWith('tmp/black-gold-vault-staging/')) {
    return 'staging-copy';
  }
  if (lower.includes('/tmp/') || lower.startsWith('tmp/')) {
    return 'temporary';
  }
  return 'authoritative';
}

function analyseArtifact(workflow, sha256) {
  const nodeTypes = [...new Set(workflow.nodes.map((node) => node.type))].sort();
  return {
    sha256,
    name: workflow.name,
    declared_active: workflow.active,
    node_count: workflow.nodes.length,
    node_types: nodeTypes,
  };
}

function classifyIntent(artifact) {
  return artifact.node_types.every((nodeType) => MAP_NODE_TYPES.has(nodeType)) ? 'map' : 'automation';
}

async function walk(rootPath, relativePath, excludedDirectories, excludedRelativePaths, files) {
  const currentPath = path.join(rootPath, relativePath);
  const entries = await readdir(currentPath, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryRelativePath = path.join(relativePath, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name) && !excludedRelativePaths.has(toPosix(entryRelativePath))) {
        await walk(rootPath, entryRelativePath, excludedDirectories, excludedRelativePaths, files);
      }
    } else if (entry.isFile()) {
      files.push(toPosix(entryRelativePath));
    }
  }
}

async function collectRootFiles(root, excludedDirectories) {
  const files = [];
  await walk(root.path, '', excludedDirectories, new Set(root.excluded_relative_paths ?? []), files);
  return files.sort();
}

async function buildLinkIndex(root, excludedDirectories) {
  const files = await collectRootFiles(root, excludedDirectories);
  return {
    schema_version: 'link-index.v1',
    root_id: root.id,
    notes: files
      .filter((relativePath) => relativePath.endsWith('.md'))
      .map((relativePath) => ({
        relative_path: relativePath,
        title: path.posix.basename(relativePath, '.md'),
        canonical: !relativePath.startsWith('tmp/'),
      })),
  };
}

async function readTextIfPresent(rootPath, relativePath) {
  try {
    return await readFile(path.join(rootPath, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function datedSource(text) {
  return text.match(/^actualizado:\s*(\d{4}-\d{2}-\d{2})$/m)?.[1] ?? null;
}

function stateN8nObservation(text, source) {
  const match = text.match(/^\| Orquestaci(?:ó|Ã³)n visual n8n \| ([^|]+) \|/m);
  if (!match) {
    return null;
  }
  return {
    subject_id: 'blackgold-n8n',
    predicate: 'deployment_state',
    value: match[1].trim().startsWith('activo') ? 'active' : match[1].trim(),
    source,
    source_date: datedSource(text),
    status_kind: 'declared',
  };
}

function inventoryN8nObservation(text, source) {
  const lines = text.split(/\r?\n/);
  let n8nSection = false;
  for (const line of lines) {
    if (/^  - nombre: blackgold-n8n$/.test(line)) {
      n8nSection = true;
      continue;
    }
    if (n8nSection && /^  - nombre: /.test(line)) {
      break;
    }
    if (n8nSection) {
      const state = line.match(/^    estado: (.+)$/);
      if (state) {
        return {
          subject_id: 'blackgold-n8n',
          predicate: 'deployment_state',
          value: state[1].trim() === 'activo' ? 'active' : state[1].trim(),
          source,
          source_date: datedSource(text),
          status_kind: 'discovered',
        };
      }
    }
  }
  return null;
}

async function collectObservations(roots) {
  const vault = roots.find((root) => root.id === 'vault');
  if (!vault) {
    return [];
  }
  const statePath = 'Áreas/Sistem OS/Estado Operativo.md';
  const inventoryPath = 'Proyectos/Black Gold/Infraestructura/n8n-hibrido/inventario-servicios.yaml';
  const [stateText, inventoryText] = await Promise.all([
    readTextIfPresent(vault.path, statePath),
    readTextIfPresent(vault.path, inventoryPath),
  ]);
  return [
    stateText ? stateN8nObservation(stateText, statePath) : null,
    inventoryText ? inventoryN8nObservation(inventoryText, inventoryPath) : null,
  ].filter(Boolean);
}

export async function collectSources({ roots, excludedDirectories = DEFAULT_EXCLUDED_DIRECTORIES }) {
  if (!Array.isArray(roots) || roots.length === 0) {
    throw new Error('collector requires at least one declared source root');
  }
  const rootIds = new Set();
  for (const root of roots) {
    if (!root?.id || !root?.path || rootIds.has(root.id)) {
      throw new Error('each source root requires a unique id and a path');
    }
    rootIds.add(root.id);
  }

  const excluded = new Set(excludedDirectories);
  const artifactsByHash = new Map();
  const occurrences = [];
  const rejectedJson = [];
  let filesScanned = 0;

  for (const root of [...roots].sort((left, right) => left.id.localeCompare(right.id))) {
    const files = await collectRootFiles(root, excluded);
    filesScanned += files.length;
    for (const relativePath of files.filter((candidate) => candidate.endsWith('.json'))) {
      const source = await readFile(path.join(root.path, relativePath));
      let parsed;
      const sha256 = digest(source);
      try {
        parsed = JSON.parse(source.toString('utf8'));
      } catch {
        rejectedJson.push({ root_id: root.id, relative_path: relativePath, sha256, reason: 'invalid-json' });
        continue;
      }
      if (!isN8nWorkflow(parsed)) {
        rejectedJson.push({ root_id: root.id, relative_path: relativePath, sha256, reason: 'not-n8n-workflow.v1' });
        continue;
      }
      const artifact = artifactsByHash.get(sha256) ?? analyseArtifact(parsed, sha256);
      artifactsByHash.set(sha256, artifact);
      occurrences.push({
        root_id: root.id,
        relative_path: relativePath,
        artifact_sha256: sha256,
        authority: classifyAuthority(relativePath),
        intent: classifyIntent(artifact),
        observed_state: 'unknown',
      });
    }
  }

  occurrences.sort((left, right) => (
    left.root_id.localeCompare(right.root_id) || left.relative_path.localeCompare(right.relative_path)
  ));
  rejectedJson.sort((left, right) => (
    left.root_id.localeCompare(right.root_id) || left.relative_path.localeCompare(right.relative_path)
  ));
  const artifacts = [...artifactsByHash.values()].sort((left, right) => left.sha256.localeCompare(right.sha256));
  const rootsWithoutPaths = [...roots]
    .map(({ id, excluded_relative_paths: excludedRelativePaths = [] }) => ({
      root_id: id,
      ...(excludedRelativePaths.length > 0 ? { excluded_relative_paths: [...excludedRelativePaths].sort() } : {}),
    }))
    .sort((left, right) => left.root_id.localeCompare(right.root_id));
  const observations = await collectObservations(roots);
  const sourceDigest = digest(JSON.stringify({ artifacts, observations, occurrences, rejectedJson, roots: rootsWithoutPaths }));
  const vaultRoot = roots.find((root) => root.id === 'vault');

  return {
    schema_version: 'source-manifest.v1',
    source_roots: rootsWithoutPaths,
    declared_exclusions: [...excluded].sort(),
    files_scanned: filesScanned,
    source_digest: `sha256:${sourceDigest}`,
    artifacts,
    occurrences,
    rejected_json: rejectedJson,
    observations,
    link_index: vaultRoot ? await buildLinkIndex(vaultRoot, excluded) : null,
  };
}

export const internals = {
  analyseArtifact,
  classifyAuthority,
  classifyIntent,
  inventoryN8nObservation,
  isN8nWorkflow,
  stateN8nObservation,
};
