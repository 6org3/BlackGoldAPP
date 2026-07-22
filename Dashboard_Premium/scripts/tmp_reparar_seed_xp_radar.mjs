// Repara dos artefactos del seed de los 5 clubes (hallazgos QA 2026-07-22):
// 1) atletas.xp_total = 0 aunque el ledger xp_eventos tiene XP → backfill
//    xp_total = SUM(delta) por atleta (la UI muestra "0 XP TOTAL" con misiones
//    completadas y XP semanal visible).
// 2) Radar plano: TODAS las evaluaciones quedaron con puntuacion_normalizada=55
//    (valorMedio siempre caía en el tier 'average') → re-rola cada puntuación
//    con un perfil determinista por (atleta, pilar) para que cada atleta tenga
//    pilares fuertes y débiles, y recomputa overall_score/rango.
// Solo clubes nuevos (los 2 demo legacy no se tocan: los usa otra sesión).
// Uso: REPARAR=1 node scripts/tmp_reparar_seed_xp_radar.mjs (sin flag: dry-run)
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import { calcularOverall } from '../../packages/analytics-core/baremos.js';

const EJECUTAR = process.env.REPARAR === '1';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CLUBES = ['Nueva Loja Basket', 'Cascabel BC', 'Águilas del Coca', 'Cuyabeno Jr', 'Petroleros BC'];
const PUNT = [15, 35, 55, 75, 95];
const TIER = { 15: 'poor', 35: 'below_avg', 55: 'average', 75: 'above_avg', 95: 'excellent' };

// hash determinista (atleta_id + pilar) → índice de tier con distribución centrada
function tierIdx(atletaId, pilar) {
  let h = 0;
  const s = `${atletaId}|${pilar}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  const r = (Math.abs(h) % 1000) / 1000;
  // pesos: 10% poor, 22% below, 34% avg, 24% above, 10% excellent
  return r < 0.10 ? 0 : r < 0.32 ? 1 : r < 0.66 ? 2 : r < 0.90 ? 3 : 4;
}

async function run() {
  console.log(`=== Reparación seed (xp_total + radar) — ${EJECUTAR ? '🚀 REAL' : '🔍 DRY-RUN'} ===\n`);

  // atletas de los 5 clubes (via usuarios.club)
  const { data: usus } = await supabase.from('usuarios').select('id, club').in('club', CLUBES).eq('rol', 'atleta');
  const usuIds = usus.map((u) => u.id);
  const atletas = [];
  for (let i = 0; i < usuIds.length; i += 400) {
    const { data } = await supabase.from('atletas').select('id, usuario_id').in('usuario_id', usuIds.slice(i, i + 400));
    atletas.push(...(data || []));
  }
  const atlIds = atletas.map((a) => a.id);
  console.log(`Atletas de los 5 clubes: ${atlIds.length}`);

  // ── 1. xp_total desde el ledger ──
  const sumXp = new Map();
  for (let i = 0; i < atlIds.length; i += 200) {
    const { data } = await supabase.from('xp_eventos').select('atleta_id, delta').in('atleta_id', atlIds.slice(i, i + 200));
    for (const e of data || []) sumXp.set(e.atleta_id, (sumXp.get(e.atleta_id) || 0) + (e.delta || 0));
  }
  console.log(`Atletas con XP en el ledger: ${sumXp.size} (total ${[...sumXp.values()].reduce((a, b) => a + b, 0)} XP)`);
  if (EJECUTAR) {
    const entries = [...sumXp.entries()];
    for (let i = 0; i < entries.length; i += 20) {
      await Promise.all(entries.slice(i, i + 20).map(([id, xp]) =>
        supabase.from('atletas').update({ xp_total: xp }).eq('id', id)));
    }
    console.log('✅ xp_total backfilleado.');
  }

  // ── 2. Radar: re-rolar puntuaciones planas ──
  // OJO: PostgREST corta en 1000 filas por request — paginar con .range()
  // dentro de cada chunk de atletas (200 atl × 16 evals > 1000 truncaba a 3000).
  const evals = [];
  for (let i = 0; i < atlIds.length; i += 200) {
    for (let desde = 0; ; desde += 1000) {
      const { data } = await supabase.from('evaluaciones_pruebas')
        .select('id, atleta_id, pilar, created_at, puntuacion_normalizada')
        .in('atleta_id', atlIds.slice(i, i + 200)).order('id').range(desde, desde + 999);
      evals.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
  }
  console.log(`Evaluaciones: ${evals.length} (planas en 55: ${evals.filter((e) => e.puntuacion_normalizada === 55).length})`);

  // fecha reciente por atleta (la batería nueva manda en el overall)
  const recienteDe = new Map();
  for (const e of evals) {
    const t = new Date(e.created_at).getTime();
    if (t > (recienteDe.get(e.atleta_id) || 0)) recienteDe.set(e.atleta_id, t);
  }

  // nueva puntuación por fila: batería reciente = tier del perfil; vieja = un paso menos (progresión)
  const grupos = new Map(); // `${punt}` -> ids
  const recientesPorAtleta = new Map(); // atleta -> [{pilar, puntuacion}]
  for (const e of evals) {
    const esReciente = new Date(e.created_at).getTime() === recienteDe.get(e.atleta_id);
    let idx = tierIdx(e.atleta_id, e.pilar);
    if (!esReciente) idx = Math.max(0, idx - (Math.abs(e.atleta_id.charCodeAt(3) + (e.pilar?.length || 0)) % 2)); // vieja: igual o un tier menos
    const punt = PUNT[idx];
    (grupos.get(punt) || grupos.set(punt, []).get(punt)).push(e.id);
    if (esReciente) {
      (recientesPorAtleta.get(e.atleta_id) || recientesPorAtleta.set(e.atleta_id, []).get(e.atleta_id)).push({ pilar: e.pilar, puntuacion_normalizada: punt });
    }
  }
  for (const [punt, ids] of grupos) console.log(`  → ${ids.length} filas a ${punt} (${TIER[punt]})`);

  if (EJECUTAR) {
    for (const [punt, ids] of grupos) {
      for (let i = 0; i < ids.length; i += 400) {
        const { error } = await supabase.from('evaluaciones_pruebas')
          .update({ puntuacion_normalizada: punt, tier: TIER[punt] }).in('id', ids.slice(i, i + 400));
        if (error) throw new Error(`update evals ${punt}: ${error.message}`);
      }
    }
    console.log('✅ Puntuaciones re-roladas.');

    // overall/rango por atleta desde la batería reciente
    const updates = [];
    for (const [atletaId, filas] of recientesPorAtleta) {
      const { overall, rango } = calcularOverall(filas);
      updates.push({ id: atletaId, overall_score: overall, rango: rango.id, rango_tier: rango.nombre });
    }
    for (let i = 0; i < updates.length; i += 20) {
      await Promise.all(updates.slice(i, i + 20).map((u) =>
        supabase.from('atletas').update({ overall_score: u.overall_score, rango: u.rango, rango_tier: u.rango_tier }).eq('id', u.id)));
    }
    console.log(`✅ Overall/rango recomputados (${updates.length} atletas).`);
    const dist = {};
    for (const u of updates) dist[u.rango] = (dist[u.rango] || 0) + 1;
    console.log(`  Distribución de rangos: ${JSON.stringify(dist)}`);
  }

  console.log(EJECUTAR ? '\n✅ Reparación completa.' : '\nDry-run. REPARAR=1 para ejecutar.');
}

run().catch((e) => { console.error('❌', e.message); process.exit(1); });
