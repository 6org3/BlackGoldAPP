#!/usr/bin/env node
// scripts/sync_edge_shared.mjs
// Sincroniza packages/analytics-core → supabase/functions/_shared/analytics-core.
//
// Contexto (Q5 del spec docs/spec_loop_misiones_baremo.md): al desplegar una Edge
// Function, Supabase empaqueta la carpeta de la función y todo lo que importe de
// forma relativa DENTRO de supabase/functions/. El código compartido de
// packages/analytics-core (fuera de ese árbol) se copia aquí para que el import
// `../_shared/analytics-core/index.js` resuelva en el bundle desplegado.
//
// La copia SE COMMITEA (deploy reproducible desde cualquier checkout). El test
// src/lib/edgeSharedSync.test.js falla si la copia diverge del origen.
//
// Uso: npm run functions:sync   (lo encadena también npm run functions:deploy)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Rutas resueltas desde la ubicación de este script (funciona con cualquier cwd).
const ORIGEN = path.resolve(__dirname, '..', '..', 'packages', 'analytics-core');
const DESTINO = path.resolve(
  __dirname, '..', 'supabase', 'functions', '_shared', 'analytics-core'
);

// Header antepuesto a cada archivo copiado. El test anti-drift lo ignora al comparar.
const HEADER =
  '// AUTO-GENERADO desde packages/analytics-core — NO EDITAR. Regenerar con: npm run functions:sync';

if (!fs.existsSync(ORIGEN)) {
  console.error(`[sync_edge_shared] No existe el origen: ${ORIGEN}`);
  process.exit(1);
}

// Crear el directorio destino si no existe.
fs.mkdirSync(DESTINO, { recursive: true });

// Copiar todos los .js del origen (los .md de documentación no viajan al bundle).
const fuentes = fs
  .readdirSync(ORIGEN)
  .filter((nombre) => nombre.endsWith('.js'))
  .sort();

for (const nombre of fuentes) {
  const contenido = fs.readFileSync(path.join(ORIGEN, nombre), 'utf8');
  fs.writeFileSync(path.join(DESTINO, nombre), `${HEADER}\n${contenido}`, 'utf8');
  console.log(`[sync_edge_shared] copiado: ${nombre}`);
}

// Borrar huérfanos: archivos en el destino que ya no existen en el origen
// (p.ej. un módulo renombrado o eliminado de analytics-core).
for (const nombre of fs.readdirSync(DESTINO)) {
  if (!fuentes.includes(nombre)) {
    fs.rmSync(path.join(DESTINO, nombre), { force: true });
    console.log(`[sync_edge_shared] huérfano eliminado: ${nombre}`);
  }
}

console.log(
  `[sync_edge_shared] OK — ${fuentes.length} archivo(s) sincronizado(s) en ${path.relative(
    path.resolve(__dirname, '..'),
    DESTINO
  )}`
);
