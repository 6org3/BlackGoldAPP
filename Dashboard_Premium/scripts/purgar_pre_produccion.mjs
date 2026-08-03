// Purga TOTAL de la base pre-producción: hoy (1 ago 2026) el proyecto entero
// es sintético — 38.103 filas, 9 clubes falsos, 895 usuarios, 111 cuentas de
// Auth (104 con correo sintético @sinacceso.blackgoldapp.internal, el resto
// de suites QA) — y el 9-10 de agosto se cargan los datos reales del club
// 'Black Gold'. Este script deja la base en cero (usuarios, atletas, clubes,
// pagos, todo) SIN tocar los catálogos globales del producto, para que
// `fundar_black_gold.mjs` arranque sobre una base limpia.
//
// GUARDARRAÍLES (mismo espíritu que scripts/limpiar_base_datos.js, con un
// matiz importante):
//   · DRY-RUN POR DEFECTO. Sin `PURGA_REAL=1` este script solo CUENTA y
//     muestra, tabla por tabla, lo que borraría. No escribe nada.
//   · ANCLA ANTI-ACCIDENTE, DE SENTIDO INVERTIDO. En limpiar_base_datos.js el
//     ancla (`LIMPIAR_STAGING_URL`) existe para evitar tocar producción POR
//     ACCIDENTE: si la URL no coincide, aborta. Aquí la purga es A PROPÓSITO
//     contra el proyecto real (no hay "staging" que purgar: la base sintética
//     ES la base de producción, todavía sin datos reales). Por eso el ancla
//     se llama `PURGA_URL` y no protege contra pisar el proyecto equivocado
//     en el sentido de "URL rara = para", sino que exige a quien ejecuta
//     ESCRIBIR A MANO la URL del proyecto que va a vaciar. Es una confirmación
//     consciente, no una red de seguridad pasiva: si alguien copia/pega
//     `PURGA_REAL=1` de un mensaje sin mirar qué URL puso, el script para
//     igual (falta PURGA_URL o no coincide), pero el propósito ya no es
//     "¿es esta la base equivocada?" sino "¿de verdad quisiste escribir la
//     URL del proyecto que estás a punto de vaciar?".
//   · SERVICE ROLE, no anon key. A diferencia de limpiar_base_datos.js (que
//     usa la anon key a propósito, como red de seguridad pasiva: con RLS v24
//     esos DELETE no pasan), este script SÍ necesita la service_role key —
//     hay que poder borrar filas de cualquier club, objetos de Storage y
//     cuentas de Auth, todo lo cual la RLS y la Admin API restringen a
//     service_role. Sin el ancla PURGA_URL, esa misma llave es lo que
//     convertiría un descuido en un desastre total; con ella, es una
//     ejecución deliberada.
//
// ALCANCE — a diferencia de limpiar_simulacion_club_demo.mjs (que borra UN
// club por nombre para no tocar el resto de la base), este script NO filtra
// por club: se purga TODO. Hoy eso es seguro porque TODO en esta base es
// sintético (9 clubes falsos, incluido 'Global', cuyos 2 superadmin también
// son de prueba). El día que exista una segunda organización real conviviendo
// con Black Gold, este script deja de tener sentido tal cual está escrito —
// habría que volver al patrón de limpiar_simulacion_club_demo.mjs (borrado
// por club) en vez de "borrar todo menos los catálogos".
//
// QUÉ SE CONSERVA — catálogos GLOBALES del producto, ninguno de los cuales
// cuelga de un club:
//   · misiones            — sin columna de club (verificado en el baseline).
//   · ejercicios_catalogo — sin columna de club.
//   · catalogo_ejercicios — SÍ tiene club_id, pero es nullable y v24 (RLS)
//     documenta el criterio exacto: "visibles las globales (club_id NULL) y
//     las del propio club". Se conservan solo las filas con club_id IS NULL;
//     las de club_id IS NOT NULL son datos de un club falso y se purgan.
//   · catalogo_sesiones   — mismo patrón que catalogo_ejercicios (mismo
//     comentario en v24: "mismo patrón").
//   · encuestas_habitos NO ES UN CATÁLOGO. Se investigó el esquema: es la
//     respuesta semanal de CADA atleta (atleta_id FK, ON DELETE CASCADE desde
//     atletas), tan de un club como `asistencia` o `atleta_readiness`. No
//     hay nada global que conservar ahí — se purga entera con las cascadas
//     de atletas.
//
// `misiones.created_by` y `catalogo_ejercicios/catalogo_sesiones.creado_por`
// (las filas globales) son FK a usuarios(id) SIN "ON DELETE" — es decir,
// RESTRICT: bloquean el borrado de un usuario mientras algo lo referencie ahí.
// (`autor_id` en esas mismas tablas SÍ es ON DELETE SET NULL — no hace falta
// tocarlo.) Como se purgan TODOS los usuarios, cualquier catálogo conservado
// que apunte a alguno de ellos rompería el borrado de usuarios si no se
// desvincula antes. Este script pone esas columnas en NULL antes de tocar
// `usuarios` — el catálogo se conserva íntegro, solo pierde el rastro de
// "quién lo creó" cuando ese alguien era una cuenta de prueba.
//
// ORDEN DE BORRADO — hijas antes que padres. La mayoría de las tablas de este
// esquema SÍ tienen ON DELETE CASCADE colgando de `atletas`/`usuarios`, pero
// varias NO (se verificaron una a una contra el baseline + migraciones):
//   · sesiones_control: atleta_id/coach_id/grupo_id, los tres SIN cascada.
//   · comunicaciones: autor_id/atleta_id/grupo_id SIN cascada (evento_id sí
//     tiene ON DELETE SET NULL).
//   · comunicacion_destinatarios.usuario_id SIN cascada (comunicacion_id sí).
//   · pago_transacciones.comprobante_id SIN cascada → transacciones antes que
//     comprobantes.
//   · progreso_misiones.evaluacion_id SIN cascada → progreso antes que
//     evaluaciones_pruebas.
//   · atletas.grupo_id y servicio_tarifas.grupo_id SIN cascada → atletas y
//     servicio_tarifas antes que grupos_entrenamiento.
// Por eso este script NO confía en que borrar `usuarios` arrastre todo por
// cascada (como sí hacía limpiar_base_datos.js con su lista corta): cada
// tabla se vacía explícitamente, en el orden que el resto de este archivo
// documenta paso a paso. Es el mismo criterio de
// limpiar_simulacion_club_demo.mjs, aplicado a la base entera en vez de a
// un solo club.
//
// IDEMPOTENTE: cada paso es "borra TODO lo que quede en esta tabla" (o
// "pone en NULL lo que quede sin desvincular"), así que correrlo dos veces
// no rompe — la segunda vez, cada paso encuentra 0 filas.
//
// Uso:
//   node purgar_pre_produccion.mjs                                    (dry-run)
//   PURGA_REAL=1 PURGA_URL=https://xxxx.supabase.co node purgar_pre_produccion.mjs
//
// Variables opcionales:
//   PRESERVAR_AUTH_EMAILS="a@x.com,b@y.com"  → esas cuentas de Auth NO se
//     borran. OJO: esto protege SOLO la cuenta de Auth (el login). La fila
//     `usuarios` asociada se purga igual (este script no distingue "cuentas
//     de prueba" de "cuentas reales" en las tablas — hoy TODO en `usuarios`
//     es de prueba, `Global` incluido). Si el dueño preserva un correo aquí,
//     esa cuenta de Auth sobrevive sin perfil vinculado hasta que alguien
//     (p.ej. `fundar_black_gold.mjs`) le cree una fila `usuarios` de nuevo.

import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error('❌ Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const REAL = process.env.PURGA_REAL === '1';
const PURGA_URL = process.env.PURGA_URL;

if (REAL && (!PURGA_URL || PURGA_URL !== supabaseUrl)) {
  console.error('❌ PURGA_REAL=1 pero PURGA_URL no coincide con VITE_SUPABASE_URL.');
  console.error(`   VITE_SUPABASE_URL = ${supabaseUrl}`);
  console.error(`   PURGA_URL         = ${PURGA_URL || '(sin definir)'}`);
  console.error('   Este ancla no es "¿estamos en el proyecto equivocado?" — es una');
  console.error('   confirmación consciente: escribe a mano la URL del proyecto que');
  console.error('   SÍ vas a vaciar por completo (usuarios, atletas, clubes, pagos, Auth).');
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const PRESERVAR_AUTH = new Set(
  (process.env.PRESERVAR_AUTH_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
);

const UUID_NULO = '00000000-0000-0000-0000-000000000000';

// ===================================================================
// PASOS de tabla: hijas → padres. Cada uno es "borra TODO lo que quede".
// `col` es una columna NOT NULL de esa tabla (PK simple o parte de una PK
// compuesta): `.not(col, 'is', null)` iguala a "todas las filas, sin
// excepción" para cualquier tipo (uuid o texto), a diferencia del truco
// `.neq(id, '000...')` de limpiar_base_datos.js, que solo sirve para uuid.
// ===================================================================
const PASOS = [
  ['recompensas_desbloqueadas', 'recompensas desbloqueadas', 'id'],
  // Antes que evaluaciones_pruebas: progreso_misiones.evaluacion_id no tiene
  // ON DELETE CASCADE (RESTRICT), así que un progreso vivo bloquearía borrar
  // la evaluación que referencia.
  ['progreso_misiones', 'misiones asignadas a atletas (progreso_misiones)', 'id'],
  ['xp_eventos', 'eventos de XP', 'id'],
  ['evento_convocados', 'convocatorias a eventos', 'id'],
  ['evento_recordatorios', 'recordatorios de eventos', 'id'],
  ['evaluaciones_pruebas', 'pruebas de evaluación registradas', 'id'],
  ['asistencia', 'registros de asistencia', 'id'],
  ['sesiones_entrenamiento', 'sesiones de entrenamiento (legacy)', 'id'],
  ['sesiones_programadas', 'sesiones programadas', 'id'],
  // Sin NINGÚN ON DELETE CASCADE (atleta_id/coach_id/grupo_id son RESTRICT):
  // si esto no se vacía explícito, bloquea atletas, usuarios Y grupos.
  ['sesiones_control', 'sesiones de la agenda (sesiones_control)', 'id'],
  ['notas_coach', 'notas de coach', 'id'],
  ['observaciones_cancha', 'observaciones de Modo Cancha', 'id'],
  ['screening_funcional', 'screenings funcionales', 'id'],
  // NO es catálogo (ver nota de cabecera): respuestas semanales por atleta.
  ['encuestas_habitos', 'encuestas de hábitos', 'id'],
  ['atleta_readiness', 'check-ins de bienestar (readiness)', 'id'],
  // Colateral: no está en el alcance que pidió el dueño (no cuelga de ningún
  // club), pero sus miembros sí cuelgan de atletas — se vacía por higiene,
  // sin tocar la tabla padre `grupos_mision` (fuera de alcance, ver informe).
  ['grupos_mision_miembros', 'miembros de grupos de misión', 'grupo_id'],
  // Antes que pago_comprobantes: pago_transacciones.comprobante_id es RESTRICT.
  ['pago_transacciones', 'transacciones de pago (abonos)', 'id'],
  ['pago_comprobantes', 'comprobantes de transferencia', 'id'],
  ['pagos_auditoria', 'auditoría de pagos', 'id'],
  ['pagos', 'cargos (pagos)', 'id'],
  ['atleta_grupo', 'membresías atleta-grupo', 'atleta_id'],
  ['padres_atletas', 'vínculos padre-atleta', 'padre_id'],
  ['comunicacion_destinatarios', 'destinatarios de comunicaciones', 'comunicacion_id'],
  ['comunicaciones', 'comunicaciones', 'id'],
  ['eventos', 'eventos', 'id'],
  // Después de TODO lo anterior (nada debe seguir referenciando un atleta) y
  // antes de grupos_entrenamiento (atletas.grupo_id es RESTRICT).
  ['atletas', 'fichas de atleta', 'id'],
  // Antes que grupos_entrenamiento (servicio_tarifas.grupo_id es RESTRICT).
  ['servicio_tarifas', 'tarifas de servicios por club', 'id'],
  // catalogo_servicios / servicio_tarifas SIEMPRE cuelgan de un club (tienen
  // columna `club` obligatoria) — a diferencia de catalogo_ejercicios y
  // catalogo_sesiones, aquí no hay nada "global" que proteger: se purgan
  // enteros. El club real fundará los suyos desde cero.
  ['catalogo_servicios', 'catálogo de servicios por club', 'id'],
  ['club_config', 'configuración de cobros por club', 'club'],
  ['grupos_entrenamiento', 'grupos de entrenamiento', 'id'],
  ['gastos', 'gastos de contabilidad de gestión', 'id'],
  // No está en las migraciones de pgdry/migrations (llegó después, fuera de
  // ese lote) pero SÍ existe en la base real: id, ip, club, exito, created_at.
  // Sin columna de club con la que filtrar catálogos: se purga entera.
  ['registro_intentos', 'intentos de login (rate-limit)', 'id'],
];

async function ejecutarPaso(tabla, etiqueta, col) {
  if (!REAL) {
    const { count, error } = await db.from(tabla).select('*', { count: 'exact', head: true }).not(col, 'is', null);
    if (error) {
      // Una tabla que no existiera aún (p.ej. si esta migración no se aplicó
      // en el proyecto apuntado) no debe tirar todo el dry-run: se reporta y
      // se sigue, igual que limpiar_base_datos.js.
      console.log(`   [?] ${etiqueta}: no se pudo contar (${error.message})`);
      return 0;
    }
    console.log(`   [dry] borraría ${count ?? 0} — ${etiqueta}`);
    return count ?? 0;
  }
  const { error, count } = await db.from(tabla).delete({ count: 'exact' }).not(col, 'is', null);
  if (error) throw new Error(`${tabla} (${etiqueta}): ${error.message}`);
  console.log(`   ✅ ${etiqueta}: ${count ?? '?'} filas borradas`);
  return count ?? 0;
}

// ===================================================================
// Catálogos con filas por club (catalogo_ejercicios, catalogo_sesiones):
// se purga solo club_id IS NOT NULL, y se desvincula creado_por en lo que
// se conserva para no bloquear el borrado de usuarios.
// ===================================================================
async function purgarCatalogoScopeado(tabla, etiqueta) {
  if (!REAL) {
    const { count: nClub } = await db.from(tabla).select('*', { count: 'exact', head: true }).not('club_id', 'is', null);
    const { count: nGlobalConAutor } = await db.from(tabla).select('*', { count: 'exact', head: true })
      .is('club_id', null).not('creado_por', 'is', null);
    console.log(`   [dry] borraría ${nClub ?? 0} filas de club en ${etiqueta} (club_id IS NOT NULL)`);
    console.log(`   [dry] desvincularía creado_por en ${nGlobalConAutor ?? 0} filas GLOBALES de ${etiqueta} (se conservan)`);
    return;
  }
  const { error: e1, count: c1 } = await db.from(tabla).delete({ count: 'exact' }).not('club_id', 'is', null);
  if (e1) throw new Error(`${tabla} (por club): ${e1.message}`);
  console.log(`   ✅ ${etiqueta}: ${c1 ?? '?'} filas de club borradas (conservadas las globales)`);
  const { error: e2, count: c2 } = await db.from(tabla).update({ creado_por: null }, { count: 'exact' })
    .is('club_id', null).not('creado_por', 'is', null);
  if (e2) throw new Error(`${tabla} (desvincular creado_por): ${e2.message}`);
  console.log(`   ✅ ${etiqueta}: creado_por desvinculado en ${c2 ?? '?'} filas globales`);
}

// misiones: catálogo 100% global (sin columna de club) — se conserva ENTERA.
// Solo se desvincula created_by (RESTRICT) de usuarios que van a purgarse.
// autor_id no hace falta: ON DELETE SET NULL ya lo resuelve solo.
async function desvincularMisiones() {
  if (!REAL) {
    const { count } = await db.from('misiones').select('*', { count: 'exact', head: true }).not('created_by', 'is', null);
    console.log(`   [dry] desvincularía created_by en ${count ?? 0} misiones (catálogo, 191 filas, se conserva entero)`);
    return;
  }
  const { error, count } = await db.from('misiones').update({ created_by: null }, { count: 'exact' }).not('created_by', 'is', null);
  if (error) throw new Error(`misiones (desvincular created_by): ${error.message}`);
  console.log(`   ✅ misiones: created_by desvinculado en ${count ?? '?'} filas (catálogo intacto por lo demás)`);
}

// ===================================================================
// Storage: los dos buckets del esquema, listados de forma recursiva. Hoy
// están vacíos (verificado por el dueño), pero el script no lo asume: lista
// y borra si encuentra algo, para que sea seguro re-ejecutarlo en cualquier
// momento futuro.
// ===================================================================
const BUCKETS = ['comprobantes-pagos', 'fotos-atletas'];

async function listarObjetos(bucket, prefijo = '') {
  const { data, error } = await db.storage.from(bucket).list(prefijo, { limit: 1000 });
  if (error) throw new Error(`storage.list(${bucket}/${prefijo}): ${error.message}`);
  const objetos = [];
  for (const entrada of data ?? []) {
    const ruta = prefijo ? `${prefijo}/${entrada.name}` : entrada.name;
    // Un objeto real trae metadata (`id`); una "carpeta" virtual de Storage
    // no la trae — se recorre un nivel más.
    if (entrada.id) objetos.push(ruta);
    else objetos.push(...(await listarObjetos(bucket, ruta)));
  }
  return objetos;
}

async function purgarStorage() {
  for (const bucket of BUCKETS) {
    const objetos = await listarObjetos(bucket).catch((e) => {
      console.log(`   [?] ${bucket}: no se pudo listar (${e.message})`);
      return null;
    });
    if (objetos === null) continue;
    if (!REAL) {
      console.log(`   [dry] borraría ${objetos.length} objetos en el bucket "${bucket}"`);
      continue;
    }
    for (let i = 0; i < objetos.length; i += 100) {
      const lote = objetos.slice(i, i + 100);
      const { error } = await db.storage.from(bucket).remove(lote);
      if (error) throw new Error(`storage.remove(${bucket}): ${error.message}`);
    }
    console.log(`   ✅ ${bucket}: ${objetos.length} objetos borrados`);
  }
}

// ===================================================================
// Auth: las 111 cuentas son de prueba (104 con correo sintético
// @sinacceso.blackgoldapp.internal + las de suites QA). Se borran TODAS
// salvo las que PRESERVAR_AUTH_EMAILS pida explícitamente conservar.
// ===================================================================
async function listarTodosLosUsuariosAuth() {
  const todos = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`auth.admin.listUsers: ${error.message}`);
    todos.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return todos;
}

async function purgarAuth() {
  const todos = await listarTodosLosUsuariosAuth();
  const preservados = todos.filter((u) => PRESERVAR_AUTH.has((u.email || '').toLowerCase()));
  const aBorrar = todos.filter((u) => !PRESERVAR_AUTH.has((u.email || '').toLowerCase()));

  if (preservados.length) {
    console.log(`   ℹ️  ${preservados.length} cuenta(s) preservada(s) por PRESERVAR_AUTH_EMAILS:`);
    for (const u of preservados) console.log(`      - ${u.email}`);
  }

  if (!REAL) {
    console.log(`   [dry] borraría ${aBorrar.length} cuentas de Auth (de ${todos.length} totales)`);
    return;
  }

  let ok = 0;
  const fallos = [];
  for (const u of aBorrar) {
    const { error } = await db.auth.admin.deleteUser(u.id);
    if (error) fallos.push({ email: u.email, error: error.message });
    else ok++;
  }
  console.log(`   ✅ Auth: ${ok}/${aBorrar.length} cuentas borradas`);
  if (fallos.length) {
    console.log(`   ⚠️  ${fallos.length} cuenta(s) de Auth NO se pudieron borrar:`);
    for (const f of fallos) console.log(`      - ${f.email}: ${f.error}`);
  }
}

// ===================================================================
// Re-conteo final: confirma que las tablas de negocio quedaron en 0 y que
// los catálogos globales siguen íntegros.
// ===================================================================
async function estadoPostPurga() {
  console.log('\n=== Estado tras la purga ===');
  const negocio = ['usuarios', 'atletas', 'pagos', 'grupos_entrenamiento', 'club_config', 'catalogo_servicios', 'eventos', 'comunicaciones'];
  for (const t of negocio) {
    const { count } = await db.from(t).select('*', { count: 'exact', head: true });
    console.log(`   ${(count ?? '?').toString().padStart(6)}  ${t}`);
  }
  console.log('   -- catálogos globales (deben seguir intactos) --');
  const { count: nMisiones } = await db.from('misiones').select('*', { count: 'exact', head: true });
  const { count: nEjCat } = await db.from('ejercicios_catalogo').select('*', { count: 'exact', head: true });
  const { count: nCatEjGlobal } = await db.from('catalogo_ejercicios').select('*', { count: 'exact', head: true }).is('club_id', null);
  const { count: nCatEjClub } = await db.from('catalogo_ejercicios').select('*', { count: 'exact', head: true }).not('club_id', 'is', null);
  const { count: nCatSesGlobal } = await db.from('catalogo_sesiones').select('*', { count: 'exact', head: true }).is('club_id', null);
  const { count: nCatSesClub } = await db.from('catalogo_sesiones').select('*', { count: 'exact', head: true }).not('club_id', 'is', null);
  console.log(`   ${(nMisiones ?? '?').toString().padStart(6)}  misiones (catálogo global)`);
  console.log(`   ${(nEjCat ?? '?').toString().padStart(6)}  ejercicios_catalogo (catálogo global)`);
  console.log(`   ${(nCatEjGlobal ?? '?').toString().padStart(6)}  catalogo_ejercicios — globales conservadas (club_id NULL)`);
  console.log(`   ${(nCatEjClub ?? '?').toString().padStart(6)}  catalogo_ejercicios — de club (debería ser 0 tras la purga)`);
  console.log(`   ${(nCatSesGlobal ?? '?').toString().padStart(6)}  catalogo_sesiones — globales conservadas (club_id NULL)`);
  console.log(`   ${(nCatSesClub ?? '?').toString().padStart(6)}  catalogo_sesiones — de club (debería ser 0 tras la purga)`);
  // listUsers no trae un total directo y fiable entre versiones de supabase-js;
  // se re-lista completa (paginada) en vez de confiar en un campo que puede no
  // venir. Tras la purga debería ser un número pequeño (0, o los preservados).
  const restantes = await listarTodosLosUsuariosAuth().catch(() => null);
  if (restantes !== null) console.log(`   ${restantes.length.toString().padStart(6)}  cuentas de Auth restantes`);
}

// ===================================================================

async function purgar() {
  console.log(`=== PURGA PRE-PRODUCCIÓN — modo ${REAL ? '🚀 REAL (escribe/borra)' : '🔍 DRY-RUN'} ===`);
  console.log(`   proyecto: ${supabaseUrl}`);
  if (PRESERVAR_AUTH.size) console.log(`   preservando ${PRESERVAR_AUTH.size} correo(s) de Auth: ${[...PRESERVAR_AUTH].join(', ')}`);
  console.log('');

  let total = 0;
  console.log('── Tablas de negocio (hijas → padres) ──');
  for (const [tabla, etiqueta, col] of PASOS) {
    total += await ejecutarPaso(tabla, etiqueta, col);
  }

  console.log('\n── Catálogos con filas por club (se conserva solo lo global) ──');
  await purgarCatalogoScopeado('catalogo_ejercicios', 'catalogo_ejercicios');
  await purgarCatalogoScopeado('catalogo_sesiones', 'catalogo_sesiones');
  await desvincularMisiones();

  console.log('\n── Storage ──');
  await purgarStorage();

  console.log('\n── Auth ──');
  await purgarAuth();

  if (!REAL) {
    console.log(`\n🔍 DRY-RUN: no se borró nada. TOTAL de filas de tabla que se borrarían: ${total}.`);
    console.log('   Para ejecutar de verdad:');
    console.log('   PURGA_REAL=1 PURGA_URL=<url-del-proyecto> node purgar_pre_produccion.mjs');
    return;
  }

  await estadoPostPurga();
  console.log('\n✅ PURGA COMPLETA. La base está lista para fundar_black_gold.mjs.');
}

purgar().catch((e) => {
  console.error(`\n❌ ${e.message}`);
  process.exit(1);
});
