// Sincroniza la tabla `catalogo_ejercicios` de Supabase (usada EN VIVO por
// EvaluacionModal.jsx para evaluar atletas) con la fuente de verdad del
// paquete compartido: packages/analytics-core/baremos.js (objeto BAREMOS).
//
// Reemplaza al viejo scripts/generate_baremos_sql.js (borrado), que extraía
// BAREMOS con regex+eval desde src/lib/baremosEngine.js — archivo que hoy es
// solo un shim de reexport, por lo que el script quedó roto.
//
// Estrategia:
//   1. Backfill de baremo_key: filas con baremo_key NULL cuyo `nombre`
//      coincide EXACTO con algún BAREMOS[key].label reciben esa key.
//      Solo tiene efecto la primera corrida (idempotente).
//   2. Upsert por baremo_key (nunca por id ni por nombre):
//      - Existe la fila → UPDATE SOLO de los campos "científicos" propiedad
//        de BAREMOS: nombre, pilar, sub_pilar, tren, unidad, invertido,
//        thresholds, inputs_requeridos. Jamás se tocan descripcion,
//        descripcion_ejecucion, club_id, autor_id ni ninguna otra columna.
//        Si ningún campo cambió, la fila cuenta como SKIP (correr dos veces
//        seguidas produce cero cambios la segunda).
//      - No existe → INSERT con esos campos + baremo_key + club_id NULL.
//   3. Intocables: toda fila que tras el backfill siga con baremo_key NULL
//      (p.ej. 'Carga Subjetiva y Sueño' de la migración v16, o pruebas
//      creadas por el coach vía NuevaPruebaModal) NO se modifica JAMÁS;
//      solo se listan en el reporte como "fuera del sync".
//
// Requiere la migración loop_misiones_fase1 aplicada (columna
// catalogo_ejercicios.baremo_key); si falta, este script falla con un
// mensaje claro sin escribir nada.
//
// Requiere una SUPABASE_SERVICE_ROLE_KEY válida en Dashboard_Premium/.env.local
// (el mismo archivo que usa `npm run dev`, ya gitignored) — esta key nunca
// debe pegarse en un chat ni commitearse.
//
// Modo de ejecución: SIMULAR = true por defecto (no escribe nada; muestra el
// diff detallado por fila: campo: valor_actual → valor_nuevo).

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import { BAREMOS } from '../../packages/analytics-core/baremos.js';

const SIMULAR = true;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// `dotenv` no está entre las dependencias del proyecto; process.loadEnvFile
// (Node 20.6+) hace lo mismo sin agregar una dependencia nueva.
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

// Campos "científicos" cuya fuente de verdad es BAREMOS. Nada fuera de esta
// lista se escribe jamás en un UPDATE.
const CAMPOS_SYNC = ['nombre', 'pilar', 'sub_pilar', 'tren', 'unidad', 'invertido', 'thresholds', 'inputs_requeridos'];

/** Proyecta una entrada de BAREMOS a las columnas de catalogo_ejercicios. */
function camposDesdeBaremo(baremo) {
  return {
    nombre: baremo.label,
    pilar: baremo.pilar,
    sub_pilar: baremo.sub_pilar,
    tren: baremo.tren ?? null,
    unidad: baremo.unidad,
    invertido: baremo.tipo === 'menos_es_mejor',
    thresholds: baremo.thresholds,
    inputs_requeridos: baremo.inputs_requeridos ?? null,
  };
}

/**
 * Comparación profunda insensible al orden de claves. Necesaria porque jsonb
 * de Postgres reordena las claves internamente (p.ej. Sub12/Sub15/Sub18/Senior
 * pueden volver en otro orden), y un JSON.stringify directo daría falsos diffs.
 */
function sonIguales(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    return a.length === b.length && a.every((v, i) => sonIguales(v, b[i]));
  }
  const clavesA = Object.keys(a);
  const clavesB = Object.keys(b);
  if (clavesA.length !== clavesB.length) return false;
  return clavesA.every(k => Object.prototype.hasOwnProperty.call(b, k) && sonIguales(a[k], b[k]));
}

const mostrar = (valor) => (valor === null || valor === undefined) ? 'NULL' : JSON.stringify(valor);

/** Verifica que la columna baremo_key exista antes de hacer nada más. */
async function verificarColumnaBaremoKey() {
  const { error } = await supabase
    .from('catalogo_ejercicios')
    .select('id, baremo_key')
    .limit(1);

  if (error) {
    if (error.code === '42703' || /baremo_key/.test(error.message)) {
      console.error('❌ La columna catalogo_ejercicios.baremo_key todavía no existe.');
      console.error('   Corre primero la migración loop_misiones_fase1 (npx supabase db push) y vuelve a intentar.');
    } else {
      console.error('❌ Error consultando catalogo_ejercicios:', error.message);
    }
    process.exit(1);
  }
}

async function run() {
  console.log('=== Sincronización de catalogo_ejercicios desde analytics-core/baremos.js ===');
  console.log(`Modo: ${SIMULAR ? '🔍 SIMULACIÓN (no escribe nada)' : '🚀 REAL (escribe en la base de datos)'}\n`);

  await verificarColumnaBaremoKey();

  const { data: filas, error } = await supabase
    .from('catalogo_ejercicios')
    .select('*');

  if (error) {
    console.error('❌ Error leyendo catalogo_ejercicios:', error.message);
    process.exit(1);
  }

  console.log(`Filas en catalogo_ejercicios: ${filas.length}`);
  console.log(`Pruebas en BAREMOS: ${Object.keys(BAREMOS).length}\n`);

  const contadores = { backfill: 0, insert: 0, update: 0, skip: 0, intocables: 0, fallidos: 0 };

  // ── PASO 1: Backfill de baremo_key por coincidencia exacta de nombre ──
  console.log('── Paso 1: Backfill de baremo_key (coincidencia exacta de nombre) ──');

  const labelAKey = new Map(Object.entries(BAREMOS).map(([key, b]) => [b.label, key]));
  // Keys ya ocupadas (por corridas anteriores o por este mismo backfill):
  // la columna tiene índice único parcial, no podemos asignar una key dos veces.
  const keysOcupadas = new Set(filas.map(f => f.baremo_key).filter(Boolean));

  for (const fila of filas) {
    if (fila.baremo_key !== null) continue;

    const key = labelAKey.get(fila.nombre);
    if (!key) continue;

    if (keysOcupadas.has(key)) {
      console.log(`⚠️  Se omite backfill de "${fila.nombre}" (id=${fila.id}): la key '${key}' ya está asignada a otra fila.`);
      continue;
    }

    if (SIMULAR) {
      console.log(`[SIMULACIÓN] Backfill: "${fila.nombre}" (id=${fila.id}) → baremo_key='${key}'`);
    } else {
      const { error: errBackfill } = await supabase
        .from('catalogo_ejercicios')
        .update({ baremo_key: key })
        .eq('id', fila.id)
        .is('baremo_key', null);

      if (errBackfill) {
        console.error(`❌ Falló backfill de "${fila.nombre}" (id=${fila.id}): ${errBackfill.message}`);
        contadores.fallidos++;
        continue;
      }
      console.log(`✅ Backfill: "${fila.nombre}" (id=${fila.id}) → baremo_key='${key}'`);
    }

    // Se refleja en memoria para que el paso 2 razone sobre el estado
    // post-backfill (también en simulación).
    fila.baremo_key = key;
    keysOcupadas.add(key);
    contadores.backfill++;
  }

  if (contadores.backfill === 0) {
    console.log('(nada que backfillear)');
  }

  // ── PASO 2: Upsert por baremo_key ──
  console.log('\n── Paso 2: Upsert por baremo_key ──');

  const filasPorKey = new Map(filas.filter(f => f.baremo_key).map(f => [f.baremo_key, f]));

  for (const [key, baremo] of Object.entries(BAREMOS)) {
    const deseado = camposDesdeBaremo(baremo);
    const existente = filasPorKey.get(key);

    if (!existente) {
      // INSERT: campos científicos + baremo_key + club_id NULL.
      if (SIMULAR) {
        console.log(`[SIMULACIÓN] INSERT '${key}':`);
        for (const campo of CAMPOS_SYNC) {
          console.log(`    ${campo}: ${mostrar(deseado[campo])}`);
        }
      } else {
        const { error: errInsert } = await supabase
          .from('catalogo_ejercicios')
          .insert({ ...deseado, baremo_key: key, club_id: null });

        if (errInsert) {
          console.error(`❌ Falló INSERT de '${key}': ${errInsert.message}`);
          contadores.fallidos++;
          continue;
        }
        console.log(`✅ INSERT '${key}' ("${deseado.nombre}")`);
      }
      contadores.insert++;
      continue;
    }

    // UPDATE solo de los campos que realmente cambiaron.
    const cambios = {};
    for (const campo of CAMPOS_SYNC) {
      if (!sonIguales(existente[campo] ?? null, deseado[campo])) {
        cambios[campo] = deseado[campo];
      }
    }

    if (Object.keys(cambios).length === 0) {
      contadores.skip++;
      continue;
    }

    if (SIMULAR) {
      console.log(`[SIMULACIÓN] UPDATE '${key}' ("${existente.nombre}", id=${existente.id}):`);
      for (const campo of Object.keys(cambios)) {
        console.log(`    ${campo}: ${mostrar(existente[campo] ?? null)} → ${mostrar(cambios[campo])}`);
      }
    } else {
      const { error: errUpdate } = await supabase
        .from('catalogo_ejercicios')
        .update(cambios)
        .eq('baremo_key', key);

      if (errUpdate) {
        console.error(`❌ Falló UPDATE de '${key}': ${errUpdate.message}`);
        contadores.fallidos++;
        continue;
      }
      console.log(`✅ UPDATE '${key}' (${Object.keys(cambios).join(', ')})`);
    }
    contadores.update++;
  }

  if (contadores.skip > 0) {
    console.log(`(${contadores.skip} prueba(s) ya al día — SKIP, sin escritura)`);
  }

  // ── PASO 3: Intocables (fuera del sync) ──
  const intocables = filas.filter(f => f.baremo_key === null);
  contadores.intocables = intocables.length;

  console.log('\n── Paso 3: Fuera del sync (gestionadas a mano, NO se modifican) ──');
  if (intocables.length === 0) {
    console.log('(ninguna)');
  } else {
    for (const fila of intocables) {
      console.log(`🔒 "${fila.nombre}" (id=${fila.id}, pilar=${fila.pilar ?? 'NULL'}, autor_id=${fila.autor_id ?? 'NULL'})`);
    }
  }

  // ── RESUMEN ──
  console.log('\n=== RESUMEN ===');
  console.log(`BACKFILL:   ${contadores.backfill}`);
  console.log(`INSERT:     ${contadores.insert}`);
  console.log(`UPDATE:     ${contadores.update}`);
  console.log(`SKIP:       ${contadores.skip}`);
  console.log(`INTOCABLES: ${contadores.intocables}`);
  if (contadores.fallidos > 0) {
    console.log(`FALLIDOS:   ${contadores.fallidos}`);
  }

  console.log('\n📝 Nota (deuda documentada aparte): las pruebas creadas con NuevaPruebaModal');
  console.log('   guardan thresholds con forma {Masculino:{Sub12:[...]}} que normalizarValor');
  console.log('   no sabe leer. Este script no las toca (quedan como intocables), pero esa');
  console.log('   incompatibilidad sigue pendiente de resolver.');

  if (SIMULAR) {
    console.log('\nNada se escribió. Para ejecutar de verdad, edita este archivo y cambia "const SIMULAR = true" a "const SIMULAR = false".');
  }
}

run().catch((err) => {
  console.error('❌ Error inesperado:', err);
  process.exit(1);
});
