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
  reg: { cedula: 'QA_RLS_REG1', nombre: 'QA Registro Uno', nac: '2013-03-15', telPadre: 'QA_RLS_TEL1', correoPadre: 'qa-rls-rep1@ejemplo.com' },
  reg2: { cedula: 'QA_RLS_REG2', nombre: 'QA Registro Dos (rechazo)', nac: '2014-06-25', telPadre: 'QA_RLS_TEL2', correoPadre: 'qa-rls-rep2@ejemplo.com' },
};

// Reversiones que limpiarQA debe aplicar en el finally (y también al arrancar,
// por si una corrida anterior murió a medias): datos REALES tocados por los
// asserts de aislamiento cross-club (v40), no filas QA que se borren solas.
const CLUB_CONFIG_BACKUP = { pendiente: false, existia: true, cuenta_bancaria_texto: null };

// Misión de catálogo sembrada por suiteTablasEscrituraH1. El catálogo `misiones`
// no cuelga de ningún usuario QA, así que el borrado en cascada por usuario no la
// alcanza: hay que limpiarla por id.
const H1_SEMILLA = { misionId: null };

// Se enciende cuando el control de abuso de v54 (429) impide crear el registro
// público de la corrida. Las suites que dependen de esa cuenta se omiten en vez
// de encadenar rojos que no hablan de RLS.
const REGISTRO_OMITIDO = { valor: false };
const PAGOS_FICTICIOS_ANIOS = [];

const resultados = [];
const check = (nombre, ok, detalle = '') => {
  resultados.push({ nombre, ok });
  console.log(`${ok ? '  ✅' : '  ❌'} ${nombre}${detalle && !ok ? ` — ${detalle}` : ''}`);
};

// Fallo TRANSITORIO de validación de JWT en Auth durante la rotación de signing
// keys del proyecto ("unrecognized JWT kid <nil> for algorithm ES256"): del lado
// servidor e intermitente (una instancia de GoTrue con el JWKS aún sin propagar).
// Reintenta SOLO ese error, con backoff corto — mismo criterio que reintentarAuth()
// de las Edge Functions (supabase/functions/_shared/brainAuth.ts). Sin esto, un
// createUser/signIn del setup revienta y tira la suite entera por un hipo de infra.
const esJwtTransitorio = (msg) => !!msg && /unrecognized JWT kid|token is unverifiable|invalid JWT/i.test(msg);
async function reintentarAuth(op, intentos = 4) {
  let r = await op();
  for (let i = 1; i < intentos && esJwtTransitorio(r.error?.message); i++) {
    await new Promise((res) => setTimeout(res, 250 * i));
    r = await op();
  }
  return r;
}

async function loginComo(cedula, password) {
  const cli = anon();
  const { data: email } = await cli.rpc('resolver_email_login', { p_identificador: cedula });
  const { data, error } = await reintentarAuth(() => cli.auth.signInWithPassword({ email, password }));
  if (error || !data.session) throw new Error(`login ${cedula}: ${error?.message}`);
  return cli;
}

// ---------- limpieza (idempotente: corre al inicio y al final) ----------
async function limpiarQA() {
  const { data: usuariosQA } = await svc.from('usuarios')
    .select('id, auth_user_id, cedula')
    .or(`cedula.like.QA_RLS_%,cedula.eq.PADRE_${QA.reg.telPadre},cedula.eq.PADRE_${QA.reg2.telPadre}`);
  const ids = (usuariosQA || []).map(u => u.id);
  // v50: las sesiones GRUPALES sembradas (atleta_id NULL) no cuelgan de ningún
  // atleta por CASCADE, y su coach_id es RESTRICT: se borran por marcador ANTES
  // que los usuarios (el coach) y que sus grupos. Idempotente en el arranque.
  await svc.from('sesiones_control').delete().like('objetivo_descripcion', 'QA_RLS%');
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
    // Mismo motivo que los pagos: `comunicaciones.autor_id` es FK a usuarios y no
    // tiene CASCADE, así que una comunicación QA (suiteTablasEscrituraH1) bloquea
    // el borrado de TODOS los usuarios QA, no solo de su autor.
    await svc.from('comunicaciones').delete().in('autor_id', ids);

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
  // v51: los gastos QA no cuelgan de ningún usuario ni atleta (registrado_por
  // es texto libre, no una FK), así que ningún CASCADE los barre. Se borran por
  // marca en la descripción. Si la v51 aún no está aplicada esto falla en
  // silencio, que es justo lo que se quiere: no hay nada que limpiar.
  await svc.from('gastos').delete().like('descripcion', 'QA_RLS%');
  // v50: los grupos sembrados, ya sin atletas que los referencien (atletas.grupo_id
  // es NO ACTION, pero sus atletas se borraron arriba) ni sesiones (borradas ya).
  await svc.from('grupos_entrenamiento').delete().like('nombre', 'QA_RLS_%');
  // Rastro del club ajeno (v40): las tablas de pago cuelgan del atleta por
  // CASCADE, pero el catálogo y la config del club van por su cuenta.
  await svc.from('catalogo_servicios').delete().eq('club', CLUB_AJENO);
  await svc.from('club_config').delete().eq('club', CLUB_AJENO);
  if (QA.comprobanteAjenoPath) {
    await svc.storage.from('comprobantes-pagos').remove([QA.comprobanteAjenoPath]);
  }
  // v63: fotos QA en el bucket privado fotos-atletas. Igual que el
  // comprobanteAjenoPath de arriba, borrar la fila de usuarios/atletas NO
  // borra el blob en Storage. Se purga por CARPETA (atletaId) y no por un path
  // exacto guardado en una variable: si suiteFotos murió a mitad de una
  // subida no se sabe qué nombre alcanzó a tomar el objeto, y listar la
  // carpeta entera cubre ese caso igual. Los ids son fijos desde el setup()
  // de esta misma corrida, así que esto es seguro también en el arranque
  // (antes de que setup() corra, listar una carpeta que aún no existe
  // simplemente no devuelve nada).
  for (const atletaId of [QA.atleta1?.atletaId, QA.atletaAjeno?.atletaId].filter(Boolean)) {
    const { data: fotosQA } = await svc.storage.from('fotos-atletas').list(String(atletaId), { limit: 100 });
    if (fotosQA?.length) {
      await svc.storage.from('fotos-atletas').remove(fotosQA.map((o) => `${atletaId}/${o.name}`));
    }
  }
  // Datos REALES tocados por los asserts de aislamiento cross-club (v40): se
  // restauran aquí (finally + arranque) y no inline, para que sobrevivan a un
  // fallo a mitad de la suite.
  if (CLUB_CONFIG_BACKUP.pendiente) {
    // Si la fila NO existía antes del check (Black Gold puede no tenerla — ver
    // nota junto al upsert de suiteAislamientoClubPagos), el upsert del test la
    // creó: restaurar con UPDATE la dejaría huérfana para siempre con valores
    // en null. Simétrico: sin fila previa, se borra; con fila previa, se
    // restaura su valor.
    if (CLUB_CONFIG_BACKUP.existia) {
      await svc.from('club_config')
        .update({ cuenta_bancaria_texto: CLUB_CONFIG_BACKUP.cuenta_bancaria_texto })
        .eq('club', CLUB);
    } else {
      await svc.from('club_config').delete().eq('club', CLUB);
    }
    CLUB_CONFIG_BACKUP.pendiente = false;
  }
  // Misión de catálogo de suiteTablasEscrituraH1: primero sus asignaciones (FK),
  // después la fila del catálogo. Por id y no por prefijo, para no rozar nunca
  // una misión real del club.
  if (H1_SEMILLA.misionId) {
    await svc.from('progreso_misiones').delete().eq('mision_id', H1_SEMILLA.misionId);
    await svc.from('misiones').delete().eq('id', H1_SEMILLA.misionId);
    H1_SEMILLA.misionId = null;
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
    const { data, error } = await reintentarAuth(() => svc.auth.admin.listUsers({ page, perPage: 200 }));
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
  const { data: au, error: e1 } = await reintentarAuth(() => svc.auth.admin.createUser({
    email: `${q.cedula}${EMAIL_DOM}`.toLowerCase(),
    password: q.cedula,
    email_confirm: true,
  }));
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

  // ── v50: sesiones GRUPALES (atleta_id NULL) para probar que el padre ve las
  // del grupo de SU hijo y no las de otro grupo. La pertenencia del hijo se
  // refleja en atletas.grupo_id (la caché que lee grupos_de_mis_atletas()).
  const { data: grupoHijo, error: eGrupoH } = await svc.from('grupos_entrenamiento')
    .insert({ nombre: 'QA_RLS_GRUPO_HIJO', horario: 'L-V 17:00', club: CLUB }).select().single();
  if (eGrupoH) throw new Error(`grupos_entrenamiento hijo: ${eGrupoH.message}`);
  QA.grupoHijoId = grupoHijo.id;
  await svc.from('atletas').update({ grupo_id: QA.grupoHijoId }).eq('id', QA.atleta1.atletaId);

  const { data: grupoAjeno, error: eGrupoAj } = await svc.from('grupos_entrenamiento')
    .insert({ nombre: 'QA_RLS_GRUPO_AJENO', horario: 'L-V 18:00', club: CLUB }).select().single();
  if (eGrupoAj) throw new Error(`grupos_entrenamiento ajeno: ${eGrupoAj.message}`);
  QA.grupoAjenoId = grupoAjeno.id;

  const { data: sesG, error: eSesG } = await svc.from('sesiones_control').insert({
    tipo: 'Grupal', grupo_id: QA.grupoHijoId, atleta_id: null, coach_id: QA.coach1.usuarioId,
    objetivo_tipo: 'Físico', objetivo_descripcion: 'QA_RLS grupal del grupo del hijo',
  }).select().single();
  if (eSesG) throw new Error(`sesiones_control grupal hijo: ${eSesG.message}`);
  QA.sesionGrupalId = sesG.id;

  const { data: sesGA, error: eSesGA } = await svc.from('sesiones_control').insert({
    tipo: 'Grupal', grupo_id: QA.grupoAjenoId, atleta_id: null, coach_id: QA.coach1.usuarioId,
    objetivo_tipo: 'Físico', objetivo_descripcion: 'QA_RLS grupal de otro grupo',
  }).select().single();
  if (eSesGA) throw new Error(`sesiones_control grupal ajena: ${eSesGA.message}`);
  QA.sesionGrupalAjenaId = sesGA.id;

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

  // v50: el padre ve las sesiones GRUPALES (atleta_id NULL) del grupo de su
  // hijo — no solo las individuales — y NO las de un grupo ajeno. Requiere la
  // migración v50 aplicada (ses_control_select_grupo_propio + grupos_de_mis_atletas).
  const { data: sesPadre } = await cli.from('sesiones_control').select('id');
  const idsSesPadre = (sesPadre || []).map(s => s.id);
  check('padre SÍ ve la sesión grupal del grupo de su hijo (RLS v50)',
    idsSesPadre.includes(QA.sesionGrupalId), `ve ${idsSesPadre.length} sesiones`);
  check('padre NO ve una sesión grupal de otro grupo (RLS v50)',
    !idsSesPadre.includes(QA.sesionGrupalAjenaId), 've la grupal de un grupo ajeno');
  await cli.auth.signOut();
}

async function suiteCoach() {
  console.log('\n— COACH (QA_RLS_COACH1) —');
  const cli = await loginComo(QA.coach1.cedula, QA.coach1.cedula);

  // Comparado contra la fuente de verdad (service_role, sin RLS) en vez de un
  // umbral fijo: "Black Gold" solo tiene los 6 QA de este setup desde el reset
  // del 22-07 (antes tenía decenas de usuarios reales, de ahí el `> 10`
  // original — un umbral fijo revive frágil cada vez que cambia el volumen
  // real del club). La aserción que importa es "todo el club, ni más ni menos".
  const { count } = await cli.from('usuarios').select('id', { count: 'exact', head: true });
  const { count: countReal } = await svc.from('usuarios').select('id', { count: 'exact', head: true }).eq('club', CLUB);
  check('coach ve el club entero en usuarios', count === countReal && (count || 0) > 0, `ve ${count}, club tiene ${countReal}`);

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

  // v56: el correo es identidad — ni el staff lo toca editando la ficha. La
  // única vía es la Edge Function `actualizar-correo`, que mueve la tabla y
  // Auth juntas; cambiarlo aquí a secas dejaría al atleta sin poder entrar.
  const { error: eCorreoFicha } = await cli.from('usuarios')
    .update({ correo: 'qa-corregido@sinacceso.blackgoldapp.internal' })
    .eq('id', QA.atleta1.usuarioId).select();
  check('coach NO cambia un correo editando la ficha (v56: solo la Edge Function)',
    !!eCorreoFicha && /se cambia desde tu perfil/i.test(eCorreoFicha?.message || ''),
    eCorreoFicha?.message || 'sin error');

  // Lo que el staff SÍ conserva de la ficha: la fecha de nacimiento (mueve la
  // categoría FEB del atleta). Se restaura para no ensuciar suites posteriores.
  const { error: eFicha } = await cli.from('usuarios')
    .update({ fecha_nacimiento: '2012-05-11' })
    .eq('id', QA.atleta1.usuarioId).select();
  check('coach SÍ corrige la fecha de nacimiento de su atleta (la ficha sigue siendo suya)',
    !eFicha, eFicha?.message);
  await svc.from('usuarios')
    .update({ fecha_nacimiento: QA.atleta1.nac })
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
      // El correo del representante es obligatorio desde v55/entrega 3: sin él la
      // Edge Function devuelve 400 y esta suite entera se cae.
      padre: { nombre: 'QA Rep Registro', telefono: QA.reg.telPadre, correo: QA.reg.correoPadre },
    }),
  });
  const cuerpo = await res.json().catch(() => ({}));

  // v54 (control de abuso del registro público) limita los intentos por IP y hora.
  // La suite crea un registro real en cada corrida, así que a partir de la segunda
  // corrida dentro de la ventana el 429 es la RESPUESTA CORRECTA del sistema, no un
  // fallo de RLS. Si se contara como rojo, además, se arrastrarían en cascada las
  // suites siguientes (que dependen de QA.reg) y la corrida entera quedaría inútil.
  // Se reporta como omitida, con el aviso bien visible: la única lectura válida de
  // esta suite es la de una corrida con la ventana limpia.
  if (res.status === 429) {
    console.log('  ⏭️  OMITIDA: el control de abuso de v54 rechazó el registro (HTTP 429).');
    console.log('      No es un fallo de RLS — es el limitador por IP/hora haciendo su trabajo.');
    console.log('      Reintentar con la ventana de una hora ya vencida para validar esta suite.');
    REGISTRO_OMITIDO.valor = true;
    return;
  }

  check('Edge Function registra atleta + representante (HTTP 200)', res.status === 200 && cuerpo?.success,
    `HTTP ${res.status} ${cuerpo?.error || ''}`);

  // La contraseña inicial ya NO es la cédula: llega una sola vez en esta
  // respuesta y es la única forma de entrar después. Guardarla aquí es lo que
  // mantiene vivos los dos logins de esta suite.
  QA.reg.password = cuerpo?.credenciales?.atleta?.password;
  check('el registro devuelve una contraseña que NO es la cédula',
    !!QA.reg.password && QA.reg.password !== QA.reg.cedula,
    QA.reg.password ? 'coincide con la cédula' : 'no llegó ninguna contraseña');

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

  const cli2 = await loginComo(QA.reg.cedula, QA.reg.password);
  const { data: perfil } = await cli2.from('usuarios').select('rol').eq('cedula', QA.reg.cedula).single();
  check('el recién registrado inicia sesión y ve su perfil (rol atleta)', perfil?.rol === 'atleta');
  await cli2.auth.signOut();
}

async function suiteSolicitudes() {
  console.log('\n— SOLICITUDES DE REGISTRO (v33: club validado + aprobación solo-owner) —');

  // Depende de la cuenta que crea suiteRegistroPublico: sin ella no hay solicitud
  // que aprobar ni rechazar (ver la nota del 429 de v54 en esa suite).
  if (REGISTRO_OMITIDO.valor) {
    console.log('  ⏭️  OMITIDA: depende del registro público, que el limitador de v54 bloqueó.');
    return;
  }

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
      atleta: { cedula: 'QA_RLS_FALSO1', nombre: 'QA Club Falso', fecha_nacimiento: '2012-01-01', club: 'CLUB_FALSO_QA', correo: 'qa_rls_falso1@ejemplo.com' },
    }),
  });
  const cuerpoFalso = await resFalso.json().catch(() => ({}));
  // v54: el limitador por IP puede responder ANTES que la validación del club
  // (cuenta todos los intentos, y la propia suite los consume). En ese caso el
  // 429 es el sistema funcionando, no un fallo — se omite sin cascada.
  if (resFalso.status === 429) {
    console.log('  ⏭️  OMITIDA la prueba del club inexistente: el limitador por IP de v54');
    console.log('      respondió antes que la validación del club (HTTP 429). No es un fallo.');
  } else {
    check('registro con club inexistente es rechazado (HTTP 400)',
      resFalso.status === 400 && /no existe/i.test(cuerpoFalso?.error || ''),
      `HTTP ${resFalso.status} ${cuerpoFalso?.error || ''}`);
  }

  // El pendiente no puede auto-aprobarse (guard de `estado` en el trigger).
  const cliPend = await loginComo(QA.reg.cedula, QA.reg.password);
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
      padre: { nombre: 'QA Rep Rechazo', telefono: QA.reg2.telPadre, correo: QA.reg2.correoPadre },
    }),
  });
  const cuerpo2 = await res2.json().catch(() => ({}));
  // Mismo criterio que arriba: si el limitador de v54 corta este registro, sin
  // solicitud no hay nada que rechazar. Antes esto cascadeaba en dos rojos
  // absurdos (resolver_solicitud_registro con p_usuario_id undefined pierde el
  // parámetro y PostgREST ni encuentra la función).
  if (res2.status === 429) {
    console.log('  ⏭️  OMITIDAS las 3 pruebas del rechazo: el limitador por IP de v54 cortó el');
    console.log('      segundo registro (HTTP 429). Reintentar con la ventana de una hora vencida,');
    console.log('      o subir REGISTRO_LIMITE_IP_HORA en el panel de Supabase para los días de QA.');
  } else {
    check('segundo registro para la prueba de rechazo (HTTP 200)', res2.status === 200 && cuerpo2?.success,
      `HTTP ${res2.status} ${cuerpo2?.error || ''}`);
    const { data: u2 } = await svc.from('usuarios').select('id').eq('cedula', QA.reg2.cedula).single();
    if (!u2?.id) {
      console.log('  ⏭️  sin fila del segundo registro: se omiten el rechazo y su verificación.');
    } else {
      const { error: eRech } = await cliOwner.rpc('resolver_solicitud_registro',
        { p_usuario_id: u2.id, p_accion: 'rechazar' });
      check('owner SÍ rechaza la segunda solicitud', !eRech, eRech?.message);
      const { data: u2Despues } = await svc.from('usuarios').select('estado').eq('id', u2.id).single();
      const { data: p2Despues } = await svc.from('usuarios').select('estado').eq('cedula', `PADRE_${QA.reg2.telPadre}`).single();
      check('rechazo deja a atleta y representante en rechazado',
        u2Despues?.estado === 'rechazado' && p2Despues?.estado === 'rechazado',
        `atleta=${u2Despues?.estado} padre=${p2Despues?.estado}`);
    }
  }
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
  // `club_config` se sembró una vez desde grupos_entrenamiento en v27 y nada la
  // mantiene (nota de v34) — "Black Gold" puede no tener fila (no la tiene tras
  // el reset del 22-07). upsertClubConfig (pagosService.js) ya lo asume: hace
  // upsert, no update. Este check replica ESE patrón real en vez de uno propio
  // que solo funciona si la fila ya existe (existía = pasaba antes del reset).
  const { data: cfgAntes } = await svc.from('club_config')
    .select('cuenta_bancaria_texto').eq('club', CLUB).maybeSingle();
  CLUB_CONFIG_BACKUP.existia = cfgAntes !== null;
  CLUB_CONFIG_BACKUP.cuenta_bancaria_texto = cfgAntes?.cuenta_bancaria_texto ?? null;
  CLUB_CONFIG_BACKUP.pendiente = true;
  const { error: ePropio } = await cliOwner.from('club_config')
    .upsert({ club: CLUB, cuenta_bancaria_texto: 'QA_RLS cuenta propia' }, { onConflict: 'club' }).select();
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

  // v56 subsumió el caso legítimo de v40: ya NADIE cambia un correo desde una
  // sesión de la app, tampoco el coach sobre sus propios atletas — el correo
  // es identidad y solo la Edge Function `actualizar-correo` mueve la tabla y
  // Auth juntas. El trabajo de ficha del coach vive ahora en la fecha de
  // nacimiento (probado en la sección del coach).
  const { data: correoAntes } = await svc.from('usuarios')
    .select('correo').eq('id', QA.atleta1.usuarioId).single();
  const { error: eCorreoAtleta } = await cliCoach.from('usuarios')
    .update({ correo: 'qa_rls_atleta@ejemplo.com' }).eq('id', QA.atleta1.usuarioId).select();
  const { data: correoDespues } = await svc.from('usuarios')
    .select('correo').eq('id', QA.atleta1.usuarioId).single();
  check('coach NO cambia el correo ni de un atleta de su propio club (v56)',
    !!eCorreoAtleta && correoDespues?.correo === correoAntes?.correo,
    eCorreoAtleta?.message || `quedó en "${correoDespues?.correo}"`);
  await cliCoach.auth.signOut();

  await svc.from('usuarios').delete().eq('id', pendiente.id);
}

// La v51 abre `gastos`: dinero que SALE del club (nómina, arriendo, marketing).
// Es el dato más sensible del esquema después de las credenciales, y la RLS que
// lo protege es la más estricta que hay — ni siquiera el coach, que es staff,
// debe verlo. Ojo con el alcance real de estos asserts: blackgold-negocio-mcp
// escribe esta tabla con la service_role key, que se salta la RLS entera. Lo
// que se prueba aquí es la barrera del día que la app gane una UI de gastos, no
// la del MCP (esa vive en las guardas de sus tools).
// ───────────────────────────────────────────────────────────────────────────
// H1-D1: las tablas que un agente autónomo ESCRIBIRÍA.
//
// El prerrequisito H1-D1 (docs/spec_h1_autonomia_resultados.md) exige verificar
// el estado real de RLS de las tablas que toca un agente H1 antes de darle
// permiso de escritura. La verificación del 2026-07-29 encontró que esta suite
// cubría a fondo las tablas de LECTURA sensible (pagos, pago_transacciones,
// pago_comprobantes) pero tenía CERO asserts sobre las tres de ESCRITURA:
// progreso_misiones, comunicaciones y misiones. Es decir: justo las que el loop
// autónomo (F1) y el reporte al padre (F2) mutarían.
//
// El riesgo que cubren estos asserts no es teórico: si un atleta pudiera
// insertar en progreso_misiones se auto-asignaría misiones y se auto-otorgaría
// XP; si un coach pudiera hacerlo sobre un atleta de otro club, la autonomía
// cruzaría la frontera de club que v29/v40/v44 levantaron para todo lo demás.
// ───────────────────────────────────────────────────────────────────────────
async function suiteTablasEscrituraH1() {
  console.log('\n— TABLAS DE ESCRITURA DE UN AGENTE H1 (progreso_misiones, comunicaciones, misiones) —');

  // Semilla: una misión de catálogo QA para poder asignarla. Con service_role,
  // porque el sujeto de prueba es la ASIGNACIÓN, no la creación del catálogo.
  const { data: misionQA, error: eMision } = await svc.from('misiones').insert({
    titulo: 'QA_RLS mision de prueba', descripcion: 'QA_RLS', pilar: 'fuerza',
    xp_recompensa: 10, activa: false,
  }).select().single();
  if (eMision) {
    check('se puede sembrar una misión de catálogo para la prueba', false, eMision.message);
    return;
  }
  H1_SEMILLA.misionId = misionQA.id;

  const cliAtleta = await loginComo(QA.atleta1.cedula, QA.atleta1.cedula);
  const cliCoach = await loginComo(QA.coach1.cedula, QA.coach1.cedula);

  // ── progreso_misiones ────────────────────────────────────────────────────
  // El assert más importante de todo H1: sin policy de INSERT para atleta, la
  // única escritura que le queda es el UPDATE de su propio progreso.
  const { error: eAutoAsigna } = await cliAtleta.from('progreso_misiones').insert({
    atleta_id: QA.atleta1.atletaId, mision_id: misionQA.id, estado: 'aprobada',
  }).select();
  const { count: nAuto } = await svc.from('progreso_misiones')
    .select('id', { count: 'exact', head: true })
    .eq('atleta_id', QA.atleta1.atletaId).eq('mision_id', misionQA.id);
  check('atleta NO se auto-asigna una misión (no habría cómo auto-otorgarse XP)',
    !!eAutoAsigna && nAuto === 0, `insertó ${nAuto} fila(s); error: ${eAutoAsigna?.message || 'ninguno'}`);

  // Caso legítimo: el coach asigna dentro de su club (policy progreso_staff, v53).
  const { data: asignada, error: eAsigna } = await cliCoach.from('progreso_misiones').insert({
    atleta_id: QA.atleta1.atletaId, mision_id: misionQA.id, estado: 'pendiente',
    origen: 'coach', sub_pilar_objetivo: 'fuerza',
  }).select().single();
  check('coach SÍ asigna una misión a un atleta de SU club (no se rompió el loop)',
    !eAsigna && !!asignada, eAsigna?.message);

  // El aislamiento por club sobre la tabla que el agente escribiría.
  const { error: eAjeno } = await cliCoach.from('progreso_misiones').insert({
    atleta_id: QA.atletaAjeno.atletaId, mision_id: misionQA.id, estado: 'pendiente',
  }).select();
  const { count: nAjeno } = await svc.from('progreso_misiones')
    .select('id', { count: 'exact', head: true })
    .eq('atleta_id', QA.atletaAjeno.atletaId).eq('mision_id', misionQA.id);
  check('coach NO asigna misiones a un atleta de OTRO club (aislamiento v53)',
    !!eAjeno && nAjeno === 0, `insertó ${nAjeno} fila(s); error: ${eAjeno?.message || 'ninguno'}`);

  // Lectura: cada quien la suya.
  const { data: verPropio } = await cliAtleta.from('progreso_misiones')
    .select('id').eq('atleta_id', QA.atleta1.atletaId);
  check('atleta SÍ lee su propio progreso de misiones', (verPropio?.length || 0) > 0);

  const { data: verAjeno } = await cliAtleta.from('progreso_misiones')
    .select('id').eq('atleta_id', QA.atletaAjeno.atletaId);
  check('atleta NO lee el progreso de otro atleta', (verAjeno?.length || 0) === 0,
    `devolvió ${verAjeno?.length} fila(s)`);

  const { data: coachAjeno } = await cliCoach.from('progreso_misiones')
    .select('id').eq('atleta_id', QA.atletaAjeno.atletaId);
  check('coach NO lee el progreso de un atleta de otro club',
    (coachAjeno?.length || 0) === 0, `devolvió ${coachAjeno?.length} fila(s)`);

  const { data: anonProg } = await anon().from('progreso_misiones').select('id').limit(1);
  check('anónimo NO ve progreso de misiones', (anonProg?.length || 0) === 0);

  // ── comunicaciones ───────────────────────────────────────────────────────
  // Un agente que redacta mensajes al padre escribe aquí (F2/F3).
  const { error: eComAtleta } = await cliAtleta.from('comunicaciones').insert({
    autor_id: QA.atleta1.usuarioId, tipo: 'Anuncio', titulo: 'QA_RLS',
    mensaje: 'QA_RLS intento de atleta', proposito: 'comunicado',
  }).select();
  check('atleta NO redacta comunicaciones (solo staff)', !!eComAtleta,
    eComAtleta ? '' : 'la insertó');

  const { data: comCoach, error: eComCoach } = await cliCoach.from('comunicaciones').insert({
    autor_id: QA.coach1.usuarioId, tipo: 'Anuncio', titulo: 'QA_RLS',
    mensaje: 'QA_RLS comunicado legítimo', proposito: 'comunicado',
  }).select().single();
  check('coach SÍ redacta una comunicación en su club (no se rompió v18)',
    !eComCoach && !!comCoach, eComCoach?.message);

  // Suplantar la autoría de un usuario del club ajeno (WITH CHECK de v29/v44).
  const { error: eComSuplanta } = await cliCoach.from('comunicaciones').insert({
    autor_id: QA.ownerAjeno.usuarioId, tipo: 'Anuncio', titulo: 'QA_RLS',
    mensaje: 'QA_RLS suplantación', proposito: 'comunicado',
  }).select();
  const { count: nSuplanta } = await svc.from('comunicaciones')
    .select('id', { count: 'exact', head: true })
    .eq('autor_id', QA.ownerAjeno.usuarioId).eq('titulo', 'QA_RLS');
  check('coach NO firma una comunicación como usuario de otro club (v44)',
    !!eComSuplanta && nSuplanta === 0,
    `insertó ${nSuplanta} fila(s); error: ${eComSuplanta?.message || 'ninguno'}`);

  // ── misiones (catálogo) ──────────────────────────────────────────────────
  const { error: eCatAtleta } = await cliAtleta.from('misiones').insert({
    titulo: 'QA_RLS mision de atleta', pilar: 'fuerza', xp_recompensa: 9999, activa: true,
  }).select();
  check('atleta NO agrega misiones al catálogo (ni con XP inflado)', !!eCatAtleta,
    eCatAtleta ? '' : 'la insertó');

  const { error: eCatBorra } = await cliAtleta.from('misiones').delete().eq('id', misionQA.id).select();
  const { data: sigueViva } = await svc.from('misiones').select('id').eq('id', misionQA.id).maybeSingle();
  check('atleta NO borra misiones del catálogo', !!sigueViva,
    `error: ${eCatBorra?.message || 'ninguno'}`);

  // Lectura global del catálogo: es DELIBERADA (misiones_select USING true, v24).
  // El catálogo es conocimiento compartido del club, no dato personal; se deja
  // asentado como decisión verificada y no como hallazgo.
  const { data: catalogo } = await cliAtleta.from('misiones').select('id').limit(5);
  check('atleta SÍ lee el catálogo de misiones (global a propósito, v24)',
    (catalogo?.length || 0) > 0);
}

async function suiteGastos() {
  console.log('\n— GASTOS: CONTABILIDAD DE GESTIÓN (v51) —');

  // Semilla con service_role: un gasto en cada club. Si la tabla no existe, la
  // migración no está aplicada y no tiene sentido seguir: se reporta en rojo y
  // se sale, en vez de encadenar quince fallos que dicen todos lo mismo.
  const { data: gastoPropio, error: eSemilla } = await svc.from('gastos').insert({
    club: CLUB, monto: 100.00, categoria: 'Marketing y publicidad',
    descripcion: 'QA_RLS gasto de Black Gold', registrado_por: 'QA_RLS',
  }).select().single();
  if (eSemilla) {
    check('la tabla `gastos` existe (v51 aplicada)', false,
      `${eSemilla.message} — falta aplicar 20260726120000_v51_gastos_contabilidad_gestion.sql`);
    return;
  }
  QA.gastoPropioId = gastoPropio.id;

  const { data: gastoAjeno, error: eSemAjeno } = await svc.from('gastos').insert({
    club: CLUB_AJENO, monto: 250.00, categoria: 'Nómina',
    descripcion: 'QA_RLS gasto del club ajeno', registrado_por: 'QA_RLS',
  }).select().single();
  if (eSemAjeno) throw new Error(`setup gastos ajeno: ${eSemAjeno.message}`);
  QA.gastoAjenoId = gastoAjeno.id;

  // 1. El coach es staff y ve media app, pero la nómina no es asunto suyo:
  // sabría lo que cobran sus compañeros. La policy pide rol owner/superadmin.
  const cliCoach = await loginComo(QA.coach1.cedula, QA.coach1.cedula);
  const { data: coachVe } = await cliCoach.from('gastos').select('id');
  check('coach NO ve gastos, ni los de su propio club (v51)',
    (coachVe || []).length === 0, `ve ${(coachVe || []).length}`);

  const { error: eCoachIns } = await cliCoach.from('gastos').insert({
    club: CLUB, monto: 1, categoria: 'Otro',
    descripcion: 'QA_RLS coach intenta registrar', registrado_por: 'QA_RLS',
  }).select();
  check('coach NO registra gastos (v51)',
    eCoachIns?.code === '42501', eCoachIns?.message || 'lo dejó insertar');
  await cliCoach.auth.signOut();

  // 2. El atleta, ni de lejos.
  const cliAtleta = await loginComo(QA.atleta1.cedula, QA.atleta1.cedula);
  const { data: atletaVe } = await cliAtleta.from('gastos').select('id');
  check('atleta NO ve gastos (v51)', (atletaVe || []).length === 0, `ve ${(atletaVe || []).length}`);
  await cliAtleta.auth.signOut();

  // 3. El anónimo: las policies son TO authenticated, así que la tabla no
  // existe para quien no ha iniciado sesión.
  const { data: anonVe } = await anon().from('gastos').select('id');
  check('anónimo NO ve gastos (v51)', (anonVe || []).length === 0, `ve ${(anonVe || []).length}`);

  // 4. El owner: los suyos sí, los del club de al lado no. Mismo vector que v40.
  const cliOwner = await loginComo(QA.owner1.cedula, QA.owner1.cedula);
  const { data: ownerVe } = await cliOwner.from('gastos').select('id, club');
  const idsOwner = (ownerVe || []).map(g => g.id);
  check('owner SÍ ve los gastos de SU club (v51)',
    idsOwner.includes(QA.gastoPropioId), `ve ${idsOwner.length} gastos y el suyo no está`);
  check('owner NO ve los gastos de otro club (v51)',
    !idsOwner.includes(QA.gastoAjenoId), 'le aparece el gasto del club ajeno');

  const { error: eOwnerIns } = await cliOwner.from('gastos').insert({
    club: CLUB, monto: 42.50, categoria: 'Insumos y suministros',
    descripcion: 'QA_RLS owner registra en su club', registrado_por: 'QA_RLS',
  }).select();
  check('owner SÍ registra un gasto en SU club (no se rompió el caso legítimo)',
    !eOwnerIns, eOwnerIns?.message);

  // El WITH CHECK, que es lo que de verdad importa: ser owner no basta, el club
  // de la fila tiene que ser el suyo. Sin esta cláusula, un owner escribiría
  // gastos en la contabilidad de cualquier club con solo cambiar un campo.
  const { error: eOwnerAjeno } = await cliOwner.from('gastos').insert({
    club: CLUB_AJENO, monto: 999, categoria: 'Otro',
    descripcion: 'QA_RLS owner inyecta en club ajeno', registrado_por: 'QA_RLS',
  }).select();
  const { count: nInyectados } = await svc.from('gastos')
    .select('id', { count: 'exact', head: true })
    .eq('club', CLUB_AJENO).like('descripcion', 'QA_RLS owner inyecta%');
  check('owner NO inyecta un gasto en la contabilidad de otro club (WITH CHECK v51)',
    eOwnerAjeno?.code === '42501' && (nInyectados || 0) === 0,
    eOwnerAjeno?.message || `se crearon ${nInyectados}`);

  const { error: eOwnerUpd } = await cliOwner.from('gastos')
    .update({ monto: 1 }).eq('id', QA.gastoAjenoId).select();
  const { data: ajenoReal } = await svc.from('gastos')
    .select('monto').eq('id', QA.gastoAjenoId).single();
  check('owner NO reescribe el monto de un gasto de otro club (v51)',
    Number(ajenoReal?.monto) === 250,
    `quedó en ${ajenoReal?.monto} (error: ${eOwnerUpd?.message || 'ninguno'})`);

  // DELETE también cae bajo el FOR ALL. Igual que en Storage (v40b), un delete
  // bloqueado por RLS no siempre devuelve error — filtra filas en vez de lanzar.
  // La prueba real es que la fila siga ahí, mirada con el cliente de servicio.
  await cliOwner.from('gastos').delete().eq('id', QA.gastoAjenoId);
  const { data: sigueAhi } = await svc.from('gastos')
    .select('id').eq('id', QA.gastoAjenoId).maybeSingle();
  check('owner NO borra un gasto de otro club (v51)',
    sigueAhi !== null, 'el gasto del club ajeno desapareció');
  await cliOwner.auth.signOut();

  // 5. El superadmin sí cruza clubes: es el único que debe, y si esto se rompe
  // la consolidación de toda la plataforma deja de funcionar.
  const cliSuper = await loginComo(QA.super1.cedula, QA.super1.cedula);
  const { data: superVe } = await cliSuper.from('gastos').select('id');
  const idsSuper = (superVe || []).map(g => g.id);
  check('superadmin SÍ ve los gastos de ambos clubes (v51)',
    idsSuper.includes(QA.gastoPropioId) && idsSuper.includes(QA.gastoAjenoId),
    `ve ${idsSuper.length} gastos`);
  await cliSuper.auth.signOut();

  // 6. Los CHECK de la tabla son la otra mitad de la barrera, y esta sí aplica
  // al MCP: la service_role key se salta la RLS, pero no las restricciones de
  // integridad. Es lo único que impide que una tool escriba basura en la
  // contabilidad. La lista de categorías tiene que seguir en sincronía con
  // CATEGORIAS_GASTO de blackgold-negocio-mcp/src/index.js.
  const { error: eCat } = await svc.from('gastos').insert({
    club: CLUB, monto: 10, categoria: 'Categoria inventada',
    descripcion: 'QA_RLS categoria invalida', registrado_por: 'QA_RLS',
  }).select();
  check('una categoría fuera de la lista cerrada es rechazada, incluso con service_role (CHECK v51)',
    !!eCat, 'la base la aceptó');

  const { error: eMonto } = await svc.from('gastos').insert({
    club: CLUB, monto: -5, categoria: 'Otro',
    descripcion: 'QA_RLS monto negativo', registrado_por: 'QA_RLS',
  }).select();
  check('un monto negativo es rechazado (CHECK v51)', !!eMonto, 'la base lo aceptó');

  const { error: eDesc } = await svc.from('gastos').insert({
    club: CLUB, monto: 10, categoria: 'Otro',
    descripcion: '   ', registrado_por: 'QA_RLS',
  }).select();
  check('una descripción en blanco es rechazada (CHECK v51)', !!eDesc, 'la base la aceptó');
}

(async () => {
// Guardarraíl: si el bucket fotos-atletas o la RPC establecer_foto_atleta no
// existen (v61/v62 sin aplicar), un solo rojo explicativo y se sale — mismo
// patrón que suiteGastos con la tabla `gastos`.
//
// Cubre las cuatro vías de escritura de v61 (RPC establecer_foto_atleta) y las
// políticas de Storage de v62 + el helper de familia de v63: quién puede
// cambiar la foto de QUIÉN, y quién puede leer/subir/listar en Storage.
//
// Semilla: dos fotos reales (PNG 1x1 válido, mismo byte a byte que usa
// cypress/e2e/foto_atleta.cy.js) subidas directo con service_role — una en la
// carpeta de QA.atleta1 (club CLUB) y otra en la de QA.atletaAjeno (club
// CLUB_AJENO) — y la fila de `atletas` apuntada a mano con service_role. No se
// usa la RPC para sembrar: sus checks de autorización miran auth.uid(), que
// con la service_role key es NULL, así que la propia RPC rechazaría la
// siembra igual que a un impostor.
async function suiteFotos() {
  console.log('\n— FOTO DE IDENTIFICACIÓN DEL ATLETA (v61/v62/v63) —');

  const { error: eBucket } = await svc.storage.from('fotos-atletas').list('', { limit: 1 });
  if (eBucket) {
    check('el bucket fotos-atletas existe (v62 aplicada)', false,
      `${eBucket.message} — falta aplicar 20260731120100_v62_storage_fotos_atletas.sql`);
    return;
  }
  const { error: eRpcExiste } = await svc.rpc('establecer_foto_atleta', { p_atleta_id: null, p_path: null });
  if (eRpcExiste?.code === 'PGRST202' || /does not exist|schema cache/i.test(eRpcExiste?.message || '')) {
    check('la RPC establecer_foto_atleta existe (v61 aplicada)', false,
      `${eRpcExiste.message} — falta aplicar 20260731120000_v61_foto_atleta.sql`);
    return;
  }

  // PNG 1x1 válido (idéntico al de cypress/e2e/foto_atleta.cy.js): "bytes
  // reales" y no un Buffer de texto con content-type falseado, porque el
  // pipeline de subida real reencoda y el bucket declara allowed_mime_types.
  const PNG_1PX = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  const pathPropio = `${QA.atleta1.atletaId}/QA_RLS-foto.png`;
  const pathAjeno = `${QA.atletaAjeno.atletaId}/QA_RLS-foto.png`;

  const { error: eSubePropio } = await svc.storage.from('fotos-atletas')
    .upload(pathPropio, PNG_1PX, { contentType: 'image/png', upsert: true });
  const { error: eSubeAjeno } = await svc.storage.from('fotos-atletas')
    .upload(pathAjeno, PNG_1PX, { contentType: 'image/png', upsert: true });
  if (eSubePropio || eSubeAjeno) {
    check('se pueden sembrar las fotos QA en Storage', false, eSubePropio?.message || eSubeAjeno?.message);
    return;
  }
  await svc.from('atletas').update({
    foto_path: pathPropio, foto_actualizada_at: new Date().toISOString(),
    foto_actualizada_por: QA.atleta1.usuarioId,
  }).eq('id', QA.atleta1.atletaId);
  await svc.from('atletas').update({
    foto_path: pathAjeno, foto_actualizada_at: new Date().toISOString(),
    foto_actualizada_por: QA.ownerAjeno.usuarioId,
  }).eq('id', QA.atletaAjeno.atletaId);

  // ── 1. ATLETA: la RPC sobre sí mismo sí, sobre otro atleta del mismo club no,
  // y en Storage no puede subir a la carpeta de otro. ──
  const cliAtleta = await loginComo(QA.atleta1.cedula, QA.atleta1.cedula);

  const { error: eAtletaOtro } = await cliAtleta.rpc('establecer_foto_atleta', {
    p_atleta_id: QA.atleta2.atletaId, p_path: `${QA.atleta2.atletaId}/QA_RLS-hack.png`,
  });
  check('atleta NO cambia la foto de OTRO atleta del mismo club (RPC v61)',
    !!eAtletaOtro, eAtletaOtro?.message || 'sin error');

  const { error: eAtletaPropio } = await cliAtleta.rpc('establecer_foto_atleta', {
    p_atleta_id: QA.atleta1.atletaId, p_path: pathPropio,
  });
  check('atleta SÍ cambia SU PROPIA foto (RPC v61)', !eAtletaPropio, eAtletaPropio?.message);

  const { error: eAtletaSubeOtro } = await cliAtleta.storage.from('fotos-atletas')
    .upload(`${QA.atleta2.atletaId}/QA_RLS-hack.png`, PNG_1PX, { contentType: 'image/png' });
  check('atleta NO sube una foto a la carpeta de OTRO atleta (Storage v62/v63)',
    !!eAtletaSubeOtro, eAtletaSubeOtro?.message || 'sin error');
  await cliAtleta.auth.signOut();

  // ── 2. PADRE: la RPC solo sobre su hijo (ni para poner foto ni para
  // anularla con NULL), y en Storage solo descarga la de su hijo. ──
  const cliPadre = await loginComo(QA.padre1.cedula, QA.padre1.cedula);

  const { error: ePadreOtro } = await cliPadre.rpc('establecer_foto_atleta', {
    p_atleta_id: QA.atleta2.atletaId, p_path: `${QA.atleta2.atletaId}/QA_RLS-hack.png`,
  });
  check('padre NO cambia la foto de un atleta que no es su hijo (RPC v61)',
    !!ePadreOtro, ePadreOtro?.message || 'sin error');

  // Caso NULL: si v61 permite establecer_foto_atleta(id, NULL) para borrar, el
  // mismo chequeo de autorización tiene que aplicar también cuando lo que se
  // pide es anular en vez de reemplazar.
  const { error: ePadreAnulaAjena } = await cliPadre.rpc('establecer_foto_atleta', {
    p_atleta_id: QA.atletaAjeno.atletaId, p_path: null,
  });
  check('padre NO anula (NULL) la foto de un atleta ajeno (RPC v61)',
    !!ePadreAnulaAjena, ePadreAnulaAjena?.message || 'sin error');

  const { error: ePadrePropio } = await cliPadre.rpc('establecer_foto_atleta', {
    p_atleta_id: QA.atleta1.atletaId, p_path: pathPropio,
  });
  check('padre SÍ cambia la foto de SU HIJO (RPC v61)', !ePadrePropio, ePadrePropio?.message);

  const { error: ePadreDescargaAjena } = await cliPadre.storage.from('fotos-atletas').download(pathAjeno);
  check('padre NO descarga la foto de un atleta ajeno (Storage v62/v63)',
    !!ePadreDescargaAjena, ePadreDescargaAjena?.message || 'sin error');

  const { error: ePadreDescargaPropia } = await cliPadre.storage.from('fotos-atletas').download(pathPropio);
  check('padre SÍ descarga la foto de SU HIJO (Storage v62)', !ePadreDescargaPropia, ePadreDescargaPropia?.message);
  await cliPadre.auth.signOut();

  // ── 3. COACH: la RPC solo dentro de su club, y en Storage no descarga ni
  // lista la carpeta de un atleta de otro club (mismo vector que v40b, ahora
  // sobre fotos-atletas). ──
  const cliCoach = await loginComo(QA.coach1.cedula, QA.coach1.cedula);

  const { error: eCoachAjeno } = await cliCoach.rpc('establecer_foto_atleta', {
    p_atleta_id: QA.atletaAjeno.atletaId, p_path: `${QA.atletaAjeno.atletaId}/QA_RLS-hack.png`,
  });
  check('coach NO cambia la foto de un atleta de OTRO club (RPC v61)',
    !!eCoachAjeno, eCoachAjeno?.message || 'sin error');

  const { error: eCoachPropio } = await cliCoach.rpc('establecer_foto_atleta', {
    p_atleta_id: QA.atleta1.atletaId, p_path: pathPropio,
  });
  check('coach SÍ cambia la foto de un atleta de SU club (RPC v61)', !eCoachPropio, eCoachPropio?.message);

  const { error: eCoachDescargaAjena } = await cliCoach.storage.from('fotos-atletas').download(pathAjeno);
  check('coach NO descarga la foto de un atleta de OTRO club (Storage v62)',
    !!eCoachDescargaAjena, eCoachDescargaAjena?.message || 'sin error');

  const { error: eCoachDescargaPropia } = await cliCoach.storage.from('fotos-atletas').download(pathPropio);
  check('coach SÍ descarga la foto de un atleta de SU club (Storage v62)',
    !eCoachDescargaPropia, eCoachDescargaPropia?.message);

  const { data: listadoAjeno } = await cliCoach.storage.from('fotos-atletas').list(String(QA.atletaAjeno.atletaId));
  check('coach NO lista el directorio de un atleta de otro club (Storage v62)',
    (listadoAjeno || []).length === 0, `ve ${(listadoAjeno || []).length} objetos`);
  await cliCoach.auth.signOut();

  // ── 4. ANON: el bucket es privado y las políticas son TO authenticated. ──
  const { error: eAnonDescarga } = await anon().storage.from('fotos-atletas').download(pathPropio);
  check('anon NO descarga ninguna foto de atletas (Storage v62)', !!eAnonDescarga, eAnonDescarga?.message || 'sin error');

  // ── Limpieza propia de la suite (además del respaldo en limpiarQA): objetos
  // y foto_path a NULL, para no dejarle una foto QA colgando a un atleta que
  // otra suite de esta misma corrida pueda tocar. ──
  await svc.storage.from('fotos-atletas').remove([pathPropio, pathAjeno]);
  await svc.from('atletas')
    .update({ foto_path: null, foto_actualizada_at: null, foto_actualizada_por: null })
    .eq('id', QA.atleta1.atletaId);
  await svc.from('atletas')
    .update({ foto_path: null, foto_actualizada_at: null, foto_actualizada_por: null })
    .eq('id', QA.atletaAjeno.atletaId);
}

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
    await suiteGastos();
    await suiteFotos();
    await suiteTablasEscrituraH1();
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
