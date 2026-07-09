#!/usr/bin/env node
// scripts/sync_edge_shared.mjs
// Sincroniza los paquetes compartidos → supabase/functions/_shared/:
//   - packages/analytics-core  → _shared/analytics-core  (todos los .js)
//   - packages/brain-core      → _shared/brain-core      (solo los módulos
//     PORTABLES: diagnostico.js, readiness.js, rackMotor.js —
//     rack.js/prompts.js/index.js dependen de fs (Node-only) y romperían
//     el bundle Deno)
//   - además GENERA _shared/brain-core/rack-corpus.generado.js con el corpus
//     del rack serializado (corpusCrudo() de packages/brain-core/rack.js),
//     para que las Edge Functions construyan el índice BM25 con rackMotor.js
//     sin tocar el disco.
//
// Contexto (Q5 del spec docs/spec_loop_misiones_baremo.md): al desplegar una Edge
// Function, Supabase empaqueta la carpeta de la función y todo lo que importe de
// forma relativa DENTRO de supabase/functions/. El código compartido de packages/
// (fuera de ese árbol) se copia aquí para que los imports `../_shared/...`
// resuelvan en el bundle desplegado. Los imports `../analytics-core/*.js` de
// brain-core resuelven igual en el espejo porque _shared replica el layout.
//
// La copia SE COMMITEA (deploy reproducible desde cualquier checkout). El test
// src/lib/edgeSharedSync.test.js falla si la copia diverge del origen.
//
// Uso: npm run functions:sync   (lo encadena también npm run functions:deploy)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Rutas resueltas desde la ubicación de este script (funciona con cualquier cwd).
const PACKAGES = path.resolve(__dirname, '..', '..', 'packages');
const SHARED = path.resolve(__dirname, '..', 'supabase', 'functions', '_shared');

// Un espejo por paquete compartido. `filtro` decide qué archivos viajan;
// `extras` son archivos GENERADOS por este script en el destino (no copias
// de un origen) que el barrido de huérfanos debe respetar.
const ESPEJOS = [
  {
    paquete: 'analytics-core',
    filtro: (nombre) => nombre.endsWith('.js'),
  },
  {
    paquete: 'brain-core',
    // Solo los módulos portables a Deno (ver header). Mantener en sintonía con
    // PORTABLES de src/lib/edgeSharedSync.test.js.
    filtro: (nombre) => ['diagnostico.js', 'readiness.js', 'rackMotor.js'].includes(nombre),
    extras: ['rack-corpus.generado.js'],
  },
];

for (const { paquete, filtro, extras = [] } of ESPEJOS) {
  const origen = path.join(PACKAGES, paquete);
  const destino = path.join(SHARED, paquete);

  if (!fs.existsSync(origen)) {
    console.error(`[sync_edge_shared] No existe el origen: ${origen}`);
    process.exit(1);
  }

  fs.mkdirSync(destino, { recursive: true });

  // Header antepuesto a cada archivo copiado. El test anti-drift lo ignora al comparar.
  const header = `// AUTO-GENERADO desde packages/${paquete} — NO EDITAR. Regenerar con: npm run functions:sync`;

  const fuentes = fs.readdirSync(origen).filter(filtro).sort();

  for (const nombre of fuentes) {
    const contenido = fs.readFileSync(path.join(origen, nombre), 'utf8');
    fs.writeFileSync(path.join(destino, nombre), `${header}\n${contenido}`, 'utf8');
    console.log(`[sync_edge_shared] copiado: ${paquete}/${nombre}`);
  }

  // Borrar huérfanos: archivos en el destino que ya no existen en el origen o
  // dejaron de pasar el filtro (p.ej. un módulo renombrado o vuelto Node-only).
  // Los `extras` generados por este script (paso siguiente) no son huérfanos.
  for (const nombre of fs.readdirSync(destino)) {
    if (!fuentes.includes(nombre) && !extras.includes(nombre)) {
      fs.rmSync(path.join(destino, nombre), { force: true });
      console.log(`[sync_edge_shared] huérfano eliminado: ${paquete}/${nombre}`);
    }
  }

  console.log(
    `[sync_edge_shared] OK — ${fuentes.length} archivo(s) en ${path.relative(
      path.resolve(__dirname, '..'),
      destino
    )}`
  );
}

// ---------------------------------------------------------------------------
// Corpus del rack → _shared/brain-core/rack-corpus.generado.js
// El loader Node (packages/brain-core/rack.js) lee los documentos de
// blackgold-mcp/knowledge/; aquí se serializan (determinista) para que las
// Edge Functions (Deno, sin fs sobre el repo) construyan el mismo índice con
// construirIndiceRack() de rackMotor.js.
// ---------------------------------------------------------------------------

const { corpusCrudo } = await import(
  pathToFileURL(path.join(PACKAGES, 'brain-core', 'rack.js')).href
);
const corpus = corpusCrudo();
if (!Array.isArray(corpus) || corpus.length === 0) {
  console.error('[sync_edge_shared] corpusCrudo() devolvió un corpus vacío — ¿existe blackgold-mcp/knowledge/?');
  process.exit(1);
}

const destinoCorpus = path.join(SHARED, 'brain-core', 'rack-corpus.generado.js');
const cabeceraCorpus = [
  '// AUTO-GENERADO desde blackgold-mcp/knowledge (corpus del rack) — NO EDITAR. Regenerar con: npm run functions:sync',
  '// Documentos crudos { id, titulo, area, subPilares, cuerpo } para construirIndiceRack() de rackMotor.js.',
].join('\n');
fs.writeFileSync(
  destinoCorpus,
  `${cabeceraCorpus}\nexport const CORPUS = ${JSON.stringify(corpus, null, 1)};\n`,
  'utf8'
);
console.log(
  `[sync_edge_shared] corpus generado: ${corpus.length} documento(s) en ${path.relative(
    path.resolve(__dirname, '..'),
    destinoCorpus
  )}`
);
