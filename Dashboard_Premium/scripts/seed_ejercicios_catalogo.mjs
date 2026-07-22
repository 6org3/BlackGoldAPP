// Siembra la tabla `ejercicios_catalogo` (catálogo GLOBAL de drills de
// entrenamiento, sin club_id) desde scripts/data/ejercicios_catalogo_seed.json.
//
// Ese JSON es generado por otro proceso a partir del manual de entrenamiento
// y los docs tácticos del repo; este script NO asume nada sobre su contenido,
// solo sobre su contrato:
//   [{ "nombre": "…", "tipo": "Físico", "descripcion": "…",
//      "grupos_recomendados": ["Micro","Desarrollo"], "fuente": "…" }]
// El campo "fuente" es solo para el borrador humano (ver
// exportar_ejercicios_md.mjs) — la tabla ejercicios_catalogo no tiene esa
// columna, así que se descarta al insertar.
//
// Validación ANTES de tocar la base de datos (si algo falla: se listan todos
// los errores y se sale con exit 1 sin escribir nada):
//   - nombre: no vacío y único dentro del JSON.
//   - tipo ∈ {'Técnico','Físico','Táctico','Recuperación'}. 'Evaluación' se
//     rechaza explícitamente: las pruebas de evaluación viven en la tabla
//     espejo `catalogo_ejercicios`, no acá.
//   - grupos_recomendados: array no vacío ⊆ {'Micro','Desarrollo','Elite'}.
//   - descripcion: no vacía.
//
// Idempotencia por `nombre` (la tabla no tiene UNIQUE en BD): se leen los
// nombres ya existentes (paginado con .range(), porque PostgREST trunca a
// 1000 filas en silencio) y solo se insertan los que faltan, en lotes de 50,
// con las columnas nombre/tipo/descripcion/grupos_recomendados únicamente.
//
// Uso:
//   node scripts/seed_ejercicios_catalogo.mjs             # inserta de verdad
//   node scripts/seed_ejercicios_catalogo.mjs --dry-run    # valida + diff, no escribe
//
// Requiere SUPABASE_SERVICE_ROLE_KEY en Dashboard_Premium/.env.local.

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  process.loadEnvFile(path.join(__dirname, '..', '.env.local'));
} catch {
  console.error('❌ No se pudo leer Dashboard_Premium/.env.local (¿existe el archivo?)');
  process.exit(1);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Dashboard_Premium/.env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DATA_PATH = path.join(__dirname, 'data', 'ejercicios_catalogo_seed.json');
const TIPOS_VALIDOS = ['Técnico', 'Físico', 'Táctico', 'Recuperación'];
const NIVELES_VALIDOS = ['Micro', 'Desarrollo', 'Elite'];
const TAMANO_LOTE = 50;
const TAMANO_PAGINA = 1000; // PostgREST trunca a 1000 filas por request en silencio

const DRY_RUN = process.argv.slice(2).includes('--dry-run');

/** Valida el array completo del JSON. Devuelve la lista de errores (vacía = OK). */
function validarEjercicios(ejercicios) {
  const errores = [];

  if (!Array.isArray(ejercicios)) {
    errores.push('El archivo debe contener un array de ejercicios en su raíz.');
    return errores;
  }

  const nombresVistos = new Map(); // nombre normalizado -> índice (1-based) donde apareció primero

  ejercicios.forEach((ej, idx) => {
    const n = idx + 1;

    if (!ej || typeof ej !== 'object' || Array.isArray(ej)) {
      errores.push(`#${n}: no es un objeto válido`);
      return;
    }

    const nombre = typeof ej.nombre === 'string' ? ej.nombre.trim() : '';
    const etiqueta = nombre || '(sin nombre)';

    if (!nombre) {
      errores.push(`#${n}: "nombre" vacío o faltante`);
    } else if (nombresVistos.has(nombre)) {
      errores.push(`#${n} ("${nombre}"): nombre duplicado (ya aparece en #${nombresVistos.get(nombre)})`);
    } else {
      nombresVistos.set(nombre, n);
    }

    if (ej.tipo === 'Evaluación') {
      errores.push(`#${n} ("${etiqueta}"): tipo 'Evaluación' no permitido acá — las pruebas de evaluación van en catalogo_ejercicios, no en ejercicios_catalogo`);
    } else if (!TIPOS_VALIDOS.includes(ej.tipo)) {
      errores.push(`#${n} ("${etiqueta}"): tipo inválido "${ej.tipo}" (válidos: ${TIPOS_VALIDOS.join(', ')})`);
    }

    if (!Array.isArray(ej.grupos_recomendados) || ej.grupos_recomendados.length === 0) {
      errores.push(`#${n} ("${etiqueta}"): "grupos_recomendados" debe ser un array no vacío`);
    } else {
      const invalidos = ej.grupos_recomendados.filter((g) => !NIVELES_VALIDOS.includes(g));
      if (invalidos.length) {
        errores.push(`#${n} ("${etiqueta}"): grupos_recomendados con valores inválidos: ${invalidos.join(', ')} (válidos: ${NIVELES_VALIDOS.join(', ')})`);
      }
    }

    if (!ej.descripcion || typeof ej.descripcion !== 'string' || !ej.descripcion.trim()) {
      errores.push(`#${n} ("${etiqueta}"): "descripcion" vacía o faltante`);
    }
  });

  return errores;
}

/** Lee todos los `nombre` ya presentes en la tabla, paginando para no perder filas. */
async function leerNombresExistentes() {
  const existentes = new Set();
  let desde = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('ejercicios_catalogo')
      .select('nombre')
      .range(desde, desde + TAMANO_PAGINA - 1);
    if (error) {
      console.error('❌ Error consultando ejercicios_catalogo:', error.message);
      process.exit(1);
    }
    for (const fila of data || []) existentes.add(fila.nombre);
    if (!data || data.length < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }
  return existentes;
}

async function contarFilas() {
  const { count, error } = await supabase
    .from('ejercicios_catalogo')
    .select('*', { count: 'exact', head: true });
  if (error) {
    console.error('⚠️  No se pudo leer el count final de ejercicios_catalogo:', error.message);
    return null;
  }
  return count ?? 0;
}

async function run() {
  console.log('=== Seed de ejercicios_catalogo (catálogo global de drills) ===');
  console.log(`Modo: ${DRY_RUN ? '🔍 DRY-RUN (valida y calcula el diff, no escribe nada)' : '🚀 REAL (inserta en la base de datos)'}\n`);

  let ejercicios;
  try {
    const crudo = fs.readFileSync(DATA_PATH, 'utf8').replace(/^﻿/, '');
    ejercicios = JSON.parse(crudo);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`❌ No se encontró el archivo de datos: ${DATA_PATH}`);
      console.error('   Este script depende de que otro proceso genere ese JSON primero.');
    } else {
      console.error(`❌ Error leyendo/parseando ${DATA_PATH}: ${err.message}`);
    }
    process.exit(1);
  }

  const errores = validarEjercicios(ejercicios);
  if (errores.length) {
    console.error(`❌ ${errores.length} error(es) de validación — no se toca la base de datos:\n`);
    errores.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }
  console.log(`✅ Validación OK: ${ejercicios.length} ejercicio(s) en el JSON.\n`);

  const existentes = await leerNombresExistentes();

  const nuevos = ejercicios.filter((e) => !existentes.has(e.nombre.trim()));
  const yaExisten = ejercicios.length - nuevos.length;

  console.log(`Total en JSON: ${ejercicios.length}`);
  console.log(`Ya existentes en la tabla (se omiten): ${yaExisten}`);
  console.log(`${DRY_RUN ? 'Se insertarían' : 'Se insertarán'}: ${nuevos.length}\n`);

  if (DRY_RUN) {
    if (nuevos.length) {
      console.log('--- Diff (lo que se insertaría) ---');
      const porTipo = {};
      nuevos.forEach((e) => {
        porTipo[e.tipo] = (porTipo[e.tipo] || 0) + 1;
        console.log(`  [${e.tipo}] "${e.nombre}" (niveles: ${e.grupos_recomendados.join(', ')})`);
      });
      console.log(`\nPor tipo: ${JSON.stringify(porTipo)}`);
    }
    const countActual = await contarFilas();
    if (countActual !== null) console.log(`\nCount actual en ejercicios_catalogo: ${countActual}`);
    console.log('\n🔍 DRY-RUN: no se escribió nada. Corré sin --dry-run para insertar de verdad.');
    return;
  }

  let insertados = 0;
  if (!nuevos.length) {
    console.log('✅ Nada nuevo que insertar. La tabla ya está al día.');
  } else {
    for (let i = 0; i < nuevos.length; i += TAMANO_LOTE) {
      const lote = nuevos.slice(i, i + TAMANO_LOTE).map((e) => ({
        nombre: e.nombre.trim(),
        tipo: e.tipo,
        descripcion: e.descripcion,
        grupos_recomendados: e.grupos_recomendados,
      }));
      const { error } = await supabase.from('ejercicios_catalogo').insert(lote);
      if (error) {
        console.error(`❌ Error insertando lote ${Math.floor(i / TAMANO_LOTE) + 1} (filas ${i + 1}-${i + lote.length} del diff):`, error.message);
        console.error(`   Insertados exitosamente antes de fallar: ${insertados}. El script es idempotente por nombre: se puede volver a correr.`);
        process.exit(1);
      }
      insertados += lote.length;
      console.log(`  ✔ Lote ${Math.floor(i / TAMANO_LOTE) + 1}: ${lote.length} insertado(s) (${insertados}/${nuevos.length})`);
    }
    console.log(`\n✅ Insertados: ${insertados}`);
  }

  const countFinal = await contarFilas();

  console.log('\n=== RESUMEN ===');
  console.log(`Total en JSON:            ${ejercicios.length}`);
  console.log(`Ya existentes (omitidos): ${yaExisten}`);
  console.log(`Insertados:               ${insertados}`);
  if (countFinal !== null) console.log(`Count final en la tabla:  ${countFinal}`);
}

run().catch((err) => {
  console.error('❌ Error inesperado:', err);
  process.exit(1);
});
