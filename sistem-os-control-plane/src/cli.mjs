import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectSources } from './collect.mjs';
import { loadRegistry } from './registry.mjs';
import { renderObsidian, validateRenderedLinks } from './render.mjs';
import { validateRegistry } from './validate.mjs';

function usage() {
  return [
    'Usage:',
    '  node src/cli.mjs collect --vault-root <path> --repo-root <path>',
    '  node src/cli.mjs validate [--manifest <path>] [--registry <path>]',
    '  node src/cli.mjs render --vault-root <path> [--manifest <path>] [--registry <path>]',
    '  node src/cli.mjs all --vault-root <path> --repo-root <path> [--registry <path>]',
  ].join('\n');
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (!argument.startsWith('--') || !rest[index + 1]) {
      throw new Error(usage());
    }
    options[argument.slice(2)] = rest[index + 1];
    index += 1;
  }
  if (!command || Object.keys(options).some((option) => !['manifest', 'registry', 'repo-root', 'vault-root'].includes(option))) {
    throw new Error(usage());
  }
  return { command, options };
}

function reportPaths(baseDirectory) {
  return {
    manifest: path.join(baseDirectory, 'reports', 'source-manifest.v1.json'),
    reconciliation: path.join(baseDirectory, 'reports', 'source-reconciliation.md'),
    validation: path.join(baseDirectory, 'reports', 'validation.v1.json'),
  };
}

function registryPath(baseDirectory, option) {
  return option ?? path.join(baseDirectory, 'data', 'system-registry.yaml');
}

async function writeText(target, content) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

async function writeJson(target, value) {
  await writeText(target, `${JSON.stringify(value, null, 2)}\n`);
}

function reconciliationReport(manifest) {
  const temporary = manifest.occurrences.filter((occurrence) => occurrence.authority !== 'authoritative').length;
  return [
    '# Reconciliación de fuentes — Sistem OS',
    '',
    `- Raíces declaradas: ${manifest.source_roots.map((root) => root.root_id).join(', ')}.`,
    `- Exclusiones declaradas: ${manifest.declared_exclusions.join(', ')}; salidas generadas: ${manifest.source_roots.flatMap((root) => root.excluded_relative_paths ?? []).join(', ') || 'ninguna'}.`,
    `- Workflows: ${manifest.occurrences.length} ocurrencias y ${manifest.artifacts.length} artefactos por hash.`,
    `- Copias no autoritativas: ${temporary}.`,
    `- JSON rechazado por no cumplir firma n8n v1: ${manifest.rejected_json.length}.`,
    '',
    'Las rutas son relativas a su raíz y los hashes son SHA-256. `tmp` y staging se registran, pero nunca son fuente de autoridad.',
    '',
  ].join('\n');
}

async function collect(baseDirectory, options) {
  if (!options['vault-root'] || !options['repo-root']) {
    throw new Error(usage());
  }
  const manifest = await collectSources({
    roots: [
      { id: 'vault', path: options['vault-root'] },
      {
        id: 'repo',
        path: options['repo-root'],
        excluded_relative_paths: ['sistem-os-control-plane/reports'],
      },
    ],
  });
  const reports = reportPaths(baseDirectory);
  await Promise.all([
    writeJson(reports.manifest, manifest),
    writeText(reports.reconciliation, reconciliationReport(manifest)),
  ]);
  return { manifest, reports };
}

async function readManifest(manifestPath) {
  return JSON.parse(await readFile(manifestPath, 'utf8'));
}

async function validate(baseDirectory, options, manifest) {
  const reports = reportPaths(baseDirectory);
  const currentManifest = manifest ?? await readManifest(options.manifest ?? reports.manifest);
  const registry = await loadRegistry(registryPath(baseDirectory, options.registry));
  const validation = validateRegistry({ registry, manifest: currentManifest, now: new Date().toISOString() });
  await writeJson(reports.validation, validation);
  return { registry, manifest: currentManifest, validation, reports };
}

async function render(baseDirectory, options, registry, manifest, validation) {
  if (!options['vault-root']) {
    throw new Error(usage());
  }
  const currentRegistry = registry ?? await loadRegistry(registryPath(baseDirectory, options.registry));
  const reports = reportPaths(baseDirectory);
  const currentManifest = manifest ?? await readManifest(options.manifest ?? reports.manifest);
  const currentValidation = validation ?? JSON.parse(await readFile(reports.validation, 'utf8'));
  const files = renderObsidian({
    registry: currentRegistry,
    manifest: currentManifest,
    validation: currentValidation,
  });
  const linkErrors = validateRenderedLinks(files, currentManifest.link_index);
  if (linkErrors.length > 0) {
    throw new Error(`renderer produced unresolved Obsidian links: ${JSON.stringify(linkErrors)}`);
  }
  const outputDirectory = path.join(options['vault-root'], 'Áreas', 'Sistem OS');
  await Promise.all(Object.entries(files).map(([name, content]) => writeText(path.join(outputDirectory, name), content)));
  return { files, outputDirectory };
}

const modulePath = fileURLToPath(import.meta.url);

export async function run(argv, baseDirectory = path.resolve(path.dirname(modulePath), '..')) {
  const { command, options } = parseArguments(argv);
  if (!['all', 'collect', 'render', 'validate'].includes(command)) {
    throw new Error(usage());
  }
  if (command === 'collect') {
    const result = await collect(baseDirectory, options);
    return { code: 0, summary: `collector: ${result.manifest.occurrences.length} workflow occurrences` };
  }
  if (command === 'validate') {
    const result = await validate(baseDirectory, options);
    return {
      code: result.validation.valid ? 0 : 1,
      summary: `validator: ${result.validation.errors.length} error(s), ${result.validation.drift.length} drift finding(s)`,
    };
  }
  if (command === 'render') {
    const result = await render(baseDirectory, options);
    return { code: 0, summary: `renderer: ${Object.keys(result.files).length} artifact(s)` };
  }
  const collected = await collect(baseDirectory, options);
  const validated = await validate(baseDirectory, options, collected.manifest);
  const rendered = await render(baseDirectory, options, validated.registry, collected.manifest, validated.validation);
  return {
    code: validated.validation.valid ? 0 : 1,
    summary: `pipeline: ${collected.manifest.occurrences.length} occurrence(s), ${validated.validation.drift.length} drift finding(s), ${Object.keys(rendered.files).length} artifact(s)`,
  };
}

export const internals = { parseArguments, reconciliationReport };
