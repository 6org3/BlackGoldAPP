// Suite de validación de RLS v24 por rol, contra la base real.
//
// Crea un juego de cuentas QA aisladas (cédulas con prefijo QA_RLS_),
// ejecuta asserts de permisos POSITIVOS (lo que cada rol debe poder
// hacer) y NEGATIVOS (lo que debe estar bloqueado) con sesiones de
// Auth reales, valida el registro público end-to-end (RPC + signUp +
// trigger de vinculación) y borra todo al terminar (los QA nunca
// sobreviven a la corrida, pase o falle).
//
// Uso: node scripts/validar_rls_por_rol.js   (desde Dashboard_Premium/)
// Requiere en .env.local: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY (nunca commitear ese archivo).

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

const URL_ = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) {
  console.error('❌ Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const opts = { auth: { autoRefreshToken: false, persistSession: false } };
const svc = createClient(URL_, SERVICE, opts);
const anon = () => createClient(URL_, ANON, opts);

const EMAIL_DOM = '@sinacceso.blackgoldapp.internal';
const QA = {
  atleta1: { cedula: 'QA_RLS_ATLETA1', nombre: 'QA Atleta Uno', nac: '2012-05-10' },
  atleta2: { cedula: 'QA_RLS_ATLETA2', nombre: 'QA Atleta Dos (ajeno)', nac: '2011-08-20' },
  padre1: { cedula: 'QA_RLS_PADRE1', nombre: 'QA Padre Uno' },
  coach1: { cedula: 'QA_RLS_COACH1', nombre: 'QA Coach Uno' },
  reg: { cedula: 'QA_RLS_REG1', nombre: 'QA Registro Uno', nac: '2013-03-15', telPadre: 'QA_RLS_TEL1' },
};

const resultados = [];
const check = (nombre, ok, detalle = '') => {
  resultados.push({ nombre, ok });
  console.log(`${ok ? '  ✅' : '  ❌'} ${nombre}${detalle && !ok ? ` — ${detalle}` : ''}`);
};

async function loginComo(cedula, password) {
  const cli = anon();
  const { data: email } = await cli.rpc('resolver_email_login', { p_identificador: cedula });
  const { data, error } = await cli.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login ${cedula}: ${error?.message}`);
  return cli;
}

// ---------- limpieza (idempotente: corre al inicio y al final) ----------
async function limpiarQA() {
  const { data: usuariosQA } = await svc.from('usuarios')
    .select('id, auth_user_id, cedula')
    .or(`cedula.like.QA_RLS_%,cedula.eq.PADRE_${QA.reg.telPadre}`);
  const ids = (usuariosQA || []).map(u => u.id);
  if (ids.length) {
    const { data: atletasQA } = await svc.from('atletas').select('id').in('usuario_id', ids);
    const atletaIds = (atletasQA || []).map(a => a.id);
    if (atletaIds.length) await svc.from('atletas').delete().in('id', atletaIds); // cascade: readiness/evals/asistencia/vínculos
    await svc.from('usuarios').delete().in('id', ids);
  }
  await svc.from('catalogo_sesiones').delete().like('titulo', 'QA_RLS_%');
  for (const u of usuariosQA || []) {
    if (u.auth_user_id) await svc.auth.admin.deleteUser(u.auth_user_id).catch(() => {});
  }
  return (usuariosQA || []).length;
}

// ---------- setup ----------
async function crearCuenta(q, rol) {
  const { data: au, error: e1 } = await svc.auth.admin.createUser({
    email: `${q.cedula}${EMAIL_DOM}`.toLowerCase(),
    password: q.cedula,
    email_confirm: true,
  });
  if (e1) throw new Error(`auth ${q.cedula}: ${e1.message}`);
  const { data: fila, error: e2 } = await svc.from('usuarios').insert({
    cedula: q.cedula, nombre: q.nombre, rol, club: 'Black Gold',
    fecha_nacimiento: q.nac || null, auth_user_id: au.user.id,
  }).select().single();
  if (e2) throw new Error(`usuarios ${q.cedula}: ${e2.message}`);
  q.usuarioId = fila.id;
  q.authId = au.user.id;
  return q;
}

async function setup() {
  await crearCuenta(QA.atleta1, 'atleta');
  await crearCuenta(QA.atleta2, 'atleta');
  await crearCuenta(QA.padre1, 'padre');
  await crearCuenta(QA.coach1, 'coach');
  for (const q of [QA.atleta1, QA.atleta2]) {
    const { data, error } = await svc.from('atletas')
      .insert({ usuario_id: q.usuarioId, edad: 13, posicion: 'Base' }).select().single();
    if (error) throw new Error(`atletas ${q.cedula}: ${error.message}`);
    q.atletaId = data.id;
  }
  await svc.from('padres_atletas').insert({ padre_id: QA.padre1.usuarioId, atleta_id: QA.atleta1.atletaId });
  // Una evaluación por atleta (con service), para probar visibilidad selectiva del padre.
  for (const q of [QA.atleta1, QA.atleta2]) {
    await svc.from('evaluaciones_pruebas').insert({
      atleta_id: q.atletaId, prueba_tipo: 'qa_rls_cmj', pilar: 'fisico', sub_pilar: 'explosividad',
      valor_crudo: 30, unidad: 'cm', puntuacion_normalizada: 50, tier: 'average',
    });
  }
}

// ---------- suites ----------
async function suiteAnon() {
  console.log('\n— ANON (sin sesión) —');
  const cli = anon();
  const { error } = await cli.from('usuarios').select('id').limit(1);
  check('anon NO lee usuarios (42501)', error?.code === '42501', error?.code || 'sin error');
  const { data: email, error: e2 } = await cli.rpc('resolver_email_login', { p_identificador: QA.atleta1.cedula });
  check('anon SÍ resuelve email de login', !e2 && typeof email === 'string' && email.includes('@'));
}

async function suiteAtleta() {
  console.log('\n— ATLETA (QA_RLS_ATLETA1) —');
  const cli = await loginComo(QA.atleta1.cedula, QA.atleta1.cedula);

  const { data: us } = await cli.from('usuarios').select('id');
  check('atleta ve SOLO su fila de usuarios', (us || []).length === 1 && us[0].id === QA.atleta1.usuarioId,
    `ve ${(us || []).length} filas`);

  const { data: ats } = await cli.from('atletas').select('id');
  check('atleta ve SOLO su fila de atletas', (ats || []).length === 1 && ats[0].id === QA.atleta1.atletaId,
    `ve ${(ats || []).length} filas`);

  const { error: eXp } = await cli.from('atletas').update({ xp_total: 99999 }).eq('id', QA.atleta1.atletaId).select();
  const { data: xpReal } = await svc.from('atletas').select('xp_total').eq('id', QA.atleta1.atletaId).single();
  check('atleta NO puede inflarse el XP (trigger)', !!eXp && xpReal.xp_total === 0, eXp?.code || 'sin error');

  const { error: eRol } = await cli.from('usuarios').update({ rol: 'superadmin' }).eq('id', QA.atleta1.usuarioId).select();
  const { data: rolReal } = await svc.from('usuarios').select('rol').eq('id', QA.atleta1.usuarioId).single();
  check('atleta NO puede auto-promoverse de rol (trigger)', !!eRol && rolReal.rol === 'atleta', eRol?.code || 'sin error');

  const { error: eVista } = await cli.from('atletas').update({ modo_vista: 'simple' }).eq('id', QA.atleta1.atletaId).select();
  check('atleta SÍ puede cambiar su modo_vista', !eVista, eVista?.message);

  const { error: eRead } = await cli.from('atleta_readiness')
    .insert({ atleta_id: QA.atleta1.atletaId, sueno_calidad: 8, fatiga_fisica: 3, color_orina: 2 });
  check('atleta SÍ registra su check-in de readiness', !eRead, eRead?.message);

  const { error: eReadAjeno } = await cli.from('atleta_readiness')
    .insert({ atleta_id: QA.atleta2.atletaId, sueno_calidad: 5, fatiga_fisica: 5, color_orina: 4 });
  check('atleta NO registra readiness de otro (42501)', eReadAjeno?.code === '42501', eReadAjeno?.code || 'sin error');

  const { data: evs } = await cli.from('evaluaciones_pruebas').select('atleta_id');
  check('atleta ve SOLO sus evaluaciones', (evs || []).every(e => e.atleta_id === QA.atleta1.atletaId));
  await cli.auth.signOut();
}

async function suitePadre() {
  console.log('\n— PADRE (QA_RLS_PADRE1) —');
  const cli = await loginComo(QA.padre1.cedula, QA.padre1.cedula);

  const { data: ats } = await cli.from('atletas').select('id');
  check('padre ve SOLO a su hijo en atletas', (ats || []).length === 1 && ats[0].id === QA.atleta1.atletaId,
    `ve ${(ats || []).length} filas`);

  const { data: us } = await cli.from('usuarios').select('id');
  const idsVisibles = (us || []).map(u => u.id);
  check('padre ve su usuario y el de su hijo, nada más',
    idsVisibles.length === 2 && idsVisibles.includes(QA.padre1.usuarioId) && idsVisibles.includes(QA.atleta1.usuarioId),
    `ve ${idsVisibles.length} filas`);

  const { data: evs } = await cli.from('evaluaciones_pruebas').select('atleta_id');
  check('padre ve SOLO evaluaciones de su hijo',
    (evs || []).length === 1 && evs[0].atleta_id === QA.atleta1.atletaId, `ve ${(evs || []).length}`);

  const { error: eClub } = await cli.from('usuarios').update({ club: 'Otro Club' }).eq('id', QA.padre1.usuarioId).select();
  check('padre NO puede cambiarse de club (trigger)', !!eClub, eClub?.code || 'sin error');

  const { error: ePagos } = await cli.from('pagos').select('id');
  check('padre consulta pagos sin error (solo los suyos)', !ePagos, ePagos?.message);
  await cli.auth.signOut();
}

async function suiteCoach() {
  console.log('\n— COACH (QA_RLS_COACH1) —');
  const cli = await loginComo(QA.coach1.cedula, QA.coach1.cedula);

  const { count } = await cli.from('usuarios').select('id', { count: 'exact', head: true });
  check('coach ve el club entero en usuarios', (count || 0) > 10, `count=${count}`);

  const { data: plantilla, error: ePl } = await cli.from('catalogo_sesiones')
    .insert({ titulo: 'QA_RLS_PLANTILLA', enfoque_principal: 'tiro', club_id: 'Black Gold' }).select().single();
  check('coach SÍ crea plantillas de sesión (roto pre-v24)', !ePl, ePl?.message);
  if (plantilla) await cli.from('catalogo_sesiones').delete().eq('id', plantilla.id);

  const { error: eEv } = await cli.from('evaluaciones_pruebas').insert({
    atleta_id: QA.atleta1.atletaId, prueba_tipo: 'qa_rls_sprint', pilar: 'fisico', sub_pilar: 'agilidad',
    valor_crudo: 5, unidad: 'seg', puntuacion_normalizada: 60, tier: 'above_avg',
  });
  check('coach SÍ registra evaluaciones', !eEv, eEv?.message);

  const { error: eAs } = await cli.from('asistencia')
    .insert({ atleta_id: QA.atleta1.atletaId, coach_id: QA.coach1.usuarioId, estado: 'Presente' });
  check('coach SÍ pasa asistencia', !eAs, eAs?.message);

  const { error: eXp } = await cli.from('atletas').update({ xp_total: 50 }).eq('id', QA.atleta1.atletaId).select();
  check('coach SÍ otorga XP (staff pasa el trigger)', !eXp, eXp?.message);

  const { error: eSup } = await cli.from('usuarios').insert({
    cedula: 'QA_RLS_HACK', nombre: 'QA Hack', rol: 'superadmin', club: 'Black Gold',
  });
  check('coach NO puede crear superadmins (42501)', eSup?.code === '42501', eSup?.code || 'sin error');
  await cli.auth.signOut();
}

async function suiteRegistroPublico() {
  console.log('\n— REGISTRO PÚBLICO end-to-end (anon → Edge Function → trigger → login) —');
  // El mismo camino que usa RegistroPage: la Edge Function registro-publico
  // con la anon key (GoTrue rechaza los emails sintéticos en signUp público,
  // por eso las cuentas se crean server-side con la Admin API).
  const res = await fetch(`${URL_}/functions/v1/registro-publico`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({
      atleta: { cedula: QA.reg.cedula, nombre: QA.reg.nombre, fecha_nacimiento: QA.reg.nac, posicion: 'Escolta' },
      padre: { nombre: 'QA Rep Registro', telefono: QA.reg.telPadre },
    }),
  });
  const cuerpo = await res.json().catch(() => ({}));
  check('Edge Function registra atleta + representante (HTTP 200)', res.status === 200 && cuerpo?.success,
    `HTTP ${res.status} ${cuerpo?.error || ''}`);

  const { data: vinculado } = await svc.from('usuarios')
    .select('auth_user_id').eq('cedula', QA.reg.cedula).single();
  check('trigger vinculó auth_user_id del atleta', !!vinculado?.auth_user_id);

  const { data: padreReg } = await svc.from('usuarios')
    .select('auth_user_id, rol').eq('cedula', `PADRE_${QA.reg.telPadre}`).single();
  check('representante creado con cuenta vinculada (rol padre)',
    padreReg?.rol === 'padre' && !!padreReg?.auth_user_id);

  const cli2 = await loginComo(QA.reg.cedula, QA.reg.cedula);
  const { data: perfil } = await cli2.from('usuarios').select('rol').eq('cedula', QA.reg.cedula).single();
  check('el recién registrado inicia sesión y ve su perfil (rol atleta)', perfil?.rol === 'atleta');
  await cli2.auth.signOut();
}

// ---------- main ----------
(async () => {
  console.log(`Validación RLS v24 por rol — ${URL_}\n`);
  const previos = await limpiarQA();
  if (previos) console.log(`(limpiados ${previos} usuarios QA de una corrida anterior)\n`);

  let fallo = null;
  try {
    await setup();
    await suiteAnon();
    await suiteAtleta();
    await suitePadre();
    await suiteCoach();
    await suiteRegistroPublico();
  } catch (err) {
    fallo = err;
    console.error(`\n💥 Error de infraestructura de la suite: ${err.message}`);
  } finally {
    await limpiarQA();
    console.log('\n(cuentas y datos QA eliminados)');
  }

  const total = resultados.length;
  const ok = resultados.filter(r => r.ok).length;
  console.log(`\n=== RESULTADO: ${ok}/${total} asserts en verde ===`);
  if (fallo || ok !== total) process.exit(1);
})();
