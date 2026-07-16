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

// El club de al lado. Hasta v40 la suite entera vivía en un solo club, así que
// una fuga cross-club era indetectable por construcción: no había a quién
// filtrarle nada. Los asserts de aislamiento (v29, v40) necesitan sí o sí un
// club ajeno con datos reales que atacar.
const CLUB = 'Black Gold';
const CLUB_AJENO = 'QA Club Ajeno';

const QA = {
  atleta1: { cedula: 'QA_RLS_ATLETA1', nombre: 'QA Atleta Uno', nac: '2012-05-10' },
  atleta2: { cedula: 'QA_RLS_ATLETA2', nombre: 'QA Atleta Dos (ajeno)', nac: '2011-08-20' },
  padre1: { cedula: 'QA_RLS_PADRE1', nombre: 'QA Padre Uno' },
  coach1: { cedula: 'QA_RLS_COACH1', nombre: 'QA Coach Uno' },
  owner1: { cedula: 'QA_RLS_OWNER1', nombre: 'QA Owner Uno' },
  super1: { cedula: 'QA_RLS_SUPER1', nombre: 'QA Superadmin Uno' },
  // Habitantes del club ajeno: el objetivo de los asserts de aislamiento (v40).
  ownerAjeno: { cedula: 'QA_RLS_OWNERAJENO', nombre: 'QA Owner del club ajeno' },
  atletaAjeno: { cedula: 'QA_RLS_ATLETAAJENO', nombre: 'QA Atleta del club ajeno', nac: '2012-09-01' },
  // Se crea DESDE la app (por el owner), no en el setup: es el sujeto de v35.
  coachNuevo: { cedula: 'QA_RLS_COACHNEW', nombre: 'QA Coach Nuevo' },
  // Co-dueño invitado por el dueño original desde la app (v36).
  coDueno: { cedula: 'QA_RLS_CODUENO', nombre: 'QA Co-dueño' },
  reg: { cedula: 'QA_RLS_REG1', nombre: 'QA Registro Uno', nac: '2013-03-15', telPadre: 'QA_RLS_TEL1' },
  reg2: { cedula: 'QA_RLS_REG2', nombre: 'QA Registro Dos (rechazo)', nac: '2014-06-25', telPadre: 'QA_RLS_TEL2' },
};

// Reversiones que limpiarQA debe aplicar en el finally (y también al arrancar,
// por si una corrida anterior murió a medias): datos REALES tocados por los
// asserts de aislamiento cross-club (v40), no filas QA que se borren solas.
const CLUB_CONFIG_BACKUP = { pendiente: false, cuenta_bancaria_texto: null };
const PAGOS_FICTICIOS_ANIOS = [];

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
    // v40: varias columnas del módulo de pagos referencian usuarios(id) SIN
    // CASCADE (pago_transacciones.registrado_por, pago_comprobantes.subido_por
    // /revisado_por, pagos.registrado_por/verificado_por, pagos_auditoria.
    // actor_id — esta última, v30). Cualquier acción QA legítima (un owner/
    // coach de verdad generando o resolviendo pagos durante la suite) deja al
    // actor referenciado ahí; sin borrar primero, el DELETE de usuarios
    // revienta por FK y se queda TODO sin limpiar, no solo esa fila. Se borra
    // explícito en vez de confiar en el CASCADE que llega por el lado de
    // atletas→pagos (ese cubre el caso feliz, no este).
    await svc.from('pago_transacciones').delete().in('registrado_por', ids);
    await svc.from('pago_comprobantes').delete().in('subido_por', ids);
    await svc.from('pago_comprobantes').delete().in('revisado_por', ids);
    await svc.from('pagos_auditoria').delete().in('actor_id', ids);
    await svc.from('pagos').delete().in('registrado_por', ids);
    await svc.from('pagos').delete().in('verificado_por', ids);

    const { data: atletasQA } = await svc.from('atletas').select('id').in('usuario_id', ids);
    const atletaIds = (atletasQA || []).map(a => a.id);
    if (atletaIds.length) await svc.from('atletas').delete().in('id', atletaIds); // cascade: pagos/readiness/evals/asistencia/vínculos
    const { error: eDelUsuarios } = await svc.from('usuarios').delete().in('id', ids);
    if (eDelUsuarios) {
      // Reintento único: en la práctica alcanzó para un fallo transitorio
      // (pooler/lock). Si persiste, se reporta en vez de fingir que se limpió.
      const { error: eRetry } = await svc.from('usuarios').delete().in('id', ids);
      if (eRetry) console.error(`⚠️  limpiarQA: no se pudieron borrar ${ids.length} usuarios QA — ${eRetry.message}`);
    }
  }
  await svc.from('catalogo_sesiones').delete().like('titulo', 'QA_RLS_%');
  // Rastro del club ajeno (v40): las tablas de pago cuelgan del atleta por
  // CASCADE, pero el catálogo y la config del club van por su cuenta.
  await svc.from('catalogo_servicios').delete().eq('club', CLUB_AJENO);
  await svc.from('club_config').delete().eq('club', CLUB_AJENO);
  if (QA.comprobanteAjenoPath) {
    await svc.storage.from('comprobantes-pagos').remove([QA.comprobanteAjenoPath]);
  }
  // Datos REALES tocados por los asserts de aislamiento cross-club (v40): se
  // restauran aquí (finally + arranque) y no inline, para que sobrevivan a un
  // fallo a mitad de la suite.
  if (CLUB_CONFIG_BACKUP.pendiente) {
    await svc.from('club_config')
      .update({ cuenta_bancaria_texto: CLUB_CONFIG_BACKUP.cuenta_bancaria_texto })
      .eq('club', CLUB);
    CLUB_CONFIG_BACKUP.pendiente = false;
  }
  if (PAGOS_FICTICIOS_ANIOS.length) {
    await svc.from('pagos').delete().in('anio', PAGOS_FICTICIOS_ANIOS);
    PAGOS_FICTICIOS_ANIOS.length = 0;
  }
  for (const u of usuariosQA || []) {
    if (u.auth_user_id) await svc.auth.admin.deleteUser(u.auth_user_id).catch(() => {});
  }
  // Red de seguridad independiente de la tabla `usuarios`: si alguna vez una
  // fila QA se borra sin pasar por aquí (una intervención manual, un fallo a
  // mitad de corrida), la cuenta de Auth queda huérfana e invisible para el
  // join de arriba — el siguiente `admin.createUser` con el mismo cedula@...
  // revienta con "already registered" y tira la suite entera. Se busca por
  // email directo en Auth, no por `usuarios`.
  let page = 1;
  while (true) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data.users.length) break;
    const huerfanos = data.users.filter(u => (u.email || '').toLowerCase().includes('qa_rls'));
    for (const u of huerfanos) await svc.auth.admin.deleteUser(u.id).catch(() => {});
    if (data.users.length < 200) break;
    page++;
  }
  return (usuariosQA || []).length;
}

// ---------- setup ----------
async function crearCuenta(q, rol, club = CLUB) {
  const { data: au, error: e1 } = await svc.auth.admin.createUser({
    email: `${q.cedula}${EMAIL_DOM}`.toLowerCase(),
    password: q.cedula,
    email_confirm: true,
  });
  if (e1) throw new Error(`auth ${q.cedula}: ${e1.message}`);
  const { data: fila, error: e2 } = await svc.from('usuarios').insert({
    cedula: q.cedula, nombre: q.nombre, rol, club,
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

  // ── El club ajeno, con datos que un staff de Black Gold pueda intentar tocar.
  await crearCuenta(QA.ownerAjeno, 'owner', CLUB_AJENO);
  await crearCuenta(QA.atletaAjeno, 'atleta', CLUB_AJENO);
  const { data: atAjeno, error: eAtAjeno } = await svc.from('atletas')
    .insert({ usuario_id: QA.atletaAjeno.usuarioId, edad: 13, posicion: 'Alero' }).select().single();
  if (eAtAjeno) throw new Error(`atletas ajeno: ${eAtAjeno.message}`);
  QA.atletaAjeno.atletaId = atAjeno.id;

  // Config del club ajeno: la cuenta bancaria es el objetivo con vector de fraude.
  const { error: eCfgAjeno } = await svc.from('club_config').upsert({
    club: CLUB_AJENO, cuenta_bancaria_texto: 'CUENTA LEGITIMA DEL CLUB AJENO', dia_vencimiento: 5,
  }, { onConflict: 'club' });
  if (eCfgAjeno) throw new Error(`club_config ajeno: ${eCfgAjeno.message}`);

  const { data: servAjeno, error: eServAjeno } = await svc.from('catalogo_servicios').upsert({
    club: CLUB_AJENO, nombre: 'QA_RLS_SERVICIO_AJENO', recurrencia: 'puntual', precio_base: 50,
  }, { onConflict: 'club,nombre' }).select().single();
  if (eServAjeno) throw new Error(`catalogo_servicios ajeno: ${eServAjeno.message}`);
  QA.servicioAjenoId = servAjeno.id;

  // Un pago del club ajeno + su comprobante pendiente (sujeto de resolver_comprobante).
  const { data: pagoAjeno, error: ePagoAjeno } = await svc.from('pagos').insert({
    atleta_id: QA.atletaAjeno.atletaId, tipo: 'Mensualidad', mes: 11, anio: 2099,
    monto_base: 30, descuento_pct: 0, monto_final: 30, estado: 'Por Verificar',
    fecha_vencimiento: '2099-11-05',
  }).select().single();
  if (ePagoAjeno) throw new Error(`pagos ajeno: ${ePagoAjeno.message}`);
  QA.pagoAjenoId = pagoAjeno.id;
  QA.comprobanteAjenoPath = `${QA.atletaAjeno.atletaId}/${QA.pagoAjenoId}/qa.jpg`;
  const { data: compAjeno, error: eCompAjeno } = await svc.from('pago_comprobantes').insert({
    pago_id: QA.pagoAjenoId, subido_por: QA.ownerAjeno.usuarioId,
    storage_path: QA.comprobanteAjenoPath,
    monto_declarado: 30, estado: 'pendiente',
  }).select().single();
  if (eCompAjeno) throw new Error(`pago_comprobantes ajeno: ${eCompAjeno.message}`);
  QA.comprobanteAjenoId = compAjeno.id;

  // El objeto real en Storage (v40b): sin esto, comprobantes_staff_all nunca se
  // ejercita. El bucket (v27b) restringe allowed_mime_types a imágenes/pdf.
  const { error: eUpload } = await svc.storage.from('comprobantes-pagos')
    .upload(QA.comprobanteAjenoPath, Buffer.from('QA_RLS contenido de prueba'), { contentType: 'image/png' });
  if (eUpload) throw new Error(`storage comprobante ajeno: ${eUpload.message}`);
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

  // Escalada por INSERT (abierta desde v24, cerrada en v35): `usuarios_insert`
  // admitía a cualquier staff con tal de que el rol nuevo no fuera superadmin,
  // así que un coach podía fabricarse un OWNER —o más coaches— de su club. Es
  // la puerta paralela a la del UPDATE que cerró v34.
  const { error: eOwnerIns } = await cli.from('usuarios').insert({
    cedula: 'QA_RLS_HACK_OWNER', nombre: 'QA Hack Owner', rol: 'owner', club: 'Black Gold',
  });
  check('coach NO puede crear owners (RLS v35)', eOwnerIns?.code === '42501', eOwnerIns?.code || 'sin error');

  const { error: eCoachIns } = await cli.from('usuarios').insert({
    cedula: 'QA_RLS_HACK_COACH', nombre: 'QA Hack Coach', rol: 'coach', club: 'Black Gold',
  });
  check('coach NO puede crear otros coaches (RLS v35)', eCoachIns?.code === '42501', eCoachIns?.code || 'sin error');

  // Lo que el coach SÍ debe poder: dar de alta atletas por el panel (v33).
  const { data: atlOk, error: eAtlIns } = await cli.from('usuarios').insert({
    cedula: 'QA_RLS_ALTA1', nombre: 'QA Alta Coach', rol: 'atleta', club: 'Black Gold',
  }).select().single();
  check('coach SÍ puede dar de alta atletas (v33 intacto)', !eAtlIns, eAtlIns?.message);
  if (atlOk) await svc.from('usuarios').delete().eq('id', atlOk.id);

  // Escalada de privilegios (agujero vivo desde v24, cerrado en v34): el coach
  // editaba SU PROPIA fila — que usuarios_update admite sin mirar `rol` — y el
  // trigger le dejaba pasar por el early-return de es_staff() antes del guard.
  // Con eso se volvía superadmin y caía todo el reparto de permisos.
  const { error: eEscal } = await cli.from('usuarios')
    .update({ rol: 'superadmin' }).eq('id', QA.coach1.usuarioId).select();
  const { data: rolCoach } = await svc.from('usuarios').select('rol').eq('id', QA.coach1.usuarioId).single();
  check('coach NO puede auto-promoverse a superadmin (trigger v34)',
    !!eEscal && rolCoach?.rol === 'coach', eEscal?.message || `rol quedó en ${rolCoach?.rol}`);

  // v34: dar de baja es decisión del dueño; borrar, del superadmin.
  const { error: eBaja } = await cli.from('atletas')
    .update({ estado_membresia: 'baja' }).eq('id', QA.atleta1.atletaId).select();
  const { data: membReal } = await svc.from('atletas').select('estado_membresia').eq('id', QA.atleta1.atletaId).single();
  check('coach NO puede dar de baja a un atleta (trigger v34)',
    !!eBaja && membReal?.estado_membresia === 'activo', eBaja?.message || 'sin error');

  const { error: eDel } = await cli.from('atletas').delete().eq('id', QA.atleta1.atletaId).select();
  const { data: sigueVivo } = await svc.from('atletas').select('id').eq('id', QA.atleta1.atletaId).maybeSingle();
  check('coach NO puede borrar atletas (RLS v34)', !!sigueVivo, eDel?.message || 'la fila desapareció');

  // SECUESTRO DE CUENTA (v36b). El ataque no cambia atributos: apunta tu sesión
  // a otra fila. Un coach reescribía el auth_user_id del owner de su club y, al
  // volver a entrar, ERA el owner — sin tocar rol, estado ni creado_por, así que
  // los guards de v33/v34/v36 ni se enteraban.
  const { error: eSecuestro } = await cli.from('usuarios')
    .update({ auth_user_id: QA.coach1.authId }).eq('id', QA.owner1.usuarioId).select();
  const { data: ownerTrasSecuestro } = await svc.from('usuarios')
    .select('auth_user_id').eq('id', QA.owner1.usuarioId).single();
  check('coach NO puede apoderarse de la cuenta del owner (auth_user_id, v36b)',
    !!eSecuestro && ownerTrasSecuestro?.auth_user_id === QA.owner1.authId,
    eSecuestro?.message || 'el auth_user_id del owner cambió');

  const { error: eCedula } = await cli.from('usuarios')
    .update({ cedula: 'QA_RLS_ROBADA' }).eq('id', QA.owner1.usuarioId).select();
  const { data: cedulaOwner } = await svc.from('usuarios')
    .select('cedula').eq('id', QA.owner1.usuarioId).single();
  check('coach NO puede cambiar la cédula de otra cuenta (identidad, v36b)',
    !!eCedula && cedulaOwner?.cedula === QA.owner1.cedula, eCedula?.message || 'sin error');

  // Lo que el staff SÍ debe poder: corregir la ficha de un atleta suyo.
  const { error: eFicha } = await cli.from('usuarios')
    .update({ correo: 'qa-corregido@sinacceso.blackgoldapp.internal', fecha_nacimiento: '2012-05-11' })
    .eq('id', QA.atleta1.usuarioId).select();
  check('coach SÍ puede corregir correo y fecha de nacimiento de su atleta', !eFicha, eFicha?.message);
  // Devolver la ficha a su estado: `resolver_email_login` (v19) resuelve por
  // COALESCE(correo, cedula||@sinacceso...), así que un correo dejado a medias
  // manda los logins posteriores de este atleta a un email que Auth no tiene.
  await svc.from('usuarios')
    .update({ correo: null, fecha_nacimiento: QA.atleta1.nac })
    .eq('id', QA.atleta1.usuarioId);

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

  // La baja corta la facturación: es lo que el panel promete al dar de baja.
  await svc.from('atletas').update({ estado_membresia: 'baja', fecha_baja: '2026-07-15' }).eq('id', QA.atleta1.atletaId);
  await svc.from('pagos').delete().eq('atleta_id', QA.atleta1.atletaId).eq('mes', 12).eq('anio', 2099);
  const { error: eGen } = await cliOwner.rpc('generar_pagos_mes',
    { p_mes: 12, p_anio: 2099, p_club: 'Black Gold', p_registrado_por: null });
  const { count: nPagosBaja } = await svc.from('pagos')
    .select('id', { count: 'exact', head: true })
    .eq('atleta_id', QA.atleta1.atletaId).eq('mes', 12).eq('anio', 2099);
  check('un atleta de baja NO recibe mensualidad (generar_pagos_mes v34)',
    !eGen && (nPagosBaja || 0) === 0, eGen?.message || `se le crearon ${nPagosBaja} pagos`);
  await svc.from('atletas').update({ estado_membresia: 'activo', fecha_baja: null }).eq('id', QA.atleta1.atletaId);
  await svc.from('pagos').delete().eq('mes', 12).eq('anio', 2099); // limpia el mes ficticio

  // El catálogo de clubes es solo del superadmin (el owner usa el suyo).
  const { data: clubesOwner } = await cliOwner.rpc('listar_clubes_todos');
  check('owner NO enumera los clubes de la plataforma',
    (clubesOwner || []).length === 0, `ve ${(clubesOwner || []).length} clubes`);

  const { error: eEscalOwner } = await cliOwner.from('usuarios')
    .update({ rol: 'superadmin' }).eq('id', QA.owner1.usuarioId).select();
  const { data: rolOwner } = await svc.from('usuarios').select('rol').eq('id', QA.owner1.usuarioId).single();
  check('owner NO puede auto-promoverse a superadmin (trigger v34)',
    !!eEscalOwner && rolOwner?.rol === 'owner', eEscalOwner?.message || `rol quedó en ${rolOwner?.rol}`);

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

async function suiteEquipoTecnico() {
  console.log('\n— EQUIPO TÉCNICO (v35: el dueño da de alta a sus coaches) —');
  const cliOwner = await loginComo(QA.owner1.cedula, QA.owner1.cedula);

  // El alta que dispara /admin/equipo: fila de usuarios con rol='coach'.
  const { data: nuevo, error: eIns } = await cliOwner.from('usuarios').insert({
    cedula: QA.coachNuevo.cedula, nombre: QA.coachNuevo.nombre,
    rol: 'coach', club: 'Black Gold', categoria: 'Menores (Sub-14)',
  }).select().single();
  check('owner SÍ crea un coach de su club (RLS v35)', !eIns && !!nuevo, eIns?.message);
  QA.coachNuevo.usuarioId = nuevo?.id;

  // El club lo pone el owner y es inmutable después (trigger v34): si se
  // pudiera insertar en otro club, el coach nacería fuera de su alcance.
  const { error: eOtroClub } = await cliOwner.from('usuarios').insert({
    cedula: 'QA_RLS_COACH_AJENO', nombre: 'QA Coach Ajeno', rol: 'coach', club: 'QA Demo Club',
  });
  check('owner NO puede crear un coach en OTRO club', !!eOtroClub, eOtroClub?.code || 'sin error');

  // v36 invierte esto: el dueño ORIGINAL sí puede invitar co-dueños de su club
  // (QA.owner1 nace por script → creado_por NULL → es original). Lo cubre
  // suiteCoDuenos; aquí solo se comprueba que no puede crear superadmins.
  const { error: eOwnerSuper } = await cliOwner.from('usuarios').insert({
    cedula: 'QA_RLS_SUPER_HACK', nombre: 'QA Super Hack', rol: 'superadmin', club: 'Black Gold',
  });
  check('owner NO puede crear superadmins', !!eOwnerSuper, eOwnerSuper?.code || 'sin error');

  if (QA.coachNuevo.usuarioId) {
    // El acceso: sin cuenta de Auth el coach existe pero no puede entrar.
    const { data: sesion } = await cliOwner.auth.getSession();
    const resAcceso = await fetch(`${URL_}/functions/v1/crear-acceso-usuario`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', apikey: ANON,
        Authorization: `Bearer ${sesion.session.access_token}`,
      },
      body: JSON.stringify({ usuario_id: QA.coachNuevo.usuarioId }),
    });
    const cuerpoAcceso = await resAcceso.json().catch(() => ({}));
    check('owner SÍ crea el acceso del coach (Edge Function v35)',
      resAcceso.status === 200 && cuerpoAcceso?.success, `HTTP ${resAcceso.status} ${cuerpoAcceso?.error || ''}`);

    // v41: la contraseña de un coach ya NO es su cédula. Llega aquí una sola vez.
    QA.coachNuevo.password = cuerpoAcceso?.password_temporal;
    check('el acceso del coach trae una contraseña temporal aleatoria (v41)',
      typeof QA.coachNuevo.password === 'string'
      && QA.coachNuevo.password.length >= 12
      && QA.coachNuevo.password !== QA.coachNuevo.cedula,
      `password_temporal=${JSON.stringify(QA.coachNuevo.password)}`);

    const { data: conAuth } = await svc.from('usuarios')
      .select('auth_user_id, estado, categoria').eq('id', QA.coachNuevo.usuarioId).single();
    check('el coach nuevo queda vinculado, activo y con su categoría',
      !!conAuth?.auth_user_id && conAuth?.estado === 'activo' && conAuth?.categoria === 'Menores (Sub-14)',
      JSON.stringify(conAuth));

    // El corazón de v41: la cédula es pública (cualquier staff la lee de
    // `usuarios`, y resolver_email_login la traduce a email hasta para anon).
    // Si además fuera la contraseña, leerla bastaría para ser esa persona.
    const cliIntruso = anon();
    const { data: emailCoach } = await cliIntruso.rpc('resolver_email_login', { p_identificador: QA.coachNuevo.cedula });
    const { data: intento, error: eIntento } = await cliIntruso.auth.signInWithPassword({
      email: emailCoach, password: QA.coachNuevo.cedula,
    });
    check('la cédula de un coach YA NO es su contraseña (v41)',
      !!eIntento && !intento?.session, 'la cédula sigue abriendo la cuenta');

    // El coach recién creado entra con su contraseña temporal y ve su club.
    const cliNuevo = await loginComo(QA.coachNuevo.cedula, QA.coachNuevo.password);
    const { data: perfil } = await cliNuevo.from('usuarios')
      .select('rol, club').eq('id', QA.coachNuevo.usuarioId).single();
    check('el coach nuevo inicia sesión y es coach de su club',
      perfil?.rol === 'coach' && perfil?.club === 'Black Gold');
    await cliNuevo.auth.signOut();

    // Aparece en el ranking del dueño (fn_coach_stats) sin sembrar nada más.
    const { data: ranking } = await cliOwner.rpc('fn_coach_stats', { p_dias: 30 });
    check('el coach nuevo aparece en el ranking del dueño',
      (ranking || []).some((r) => r.coach_id === QA.coachNuevo.usuarioId), `${(ranking || []).length} coaches`);

    // Retirarlo: 'inactivo' (v35), no borrar — sus FKs son RESTRICT.
    const { error: eRetiro } = await cliOwner.from('usuarios')
      .update({ estado: 'inactivo' }).eq('id', QA.coachNuevo.usuarioId).select();
    const { data: trasRetiro } = await svc.from('usuarios').select('estado').eq('id', QA.coachNuevo.usuarioId).single();
    check('owner SÍ retira a un coach (estado inactivo)',
      !eRetiro && trasRetiro?.estado === 'inactivo', eRetiro?.message || `estado=${trasRetiro?.estado}`);

    const { data: rankingTrasRetiro } = await cliOwner.rpc('fn_coach_stats', { p_dias: 30 });
    check('un coach retirado sale del ranking (fn_coach_stats v35)',
      !(rankingTrasRetiro || []).some((r) => r.coach_id === QA.coachNuevo.usuarioId));

    // Y pierde los permisos DE VERDAD, no solo en el navegador. Este bloque es
    // el que faltaba: 'inactivo' solo lo miraba PrivateRoute (JavaScript del
    // propio ex-coach), así que volvía a entrar con su cédula y por API
    // conservaba el padrón del club, pasar lista y crear atletas. v35 mete el
    // filtro de estado en es_staff(), que es de quien cuelga toda la RLS.
    const cliRetirado = await loginComo(QA.coachNuevo.cedula, QA.coachNuevo.password);
    check('el coach retirado TODAVÍA puede hacer login (la cuenta de Auth vive)', true);

    const { data: perfilRetirado } = await cliRetirado.from('usuarios')
      .select('estado').eq('id', QA.coachNuevo.usuarioId).single();
    check('el coach retirado ve su cuenta como inactiva (gate de PrivateRoute)',
      perfilRetirado?.estado === 'inactivo', `estado=${perfilRetirado?.estado}`);

    const { data: padron } = await cliRetirado.from('usuarios').select('id');
    check('el coach retirado NO ve el padrón del club (es_staff con estado, v35)',
      (padron || []).length <= 1, `ve ${(padron || []).length} usuarios`);

    const { error: eAsis } = await cliRetirado.from('asistencia')
      .insert({ atleta_id: QA.atleta1.atletaId, coach_id: QA.coachNuevo.usuarioId, estado: 'Presente' });
    check('el coach retirado NO puede pasar asistencia (42501)',
      eAsis?.code === '42501', eAsis?.code || 'sin error');

    const { error: eAltaRetirado } = await cliRetirado.from('usuarios')
      .insert({ cedula: 'QA_RLS_ALTA_RET', nombre: 'QA Alta Retirado', rol: 'atleta', club: 'Black Gold' });
    check('el coach retirado NO puede dar de alta atletas (42501)',
      eAltaRetirado?.code === '42501', eAltaRetirado?.code || 'sin error');
    await cliRetirado.auth.signOut();
  }

  await cliOwner.auth.signOut();
}

async function suiteCoDuenos() {
  console.log('\n— CO-DUEÑOS (v36: el dueño original invita, solo el superadmin retira) —');
  const cliOwner = await loginComo(QA.owner1.cedula, QA.owner1.cedula);

  // QA.owner1 nace por script (service_role) → creado_por NULL → es original.
  const { data: fundador } = await svc.from('usuarios')
    .select('creado_por').eq('id', QA.owner1.usuarioId).single();
  check('un owner sembrado por script es dueño ORIGINAL (creado_por NULL)',
    fundador?.creado_por === null, `creado_por=${fundador?.creado_por}`);

  // El alta que dispara /admin/equipo con rol 'Co-dueño'.
  const { data: nuevo, error: eIns } = await cliOwner.from('usuarios').insert({
    cedula: QA.coDueno.cedula, nombre: QA.coDueno.nombre, rol: 'owner', club: 'Black Gold',
  }).select().single();
  check('el dueño original SÍ crea un co-dueño de su club (RLS v36)', !eIns && !!nuevo, eIns?.message);
  QA.coDueno.usuarioId = nuevo?.id;

  // El linaje lo sella el servidor: el cliente mandó creado_por a su antojo y
  // no cuenta — si contara, cualquiera se declararía original mandando NULL.
  const { data: sellado } = await svc.from('usuarios')
    .select('creado_por, categoria').eq('id', QA.coDueno.usuarioId).single();
  check('el co-dueño queda sellado con su padrino (creado_por = owner original)',
    sellado?.creado_por === QA.owner1.usuarioId, `creado_por=${sellado?.creado_por}`);

  const { error: eMentira } = await cliOwner.from('usuarios')
    .update({ creado_por: null }).eq('id', QA.coDueno.usuarioId).select();
  const { data: trasMentira } = await svc.from('usuarios')
    .select('creado_por').eq('id', QA.coDueno.usuarioId).single();
  check('nadie puede borrarse el padrino para ascender a original (trigger v36)',
    !!eMentira && trasMentira?.creado_por === QA.owner1.usuarioId, eMentira?.message || 'sin error');

  if (QA.coDueno.usuarioId) {
    const { data: sesion } = await cliOwner.auth.getSession();
    const resAcceso = await fetch(`${URL_}/functions/v1/crear-acceso-usuario`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', apikey: ANON,
        Authorization: `Bearer ${sesion.session.access_token}`,
      },
      body: JSON.stringify({ usuario_id: QA.coDueno.usuarioId }),
    });
    const cuerpo = await resAcceso.json().catch(() => ({}));
    check('el dueño original SÍ crea el acceso del co-dueño (Edge Function v36)',
      resAcceso.status === 200 && cuerpo?.success, `HTTP ${resAcceso.status} ${cuerpo?.error || ''}`);
    QA.coDueno.password = cuerpo?.password_temporal;

    // LA ESCALADA QUE CIERRA v41. El coach lee la cédula de un dueño de su club
    // (usuarios_select se lo permite, y es un dato que además sabe fuera de la
    // base). Si la cédula fuera la contraseña, ahí mismo sería dueño.
    const cliCoachAtacante = await loginComo(QA.coach1.cedula, QA.coach1.cedula);
    const { data: filaDueno } = await cliCoachAtacante.from('usuarios')
      .select('cedula, correo').eq('id', QA.coDueno.usuarioId).maybeSingle();
    check('un coach SÍ lee la cédula de un dueño de su club (el dato no es secreto)',
      !!filaDueno?.cedula, 'no la ve — el assert de abajo pierde sentido');
    await cliCoachAtacante.auth.signOut();

    const cliEscalada = anon();
    const { data: emailDueno } = await cliEscalada.rpc('resolver_email_login',
      { p_identificador: QA.coDueno.cedula });
    const { data: sesionRobada, error: eEscalada } = await cliEscalada.auth.signInWithPassword({
      email: emailDueno, password: QA.coDueno.cedula,
    });
    check('un coach NO se hace dueño con la cédula que acaba de leer (v41)',
      !!eEscalada && !sesionRobada?.session, 'ENTRÓ COMO DUEÑO: la escalada sigue abierta');

    // El co-dueño entra con su contraseña temporal y administra el club.
    let cliCo = await loginComo(QA.coDueno.cedula, QA.coDueno.password);
    const { data: perfilCo } = await cliCo.from('usuarios')
      .select('rol, club').eq('id', QA.coDueno.usuarioId).single();
    check('el co-dueño inicia sesión y es owner de su club',
      perfilCo?.rol === 'owner' && perfilCo?.club === 'Black Gold');

    const { data: atlCo } = await cliCo.from('atletas').select('id');
    check('el co-dueño administra el plantel (ve atletas del club)', (atlCo || []).length >= 2,
      `ve ${(atlCo || []).length}`);

    // v41: la otra mitad — quien recibe una contraseña temporal aleatoria tiene
    // que poder poner la suya (antes la app no ofrecía NINGUNA vía, así que la
    // inicial era para siempre). Es lo que hace EditarPerfilModal.
    const passPropia = `QA_RLS_prop_${QA.coDueno.usuarioId.slice(0, 8)}`;
    const { error: eCambio } = await cliCo.auth.updateUser({ password: passPropia });
    check('el co-dueño SÍ cambia su propia contraseña (v41)', !eCambio, eCambio?.message);
    await cliCo.auth.signOut();

    QA.coDueno.password = passPropia;
    // Reabre la sesión con la contraseña NUEVA: que el resto de la suite corra
    // sobre ella es, en sí, la prueba de que el cambio surtió efecto.
    cliCo = await loginComo(QA.coDueno.cedula, QA.coDueno.password);
    check('la contraseña nueva del co-dueño funciona y la temporal muere (v41)',
      !!cliCo, 'no pudo entrar con la contraseña que acaba de poner');

    // LA REGLA QUE PROTEGE EL CLUB: el co-dueño no echa al fundador.
    const { error: eGolpe } = await cliCo.from('usuarios')
      .update({ estado: 'inactivo' }).eq('id', QA.owner1.usuarioId).select();
    const { data: fundadorTrasGolpe } = await svc.from('usuarios')
      .select('estado').eq('id', QA.owner1.usuarioId).single();
    check('un co-dueño NO puede retirar al dueño original (trigger v36)',
      !!eGolpe && fundadorTrasGolpe?.estado === 'activo', eGolpe?.message || 'sin error');

    // Ni el original al co-dueño: retirar dueños es del superadmin.
    const { error: eEcharCo } = await cliOwner.from('usuarios')
      .update({ estado: 'inactivo' }).eq('id', QA.coDueno.usuarioId).select();
    const { data: coTrasIntento } = await svc.from('usuarios')
      .select('estado').eq('id', QA.coDueno.usuarioId).single();
    check('el dueño original TAMPOCO retira a un co-dueño (solo el superadmin)',
      !!eEcharCo && coTrasIntento?.estado === 'activo', eEcharCo?.message || 'sin error');

    // Un co-dueño no encadena más co-dueños: tiene padrino, no es original.
    const { error: eCadena } = await cliCo.from('usuarios').insert({
      cedula: 'QA_RLS_CODUENO2', nombre: 'QA Co-dueño 2', rol: 'owner', club: 'Black Gold',
    });
    check('un co-dueño NO puede invitar a más co-dueños (es_owner_principal, v36)',
      !!eCadena, eCadena?.code || 'sin error');

    // Pero sí es dueño para todo lo demás: crea coaches.
    const { data: coachDelCo, error: eCoachCo } = await cliCo.from('usuarios').insert({
      cedula: 'QA_RLS_COACH_DELCO', nombre: 'QA Coach del Co', rol: 'coach', club: 'Black Gold',
    }).select().single();
    check('un co-dueño SÍ puede crear coaches (es un dueño más)', !eCoachCo, eCoachCo?.message);
    if (coachDelCo) await svc.from('usuarios').delete().eq('id', coachDelCo.id);
    await cliCo.auth.signOut();

    // El superadmin sí retira dueños... pero no al último que queda.
    const cliSuper = await loginComo(QA.super1.cedula, QA.super1.cedula);
    const { error: eSuperRetira } = await cliSuper.from('usuarios')
      .update({ estado: 'inactivo' }).eq('id', QA.coDueno.usuarioId).select();
    const { data: coTrasSuper } = await svc.from('usuarios')
      .select('estado').eq('id', QA.coDueno.usuarioId).single();
    check('el superadmin SÍ retira a un co-dueño', !eSuperRetira && coTrasSuper?.estado === 'inactivo',
      eSuperRetira?.message || `estado=${coTrasSuper?.estado}`);
    await cliSuper.auth.signOut();
  }
  await cliOwner.auth.signOut();

  // El último dueño activo de un club no se puede desactivar: sin él, el club
  // no aprueba solicitudes, no da de alta staff y desaparece del registro
  // público. Se prueba en un club QA propio, con exactamente un owner (Black
  // Gold tiene varios y no serviría de escenario).
  const { data: solo } = await svc.from('usuarios').insert({
    cedula: 'QA_RLS_OWNER_SOLO', nombre: 'QA Owner Solo', rol: 'owner',
    club: 'QA_RLS_CLUB_SOLO', estado: 'activo',
  }).select().single();
  const cliSuper2 = await loginComo(QA.super1.cedula, QA.super1.cedula);
  const { error: eUltimo } = await cliSuper2.from('usuarios')
    .update({ estado: 'inactivo' }).eq('id', solo.id).select();
  const { data: sigueActivo } = await svc.from('usuarios').select('estado').eq('id', solo.id).single();
  check('NADIE puede desactivar al último dueño activo de un club (trigger v36)',
    !!eUltimo && sigueActivo?.estado === 'activo', eUltimo?.message || `estado=${sigueActivo?.estado}`);

  // SUCESIÓN (contrato deliberado, v36 §1): borrar al dueño original deja a sus
  // co-dueños sin padrino (ON DELETE SET NULL) y por tanto como originales, con
  // lo que recuperan la capacidad de invitar. Sin esto, un club cuyo fundador se
  // borra no podría ampliar nunca más su equipo de dueños. Se fija aquí para que
  // cambiarlo sea una decisión y no un accidente de la FK.
  const { data: padrino } = await svc.from('usuarios').insert({
    cedula: 'QA_RLS_SUC_PADRINO', nombre: 'QA Sucesión Padrino', rol: 'owner', club: 'QA_RLS_CLUB_SUC',
  }).select().single();
  const { data: ahijado } = await svc.from('usuarios').insert({
    cedula: 'QA_RLS_SUC_AHIJADO', nombre: 'QA Sucesión Ahijado', rol: 'owner', club: 'QA_RLS_CLUB_SUC',
  }).select().single();
  await svc.from('usuarios').update({ creado_por: padrino.id }).eq('id', ahijado.id);
  await svc.from('usuarios').delete().eq('id', padrino.id);
  const { data: heredero } = await svc.from('usuarios').select('creado_por').eq('id', ahijado.id).single();
  check('al borrar al dueño original, su co-dueño hereda la condición de original (sucesión v36)',
    heredero?.creado_por === null, `creado_por=${heredero?.creado_por}`);
  await svc.from('usuarios').delete().eq('id', ahijado.id);

  // Con un segundo dueño en ese club, el primero ya se puede retirar.
  const { data: acompanante } = await svc.from('usuarios').insert({
    cedula: 'QA_RLS_OWNER_SOLO2', nombre: 'QA Owner Solo 2', rol: 'owner',
    club: 'QA_RLS_CLUB_SOLO', estado: 'activo',
  }).select().single();
  const { error: eConRelevo } = await cliSuper2.from('usuarios')
    .update({ estado: 'inactivo' }).eq('id', solo.id).select();
  const { data: trasRelevo } = await svc.from('usuarios').select('estado').eq('id', solo.id).single();
  check('con un relevo activo, el superadmin SÍ retira a un dueño',
    !eConRelevo && trasRelevo?.estado === 'inactivo', eConRelevo?.message || `estado=${trasRelevo?.estado}`);
  await cliSuper2.auth.signOut();
  await svc.from('usuarios').delete().in('id', [solo.id, acompanante.id]);
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
// Aislamiento por club en pagos + el correo del staff sin acceso (v40).
// Todo lo de aquí se ejecuta como staff LEGÍTIMO de 'Black Gold' apuntando a
// 'QA Club Ajeno': es la regla de oro puesta a prueba — nada de esto pasa por
// un botón, se llama la API directo como lo haría un atacante con su JWT.
async function suiteAislamientoClubPagos() {
  console.log('\n— AISLAMIENTO POR CLUB EN PAGOS (v40) —');

  const cliOwner = await loginComo(QA.owner1.cedula, QA.owner1.cedula);

  // 1. club_config de otro club: el vector de fraude (cuenta bancaria que ve la familia).
  const { error: eCfg } = await cliOwner.from('club_config')
    .update({ cuenta_bancaria_texto: 'CUENTA DEL ATACANTE' }).eq('club', CLUB_AJENO).select();
  const { data: cfgReal } = await svc.from('club_config')
    .select('cuenta_bancaria_texto').eq('club', CLUB_AJENO).single();
  check('owner NO reescribe la cuenta bancaria de otro club (v40)',
    cfgReal?.cuenta_bancaria_texto === 'CUENTA LEGITIMA DEL CLUB AJENO',
    `quedó en "${cfgReal?.cuenta_bancaria_texto}" (error: ${eCfg?.message || 'ninguno'})`);

  // Y sigue pudiendo con la suya: el fix acota alcance, no quita permisos.
  // La config de CLUB es un dato real de la base: se respalda ANTES de tocarla
  // y limpiarQA (que corre en el finally, pase o falle la suite) la restaura —
  // un test no debe dejar el club con la cuenta bancaria de un QA a medias.
  const { data: cfgAntes } = await svc.from('club_config')
    .select('cuenta_bancaria_texto').eq('club', CLUB).maybeSingle();
  CLUB_CONFIG_BACKUP.cuenta_bancaria_texto = cfgAntes?.cuenta_bancaria_texto ?? null;
  CLUB_CONFIG_BACKUP.pendiente = true;
  const { error: ePropio } = await cliOwner.from('club_config')
    .update({ cuenta_bancaria_texto: 'QA_RLS cuenta propia' }).eq('club', CLUB).select();
  const { data: cfgPropio } = await svc.from('club_config')
    .select('cuenta_bancaria_texto').eq('club', CLUB).maybeSingle();
  check('owner SÍ escribe la config de SU club (no se rompió v27)',
    !ePropio && cfgPropio?.cuenta_bancaria_texto === 'QA_RLS cuenta propia', ePropio?.message);

  // 2. Catálogo de servicios ajeno.
  const { error: eServ } = await cliOwner.from('catalogo_servicios')
    .update({ precio_base: 1 }).eq('id', QA.servicioAjenoId).select();
  const { data: servReal } = await svc.from('catalogo_servicios')
    .select('precio_base').eq('id', QA.servicioAjenoId).single();
  check('owner NO cambia el precio de un servicio de otro club (v40)',
    Number(servReal?.precio_base) === 50, `quedó en ${servReal?.precio_base} (error: ${eServ?.message || 'ninguno'})`);

  // 3. Tarifas del servicio ajeno. Se exige el código 42501 (RLS), no
  // cualquier error: una FK/NOT NULL violado daría igual de verde sin probar
  // nada de la policy.
  const { error: eTar } = await cliOwner.from('servicio_tarifas')
    .insert({ servicio_id: QA.servicioAjenoId, precio: 1 }).select();
  const { count: nTar } = await svc.from('servicio_tarifas')
    .select('id', { count: 'exact', head: true }).eq('servicio_id', QA.servicioAjenoId);
  check('owner NO inyecta tarifas en un servicio de otro club (v40)',
    eTar?.code === '42501' && (nTar || 0) === 0, eTar?.message || `se crearon ${nTar} tarifas`);

  // 4. generar_pagos_mes: el club ya no lo elige quien llama.
  await svc.from('pagos').delete().eq('atleta_id', QA.atletaAjeno.atletaId).eq('mes', 12).eq('anio', 2099);
  await cliOwner.rpc('generar_pagos_mes', { p_mes: 12, p_anio: 2099, p_club: CLUB_AJENO, p_registrado_por: null });
  const { count: nAjenos } = await svc.from('pagos')
    .select('id', { count: 'exact', head: true })
    .eq('atleta_id', QA.atletaAjeno.atletaId).eq('mes', 12).eq('anio', 2099);
  check('owner NO factura al club ajeno pasando su nombre en p_club (v40)',
    (nAjenos || 0) === 0, `le creó ${nAjenos} mensualidades`);

  // p_club = NULL era el peor caso: facturaba a TODA la plataforma.
  await cliOwner.rpc('generar_pagos_mes', { p_mes: 11, p_anio: 2098, p_club: null, p_registrado_por: null });
  const { count: nAjenosNull } = await svc.from('pagos')
    .select('id', { count: 'exact', head: true })
    .eq('atleta_id', QA.atletaAjeno.atletaId).eq('mes', 11).eq('anio', 2098);
  check('owner con p_club=NULL NO factura a toda la plataforma (v40)',
    (nAjenosNull || 0) === 0, `le creó ${nAjenosNull} mensualidades al club ajeno`);
  // Al forzar el club, la llamada legítima SÍ facturó de verdad a los atletas
  // reales de Black Gold con mes/año ficticios (2098/2099). limpiarQA (finally,
  // y también al arrancar) los barre; se preserva el pago sembrado del club
  // ajeno, que aún sostiene el comprobante de arriba.
  PAGOS_FICTICIOS_ANIOS.push(2098, 2099);

  await cliOwner.auth.signOut();

  // 5. El coach: comprobantes y transacciones de otro club.
  const cliCoach = await loginComo(QA.coach1.cedula, QA.coach1.cedula);

  const { error: eResolver } = await cliCoach.rpc('resolver_comprobante',
    { p_comprobante_id: QA.comprobanteAjenoId, p_aprobar: true, p_motivo: null });
  const { data: compReal } = await svc.from('pago_comprobantes')
    .select('estado').eq('id', QA.comprobanteAjenoId).single();
  check('coach NO aprueba un comprobante de otro club (RPC v40)',
    !!eResolver && compReal?.estado === 'pendiente',
    eResolver?.message || `el comprobante quedó en "${compReal?.estado}"`);

  const { data: compsVistos } = await cliCoach.from('pago_comprobantes')
    .select('id').eq('id', QA.comprobanteAjenoId);
  check('coach NO ve comprobantes de otro club (v40)',
    (compsVistos || []).length === 0, `ve ${(compsVistos || []).length}`);

  const { error: eTx } = await cliCoach.from('pago_transacciones')
    .insert({ pago_id: QA.pagoAjenoId, monto: 30, forma_pago: 'Efectivo',
              registrado_por: QA.coach1.usuarioId }).select();
  const { count: nTx } = await svc.from('pago_transacciones')
    .select('id', { count: 'exact', head: true }).eq('pago_id', QA.pagoAjenoId);
  check('coach NO fabrica abonos sobre un pago de otro club (v40)',
    eTx?.code === '42501' && (nTx || 0) === 0, eTx?.message || `se crearon ${nTx} transacciones`);

  // 6b. Storage (v40b): la imagen del comprobante también es de un club.
  const { error: eDescarga } = await cliCoach.storage.from('comprobantes-pagos')
    .download(QA.comprobanteAjenoPath);
  check('coach NO descarga el comprobante de otro club (Storage v40b)', !!eDescarga, eDescarga?.message);

  const { data: listado } = await cliCoach.storage.from('comprobantes-pagos')
    .list(QA.atletaAjeno.atletaId);
  check('coach NO lista el directorio de un atleta de otro club (Storage v40b)',
    (listado || []).length === 0, `ve ${(listado || []).length} objetos`);

  const { error: eSubeAjeno } = await cliCoach.storage.from('comprobantes-pagos')
    .upload(QA.comprobanteAjenoPath, Buffer.from('QA_RLS intento de sobrescritura'),
      { contentType: 'image/png', upsert: true });
  check('coach NO sobrescribe el comprobante de otro club (Storage v40b)', !!eSubeAjeno, eSubeAjeno?.message);

  await cliCoach.storage.from('comprobantes-pagos').remove([QA.comprobanteAjenoPath]);
  // remove() sobre una policy que lo bloquea no siempre trae error (RLS filtra
  // filas, no lanza): la prueba real es que el objeto SIGA existiendo, vía el
  // cliente de servicio (bypasea RLS, no depende de lo que devuelva el intento).
  const { error: eSigueAhi } = await svc.storage.from('comprobantes-pagos')
    .download(QA.comprobanteAjenoPath);
  check('coach NO borra el comprobante de otro club (Storage v40b)',
    !eSigueAhi, eSigueAhi?.message || 'el objeto ya no existe');

  // Positivo: el coach SÍ opera sobre un comprobante de SU club (el fix acota
  // alcance, no bloquea Storage entero para el staff).
  const pathPropio = `${QA.atleta1.atletaId}/qa-propio-${QA.atleta1.usuarioId}/qa.png`;
  const { error: eSubePropio } = await svc.storage.from('comprobantes-pagos')
    .upload(pathPropio, Buffer.from('QA_RLS propio'), { contentType: 'image/png' });
  const { error: eDescargaPropio } = await cliCoach.storage.from('comprobantes-pagos').download(pathPropio);
  check('coach SÍ descarga un comprobante de SU club (no se rompió Storage)',
    !eSubePropio && !eDescargaPropio, eSubePropio?.message || eDescargaPropio?.message);
  await svc.storage.from('comprobantes-pagos').remove([pathPropio]);

  // 6. resolver_audiencia: era enumerable por cualquiera y sin filtro de club.
  const { data: audCoach } = await cliCoach.rpc('resolver_audiencia',
    { p_segmento_tipo: 'general', p_params: {}, p_incluir_reps: true, p_club: CLUB_AJENO });
  const idsAjenos = (audCoach || []).map(r => r.usuario_id ?? r);
  check('coach NO enumera la audiencia de otro club aunque lo pida (v40)',
    !idsAjenos.includes(QA.atletaAjeno.usuarioId), `devolvió ${idsAjenos.length} usuarios del club ajeno`);
  await cliCoach.auth.signOut();

  const cliAtleta = await loginComo(QA.atleta1.cedula, QA.atleta1.cedula);
  const { data: audAtleta, error: eAud } = await cliAtleta.rpc('resolver_audiencia',
    { p_segmento_tipo: 'general', p_params: {}, p_incluir_reps: true, p_club: null });
  check('atleta NO puede resolver audiencias (v40: el comentario de v24, ahora aplicado)',
    !!eAud && !(audAtleta || []).length, `devolvió ${(audAtleta || []).length} usuarios`);
  await cliAtleta.auth.signOut();
}

// El correo de un staff sin acceso es su identidad futura (v40 §6).
async function suiteCorreoStaffSinAcceso() {
  console.log('\n— CORREO DE STAFF SIN ACCESO (v40) —');

  // El estado que el propio flujo de alta deja cuando falla el 2º paso
  // (useAdminEquipoForm: "Quedó sin acceso — vuelve a intentarlo desde la lista").
  const { data: pendiente, error: ePend } = await svc.from('usuarios').insert({
    cedula: 'QA_RLS_OWNER_PEND', nombre: 'QA Co-dueño sin acceso', rol: 'owner',
    club: CLUB, correo: 'qa_rls_pendiente@ejemplo.com', auth_user_id: null,
  }).select().single();
  if (ePend) throw new Error(`setup co-dueño pendiente: ${ePend.message}`);

  const cliCoach = await loginComo(QA.coach1.cedula, QA.coach1.cedula);
  const { error: eCorreo } = await cliCoach.from('usuarios')
    .update({ correo: 'atacante@evil.com' }).eq('id', pendiente.id).select();
  const { data: correoReal } = await svc.from('usuarios').select('correo').eq('id', pendiente.id).single();
  check('coach NO se apodera del correo de un dueño que aún no tiene acceso (v40)',
    !!eCorreo && correoReal?.correo === 'qa_rls_pendiente@ejemplo.com',
    eCorreo?.message || `el correo quedó en "${correoReal?.correo}"`);

  // El coach sigue corrigiendo el correo de sus atletas: el fix no le quita el
  // trabajo. Se restaura de inmediato: dejarlo grabado rompería cualquier
  // suite posterior que haga loginComo(QA.atleta1) — resolver_email_login
  // (v19) resolvería a un correo que Auth no tiene, y loginComo lanza.
  const { error: eCorreoAtleta } = await cliCoach.from('usuarios')
    .update({ correo: 'qa_rls_atleta@ejemplo.com' }).eq('id', QA.atleta1.usuarioId).select();
  check('coach SÍ corrige el correo de un atleta de su club (no se rompió el alta)',
    !eCorreoAtleta, eCorreoAtleta?.message);
  await svc.from('usuarios').update({ correo: null }).eq('id', QA.atleta1.usuarioId);
  await cliCoach.auth.signOut();

  await svc.from('usuarios').delete().eq('id', pendiente.id);
}

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
    await suiteEquipoTecnico();
    await suiteCoDuenos();
    await suiteAislamientoClubPagos();
    await suiteCorreoStaffSinAcceso();
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
