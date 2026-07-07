// Inserta el lote de misiones de CASA (scripts/seed_misiones_casa.json) en la
// tabla `misiones`, replicando lo que hace la tool MCP insertar_misiones_catalogo
// para la matriz fuera de cancha: contexto='casa', complejidad='general',
// nivel_objetivo=null (la dosis por edad va en la descripción), activa=false
// (curaduría del coach, D3), is_ai_generated=true, condicion_trigger='catalogo_mcp'.
//
// Idempotente: si ya existe una misión con el mismo (titulo, categoria_bucket)
// se omite (permite re-ejecutar sin duplicar).
//
// Requiere SUPABASE_SERVICE_ROLE_KEY en Dashboard_Premium/.env.local.
// Modo de ejecución: SIMULAR = true por defecto (no escribe nada).

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const SIMULAR = true;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Dashboard_Premium/.env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 8 sub-pilares del radar (incluye 'resistencia', habilitada al ampliar el CHECK en v26).
const SUB_PILARES = ['fuerza', 'explosividad', 'resistencia', 'movilidad', 'tiro', 'agilidad', 'tactica', 'resiliencia'];
const BUCKETS = ['Sub12', 'Sub15', 'Sub18', 'Senior'];

function validar(m, i) {
  const errores = [];
  if (!m.titulo || m.titulo.length < 5 || m.titulo.length > 60) errores.push('titulo fuera de rango (5-60)');
  if (!m.descripcion || m.descripcion.length < 20) errores.push('descripcion corta');
  if (!m.justificacion || m.justificacion.length < 30) errores.push('justificacion corta');
  if (!m.justificacion || !/\[.+?›.+?\]/.test(m.justificacion)) errores.push('justificacion sin cita [archivo › sección]');
  if (!SUB_PILARES.includes(m.pilar)) errores.push(`pilar inválido: ${m.pilar}`);
  if (!BUCKETS.includes(m.categoria_bucket)) errores.push(`bucket inválido: ${m.categoria_bucket}`);
  if (!Number.isInteger(m.xp_recompensa) || m.xp_recompensa <= 0) errores.push('xp_recompensa inválida');
  if (errores.length) throw new Error(`Misión #${i} ("${m.titulo}"): ${errores.join(', ')}`);
}

async function run() {
  console.log('=== Seed de misiones de CASA (fuera de cancha) ===');
  console.log(`Modo: ${SIMULAR ? '🔍 SIMULACIÓN (no escribe nada)' : '🚀 REAL (inserta de verdad)'}\n`);

  const { misiones } = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'seed_misiones_casa.json'), 'utf8'),
  );
  misiones.forEach(validar);

  // Cobertura del lote: matriz casa objetivo 8 sub-pilares × 4 buckets = 32 celdas.
  const celdas = new Set(misiones.map(m => `${m.pilar}|${m.categoria_bucket}`));
  console.log(`Misiones en el lote: ${misiones.length} · Celdas (sub-pilar×bucket): ${celdas.size}/32`);
  if (celdas.size !== 32) {
    const faltan = [];
    SUB_PILARES.forEach(sp => BUCKETS.forEach(b => {
      if (!celdas.has(`${sp}|${b}`)) faltan.push(`${sp}×${b}`);
    }));
    console.warn(`⚠️  Celdas faltantes: ${faltan.join(', ')}`);
  }

  // Idempotencia: omitir las que ya existen por (titulo, categoria_bucket)
  const { data: existentes, error: exError } = await supabase
    .from('misiones')
    .select('titulo, categoria_bucket')
    .eq('condicion_trigger', 'catalogo_mcp');
  if (exError) {
    console.error('❌ Error consultando misiones existentes:', exError.message);
    process.exit(1);
  }
  const yaInsertadas = new Set((existentes || []).map(m => `${m.titulo}|${m.categoria_bucket}`));

  const nuevas = misiones.filter(m => !yaInsertadas.has(`${m.titulo}|${m.categoria_bucket}`));
  const omitidas = misiones.length - nuevas.length;

  if (SIMULAR) {
    nuevas.forEach(m => console.log(`[SIMULACIÓN] Insertaría: [${m.pilar}/${m.categoria_bucket}/casa] "${m.titulo}" (+${m.xp_recompensa} XP)`));
    console.log(`\n=== RESUMEN (simulación) ===`);
    console.log(`Insertaría: ${nuevas.length} · Omitiría (ya existen): ${omitidas}`);
    console.log('\nPara ejecutar de verdad, cambia "const SIMULAR = true" a false.');
    return;
  }

  const filas = nuevas.map(m => ({
    titulo: m.titulo,
    descripcion: m.descripcion,
    justificacion: m.justificacion,
    pilar: m.pilar,
    nivel_objetivo: null, // comodín de nivel a propósito: la dosis por edad va en la descripción
    categoria_bucket: m.categoria_bucket,
    complejidad: 'general', // lo que cuenta para la matriz casa (auto-asignable)
    contexto: 'casa',
    xp_recompensa: m.xp_recompensa,
    video_url: m.video_url ?? null,
    activa: false,
    is_ai_generated: true,
    condicion_trigger: 'catalogo_mcp',
  }));

  const { error: insError } = await supabase.from('misiones').insert(filas);
  if (insError) {
    console.error('❌ Error insertando:', insError.message);
    process.exit(1);
  }

  console.log(`✅ ${filas.length} misión(es) de casa insertada(s) con activa=false · Omitidas (ya existían): ${omitidas}`);
  console.log('Siguiente paso: el coach las revisa y activa en Gestionar Misiones (chips "Propuestas" + "Casa").');
}

run().catch(console.error);
