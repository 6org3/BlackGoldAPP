// tmp_probe_rls_5clubes.mjs — Sondas de aislamiento RLS cross-club sobre los 5
// clubes simulados (BD reseteada 2026-07-22). Usa SOLO la clave ANON para las
// sesiones de usuario (como el producto); el SERVICE_ROLE se usa únicamente
// para descubrir IDs de referencia del club ajeno (Nueva Loja Basket) que las
// sesiones intentarán leer/escribir — nunca para saltarse RLS en las sondas.
//
// Uso: node scripts/tmp_probe_rls_5clubes.mjs   (DESDE Dashboard_Premium/)

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

const URL_ = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) {
  console.error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const opts = { auth: { autoRefreshToken: false, persistSession: false } };
const svc = createClient(URL_, SERVICE, opts);
const anon = () => createClient(URL_, ANON, opts);
const EMAIL_DOM = '@sinacceso.blackgoldapp.internal';

const CLUB_NLB = 'Nueva Loja Basket';
const CLUB_CAS = 'Cascabel BC';

// ---- registro de sondas ----
const probes = []; // { nombre, pasa, critico, detalle }
function probe(nombre, pasa, { critico = false, detalle = '' } = {}) {
  probes.push({ nombre, pasa, critico, detalle });
  const tag = pasa ? 'PASA' : (critico ? 'FALLA(CRIT)' : 'FALLA');
  console.log(`  [${tag}] ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

// La BD sembrada dejó a CAS-OWNER (único owner de Cascabel BC) SIN cuenta de
// Auth, así que no podía entrar. Es un hueco de seed (se reporta), pero la tarea
// exige probar el aislamiento de escritura a nivel OWNER, así que se le provee
// una cuenta idempotente con la contraseña documentada. Solo datos de prueba.
async function ensureAuth(identificador, password) {
  const { data: u } = await svc.from('usuarios')
    .select('id, auth_user_id, cedula').eq('cedula', identificador).maybeSingle();
  if (!u) throw new Error(`ensureAuth: no existe usuarios.cedula=${identificador}`);
  if (u.auth_user_id) return { creado: false };
  const email = `${identificador}${EMAIL_DOM}`.toLowerCase();
  const { data: au, error: eAu } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (eAu) throw new Error(`ensureAuth createUser ${identificador}: ${eAu.message}`);
  const { error: eLink } = await svc.from('usuarios').update({ auth_user_id: au.user.id }).eq('id', u.id);
  if (eLink) throw new Error(`ensureAuth link ${identificador}: ${eLink.message}`);
  return { creado: true };
}

// El producto resuelve email por RPC (COALESCE correo/cedula@dom). Usamos la RPC
// y, si algo falla, caemos a construir el email interno directo como pide la tarea.
async function loginComo(cli, identificador, password) {
  let email = `${identificador}${EMAIL_DOM}`.toLowerCase();
  try {
    const { data } = await cli.rpc('resolver_email_login', { p_identificador: identificador });
    if (typeof data === 'string' && data.includes('@')) email = data;
  } catch { /* usa el fallback */ }
  const { data, error } = await cli.auth.signInWithPassword({ email, password });
  if (error || !data?.session) throw new Error(`login ${identificador}: ${error?.message || 'sin sesión'}`);
  return data;
}

async function main() {
  // ===== 0. Referencias del club ajeno (Nueva Loja Basket) con service_role =====
  const ref = {};
  {
    const { data: uNLB } = await svc.from('usuarios')
      .select('id, cedula, club, rol').eq('club', CLUB_NLB).limit(500);
    ref.usuariosNLB = uNLB || [];
    const atletaUsr = ref.usuariosNLB.find(u => u.rol === 'atleta');

    const { data: atletasNLB } = await svc.from('atletas')
      .select('id, usuario_id').in('usuario_id', ref.usuariosNLB.map(u => u.id)).limit(500);
    ref.atletasNLB = atletasNLB || [];
    ref.atletaNLBId = ref.atletasNLB[0]?.id;

    const { data: gruposNLB } = await svc.from('grupos_entrenamiento')
      .select('id, nombre, club, descripcion, precio_mensual').eq('club', CLUB_NLB).limit(50);
    ref.gruposNLB = gruposNLB || [];
    ref.grupoNLBId = ref.gruposNLB[0]?.id;
    ref.grupoNLBDescOrig = ref.gruposNLB[0]?.descripcion;

    const { data: pagosNLB } = await svc.from('pagos')
      .select('id, atleta_id').in('atleta_id', ref.atletasNLB.map(a => a.id)).limit(50);
    ref.pagosNLB = pagosNLB || [];
    ref.pagoNLBId = ref.pagosNLB[0]?.id;

    const { data: agNLB } = await svc.from('atleta_grupo')
      .select('atleta_id, grupo_id').eq('grupo_id', ref.grupoNLBId || '00000000-0000-0000-0000-000000000000').limit(50);
    ref.atletaGrupoNLB = agNLB || [];

    const { data: comNLB } = await svc.from('comunicaciones')
      .select('id, autor_id').in('autor_id', ref.usuariosNLB.map(u => u.id)).limit(50);
    ref.comunicacionesNLB = comNLB || [];
    ref.comNLBId = ref.comunicacionesNLB[0]?.id;

    const { data: cfgNLB } = await svc.from('club_config')
      .select('club, cuenta_bancaria_texto, dia_vencimiento').eq('club', CLUB_NLB).maybeSingle();
    ref.cfgNLB = cfgNLB;
    ref.cfgNLBCuentaOrig = cfgNLB?.cuenta_bancaria_texto ?? null;

    console.log('== Referencias NLB ==');
    console.log(`  usuarios=${ref.usuariosNLB.length} atletas=${ref.atletasNLB.length} grupos=${ref.gruposNLB.length} pagos=${ref.pagosNLB.length} atleta_grupo(grupo0)=${ref.atletaGrupoNLB.length} comunicaciones=${ref.comunicacionesNLB.length} club_config=${ref.cfgNLB ? 'sí' : 'no'}`);
    console.log(`  atletaUsrNLB=${atletaUsr?.id} grupoNLB=${ref.grupoNLBId} pagoNLB=${ref.pagoNLBId} comNLB=${ref.comNLBId}`);
  }

  // ===== a) CAS-OWNER: aislamiento de lectura y escritura cross-club =====
  console.log('\n== (a) CAS-OWNER (owner de Cascabel BC) ==');
  {
    const prov = await ensureAuth('CAS-OWNER', 'CAS-OWNER#2026');
    if (prov.creado) console.log('  [seed] CAS-OWNER no tenía cuenta de Auth; se aprovisionó para poder probar (hueco de seed reportado)');
    const cli = anon();
    await loginComo(cli, 'CAS-OWNER', 'CAS-OWNER#2026');

    // usuarios: no debe ver NINGUNA fila de NLB
    const { data: uVis } = await cli.from('usuarios').select('id, club').limit(2000);
    const nlbEnUsuarios = (uVis || []).filter(u => u.club === CLUB_NLB).length;
    const clubesVistos = [...new Set((uVis || []).map(u => u.club))];
    probe('CAS-OWNER no ve usuarios de Nueva Loja Basket', nlbEnUsuarios === 0,
      { critico: true, detalle: `ve ${nlbEnUsuarios} usuarios NLB; clubes visibles=${JSON.stringify(clubesVistos)}` });

    // usuarios: intento directo de leer un usuario NLB por id
    const nlbUsrIds = ref.usuariosNLB.slice(0, 20).map(u => u.id);
    const { data: uDir } = await cli.from('usuarios').select('id, club').in('id', nlbUsrIds);
    probe('CAS-OWNER no puede leer usuarios NLB por id directo', (uDir || []).length === 0,
      { critico: true, detalle: `devolvió ${(uDir || []).length} filas` });

    // atletas via join a usuarios(club): ninguna debe ser NLB
    const { data: atVis } = await cli.from('atletas').select('id, usuario:usuarios(club)').limit(2000);
    const nlbEnAtletas = (atVis || []).filter(a => a?.usuario?.club === CLUB_NLB).length;
    probe('CAS-OWNER no ve atletas de NLB (via join)', nlbEnAtletas === 0,
      { critico: true, detalle: `ve ${nlbEnAtletas} atletas NLB` });

    // atletas: intento directo por id de un atleta NLB
    if (ref.atletaNLBId) {
      const { data: atDir } = await cli.from('atletas').select('id').eq('id', ref.atletaNLBId);
      probe('CAS-OWNER no puede leer un atleta NLB por id directo', (atDir || []).length === 0,
        { critico: true, detalle: `devolvió ${(atDir || []).length} filas` });
    }

    // pagos: intento directo por id de un pago NLB
    if (ref.pagoNLBId) {
      const { data: pgDir } = await cli.from('pagos').select('id').eq('id', ref.pagoNLBId);
      probe('CAS-OWNER no puede leer un pago NLB por id directo', (pgDir || []).length === 0,
        { critico: true, detalle: `devolvió ${(pgDir || []).length} filas` });
    }
    // pagos: barrido — ninguno de los pagos NLB conocidos debe verse
    if (ref.pagosNLB.length) {
      const { data: pgVis } = await cli.from('pagos').select('id').in('id', ref.pagosNLB.map(p => p.id));
      probe('CAS-OWNER no ve ningún pago NLB (barrido por ids)', (pgVis || []).length === 0,
        { critico: true, detalle: `ve ${(pgVis || []).length} pagos NLB` });
    }

    // grupos_entrenamiento: no debe ver los de NLB
    const { data: grVis } = await cli.from('grupos_entrenamiento').select('id, club').limit(500);
    const nlbEnGrupos = (grVis || []).filter(g => g.club === CLUB_NLB).length;
    probe('CAS-OWNER no ve grupos_entrenamiento de NLB', nlbEnGrupos === 0,
      { critico: true, detalle: `ve ${nlbEnGrupos} grupos NLB` });

    // atleta_grupo: filtrando por un grupo NLB no debe salir nada
    if (ref.grupoNLBId) {
      const { data: agVis } = await cli.from('atleta_grupo').select('atleta_id, grupo_id').eq('grupo_id', ref.grupoNLBId);
      probe('CAS-OWNER no ve atleta_grupo de un grupo NLB', (agVis || []).length === 0,
        { critico: true, detalle: `ve ${(agVis || []).length} vínculos` });
    }

    // comunicaciones: no debe ver la comunicación NLB por id
    if (ref.comNLBId) {
      const { data: coVis } = await cli.from('comunicaciones').select('id').eq('id', ref.comNLBId);
      probe('CAS-OWNER no ve una comunicación NLB por id', (coVis || []).length === 0,
        { critico: true, detalle: `ve ${(coVis || []).length} filas` });
    }

    // club_config: no debe ver la config de NLB
    const { data: cfgVis } = await cli.from('club_config').select('club').limit(50);
    const nlbEnCfg = (cfgVis || []).filter(c => c.club === CLUB_NLB).length;
    probe('CAS-OWNER no ve club_config de NLB', nlbEnCfg === 0,
      { critico: true, detalle: `clubes en club_config=${JSON.stringify((cfgVis || []).map(c => c.club))}` });

    // ---- e) Escrituras cross-club ----
    if (ref.grupoNLBId) {
      const marca = `HACK_CAS_${Date.now()}`;
      const { data: upG, error: eUpG } = await cli.from('grupos_entrenamiento')
        .update({ descripcion: marca }).eq('id', ref.grupoNLBId).select();
      const { data: gAfter } = await svc.from('grupos_entrenamiento')
        .select('descripcion').eq('id', ref.grupoNLBId).single();
      const sinCambio = gAfter?.descripcion !== marca;
      probe('CAS-OWNER NO puede UPDATE un grupo de NLB (0 filas / bloqueado y sin cambio)',
        (upG || []).length === 0 && sinCambio,
        { critico: true, detalle: `filas=${(upG || []).length} err=${eUpG?.code || 'ninguno'} descAhora=${JSON.stringify(gAfter?.descripcion)}` });
      // restaurar por si acaso
      if (!sinCambio) await svc.from('grupos_entrenamiento').update({ descripcion: ref.grupoNLBDescOrig }).eq('id', ref.grupoNLBId);
    }

    if (ref.cfgNLB) {
      const marca = `HACK_CUENTA_${Date.now()}`;
      const { data: upC, error: eUpC } = await cli.from('club_config')
        .update({ cuenta_bancaria_texto: marca }).eq('club', CLUB_NLB).select();
      const { data: cAfter } = await svc.from('club_config')
        .select('cuenta_bancaria_texto').eq('club', CLUB_NLB).single();
      const sinCambio = cAfter?.cuenta_bancaria_texto !== marca;
      probe('CAS-OWNER NO puede UPDATE club_config de NLB (cuenta bancaria intacta)',
        (upC || []).length === 0 && sinCambio,
        { critico: true, detalle: `filas=${(upC || []).length} err=${eUpC?.code || 'ninguno'} cuentaAhora=${JSON.stringify(cAfter?.cuenta_bancaria_texto)}` });
      if (!sinCambio) await svc.from('club_config').update({ cuenta_bancaria_texto: ref.cfgNLBCuentaOrig }).eq('club', CLUB_NLB);
    }

    // PASA-info: sí ve lo suyo
    const { data: uCas } = await cli.from('usuarios').select('id, club').eq('club', CLUB_CAS).limit(5);
    probe('CAS-OWNER SÍ ve usuarios de su propio club (Cascabel BC)', (uCas || []).length > 0,
      { detalle: `ve ${(uCas || []).length} usuarios de su club` });

    await cli.auth.signOut();
  }

  // ===== b) NLB-ATLETA-1: solo lo suyo =====
  console.log('\n== (b) NLB-ATLETA-1 (atleta de Nueva Loja Basket) ==');
  {
    const cli = anon();
    const sess = await loginComo(cli, 'NLB-ATLETA-1', 'NLB-ATLETA-1');
    const myAuth = sess.user.id;
    const { data: miUsr } = await svc.from('usuarios').select('id, club').eq('auth_user_id', myAuth).single();

    // usuarios: no ve otros clubes
    const { data: uVis } = await cli.from('usuarios').select('id, club').limit(2000);
    const otrosClubes = (uVis || []).filter(u => u.club && u.club !== miUsr.club).length;
    probe('NLB-ATLETA-1 no ve usuarios de otros clubes', otrosClubes === 0,
      { critico: true, detalle: `ve ${otrosClubes} usuarios de clubes ajenos; total visibles=${(uVis || []).length}` });
    probe('NLB-ATLETA-1 ve pocas filas de usuarios (solo su entorno)', (uVis || []).length <= 5,
      { detalle: `ve ${(uVis || []).length} filas de usuarios` });

    // atletas: solo la suya
    const { data: atVis } = await cli.from('atletas').select('id').limit(500);
    probe('NLB-ATLETA-1 ve como máximo su propia fila de atletas', (atVis || []).length <= 1,
      { detalle: `ve ${(atVis || []).length} atletas` });

    // pagos: no ve pagos de otro atleta NLB
    if (ref.pagoNLBId) {
      const { data: pgOtro } = await cli.from('pagos').select('id').eq('id', ref.pagoNLBId);
      // ref.pagoNLBId podría (con baja probabilidad) ser suyo; comprobamos que sea de otro atleta
      const esSuyo = false; // pagoNLBId proviene del primer atleta NLB, casi seguro no es este atleta-1
      probe('NLB-ATLETA-1 no lee un pago de otro atleta NLB por id',
        (pgOtro || []).length === 0 || esSuyo,
        { critico: true, detalle: `ve ${(pgOtro || []).length} filas del pago de otro atleta` });
    }

    // pagos propios: consulta sin error
    const { data: pgMios, error: ePg } = await cli.from('pagos').select('id');
    probe('NLB-ATLETA-1 consulta sus pagos sin error', !ePg,
      { detalle: `ve ${(pgMios || []).length} pagos propios; err=${ePg?.code || 'ninguno'}` });

    await cli.auth.signOut();
  }

  // ===== c) CUY-PADRE-1: solo sus hijos =====
  console.log('\n== (c) CUY-PADRE-1 (padre de Cuyabeno Jr) ==');
  {
    const cli = anon();
    const sess = await loginComo(cli, 'CUY-PADRE-1', 'CUY-PADRE-1');
    const myAuth = sess.user.id;
    const { data: miUsr } = await svc.from('usuarios').select('id, club').eq('auth_user_id', myAuth).single();
    const { data: hijos } = await svc.from('padres_atletas').select('atleta_id').eq('padre_id', miUsr.id);
    const hijoIds = new Set((hijos || []).map(h => h.atleta_id));

    // atletas: solo sus hijos
    const { data: atVis } = await cli.from('atletas').select('id').limit(500);
    const ajenos = (atVis || []).filter(a => !hijoIds.has(a.id)).length;
    probe('CUY-PADRE-1 solo ve a sus hijos en atletas', ajenos === 0,
      { critico: true, detalle: `hijos=${hijoIds.size} atletasVisibles=${(atVis || []).length} ajenos=${ajenos}` });

    // usuarios: no ve otros clubes
    const { data: uVis } = await cli.from('usuarios').select('id, club').limit(2000);
    const otrosClubes = (uVis || []).filter(u => u.club && u.club !== miUsr.club).length;
    probe('CUY-PADRE-1 no ve usuarios de otros clubes', otrosClubes === 0,
      { critico: true, detalle: `ve ${otrosClubes} usuarios de clubes ajenos` });

    // atletas NLB por id directo: nada
    if (ref.atletaNLBId) {
      const { data: atDir } = await cli.from('atletas').select('id').eq('id', ref.atletaNLBId);
      probe('CUY-PADRE-1 no puede leer un atleta NLB por id directo', (atDir || []).length === 0,
        { critico: true, detalle: `ve ${(atDir || []).length} filas` });
    }

    await cli.auth.signOut();
  }

  // ===== d) ANON sin sesión: nada directo =====
  console.log('\n== (d) ANON sin sesión ==');
  {
    const cli = anon();
    const tablas = ['usuarios', 'atletas', 'pagos', 'grupos_entrenamiento', 'atleta_grupo', 'comunicaciones', 'club_config'];
    for (const t of tablas) {
      const { data, error } = await cli.from(t).select('*').limit(1);
      const bloqueado = (!!error) || ((data || []).length === 0);
      probe(`ANON no lee ${t} directamente`, bloqueado,
        { critico: true, detalle: `err=${error?.code || 'ninguno'} filas=${(data || []).length}` });
    }
    // La RPC de login pública SÍ debe funcionar (no es una fuga: solo traduce cédula→email)
    const { data: email } = await cli.rpc('resolver_email_login', { p_identificador: 'NLB-ATLETA-1' });
    probe('ANON sí resuelve email de login (RPC pública, esperado)',
      typeof email === 'string' && email.includes('@'),
      { detalle: `email=${JSON.stringify(email)}` });
  }

  // ===== resumen =====
  const total = probes.length;
  const pasan = probes.filter(p => p.pasa).length;
  const fallosCriticos = probes.filter(p => !p.pasa && p.critico);
  const fallosMenores = probes.filter(p => !p.pasa && !p.critico);
  console.log('\n================ RESUMEN ================');
  console.log(`probes_total=${total} probes_pasan=${pasan} fallan=${total - pasan}`);
  if (fallosCriticos.length) {
    console.log('\n!! FALLOS CRITICOS (fuga cross-club):');
    for (const f of fallosCriticos) console.log(`   - ${f.nombre} :: ${f.detalle}`);
  }
  if (fallosMenores.length) {
    console.log('\n! Fallos menores:');
    for (const f of fallosMenores) console.log(`   - ${f.nombre} :: ${f.detalle}`);
  }
  // Salida JSON para el reporte automático
  console.log('\nJSON_RESULT=' + JSON.stringify({
    total, pasan, fallan: total - pasan,
    criticos: fallosCriticos.map(f => ({ nombre: f.nombre, detalle: f.detalle })),
    menores: fallosMenores.map(f => ({ nombre: f.nombre, detalle: f.detalle })),
  }));
}

main().catch((e) => { console.error('ERROR FATAL', e); process.exit(1); });
