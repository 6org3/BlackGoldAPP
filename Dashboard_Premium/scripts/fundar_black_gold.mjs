// Funda el club REAL 'Black Gold' desde cero, sobre la base que dejó
// `purgar_pre_produccion.mjs`. A diferencia de sembrar_club_demostracion.mjs
// (pensado para que alguien de fuera vea una demo creíble) o de la suite
// validar_rls_por_rol.js (cuentas QA_RLS_ desechables), esto crea las
// PRIMERAS cuentas de PRODUCCIÓN reales del club: dueño, superadmin de
// plataforma, grupos y catálogo de servicios. Tres diferencias deliberadas
// con esos dos, justo las opuestas a las de la demo:
//
//   1. La contraseña es aleatoria e IRRECUPERABLE (no una frase para dictar
//      por teléfono): se genera con crypto.randomBytes, se muestra una vez y
//      se escribe a un archivo local. Si se pierde, no hay forma de leerla de
//      vuelta — solo de resetearla.
//   2. `app_metadata.debe_cambiar_password: true` — SÍ se marca (al revés que
//      la demo, que lo deja en false a propósito para no interrumpir una
//      presentación). Es producción: la primera vez que el dueño entra, la
//      app lo manda a elegir su propia contraseña (AuthContext.jsx lee este
//      mismo flag).
//   3. Si una cuenta YA EXISTE (misma cédula), este script NO le toca la
//      contraseña. La demo la reescribe en cada corrida a propósito (para
//      poder dictarla de nuevo); aquí sería resetear el acceso de una cuenta
//      real sin que nadie lo pidiera. Reejecutar el script es seguro: reporta
//      "ya existe" y sigue, no la reemplaza.
//
// El archivo de credenciales (`credenciales_black_gold.json`, junto a este
// script) sigue el mismo patrón que `credenciales_club_demo.json`
// (sembrar_club_demostracion.mjs): el comentario de cabecera de ESE script
// documenta que el patrón `credenciales*.json` está cubierto por el
// .gitignore de la raíz del repo — no se pudo verificar el archivo
// `.gitignore` en sí en este checkout parcial, pero el patrón es el mismo
// nombre de archivo que ya usa el resto de scripts/, así que hereda esa
// cobertura. El repositorio es público: ninguna contraseña de producción
// puede versionarse.
//
// DRY-RUN por defecto. Para escribir:
//   FUNDAR_REAL=1 node fundar_black_gold.mjs
//
// Config: lee ./fundacion_black_gold.config.json (junto a este script). Si el
// archivo tiene algún placeholder "<REEMPLAZAR...>" sin rellenar, aborta con
// un mensaje que lista exactamente cuáles.
//
// Idempotente: una cuenta o el club_config que ya exista se reporta y no se
// duplica ni se sobreescribe (ver diferencia #3 arriba). Los grupos y
// servicios se buscan por su clave natural (club+nombre) antes de insertar.
//
// Orden de creación (cada paso depende del anterior):
//   club_config → superadmin (club 'Global') → owner(s) (club Black Gold,
//   creado_por sellado) → grupos_entrenamiento → catalogo_servicios.
// club_config no depende de que exista ningún usuario todavía (`club` es
// texto denormalizado en todo el esquema, sin FK — ver v51 §1), así que
// puede ir primero sin problema.

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !serviceKey) {
  console.error('❌ Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const REAL = process.env.FUNDAR_REAL === '1';

// La ruta del config es sobreescribible porque Black Gold no es UN club: son
// varias sedes (Lago Agrio, El Coca, Sacha, Loreto) y cada una se funda por
// separado, con su propio dueño. No es una decisión de estilo — la impone el
// esquema: `listar_clubes_publicos()` (v33) solo devuelve clubes con un owner
// ACTIVO, y una misma persona no puede cubrir las cuatro sedes porque cédula,
// correo y teléfono son UNIQUE en toda la plataforma y `usuarios.club` guarda
// un solo club por cuenta.
//
//   FUNDAR_CONFIG=scripts/fundacion/lago_agrio.json node scripts/fundar_black_gold.mjs
//
// Sin la variable se comporta igual que siempre. El archivo de credenciales
// lleva el nombre de la sede para que dos fundaciones no se pisen el suyo —
// cada una reparte contraseñas distintas y solo se muestran una vez.
const ARCHIVO_CONFIG = process.env.FUNDAR_CONFIG
  ? path.resolve(process.env.FUNDAR_CONFIG)
  : path.join(__dirname, 'fundacion_black_gold.config.json');
const SUFIJO_SEDE = process.env.FUNDAR_CONFIG
  ? `_${path.basename(ARCHIVO_CONFIG, '.json')}`
  : '';
const ARCHIVO_CREDENCIALES = path.join(__dirname, `credenciales_black_gold${SUFIJO_SEDE}.json`);
const PLACEHOLDER = '<REEMPLAZAR';

// ===================================================================
// 1. Config
// ===================================================================
if (!fs.existsSync(ARCHIVO_CONFIG)) {
  console.error(`❌ No existe ${ARCHIVO_CONFIG}.`);
  console.error('   Copia la plantilla que trae este repo (fundacion_black_gold.config.json) y rellena los placeholders.');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(ARCHIVO_CONFIG, 'utf8'));

// Busca placeholders sin rellenar en TODO el árbol, salvo owner_secundario
// cuando viene con activo:false — ese bloque puede quedarse con la plantilla
// puesta, porque no se va a usar.
function buscarPlaceholders(valor, ruta, hallazgos) {
  if (typeof valor === 'string') {
    if (valor.startsWith(PLACEHOLDER)) hallazgos.push(ruta);
    return;
  }
  if (Array.isArray(valor)) {
    valor.forEach((v, i) => buscarPlaceholders(v, `${ruta}[${i}]`, hallazgos));
    return;
  }
  if (valor && typeof valor === 'object') {
    for (const [k, v] of Object.entries(valor)) {
      if (k.startsWith('_comentario')) continue;
      buscarPlaceholders(v, ruta ? `${ruta}.${k}` : k, hallazgos);
    }
  }
}
const configParaValidar = { ...config };
if (!config.owner_secundario?.activo) delete configParaValidar.owner_secundario;
const hallazgos = [];
buscarPlaceholders(configParaValidar, '', hallazgos);
if (hallazgos.length) {
  console.error(`❌ La configuración todavía tiene ${hallazgos.length} placeholder(s) sin rellenar:`);
  for (const h of hallazgos) console.error(`   - ${h}`);
  // Nombra el archivo que se está leyendo de verdad: con cuatro sedes, decir
  // siempre "fundacion_black_gold.config.json" mandaba a editar el equivocado.
  console.error(`\n   Edita ${path.relative(process.cwd(), ARCHIVO_CONFIG)} y vuelve a correr el script.`);
  process.exit(1);
}

const CLUB = config.club;

// ===================================================================
// 2. Utilidades
// ===================================================================

// 22 caracteres de un alfabeto base64url — muy por encima del mínimo de 12
// de passwordPolicy, y a propósito NO pensada para dictarse por teléfono
// (ver diferencia #1 en la cabecera): esto es producción, no una demo.
const generarPasswordSegura = () => randomBytes(16).toString('base64url');

const buscarAuthPorEmail = async (email) => {
  const encontrados = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    encontrados.push(...data.users.filter((u) => u.email?.toLowerCase() === email.toLowerCase()));
    if (data.users.length < 1000) break;
  }
  return encontrados;
};

// Crea (o detecta) una cuenta de STAFF (superadmin/owner): fila `usuarios` +
// cuenta de Auth + vínculo auth_user_id. El trigger de v24 solo auto-vincula
// atletas/representantes por correo o cédula sintética — al staff hay que
// vincularlo a mano, igual que upsertPersona() en sembrar_club_demostracion.mjs.
async function crearCuentaStaff({ cedula, nombre, rol, club, correo, telefono }) {
  const { data: ya } = await db.from('usuarios').select('id, correo, auth_user_id').eq('cedula', cedula).maybeSingle();
  if (ya) {
    console.log(`  ⏭️  ${rol.padEnd(11)} ${nombre} (cédula ${cedula}) ya existe — no se toca su contraseña.`);
    return { id: ya.id, correo: ya.correo, password: null, creada: false };
  }

  if (!REAL) {
    console.log(`  · ${rol.padEnd(11)} ${nombre.padEnd(28)} cédula ${cedula}  club "${club}"  [se crearía]`);
    return { id: null, correo, password: null, creada: false };
  }

  const password = generarPasswordSegura();
  // Producción: SÍ se marca debe_cambiar_password (diferencia #2, cabecera).
  const appMetadata = { debe_cambiar_password: true, fundacion_black_gold: true };

  let authId;
  const { data: au, error: eAuth } = await db.auth.admin.createUser({
    email: correo, password, email_confirm: true,
    user_metadata: { fundacion: true }, app_metadata: appMetadata,
  });
  if (!eAuth && au?.user) {
    authId = au.user.id;
  } else {
    // Mismo camino de rescate que sembrar_club_demostracion.mjs: una base
    // reseteada a medias puede dejar la cuenta de Auth viva sin su fila.
    const candidatos = await buscarAuthPorEmail(correo);
    if (candidatos.length === 1) {
      authId = candidatos[0].id;
      await db.auth.admin.updateUserById(authId, { password, email_confirm: true, app_metadata: appMetadata });
      console.log(`  🔗 ${cedula}: re-vinculado a una cuenta de Auth que ya existía para ${correo}.`);
    } else {
      throw new Error(`auth ${cedula} (${correo}): ${eAuth?.message || 'sin user'} y ${candidatos.length} candidatos`);
    }
  }

  const { data: fila, error: eIns } = await db.from('usuarios').insert({
    cedula, nombre, rol, club, correo, telefono, auth_user_id: authId,
  }).select('id').single();
  if (eIns) throw new Error(`usuarios ${cedula}: ${eIns.message}`);

  console.log(`  ✅ ${rol.padEnd(11)} ${nombre.padEnd(28)} cédula ${cedula}  club "${club}"`);
  return { id: fila.id, correo, password, creada: true };
}

// ===================================================================
// 3. Fundación
// ===================================================================
async function fundar() {
  console.log(`=== Fundación de "${CLUB}" — modo ${REAL ? '🚀 REAL (escribe)' : '🔍 DRY-RUN'} ===\n`);

  // ── 1. club_config ──────────────────────────────────────────────
  console.log('── 1. Configuración de cobros (club_config) ──');
  const cfg = config.cuenta_bancaria;
  const { data: yaCfg } = await db.from('club_config').select('club').eq('club', CLUB).maybeSingle();
  if (yaCfg) {
    console.log(`  ⏭️  club_config para "${CLUB}" ya existe — no se toca.`);
  } else if (!REAL) {
    console.log(`  · club_config se crearía: whatsapp ${cfg.whatsapp_club}, vencimiento día ${cfg.dia_vencimiento}, descuento hermanos ${cfg.descuento_hermanos_pct}%`);
  } else {
    const { error } = await db.from('club_config').insert({
      club: CLUB,
      whatsapp_club: cfg.whatsapp_club,
      cuenta_bancaria_texto: cfg.cuenta_bancaria_texto,
      dia_vencimiento: cfg.dia_vencimiento,
      descuento_hermanos_pct: cfg.descuento_hermanos_pct,
    });
    if (error) throw new Error(`club_config: ${error.message}`);
    console.log(`  ✅ club_config creada para "${CLUB}".`);
  }

  // ── 2. Superadmin de plataforma (club 'Global') ─────────────────
  console.log('\n── 2. Superadmin de plataforma ──');
  const sa = config.superadmin_plataforma;
  const superadmin = await crearCuentaStaff({
    cedula: sa.cedula, nombre: sa.nombre, rol: 'superadmin', club: 'Global',
    correo: sa.correo, telefono: sa.telefono,
  });

  // ── 3. Owner(s) ──────────────────────────────────────────────────
  console.log('\n── 3. Dueño(s) de Black Gold ──');
  const oo = config.owner_original;
  const ownerOriginal = await crearCuentaStaff({
    cedula: oo.cedula, nombre: oo.nombre, rol: 'owner', club: CLUB,
    correo: oo.correo, telefono: oo.telefono,
  });

  let ownerSecundario = null;
  if (config.owner_secundario?.activo) {
    const os = config.owner_secundario;
    ownerSecundario = await crearCuentaStaff({
      cedula: os.cedula, nombre: os.nombre, rol: 'owner', club: CLUB,
      correo: os.correo, telefono: os.telefono,
    });
    // Sellado explícito (ver cabecera, diferencia con owner_original): sin
    // sesión de usuario el trigger sellar_creado_por deja creado_por en NULL
    // para CUALQUIER insert de este script — hay que decirle a propósito que
    // este owner fue invitado por el original, o la RLS de v36 lo trataría
    // como un segundo "dueño original" independiente.
    if (REAL && ownerSecundario.creada && ownerOriginal.id) {
      const { error } = await db.from('usuarios').update({ creado_por: ownerOriginal.id }).eq('id', ownerSecundario.id);
      if (error) throw new Error(`sellar creado_por de ${os.cedula}: ${error.message}`);
      console.log(`  🔏 ${os.nombre}: sellado como co-dueño invitado por ${oo.nombre} (creado_por).`);
    } else if (!REAL) {
      console.log(`  · [dry] se sellaría creado_por de "${os.nombre}" = id de "${oo.nombre}"`);
    }
  } else {
    console.log('  (owner_secundario.activo = false — no se crea)');
  }

  // ── 4. Grupos de entrenamiento ────────────────────────────────────
  console.log('\n── 4. Grupos de entrenamiento ──');
  for (const g of config.grupos_entrenamiento) {
    const { data: ya } = await db.from('grupos_entrenamiento').select('id').eq('club', CLUB).eq('nombre', g.nombre).maybeSingle();
    if (ya) {
      console.log(`  ⏭️  "${g.nombre}" ya existe en "${CLUB}" — no se toca.`);
      continue;
    }
    if (!REAL) {
      console.log(`  · ${g.nombre.padEnd(24)} ${g.horario}  ${g.precio_mensual != null ? `$${g.precio_mensual}/mes` : '(sin precio_mensual)'}`);
      continue;
    }
    const { data, error } = await db.from('grupos_entrenamiento').insert({
      nombre: g.nombre, horario: g.horario, club: CLUB,
      descripcion: `${g.categoria} — ${CLUB}`,
      dias_semana: g.dias_semana ?? null,
      hora_inicio: g.hora_inicio ?? null, hora_fin: g.hora_fin ?? null,
      precio_mensual: g.precio_mensual ?? null,
      precio_sesion_ind: g.precio_sesion_ind ?? null,
    }).select('id').single();
    if (error) throw new Error(`grupos_entrenamiento ${g.nombre}: ${error.message}`);
    console.log(`  ✅ ${g.nombre} creado.`);
  }
  if (!config.grupos_entrenamiento.some((g) => g.precio_mensual != null)) {
    console.log('  ⚠️  Ningún grupo tiene precio_mensual: generar_pagos_mes (v42) NO facturará');
    console.log('     mensualidad automática a nadie hasta que se le ponga precio a un grupo,');
    console.log('     o el club decida cobrar solo por el catálogo de servicios (paso 5).');
  }

  // ── 5. Catálogo de servicios ──────────────────────────────────────
  console.log('\n── 5. Catálogo de servicios ──');
  for (const s of config.servicios) {
    const { data: ya } = await db.from('catalogo_servicios').select('id').eq('club', CLUB).eq('nombre', s.nombre).maybeSingle();
    if (ya) {
      console.log(`  ⏭️  servicio "${s.nombre}" ya existe en "${CLUB}" — no se toca.`);
      continue;
    }
    if (!REAL) {
      console.log(`  · ${s.nombre.padEnd(20)} $${s.precio_base} (${s.recurrencia})`);
      continue;
    }
    const { error } = await db.from('catalogo_servicios').insert({
      club: CLUB, nombre: s.nombre, descripcion: s.descripcion ?? null,
      recurrencia: s.recurrencia, precio_base: s.precio_base,
    });
    if (error) throw new Error(`catalogo_servicios ${s.nombre}: ${error.message}`);
    console.log(`  ✅ servicio "${s.nombre}" creado.`);
  }
  // servicio_tarifas (reglas de precio por grupo/categoría/género) no se
  // crea por defecto: precio_base ya resuelve el caso general (ver
  // precio_servicio_atleta, v27). Es un módulo aparte para cuando el club
  // quiera precios distintos por grupo o categoría FEB — no hace falta una
  // fila "vacía" (todas las dimensiones NULL) que no aportaría nada sobre lo
  // que precio_base ya cubre.

  if (!REAL) {
    console.log('\n🔍 DRY-RUN: no se escribió nada.');
    console.log('   Para ejecutar de verdad:');
    console.log('   FUNDAR_REAL=1 node fundar_black_gold.mjs');
    return null;
  }

  return { superadmin: { ...superadmin, correo: sa.correo, rol: 'superadmin', nombre: sa.nombre, cedula: sa.cedula },
           ownerOriginal: { ...ownerOriginal, correo: oo.correo, rol: 'owner', nombre: oo.nombre, cedula: oo.cedula },
           ownerSecundario: ownerSecundario && { ...ownerSecundario, correo: config.owner_secundario.correo, rol: 'owner (co-dueño)', nombre: config.owner_secundario.nombre, cedula: config.owner_secundario.cedula } };
}

// ===================================================================
// 4. Verificación — el checklist que pidió el dueño, ejecutado de verdad
//    cuando se pueda (no solo impreso como una lista de buenas intenciones).
// ===================================================================
async function verificar(cuentas) {
  console.log('\n=== Verificación ===');

  // 1) El club aparece en el selector público de registro.
  const anon = anonKey ? createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
  if (anon) {
    const { data, error } = await anon.rpc('listar_clubes_publicos');
    const aparece = !error && (data ?? []).some((r) => r.club === CLUB);
    console.log(`  ${aparece ? '✅' : '❌'} "${CLUB}" aparece en listar_clubes_publicos (requiere un owner con estado='activo')`);
    console.log(`  ${aparece ? '✅' : 'ℹ️ '} Con eso, el formulario de registro público ya puede ofrecer "${CLUB}" a una familia nueva.`);
  } else {
    console.log('  ⚠️  Sin VITE_SUPABASE_ANON_KEY no se pudo probar listar_clubes_publicos como lo hace la app.');
  }

  // 2) Login real del dueño (y del superadmin), igual que hace
  //    validar_rls_por_rol.js: signInWithPassword + resolver el perfil por
  //    auth_user_id, no solo "el signIn no dio error".
  if (!anon) return;
  for (const c of [cuentas.superadmin, cuentas.ownerOriginal, cuentas.ownerSecundario].filter(Boolean)) {
    if (!c.password) {
      console.log(`  ℹ️  ${c.rol.padEnd(16)} ${c.nombre}: cuenta ya existía, no se generó contraseña nueva — login no verificable desde este script.`);
      continue;
    }
    const cli = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    try {
      const { data: email } = await cli.rpc('resolver_email_login', { p_identificador: c.cedula });
      const { data: sesion, error: eAuth } = await cli.auth.signInWithPassword({ email: email || c.correo, password: c.password });
      if (eAuth || !sesion?.user) throw new Error(eAuth?.message || 'sin sesión');
      const { data: perfil, error: ePerfil } = await cli.from('usuarios').select('id, rol, club').eq('auth_user_id', sesion.user.id).maybeSingle();
      if (ePerfil) throw new Error(ePerfil.message);
      if (!perfil) throw new Error('autentica pero sin perfil vinculado (auth_user_id sin escribir)');
      console.log(`  ✅ login de ${c.rol.padEnd(16)} ${c.nombre} → ${perfil.rol} en "${perfil.club}"`);
      await cli.auth.signOut();
    } catch (e) {
      console.log(`  ❌ login de ${c.rol.padEnd(16)} ${c.nombre} → ${e.message}`);
    }
  }
}

// ===================================================================

const resultado = await fundar().catch((e) => { console.error(`\n❌ ${e.message}`); process.exit(1); });
if (!resultado) process.exit(0);

await verificar(resultado);

const cuentasParaArchivo = [resultado.superadmin, resultado.ownerOriginal, resultado.ownerSecundario]
  .filter(Boolean)
  .map(({ rol, nombre, cedula, correo, password, creada }) => ({
    rol, nombre, cedula, correo,
    password: creada ? password : '(cuenta ya existía — sin cambios)',
  }));

fs.writeFileSync(ARCHIVO_CREDENCIALES, `${JSON.stringify({
  club: CLUB,
  generado: new Date().toISOString(),
  aviso: 'Archivo LOCAL de PRODUCCIÓN. El repositorio es público: no versionar ni pegar estas claves en ningún sitio compartido. Cada cuenta nace con debe_cambiar_password=true: en el primer login la app pide elegir una contraseña propia, así que esta no hace falta guardarla más allá de entregarla una vez.',
  como_entrar: 'En la pantalla de ingreso, el campo de usuario acepta la cédula, el correo o el teléfono.',
  cuentas: cuentasParaArchivo,
}, null, 2)}\n`, 'utf8');

console.log(`\n=== "${CLUB}" fundado ===`);
console.table(cuentasParaArchivo.map(({ rol, nombre, cedula, password }) => ({ rol, nombre, cedula, password })));
console.log(`Credenciales guardadas en ${path.basename(ARCHIVO_CREDENCIALES)} (cubierto por credenciales*.json en .gitignore).`);
console.log('\nChecklist:');
console.log('  [ ] El dueño puede iniciar sesión (verificado arriba si se pudo probar) y cambia su contraseña.');
console.log(`  [ ] "${CLUB}" aparece en el selector de clubes del registro público (verificado arriba).`);
console.log('  [ ] Una familia de prueba puede registrarse eligiendo Black Gold y queda "pendiente" hasta que el dueño la apruebe.');
