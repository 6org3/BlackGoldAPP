// Inventario PRE-RESET (solo lectura): qué clubes, usuarios, grupos y volúmenes
// hay en la BD antes de la limpieza total para los 5 clubes simulados.
// Identifica además las cuentas a PRESERVAR (superadmins y la cuenta real del
// dueño) y cuántos pagos dependen hoy del fallback de $30 (atletas sin grupo).
// No escribe nada. Uso: node scripts/tmp_inventario_pre_reset.mjs
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const count = async (tabla, filtro = (q) => q) => {
  const { count: n, error } = await filtro(supabase.from(tabla).select('*', { count: 'exact', head: true }));
  if (error) return `ERR: ${error.message}`;
  return n;
};

async function run() {
  // 1. Usuarios por club y rol
  const { data: usuarios, error: eU } = await supabase
    .from('usuarios')
    .select('id, club, rol, estado, cedula, nombre, correo, auth_user_id');
  if (eU) throw new Error(eU.message);
  const porClub = {};
  for (const u of usuarios) {
    const club = u.club ?? '(sin club)';
    porClub[club] ??= {};
    porClub[club][u.rol] = (porClub[club][u.rol] || 0) + 1;
  }
  console.log('=== USUARIOS POR CLUB Y ROL ===');
  for (const [club, roles] of Object.entries(porClub)) {
    const total = Object.values(roles).reduce((a, b) => a + b, 0);
    console.log(`  ${club}: total ${total} — ${JSON.stringify(roles)}`);
  }

  // 2. Cuentas de staff (para decidir qué preservar) — sin passwords, claro
  console.log('\n=== STAFF (superadmin/owner/coach) ===');
  for (const u of usuarios.filter((x) => ['superadmin', 'owner', 'coach'].includes(x.rol))) {
    console.log(`  [${u.rol}] ${u.cedula} · ${u.nombre} · correo=${u.correo || '—'} · club=${u.club || '—'} · estado=${u.estado || '—'} · auth=${u.auth_user_id ? 'sí' : 'no'}`);
  }

  // 3. Grupos por club (con precio y nivel)
  const { data: grupos, error: eG } = await supabase
    .from('grupos_entrenamiento')
    .select('club, nombre, precio_mensual, nivel, es_principal, activo');
  if (eG) throw new Error(eG.message);
  console.log('\n=== GRUPOS POR CLUB ===');
  const gPorClub = {};
  for (const g of grupos) (gPorClub[g.club ?? '(sin club)'] ??= []).push(g);
  for (const [club, gs] of Object.entries(gPorClub)) {
    console.log(`  ${club}: ${gs.length} grupos — ${gs.map((g) => `${g.nombre}($${g.precio_mensual ?? 'NULL'}${g.activo === false ? ',archivado' : ''})`).join(', ')}`);
  }

  // 4. Volúmenes globales
  console.log('\n=== VOLÚMENES ===');
  for (const t of ['atletas', 'pagos', 'atleta_grupo', 'evaluaciones', 'asistencias', 'sesiones_control', 'comunicaciones', 'eventos', 'misiones_atleta', 'padres_atletas', 'club_config', 'xp_eventos']) {
    console.log(`  ${t}: ${await count(t)}`);
  }

  // 5. Dependencia del fallback $30: atletas activos SIN grupo_id
  const { data: sinGrupo, error: eSG } = await supabase
    .from('atletas')
    .select('id, usuario_id, grupo_id, estado_membresia, usuarios!atletas_usuario_id_fkey(club, estado)')
    .is('grupo_id', null);
  if (eSG) console.log(`\n(sin_grupo ERR: ${eSG.message})`);
  else {
    const activos = sinGrupo.filter((a) => (a.estado_membresia ?? 'activo') === 'activo' && a.usuarios?.estado === 'activo');
    const porClubSG = {};
    for (const a of activos) porClubSG[a.usuarios?.club ?? '?'] = (porClubSG[a.usuarios?.club ?? '?'] || 0) + 1;
    console.log(`\n=== ATLETAS ACTIVOS SIN GRUPO (facturarían $30 con el fallback) ===`);
    console.log(`  total: ${activos.length} — por club: ${JSON.stringify(porClubSG)}`);
  }

  // 6. Pagos de julio 2026 con monto_base = 30 (huella del fallback este mes)
  const { count: pagos30, error: e30 } = await supabase
    .from('pagos')
    .select('*', { count: 'exact', head: true })
    .eq('monto_base', 30.0)
    .eq('tipo', 'Mensualidad');
  console.log(`\n=== MENSUALIDADES CON BASE $30 (histórico, posible huella del fallback) ===`);
  console.log(`  total: ${e30 ? `ERR ${e30.message}` : pagos30}`);

  // 7. Usuarios de Auth (para dimensionar la limpieza de auth.users)
  const { data: authList, error: eA } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  console.log(`\n=== AUTH USERS ===`);
  console.log(`  total: ${eA ? `ERR ${eA.message}` : authList?.total ?? '?'}`);
}

run().catch((e) => { console.error('❌', e.message); process.exit(1); });
