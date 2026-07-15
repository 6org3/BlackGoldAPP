// Suite de validación de RLS v24 por rol, contra la base real.
//
// Crea un juego de cuentas QA aisladas (cédulas con prefijo QA_RLS_),
// ejecuta asserts de permisos POSITIVOS (lo que cada rol debe poder
// hacer) y NEGATIVOS (lo que debe estar bloqueado) con sesiones de
// Auth reales, valida el registro público end-to-end (RPC + signUp +
// trigger de vinculación) — incluido el ciclo de solicitudes v33
// (club validado, estado pendiente, aprobación/rechazo solo-owner) —
// y borra todo al terminar (los QA nunca sobreviven a la corrida,
// pase o falle).
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
  owner1: { cedula: 'QA_RLS_OWNER1', nombre: 'QA Owner Uno' },
  super1: { cedula: 'QA_RLS_SUPER1', nombre: 'QA Superadmin Uno' },
  reg: { cedula: 'QA_RLS_REG1', nombre: 'QA Registro Uno', nac: '2013-03-15', telPadre: 'QA_RLS_TEL1' },
  reg2: { cedula: 'QA_RLS_REG2', nombre: 'QA Registro Dos (rechazo)', nac: '2014-06-25', telPadre: 'QA_RLS_TEL2' },
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
    .or(`cedula.like.QA_RLS_%,cedula.eq.PADRE_${QA.reg.telPadre},cedula.eq.PADRE_${QA.reg2.telPadre}`);
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
  await crearCuenta(QA.owner1, 'owner'); // resuelve solicitudes v33 sin tocar al owner real
  await crearCuenta(QA.super1, 'superadmin'); // catálogo de clubes v34 (se borra al terminar)
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

  // v34: dar de baja es decisión del dueño; borrar, del superadmin.
  const { error: eBaja } = await cli.from('atletas')
    .update({ estado_membresia: 'baja' }).eq('id', QA.atleta1.atletaId).select();
  const { data: membReal } = await svc.from('atletas').select('estado_membresia').eq('id', QA.atleta1.atletaId).single();
  check('coach NO puede dar de baja a un atleta (trigger v34)',
    !!eBaja && membReal?.estado_membresia === 'activo', eBaja?.message || 'sin error');

  const { error: eDel } = await cli.from('atletas').delete().eq('id', QA.atleta1.atletaId).select();
  const { data: sigueVivo } = await svc.from('atletas').select('id').eq('id', QA.atleta1.atletaId).maybeSingle();
  check('coach NO puede borrar atletas (RLS v34)', !!sigueVivo, eDel?.message || 'la fila desapareció');

  const { data: clubesCoach } = await cli.rpc('listar_clubes_todos');
  check('coach NO enumera los clubes de la plataforma (RPC solo-superadmin)',
    (clubesCoach || []).length === 0, `ve ${(clubesCoach || []).length} clubes`);
  await cli.auth.signOut();
}

async function suiteMembresiaYClubes() {
  console.log('\n— MEMBRESÍA + CATÁLOGO DE CLUBES (v34) —');

  // El owner da de baja y reactiva a un atleta de SU club.
  const cliOwner = await loginComo(QA.owner1.cedula, QA.owner1.cedula);
  const { error: eBaja } = await cliOwner.from('atletas')
    .update({ estado_membresia: 'baja', fecha_baja: '2026-07-15' }).eq('id', QA.atleta1.atletaId).select();
  const { data: trasBaja } = await svc.from('atletas').select('estado_membresia, fecha_baja').eq('id', QA.atleta1.atletaId).single();
  check('owner SÍ da de baja a un atleta de su club',
    !eBaja && trasBaja?.estado_membresia === 'baja' && !!trasBaja?.fecha_baja, eBaja?.message);

  const { error: eReact } = await cliOwner.from('atletas')
    .update({ estado_membresia: 'activo', fecha_baja: null }).eq('id', QA.atleta1.atletaId).select();
  const { data: trasReact } = await svc.from('atletas').select('estado_membresia, fecha_baja').eq('id', QA.atleta1.atletaId).single();
  check('owner SÍ reactiva (estado activo y sin fecha_baja)',
    !eReact && trasReact?.estado_membresia === 'activo' && trasReact?.fecha_baja === null, eReact?.message);

  // El catálogo de clubes es solo del superadmin (el owner usa el suyo).
  const { data: clubesOwner } = await cliOwner.rpc('listar_clubes_todos');
  check('owner NO enumera los clubes de la plataforma',
    (clubesOwner || []).length === 0, `ve ${(clubesOwner || []).length} clubes`);

  // Cambiar de club es cross-club: ni el owner de ese club puede.
  const { error: eClubOwner } = await cliOwner.from('usuarios')
    .update({ club: 'Club Leones' }).eq('id', QA.atleta1.usuarioId).select();
  const { data: clubReal } = await svc.from('usuarios').select('club').eq('id', QA.atleta1.usuarioId).single();
  check('owner NO puede mover a un atleta a otro club (trigger v34)',
    !!eClubOwner && clubReal?.club === 'Black Gold', eClubOwner?.message || 'sin error');
  await cliOwner.auth.signOut();

  // El atleta tampoco enumera clubes (la RPC es SECURITY DEFINER: sin el gate
  // interno saltaría RLS y los devolvería todos).
  const cliAtleta = await loginComo(QA.atleta1.cedula, QA.atleta1.cedula);
  const { data: clubesAtleta } = await cliAtleta.rpc('listar_clubes_todos');
  check('atleta NO enumera los clubes de la plataforma',
    (clubesAtleta || []).length === 0, `ve ${(clubesAtleta || []).length} clubes`);
  await cliAtleta.auth.signOut();

  // anon no tiene ni permiso de ejecución.
  const { error: eAnon } = await anon().rpc('listar_clubes_todos');
  check('anon NO puede ejecutar listar_clubes_todos', !!eAnon, eAnon?.code || 'sin error');

  // El superadmin sí: es quien alimenta el select de club del panel. Y el
  // catálogo incluye clubes SIN owner, que listar_clubes_publicos (v33) omite
  // — justo los que hay que poder elegir para sacar a un atleta de ahí.
  const cliSuper = await loginComo(QA.super1.cedula, QA.super1.cedula);
  const { data: todos, error: eTodos } = await cliSuper.rpc('listar_clubes_todos');
  const nombresTodos = (todos || []).map((r) => r.club);
  check('superadmin SÍ enumera los clubes (incluye Black Gold)',
    !eTodos && nombresTodos.includes('Black Gold'), eTodos?.message || `ve ${nombresTodos.length}`);

  const { data: publicos } = await cliSuper.rpc('listar_clubes_publicos');
  const nombresPublicos = (publicos || []).map((r) => r.club);
  check('el catálogo del superadmin es un superconjunto del público',
    nombresPublicos.every((c) => nombresTodos.includes(c)) && nombresTodos.length >= nombresPublicos.length,
    `todos=${nombresTodos.length} publicos=${nombresPublicos.length}`);

  // Mover de club: la operación que el select del panel dispara.
  const { error: eMover } = await cliSuper.from('usuarios')
    .update({ club: 'QA Demo Club' }).eq('id', QA.atleta2.usuarioId).select();
  const { data: movido } = await svc.from('usuarios').select('club').eq('id', QA.atleta2.usuarioId).single();
  check('superadmin SÍ mueve a un atleta de club', !eMover && movido?.club === 'QA Demo Club', eMover?.message);
  await svc.from('usuarios').update({ club: 'Black Gold' }).eq('id', QA.atleta2.usuarioId);
  await cliSuper.auth.signOut();
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
      atleta: { cedula: QA.reg.cedula, nombre: QA.reg.nombre, fecha_nacimiento: QA.reg.nac, posicion: 'Escolta', club: 'Black Gold' },
      padre: { nombre: 'QA Rep Registro', telefono: QA.reg.telPadre },
    }),
  });
  const cuerpo = await res.json().catch(() => ({}));
  check('Edge Function registra atleta + representante (HTTP 200)', res.status === 200 && cuerpo?.success,
    `HTTP ${res.status} ${cuerpo?.error || ''}`);

  const { data: vinculado } = await svc.from('usuarios')
    .select('id, auth_user_id, estado').eq('cedula', QA.reg.cedula).single();
  QA.reg.usuarioId = vinculado?.id;
  check('trigger vinculó auth_user_id del atleta', !!vinculado?.auth_user_id);
  check('el registro nace pendiente de aprobación (v33)', vinculado?.estado === 'pendiente', `estado=${vinculado?.estado}`);
  const { data: atlReg } = await svc.from('atletas').select('id').eq('usuario_id', QA.reg.usuarioId).single();
  QA.reg.atletaId = atlReg?.id;

  const { data: padreReg } = await svc.from('usuarios')
    .select('auth_user_id, rol, estado').eq('cedula', `PADRE_${QA.reg.telPadre}`).single();
  check('representante creado con cuenta vinculada (rol padre, pendiente)',
    padreReg?.rol === 'padre' && !!padreReg?.auth_user_id && padreReg?.estado === 'pendiente');

  const cli2 = await loginComo(QA.reg.cedula, QA.reg.cedula);
  const { data: perfil } = await cli2.from('usuarios').select('rol').eq('cedula', QA.reg.cedula).single();
  check('el recién registrado inicia sesión y ve su perfil (rol atleta)', perfil?.rol === 'atleta');
  await cli2.auth.signOut();
}

async function suiteSolicitudes() {
  console.log('\n— SOLICITUDES DE REGISTRO (v33: club validado + aprobación solo-owner) —');

  // Lista pública de clubes para el selector del registro (único read de anon).
  const cli = anon();
  const { data: clubes, error: eClubes } = await cli.rpc('listar_clubes_publicos');
  check('anon lista los clubes con owner activo (incluye Black Gold)',
    !eClubes && (clubes || []).some(c => c.club === 'Black Gold'), eClubes?.message);

  // Club inexistente → la RPC rechaza (ya no hay fallback silencioso a 'Black Gold').
  const resFalso = await fetch(`${URL_}/functions/v1/registro-publico`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({
      atleta: { cedula: 'QA_RLS_FALSO1', nombre: 'QA Club Falso', fecha_nacimiento: '2012-01-01', club: 'CLUB_FALSO_QA' },
    }),
  });
  const cuerpoFalso = await resFalso.json().catch(() => ({}));
  check('registro con club inexistente es rechazado (HTTP 400)',
    resFalso.status === 400 && /no existe/i.test(cuerpoFalso?.error || ''),
    `HTTP ${resFalso.status} ${cuerpoFalso?.error || ''}`);

  // El pendiente no puede auto-aprobarse (guard de `estado` en el trigger).
  const cliPend = await loginComo(QA.reg.cedula, QA.reg.cedula);
  const { error: eAuto } = await cliPend.from('usuarios')
    .update({ estado: 'activo' }).eq('id', QA.reg.usuarioId).select();
  const { data: sigue } = await svc.from('usuarios').select('estado').eq('id', QA.reg.usuarioId).single();
  check('atleta pendiente NO puede auto-aprobarse (trigger)',
    !!eAuto && sigue?.estado === 'pendiente', eAuto?.code || 'sin error');
  await cliPend.auth.signOut();

  // Coach: ni aprueba por RPC ni ve pendientes con el filtro del servicio.
  const cliCoach = await loginComo(QA.coach1.cedula, QA.coach1.cedula);
  const { error: eCoachRpc } = await cliCoach.rpc('resolver_solicitud_registro',
    { p_usuario_id: QA.reg.usuarioId, p_accion: 'aprobar' });
  check('coach NO puede aprobar solicitudes (RPC solo-owner)',
    !!eCoachRpc && /due/i.test(eCoachRpc.message || ''), eCoachRpc?.message || 'sin error');
  const { data: visibles } = await cliCoach.from('atletas')
    .select('id, usuarios!inner!atletas_usuario_id_fkey(estado)')
    .eq('usuarios.estado', 'activo');
  check('pendiente NO aparece en el plantel filtrado (query del servicio)',
    !(visibles || []).some(a => a.id === QA.reg.atletaId));
  await cliCoach.auth.signOut();

  // Owner aprueba: atleta y representante pasan a activo y se sella fecha_alta.
  const cliOwner = await loginComo(QA.owner1.cedula, QA.owner1.cedula);
  const { error: eAprobar } = await cliOwner.rpc('resolver_solicitud_registro',
    { p_usuario_id: QA.reg.usuarioId, p_accion: 'aprobar' });
  check('owner SÍ aprueba la solicitud', !eAprobar, eAprobar?.message);
  const { data: regDespues } = await svc.from('usuarios').select('estado').eq('id', QA.reg.usuarioId).single();
  const { data: padreDespues } = await svc.from('usuarios').select('estado').eq('cedula', `PADRE_${QA.reg.telPadre}`).single();
  const { data: atlDespues } = await svc.from('atletas').select('fecha_alta').eq('id', QA.reg.atletaId).single();
  check('aprobación activa a atleta y representante y sella fecha_alta',
    regDespues?.estado === 'activo' && padreDespues?.estado === 'activo' && !!atlDespues?.fecha_alta,
    `atleta=${regDespues?.estado} padre=${padreDespues?.estado} alta=${atlDespues?.fecha_alta}`);

  // Segundo registro → rechazo: atleta y representante quedan 'rechazado'.
  const res2 = await fetch(`${URL_}/functions/v1/registro-publico`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({
      atleta: { cedula: QA.reg2.cedula, nombre: QA.reg2.nombre, fecha_nacimiento: QA.reg2.nac, club: 'Black Gold' },
      padre: { nombre: 'QA Rep Rechazo', telefono: QA.reg2.telPadre },
    }),
  });
  const cuerpo2 = await res2.json().catch(() => ({}));
  check('segundo registro para la prueba de rechazo (HTTP 200)', res2.status === 200 && cuerpo2?.success,
    `HTTP ${res2.status} ${cuerpo2?.error || ''}`);
  const { data: u2 } = await svc.from('usuarios').select('id').eq('cedula', QA.reg2.cedula).single();
  const { error: eRech } = await cliOwner.rpc('resolver_solicitud_registro',
    { p_usuario_id: u2?.id, p_accion: 'rechazar' });
  check('owner SÍ rechaza la segunda solicitud', !eRech, eRech?.message);
  const { data: u2Despues } = await svc.from('usuarios').select('estado').eq('id', u2?.id).single();
  const { data: p2Despues } = await svc.from('usuarios').select('estado').eq('cedula', `PADRE_${QA.reg2.telPadre}`).single();
  check('rechazo deja a atleta y representante en rechazado',
    u2Despues?.estado === 'rechazado' && p2Despues?.estado === 'rechazado',
    `atleta=${u2Despues?.estado} padre=${p2Despues?.estado}`);
  await cliOwner.auth.signOut();
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
    await suiteSolicitudes();
    await suiteMembresiaYClubes();
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
