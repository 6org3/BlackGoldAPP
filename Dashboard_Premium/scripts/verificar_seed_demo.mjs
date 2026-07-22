// Verificación de la siembra demo: conteos por club + smoke de login real
// (sin imprimir contraseñas). Solo lectura. No escribe nada.
//   node scripts/verificar_seed_demo.mjs
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

import { SUB_PILARES } from '../../packages/analytics-core/taxonomia.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));
const url = process.env.VITE_SUPABASE_URL;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.VITE_SUPABASE_ANON_KEY;
const admin = createClient(url, svc, { auth: { persistSession: false } });

const CLUBES = ['DEMO Simulación 1 Año', 'DEMO QA Compacto'];

async function cnt(tabla, filtro) {
  let q = admin.from(tabla).select('*', { count: 'exact', head: true });
  for (const [k, v] of Object.entries(filtro || {})) q = q.eq(k, v);
  const { count } = await q;
  return count ?? 0;
}

async function conteosClub(club) {
  // atletas del club (vía usuarios.club)
  const { data: us } = await admin.from('usuarios').select('id, rol').eq('club', club);
  const roles = {};
  for (const u of us || []) roles[u.rol] = (roles[u.rol] || 0) + 1;
  const idsAtl = [];
  const { data: usAtl } = await admin.from('usuarios').select('id').eq('club', club).eq('rol', 'atleta');
  const { data: atl } = await admin.from('atletas').select('id').in('usuario_id', (usAtl || []).map((u) => u.id).concat('00000000-0000-0000-0000-000000000000'));
  const ids = (atl || []).map((a) => a.id);
  const inCount = async (tabla) => { if (!ids.length) return 0; const { count } = await admin.from(tabla).select('*', { count: 'exact', head: true }).in('atleta_id', ids); return count ?? 0; };
  console.log(`\n=== ${club} ===`);
  console.log(`  usuarios por rol: ${JSON.stringify(roles)}`);
  console.log(`  atletas: ${ids.length}`);
  console.log(`  evaluaciones_pruebas: ${await inCount('evaluaciones_pruebas')}`);
  // Desglose por sub_pilar (paginado: el club rico supera el límite de 1000 filas
  // por request de PostgREST) + WARNING si algún sub-pilar del radar (SUB_PILARES,
  // taxonomia.js — 8 con resistencia) quedó con 0 evaluaciones en este club.
  const porSubPilar = {};
  if (ids.length) {
    for (let desde = 0; ; desde += 1000) {
      const { data: evs } = await admin.from('evaluaciones_pruebas').select('sub_pilar').in('atleta_id', ids).range(desde, desde + 999);
      for (const e of evs || []) { const k = e.sub_pilar || '(sin sub_pilar)'; porSubPilar[k] = (porSubPilar[k] || 0) + 1; }
      if (!evs || evs.length < 1000) break;
    }
  }
  console.log(`  evaluaciones por sub_pilar: ${JSON.stringify(porSubPilar)}`);
  const sinEvaluaciones = SUB_PILARES.filter((s) => !porSubPilar[s.key]).map((s) => s.key);
  if (sinEvaluaciones.length) console.log(`  ⚠️  WARNING: sub-pilares del radar SIN evaluaciones en este club: ${sinEvaluaciones.join(', ')}`);
  console.log(`  asistencia: ${await inCount('asistencia')}`);
  console.log(`  pagos: ${await inCount('pagos')}`);
  console.log(`  pago_transacciones: (por pago) ` + (await (async () => { const { data: pg } = await admin.from('pagos').select('id').in('atleta_id', ids.length ? ids : ['x']); const pids = (pg || []).map((p) => p.id); if (!pids.length) return 0; const { count } = await admin.from('pago_transacciones').select('*', { count: 'exact', head: true }).in('pago_id', pids); return count ?? 0; })()));
  console.log(`  xp_eventos: ${await inCount('xp_eventos')}`);
  console.log(`  progreso_misiones: ${await inCount('progreso_misiones')}`);
  console.log(`  eventos: ${await cnt('eventos', { club })}`);
  console.log(`  club_config: ${await cnt('club_config', { club })}`);
}

// Smoke de login: usa el mismo flujo del app (resolver_email_login → signInWithPassword).
async function smokeLogin(cedula) {
  const pub = createClient(url, anon, { auth: { persistSession: false } });
  const { data: email, error: e1 } = await pub.rpc('resolver_email_login', { p_identificador: cedula });
  if (e1) return `resolver falló (${e1.message})`;
  const { data, error } = await pub.auth.signInWithPassword({ email, password: cedula });
  if (error) return `❌ ${error.message}`;
  await pub.auth.signOut();
  return data?.user ? '✅ OK' : '❌ sin user';
}

async function run() {
  for (const c of CLUBES) await conteosClub(c);
  console.log('\n=== Smoke de login (identificador = password = cédula) ===');
  const cuentas = ['DEMO-OWNER-001', 'DEMO-SUPERADMIN-001', 'DEMO-COACH-001', 'DEMO-ATL-001', 'DEMO-PADRE-001', 'QAC-OWNER', 'QAC-COACH', 'QAC-ATLETA', 'QAC-PADRE'];
  for (const ced of cuentas) console.log(`  ${ced.padEnd(20)} → ${await smokeLogin(ced)}`);
}
run().catch((e) => { console.error(e); process.exit(1); });
