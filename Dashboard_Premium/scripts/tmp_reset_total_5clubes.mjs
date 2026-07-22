// RESET TOTAL para la estructura de 5 clubes simulados (2026-07-22).
// 1) SNAPSHOT completo de todas las tablas public + auth users a JSON
//    (C:\Users\jorge\dev\backups-blackgold\pre_reset_5clubes_20260722\).
// 2) BORRA todos los datos de club en orden FK-seguro.
//
// PRESERVA:
//   · usuarios: SA_001 (superadmin, club='Global') y su cuenta Auth — escotilla.
//   · Catálogos GLOBALES de producto (no son datos de club): misiones (salvo
//     las de condicion_trigger='simulacion_club_demo'), catalogo_ejercicios,
//     ejercicios_catalogo, catalogo_sesiones.
//
// Dry-run por defecto (cuenta e imprime). Real: RESET_REAL=1 node scripts/tmp_reset_total_5clubes.mjs
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const EJECUTAR = process.env.RESET_REAL === '1';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SNAP_DIR = 'C:/Users/jorge/dev/backups-blackgold/pre_reset_5clubes_20260722';

// Todas las tablas public (baseline + v17/v18/v27/v30/v31)
const TODAS = [
  'usuarios', 'atletas', 'padres_atletas', 'atleta_grupo', 'grupos_entrenamiento',
  'asistencia', 'atleta_readiness', 'evaluaciones_pruebas', 'screening_funcional',
  'encuestas_habitos', 'sesiones_entrenamiento', 'sesiones_control', 'sesiones_programadas',
  'notas_coach', 'observaciones_cancha', 'comunicaciones', 'comunicacion_destinatarios',
  'eventos', 'evento_convocados', 'evento_recordatorios', 'misiones', 'progreso_misiones',
  'recompensas_desbloqueadas', 'grupos_mision', 'grupos_mision_miembros', 'xp_eventos',
  'pagos', 'pagos_auditoria', 'pago_transacciones', 'pago_comprobantes',
  'catalogo_servicios', 'servicio_tarifas', 'club_config',
  'catalogo_ejercicios', 'ejercicios_catalogo', 'catalogo_sesiones',
];

// Orden de borrado (hijos → padres). [tabla, filtro|null=todo]
const BORRADO = [
  ['pagos_auditoria', null],
  ['pago_transacciones', null],
  ['pago_comprobantes', null],
  ['pagos', null],
  ['servicio_tarifas', null],
  ['catalogo_servicios', null],
  ['recompensas_desbloqueadas', null],
  ['progreso_misiones', null],
  ['xp_eventos', null],
  ['evaluaciones_pruebas', null],
  ['screening_funcional', null],
  ['encuestas_habitos', null],
  ['atleta_readiness', null],
  ['asistencia', null],
  ['sesiones_entrenamiento', null],
  ['notas_coach', null],
  ['observaciones_cancha', null],
  ['evento_recordatorios', null],
  ['evento_convocados', null],
  ['eventos', null],
  ['comunicacion_destinatarios', null],
  ['comunicaciones', null],
  ['grupos_mision_miembros', null],
  ['grupos_mision', null],
  ['sesiones_control', null],
  ['sesiones_programadas', null],
  ['atleta_grupo', null],
  ['padres_atletas', null],
  ['atletas', null],
  ['grupos_entrenamiento', null],
  ['club_config', null],
  ['misiones', (q) => q.eq('condicion_trigger', 'simulacion_club_demo')],
  // usuarios: todos MENOS el superadmin global (escotilla)
  ['usuarios', (q) => q.not('and', 'and', undefined)], // placeholder — se maneja aparte
];

// Tablas sin columna `id` (PK compuesta): columna-ancla para el DELETE-todo.
const COL_ANCLA = {
  comunicacion_destinatarios: 'comunicacion_id',
  grupos_mision_miembros: 'grupo_id',
  atleta_grupo: 'atleta_id',
  padres_atletas: 'atleta_id',
  club_config: 'club',
};

async function snapshotTabla(tabla) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from(tabla).select('*').range(desde, desde + 999);
    if (error) return { tabla, error: error.message };
    filas.push(...data);
    if (data.length < 1000) break;
  }
  fs.writeFileSync(path.join(SNAP_DIR, `${tabla}.json`), JSON.stringify(filas));
  return { tabla, n: filas.length };
}

async function snapshotAuth() {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return { error: error.message };
    users.push(...data.users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at, user_metadata: u.user_metadata })));
    if (data.users.length < 1000) break;
  }
  fs.writeFileSync(path.join(SNAP_DIR, `_auth_users.json`), JSON.stringify(users));
  return { n: users.length, users };
}

async function run() {
  console.log(`=== RESET TOTAL (5 clubes) — modo ${EJECUTAR ? '🚀 REAL' : '🔍 DRY-RUN'} ===\n`);

  // Escotilla a preservar
  const { data: sa } = await supabase.from('usuarios')
    .select('id, cedula, auth_user_id').eq('rol', 'superadmin').eq('club', 'Global').maybeSingle();
  if (!sa) throw new Error('No encontré el superadmin Global (SA_001) — aborto por seguridad.');
  console.log(`Preservo: [superadmin Global] ${sa.cedula} (usuario ${sa.id}, auth ${sa.auth_user_id})\n`);

  // 1. SNAPSHOT (solo en modo real; el dry-run solo cuenta)
  let authSnap = null;
  const snapHecho = fs.existsSync(path.join(SNAP_DIR, '_auth_users.json'));
  if (EJECUTAR && snapHecho) {
    // NUNCA pisar el snapshot bueno con un estado semi-borrado en reejecuciones.
    const users = JSON.parse(fs.readFileSync(path.join(SNAP_DIR, '_auth_users.json'), 'utf8'));
    authSnap = { n: users.length, users };
    console.log(`── Snapshot ya existe (${authSnap.n} auth users) — NO se pisa ──\n`);
  } else if (EJECUTAR) {
    fs.mkdirSync(SNAP_DIR, { recursive: true });
    console.log(`── Snapshot → ${SNAP_DIR} ──`);
    for (const t of TODAS) {
      const r = await snapshotTabla(t);
      console.log(`  ${r.tabla}: ${r.error ? `ERR ${r.error}` : `${r.n} filas`}`);
    }
    authSnap = await snapshotAuth();
    console.log(`  _auth_users: ${authSnap.error ? `ERR ${authSnap.error}` : `${authSnap.n} usuarios`}\n`);
  } else {
    authSnap = await snapshotAuthCount();
  }

  // 2. BORRADO en orden
  console.log('── Borrado ──');
  for (const [tabla, filtro] of BORRADO) {
    if (tabla === 'usuarios') continue; // aparte, abajo
    const base = supabase.from(tabla);
    if (!EJECUTAR) {
      const q = filtro ? filtro(base.select('*', { count: 'exact', head: true })) : base.select('*', { count: 'exact', head: true });
      const { count, error } = await q;
      console.log(`  [dry] ${tabla}: borraría ${error ? `ERR ${error.message}` : count ?? 0}`);
    } else {
      const q = filtro
        ? filtro(base.delete({ count: 'exact' }))
        : base.delete({ count: 'exact' }).not(COL_ANCLA[tabla] || 'id', 'is', null);
      const { count, error } = await q;
      if (error) throw new Error(`DELETE ${tabla}: ${error.message}`);
      console.log(`  ✅ ${tabla}: ${count ?? '?'} borradas`);
    }
  }

  // Los catálogos globales preservados referencian usuarios via creado_por:
  // reapuntarlos a la escotilla para que el DELETE de usuarios no choque con FK.
  if (EJECUTAR) {
    for (const t of ['catalogo_sesiones', 'catalogo_ejercicios', 'ejercicios_catalogo', 'misiones']) {
      for (const col of ['creado_por', 'created_by']) {
        const { error } = await supabase.from(t).update({ [col]: sa.id }).not(col, 'is', null).neq(col, sa.id);
        if (error && !new RegExp(col).test(error.message)) console.warn(`  ⚠️ reapuntar ${t}.${col}: ${error.message}`);
        else if (!error) console.log(`  ↪ ${t}.${col} → SA_001`);
      }
    }
  }

  // usuarios (menos la escotilla)
  if (!EJECUTAR) {
    const { count } = await supabase.from('usuarios').select('*', { count: 'exact', head: true }).neq('id', sa.id);
    console.log(`  [dry] usuarios: borraría ${count} (preserva 1)`);
  } else {
    const { count, error } = await supabase.from('usuarios').delete({ count: 'exact' }).neq('id', sa.id);
    if (error) throw new Error(`DELETE usuarios: ${error.message}`);
    console.log(`  ✅ usuarios: ${count} borrados (preservado ${sa.cedula})`);
  }

  // 3. AUTH users (todos menos la escotilla)
  if (!EJECUTAR) {
    console.log(`  [dry] auth.users: borraría ${(authSnap?.n ?? '?') - 1} de ${authSnap?.n ?? '?'}`);
  } else {
    const aBorrar = authSnap.users.filter((u) => u.id !== sa.auth_user_id);
    console.log(`\n── Auth: borrando ${aBorrar.length} de ${authSnap.n} ──`);
    let ok = 0, fail = 0;
    for (const u of aBorrar) {
      const { error } = await supabase.auth.admin.deleteUser(u.id);
      if (error) { fail++; if (fail <= 5) console.warn(`  ⚠️ ${u.email}: ${error.message}`); }
      else ok++;
      if ((ok + fail) % 100 === 0) console.log(`  … ${ok + fail}/${aBorrar.length}`);
    }
    console.log(`  ✅ auth: ${ok} borrados, ${fail} fallos`);
  }

  // 4. Storage de comprobantes (best-effort)
  if (EJECUTAR) {
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      for (const b of buckets || []) {
        const { data: files } = await supabase.storage.from(b.name).list('', { limit: 1000 });
        const paths = await listarRec(b.name, '', files || []);
        if (paths.length) {
          await supabase.storage.from(b.name).remove(paths);
          console.log(`  ✅ storage/${b.name}: ${paths.length} objetos borrados`);
        }
      }
    } catch (e) { console.warn(`  ⚠️ storage: ${e.message}`); }
  }

  console.log(`\n${EJECUTAR ? '✅ RESET COMPLETO.' : 'Dry-run terminado. RESET_REAL=1 para ejecutar.'}`);
}

async function listarRec(bucket, prefijo, entradas) {
  const paths = [];
  for (const e of entradas) {
    const p = prefijo ? `${prefijo}/${e.name}` : e.name;
    if (e.id) paths.push(p); // archivo
    else {
      const { data: sub } = await supabase.storage.from(bucket).list(p, { limit: 1000 });
      paths.push(...await listarRec(bucket, p, sub || []));
    }
  }
  return paths;
}

async function snapshotAuthCount() {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  return { n: error ? '?' : data?.total, users: [] };
}

run().catch((e) => { console.error('❌', e.message); process.exit(1); });
