// Backfill de evaluaciones de RESISTENCIA (8º sub-pilar del radar, v42) para los
// 2 clubes demo ya sembrados: 'DEMO Simulación 1 Año' y 'DEMO QA Compacto'.
//
// ¿Por qué existe? Los seeds (simular_club_nuevo_1anio.mjs / sembrar_club_qa_compacto.mjs)
// abortan si el club ya existe y no re-siembran, así que aunque ya conocen las
// pruebas de resistencia, NUNCA volverán a correr sobre los clubes demo existentes.
// Este script rellena solo ese hueco: a cada atleta de esos clubes SIN ninguna
// evaluación sub_pilar='resistencia' le inserta en evaluaciones_pruebas:
//   - Course Navette (Léger 20m) + Yo-Yo IR1 (aplican a todos los buckets), y
//   - Carrera 600 m si su bucket es Sub12 / Carrera 1000 m si es Sub15 (el resto
//     de buckets no tiene cortes para esas pruebas y se saltan solas).
//
// Reusa el MISMO motor que los seeds (no reinventa lógica):
//   - resolverUmbrales (baremos.js) resuelve los cortes por Género→Bucket→Nivel.
//   - Tier/puntuación con el mismo criterio de tiers de los seeds (réplica de
//     normalizarValor sobre cortes ya resueltos + PUNT_TIER).
//   - Recalcula overall_score/rango con calcularOverall sobre las ÚLTIMAS
//     evaluaciones por prueba (ultimasPorPrueba, recomendaciones.js) — mismo
//     criterio que recalcularOverall (evaluacionesService.js) y que los seeds.
//
// Valores plausibles en banda media (entre corte 2 y 3, tier average) con variación
// DETERMINISTA por atleta: LCG de la casa sembrado con el uuid del atleta, sin
// Math.random — re-correrlo genera los mismos valores para el mismo atleta.
// Fecha de evaluación: reciente (1-14 días atrás), nunca futura.
//
// Dry-run por defecto (imprime lo que haría sin escribir). Para escribir de verdad:
//   SEED_REAL=1 node scripts/sembrar_resistencia_clubes_demo.mjs
// Idempotente: el filtro "atleta sin evaluaciones de resistencia" garantiza que
// correrlo dos veces no duplica nada.

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

import { BAREMOS, calcularOverall, resolverUmbrales, categoriaABucketBaremo } from '../../packages/analytics-core/baremos.js';
import { calcularCategoriaFEB } from '../../packages/analytics-core/categoriaFEB.js';
import { ultimasPorPrueba } from '../../packages/analytics-core/recomendaciones.js';

const EJECUTAR = process.env.SEED_REAL === '1';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Dashboard_Premium/.env.local');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const CLUBES = ['DEMO Simulación 1 Año', 'DEMO QA Compacto'];
// Las 4 pruebas de resistencia de BAREMOS (v42). resolverUmbrales decide cuáles
// aplican a cada atleta (600m solo Sub12, 1000m solo Sub15).
const CLAVES_RESISTENCIA = ['course_navette', 'yoyo_ir1', 'carrera_600m_vinueza', 'carrera_1000m_vinueza'];
const PUNT_TIER = { poor: 15, below_avg: 35, average: 55, above_avg: 75, excellent: 95 };

// PRNG determinista POR ATLETA: mismo LCG de los seeds de la casa, pero sembrado
// con el uuid del atleta (los seeds usan semilla global fija; aquí la variación
// debe ser estable por atleta aunque cambie el orden de recorrido).
function crearRand(semillaStr) {
  let s = 0;
  for (const ch of String(semillaStr)) s = (s * 31 + ch.charCodeAt(0)) & 0x7fffffff;
  s = s || 42;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// Mismo criterio de tier que los seeds (réplica de normalizarValor de baremos.js
// aplicada sobre cortes ya resueltos por resolverUmbrales).
function tierDe(tipo, cortes, valor) {
  const [t1, t2, t3, t4] = cortes;
  if (tipo === 'mas_es_mejor') return valor > t4 ? 'excellent' : valor > t3 ? 'above_avg' : valor > t2 ? 'average' : valor > t1 ? 'below_avg' : 'poor';
  return valor <= t1 ? 'excellent' : valor <= t2 ? 'above_avg' : valor <= t3 ? 'average' : valor <= t4 ? 'below_avg' : 'poor';
}

async function coachDelClub(club) {
  const { data } = await supabase.from('usuarios').select('id').eq('club', club).eq('rol', 'coach').limit(1).maybeSingle();
  return data?.id || null;
}

// Atletas del club con el perfil que necesita resolverUmbrales: bucket de baremos
// (derivado de fecha_nacimiento con el MISMO camino que la app: calcularCategoriaFEB
// → categoriaABucketBaremo), género y nivel_desarrollo.
async function atletasDelClub(club) {
  const { data: us } = await supabase.from('usuarios')
    .select('id, cedula, genero, fecha_nacimiento').eq('club', club).eq('rol', 'atleta');
  if (!us || !us.length) return [];
  const { data: atl } = await supabase.from('atletas')
    .select('id, usuario_id, nivel_desarrollo').in('usuario_id', us.map((u) => u.id));
  const porUsuario = new Map(us.map((u) => [u.id, u]));
  return (atl || []).map((a) => {
    const u = porUsuario.get(a.usuario_id);
    return {
      atletaId: a.id,
      cedula: u?.cedula || a.usuario_id,
      genero: u?.genero || null,
      nivel: a.nivel_desarrollo || null,
      bucket: categoriaABucketBaremo(calcularCategoriaFEB(u?.fecha_nacimiento || null)),
    };
  });
}

async function run() {
  console.log('=== Backfill de resistencia (8º sub-pilar) — clubes demo ===');
  console.log(`Modo: ${EJECUTAR ? '🚀 REAL (escribe)' : '🔍 DRY-RUN (no escribe)'}\n`);
  const ahora = new Date();

  for (const club of CLUBES) {
    console.log(`── ${club} ──`);
    const coachId = await coachDelClub(club);
    const atletas = await atletasDelClub(club);
    if (!atletas.length) { console.log('  ⏭️  Sin atletas (¿club aún no sembrado?). Se omite.\n'); continue; }
    if (EJECUTAR && !coachId) { console.warn('  ⚠️  Sin coach en el club → registrado_por quedaría null; se omite el club.\n'); continue; }

    let conResistencia = 0, sinBucket = 0, atletasBackfill = 0, filasTotal = 0;
    for (const a of atletas) {
      // Idempotencia: si YA tiene alguna evaluación de resistencia, no se toca.
      const { count, error: errCnt } = await supabase.from('evaluaciones_pruebas')
        .select('*', { count: 'exact', head: true }).eq('atleta_id', a.atletaId).eq('sub_pilar', 'resistencia');
      if (errCnt) throw new Error(`conteo resistencia ${a.cedula}: ${errCnt.message}`);
      if ((count ?? 0) > 0) { conResistencia++; continue; }
      if (!a.bucket) { sinBucket++; console.warn(`  ⚠️  ${a.cedula}: sin fecha_nacimiento válida → sin bucket de baremos, se salta.`); continue; }

      const rand = crearRand(a.atletaId);
      // Fecha reciente determinista por atleta: 1-14 días atrás, nunca futura.
      const fecha = new Date(ahora);
      fecha.setDate(fecha.getDate() - (1 + Math.floor(rand() * 14)));
      const fechaISO = fecha.toISOString();

      const filas = [];
      for (const clave of CLAVES_RESISTENCIA) {
        const b = BAREMOS[clave];
        const cortes = resolverUmbrales(b.thresholds, { bucket: a.bucket, genero: a.genero, nivelDesarrollo: a.nivel });
        if (!cortes) continue; // sin cortes para este perfil (p.ej. carrera_600m fuera de Sub12)
        const [, t2, t3] = cortes;
        // Banda media: entre corte 2 y 3 (tier average), 1 decimal.
        const valor = Math.round((t2 + rand() * (t3 - t2)) * 10) / 10;
        const tier = tierDe(b.tipo, cortes, valor);
        // Shape EXACTO de las filas que insertan los seeds en evaluaciones_pruebas.
        filas.push({
          atleta_id: a.atletaId,
          prueba_tipo: b.label,
          pilar: b.pilar,
          sub_pilar: b.sub_pilar,
          tren: b.tren || null,
          lado: 'unico',
          valor_crudo: valor,
          unidad: b.unidad,
          puntuacion_normalizada: PUNT_TIER[tier],
          tier,
          registrado_por: coachId,
          created_at: fechaISO,
          notas: 'Backfill de resistencia (8º sub-pilar) — clubes demo',
        });
      }
      if (!filas.length) continue;
      atletasBackfill++; filasTotal += filas.length;

      if (!EJECUTAR) {
        console.log(`  [DRY-RUN] ${a.cedula} (${a.bucket}/${a.genero || '—'}/${a.nivel || '—'}): insertaría ${filas.length} → ` +
          filas.map((f) => `${f.prueba_tipo}=${f.valor_crudo} ${f.unidad} (${f.tier})`).join(' · '));
        continue;
      }

      const { error: errIns } = await supabase.from('evaluaciones_pruebas').insert(filas);
      if (errIns) throw new Error(`evaluaciones ${a.cedula}: ${errIns.message}`);

      // Recalcular overall/rango: última evaluación por prueba_tipo → calcularOverall
      // (mismo criterio que recalcularOverall y que los seeds).
      const { data: historial, error: errHist } = await supabase.from('evaluaciones_pruebas')
        .select('prueba_tipo, pilar, puntuacion_normalizada, created_at')
        .eq('atleta_id', a.atletaId).order('created_at', { ascending: true });
      if (errHist) throw new Error(`historial ${a.cedula}: ${errHist.message}`);
      const { overall, rango } = calcularOverall(Object.values(ultimasPorPrueba(historial || [])));
      const { error: errUp } = await supabase.from('atletas')
        .update({ overall_score: overall, rango: rango.id, rango_tier: rango.nombre }).eq('id', a.atletaId);
      if (errUp) throw new Error(`update overall ${a.cedula}: ${errUp.message}`);
      console.log(`  ✅ ${a.cedula}: +${filas.length} evaluaciones de resistencia · overall → ${overall} (${rango.nombre})`);
    }

    console.log(`  Atletas: ${atletas.length} · ya tenían resistencia: ${conResistencia} · sin bucket: ${sinBucket} · backfill: ${atletasBackfill} atletas (${filasTotal} filas)\n`);
  }

  if (!EJECUTAR) console.log('🔍 DRY-RUN: no se escribió nada. Para ejecutar:\n   SEED_REAL=1 node scripts/sembrar_resistencia_clubes_demo.mjs');
  else console.log('✅ Backfill de resistencia completado.');
}

run().catch((err) => { console.error('❌ Error inesperado:', err); process.exit(1); });
