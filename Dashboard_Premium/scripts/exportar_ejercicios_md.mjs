// Genera docs/ejercicios_catalogo_borrador.md (raíz del repo, hermana de
// Dashboard_Premium) a partir del MISMO JSON que consume
// seed_ejercicios_catalogo.mjs — scripts/data/ejercicios_catalogo_seed.json.
//
// Este script NO toca Supabase (no necesita credenciales): es un generador
// de texto puro, pensado como documento de revisión para que el dueño del
// club pode/edite el borrador antes de que se sembre en la base de datos.
//
// Uso:
//   node scripts/exportar_ejercicios_md.mjs
//
// Requiere que exista scripts/data/ejercicios_catalogo_seed.json (lo genera
// otro proceso a partir del manual de entrenamiento y los docs tácticos del
// repo). Si no existe, falla con un mensaje claro sin escribir nada.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, 'data', 'ejercicios_catalogo_seed.json');
const OUT_PATH = path.join(__dirname, '..', '..', 'docs', 'ejercicios_catalogo_borrador.md');

const TIPOS_ORDENADOS = ['Físico', 'Técnico', 'Táctico', 'Recuperación'];
const NIVELES_ORDENADOS = ['Micro', 'Desarrollo', 'Elite'];
const FECHA_GENERACION = '2026-07-22';

/** Sanea texto para que no rompa una celda de tabla markdown. */
function celda(valor) {
  return String(valor ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

function leerEjercicios() {
  let crudo;
  try {
    crudo = fs.readFileSync(DATA_PATH, 'utf8').replace(/^﻿/, '');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`❌ No se encontró el archivo de datos: ${DATA_PATH}`);
      console.error('   Este script depende de que otro proceso genere ese JSON primero.');
    } else {
      console.error(`❌ Error leyendo ${DATA_PATH}: ${err.message}`);
    }
    process.exit(1);
  }

  let ejercicios;
  try {
    ejercicios = JSON.parse(crudo);
  } catch (err) {
    console.error(`❌ Error parseando ${DATA_PATH}: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(ejercicios)) {
    console.error(`❌ ${DATA_PATH} debe contener un array de ejercicios en su raíz.`);
    process.exit(1);
  }

  return ejercicios;
}

function construirTabla(lista) {
  const filas = [
    '| Nº | Nombre | Niveles | Descripción | Fuente |',
    '|---|---|---|---|---|',
  ];
  lista.forEach((e, i) => {
    const niveles = Array.isArray(e.grupos_recomendados) ? e.grupos_recomendados.join(', ') : '';
    filas.push(`| ${i + 1} | ${celda(e.nombre)} | ${celda(niveles)} | ${celda(e.descripcion)} | ${celda(e.fuente)} |`);
  });
  return filas.join('\n');
}

function construirMarkdown(ejercicios) {
  const secciones = [];

  secciones.push('# Catálogo de ejercicios — borrador para revisión');
  secciones.push('');
  secciones.push(
    'Este documento es un borrador del catálogo de drills de entrenamiento, generado ' +
    'a partir del manual de entrenamiento y los docs tácticos del repo, listo para ' +
    'cargarse en la tabla `ejercicios_catalogo` (catálogo global de drills, sin ' +
    'club_id) vía `scripts/seed_ejercicios_catalogo.mjs`.',
  );
  secciones.push('');
  secciones.push(
    'Para podar el borrador: marcá en esta tabla las filas que querés eliminar o ' +
    'editar (nombre, descripción, niveles) y pedile al asistente que aplique los ' +
    'cambios sobre `scripts/data/ejercicios_catalogo_seed.json` antes de sembrar.',
  );
  secciones.push('');
  secciones.push(`_Generado: ${FECHA_GENERACION}_`);
  secciones.push('');

  const porTipo = new Map(TIPOS_ORDENADOS.map((t) => [t, []]));
  const otros = [];
  for (const e of ejercicios) {
    if (porTipo.has(e.tipo)) porTipo.get(e.tipo).push(e);
    else otros.push(e);
  }

  for (const tipo of TIPOS_ORDENADOS) {
    const lista = porTipo.get(tipo);
    secciones.push(`## ${tipo} (${lista.length})`);
    secciones.push('');
    if (lista.length) {
      secciones.push(construirTabla(lista));
    } else {
      secciones.push('_(sin ejercicios de este tipo en el borrador)_');
    }
    secciones.push('');
  }

  if (otros.length) {
    console.warn(`⚠️  ${otros.length} ejercicio(s) con tipo fuera de ${TIPOS_ORDENADOS.join('/')} (p.ej. "Evaluación"): ${otros.map((e) => `${e.nombre} [${e.tipo}]`).join(', ')}`);
    secciones.push(`## Otros / fuera de catálogo (${otros.length})`);
    secciones.push('');
    secciones.push('_Ejercicios con un tipo que no corresponde a ejercicios_catalogo (p.ej. "Evaluación" — esas pruebas van en `catalogo_ejercicios`). No se sembrarán._');
    secciones.push('');
    secciones.push(construirTabla(otros));
    secciones.push('');
  }

  // ── Resumen ──
  secciones.push('## Resumen');
  secciones.push('');
  secciones.push('### Por tipo');
  secciones.push('');
  for (const tipo of TIPOS_ORDENADOS) {
    secciones.push(`- ${tipo}: ${porTipo.get(tipo).length}`);
  }
  if (otros.length) secciones.push(`- Otros (fuera de catálogo): ${otros.length}`);
  secciones.push(`- **Total: ${ejercicios.length}**`);
  secciones.push('');

  secciones.push('### Por nivel');
  secciones.push('');
  const porNivel = Object.fromEntries(NIVELES_ORDENADOS.map((n) => [n, 0]));
  for (const e of ejercicios) {
    for (const nivel of Array.isArray(e.grupos_recomendados) ? e.grupos_recomendados : []) {
      if (nivel in porNivel) porNivel[nivel] += 1;
    }
  }
  for (const nivel of NIVELES_ORDENADOS) {
    secciones.push(`- ${nivel}: ${porNivel[nivel]}`);
  }
  secciones.push('');

  return secciones.join('\n');
}

function run() {
  console.log('=== Exportador de ejercicios_catalogo a Markdown ===\n');

  const ejercicios = leerEjercicios();
  console.log(`Ejercicios leídos del JSON: ${ejercicios.length}`);

  const markdown = construirMarkdown(ejercicios);

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, markdown, 'utf8');

  console.log(`✅ Documento escrito en: ${OUT_PATH}`);
}

run();
