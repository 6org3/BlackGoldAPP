// Inventario de pre-producción — SOLO LECTURA.
//
// Por qué existe: el 9-10 de agosto se cargan atletas REALES a esta base. Antes
// de eso el dueño necesita saber, con datos y no con memoria, qué hay sembrado
// hoy: cuánto es de las suites de QA (validar_rls_por_rol.js y afines), cuánto
// son clubes DEMO/sintéticos usados para probar el producto, y cuánto podría
// ser ya dato real de alguien. Este script no decide nada de eso — solo cuenta
// y reporta, con la mayor cobertura posible, para que la decisión de qué
// purgar la tome el dueño con la foto completa delante.
//
// PROMESA DE SOLO LECTURA: este archivo no contiene un solo .insert(),
// .update(), .upsert() ni .delete(), ni sobre tablas ni sobre Storage ni sobre
// Auth. Cada llamada es un SELECT (count:exact/head:true), un list() o un
// listUsers(). Si algún día alguien agrega una escritura aquí, ya no es este
// script — que renombre el archivo.
//
// Usa SUPABASE_SERVICE_ROLE_KEY (no el anon key): la meta es ver TODO,
// incluida la data de clubes que la RLS le escondería a cualquier sesión
// normal. Es justo el rol contrario al que este script debería tener en
// producción corriendo desapercibido — aquí se justifica porque es una
// auditoría puntual, manual, antes de la carga real.
//
// Uso: node scripts/inventario_pre_produccion.js   (desde Dashboard_Premium/)
// Requiere en .env.local: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// (nunca commitear ese archivo).

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

const URL_ = process.env.VITE_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SERVICE) {
  console.error('❌ Faltan VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local — sin ellas no hay forma de auditar la base completa (con el anon key la RLS escondería justo lo que hay que inventariar).');
  process.exit(1);
}

const svc = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

// ---------- constantes del dominio ----------

const CLUB_PRINCIPAL = 'Black Gold';

// Clubes sintéticos conocidos de antemano (demos, QA de aislamiento cross-club
// de validar_rls_por_rol.js, etc.). Cualquier OTRO club que aparezca se reporta
// aparte, en la sección D, como descubrimiento.
const CLUBES_SINTETICOS_CONOCIDOS = [
  'DEMO Simulación 1 Año',
  'DEMO QA Compacto',
  'Titanes de Sucumbíos',
  'QA Club Ajeno',
];

// Las 38 tablas de public. Si alguna no existe en este ambiente (proyecto
// distinto, migración no aplicada, nombre que cambió), se reporta como
// AUSENTE y el inventario sigue — no es motivo para romper la corrida.
const TABLAS = [
  'asistencia', 'atleta_grupo', 'atleta_readiness', 'atletas', 'catalogo_ejercicios',
  'catalogo_servicios', 'catalogo_sesiones', 'club_config', 'comunicacion_destinatarios',
  'comunicaciones', 'ejercicios_catalogo', 'encuestas_habitos', 'evaluaciones_pruebas',
  'evento_convocados', 'evento_recordatorios', 'eventos', 'gastos', 'grupos_entrenamiento',
  'grupos_mision', 'grupos_mision_miembros', 'misiones', 'notas_coach', 'observaciones_cancha',
  'padres_atletas', 'pago_comprobantes', 'pago_transacciones', 'pagos', 'pagos_auditoria',
  'progreso_misiones', 'recompensas_desbloqueadas', 'registro_intentos', 'screening_funcional',
  'servicio_tarifas', 'sesiones_control', 'sesiones_entrenamiento', 'sesiones_programadas',
  'usuarios', 'xp_eventos',
];

// ---------- helpers de impresión ----------

const linea = (c = '─', n = 78) => c.repeat(n);
const titulo = (t) => { console.log('\n' + linea('═')); console.log(t); console.log(linea('═')); };
const col = (s, n) => String(s).padEnd(n);
const num = (n, w = 8) => String(n).padStart(w);

// ---------- helpers de lectura, tolerantes a tablas ausentes ----------

// Códigos/mensajes con los que Postgres o PostgREST avisan que una tabla no
// existe. Sin este chequeo, una sola tabla faltante tira todo el script.
function esTablaAusente(error) {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  return error.code === '42P01' || error.code === 'PGRST205'
    || msg.includes('does not exist') || msg.includes('could not find the table');
}

async function contarTabla(tabla) {
  const { count, error } = await svc.from(tabla).select('*', { count: 'exact', head: true });
  if (error) {
    if (esTablaAusente(error)) return { tabla, existe: false, count: null };
    return { tabla, existe: true, count: null, error: error.message };
  }
  return { tabla, existe: true, count: count ?? 0 };
}

async function contarConFiltro(tabla, aplicarFiltro) {
  const q = aplicarFiltro(svc.from(tabla).select('*', { count: 'exact', head: true }));
  const { count, error } = await q;
  if (error) {
    if (esTablaAusente(error)) return { existe: false, count: null };
    return { existe: true, count: null, error: error.message };
  }
  return { existe: true, count: count ?? 0 };
}

// Trae TODAS las filas de una tabla paginando de a 1000 (tope duro habitual de
// PostgREST por página). Se usa solo donde hace falta agrupar en memoria
// (usuarios, atletas) para descubrir clubes de forma robusta — nunca para las
// 38 tablas del inventario, que solo necesitan un conteo.
async function traerTodo(tabla, columnas) {
  const PAGINA = 1000;
  let desde = 0;
  const todas = [];
  while (true) {
    const { data, error } = await svc.from(tabla).select(columnas).range(desde, desde + PAGINA - 1);
    if (error) throw new Error(`traerTodo(${tabla}): ${error.message}`);
    todas.push(...(data || []));
    if (!data || data.length < PAGINA) break;
    desde += PAGINA;
  }
  return todas;
}

// ---------- A. inventario de las 38 tablas ----------

async function inventarioTablas() {
  titulo('A. INVENTARIO DE LAS 38 TABLAS DE public');
  const resultados = [];
  for (const tabla of TABLAS) {
    const r = await contarTabla(tabla);
    resultados.push(r);
    if (!r.existe) {
      console.log(`  ⚠️  ${col(tabla, 28)} AUSENTE en este ambiente`);
    } else if (r.error) {
      console.log(`  ❌ ${col(tabla, 28)} error al contar: ${r.error}`);
    } else {
      console.log(`     ${col(tabla, 28)} ${num(r.count)} filas`);
    }
  }
  const totalFilas = resultados.reduce((acc, r) => acc + (r.count || 0), 0);
  const ausentes = resultados.filter((r) => !r.existe).map((r) => r.tabla);
  console.log(linea());
  console.log(`  TOTAL de filas contadas (suma de las tablas existentes): ${totalFilas}`);
  if (ausentes.length) console.log(`  Tablas ausentes (${ausentes.length}): ${ausentes.join(', ')}`);
  return { resultados, totalFilas };
}

// ---------- B. usuarios por (club, rol, estado) ----------

async function cargarUsuarios() {
  return traerTodo('usuarios', 'id, cedula, club, rol, estado');
}

function desgloseUsuarios(usuarios) {
  titulo('B. USUARIOS por (club, rol, estado)');
  const grupos = new Map();
  for (const u of usuarios) {
    const clave = `${u.club || '(sin club)'}||${u.rol || '(sin rol)'}||${u.estado || '(sin estado)'}`;
    grupos.set(clave, (grupos.get(clave) || 0) + 1);
  }
  const filas = [...grupos.entries()]
    .map(([clave, n]) => { const [club, rol, estado] = clave.split('||'); return { club, rol, estado, n }; })
    .sort((a, b) => a.club.localeCompare(b.club) || a.rol.localeCompare(b.rol) || a.estado.localeCompare(b.estado));

  let clubActual = null;
  for (const f of filas) {
    if (f.club !== clubActual) { console.log(`\n  ${f.club}`); clubActual = f.club; }
    console.log(`     ${col(f.rol, 14)} ${col(f.estado, 14)} ${num(f.n, 6)}`);
  }
  console.log('\n' + linea());
  console.log(`  TOTAL usuarios: ${usuarios.length}`);
}

// ---------- C. atletas por club ----------
// atletas NO tiene columna club propia: cuelga de usuario_id → usuarios.club.
// Se resuelve en memoria contra el mismo listado de usuarios ya traído en B,
// para no pagar un join en la base ni una segunda pasada de red por fila.

async function desgloseAtletasPorClub(usuarios) {
  titulo('C. ATLETAS por club');
  const atletas = await traerTodo('atletas', 'id, usuario_id');
  const clubPorUsuarioId = new Map(usuarios.map((u) => [u.id, u.club || '(sin club)']));

  const porClub = new Map();
  for (const a of atletas) {
    const club = a.usuario_id
      ? (clubPorUsuarioId.get(a.usuario_id) || '(usuario no encontrado)')
      : '(sin usuario vinculado)';
    porClub.set(club, (porClub.get(club) || 0) + 1);
  }
  for (const [club, n] of [...porClub.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`     ${col(club, 36)} ${num(n, 6)}`);
  }
  console.log(linea());
  console.log(`  TOTAL atletas: ${atletas.length}`);
  return { atletas, porClub };
}

// ---------- D. clubes sintéticos conocidos + descubrimiento de otros ----------

function seccionClubes(usuarios, atletasPorClub) {
  titulo('D. CLUBES SINTÉTICOS CONOCIDOS Y OTROS CLUBES DETECTADOS');

  const usuariosPorClub = new Map();
  for (const u of usuarios) {
    const c = u.club || '(sin club)';
    usuariosPorClub.set(c, (usuariosPorClub.get(c) || 0) + 1);
  }
  // Descubrimiento robusto de clubes: se hace en memoria sobre el listado
  // completo de usuarios (ya paginado en B), no con un DISTINCT en la base
  // (supabase-js no expone group-by directo sobre PostgREST).
  const clubesTotales = new Set([...usuariosPorClub.keys(), ...atletasPorClub.keys()]);

  console.log('\n  Clubes sintéticos conocidos (usuarios + atletas, total combinado):');
  for (const club of CLUBES_SINTETICOS_CONOCIDOS) {
    const nu = usuariosPorClub.get(club) || 0;
    const na = atletasPorClub.get(club) || 0;
    console.log(`     ${col(club, 34)} usuarios=${num(nu, 5)}  atletas=${num(na, 5)}  total=${nu + na}`);
  }

  const otros = [...clubesTotales].filter((c) => c !== CLUB_PRINCIPAL && !CLUBES_SINTETICOS_CONOCIDOS.includes(c));
  console.log('\n  Otros clubes presentes (ni "Black Gold" ni los 4 sintéticos conocidos):');
  if (!otros.length) {
    console.log('     — ninguno —');
  } else {
    for (const club of otros) {
      const nu = usuariosPorClub.get(club) || 0;
      const na = atletasPorClub.get(club) || 0;
      console.log(`     ${col(club, 34)} usuarios=${num(nu, 5)}  atletas=${num(na, 5)}  total=${nu + na}`);
    }
  }
  return { usuariosPorClub, otros };
}

// ---------- E. patrones QA ----------

async function patronesQA(usuarios) {
  titulo('E. PATRONES QA (dentro de cualquier club)');

  const esCedulaQA = (cedula) => {
    const c = cedula || '';
    return c.startsWith('QA_RLS') || c.startsWith('QA_') || c.startsWith('999');
  };
  const usuariosQA = usuarios.filter((u) => esCedulaQA(u.cedula));
  console.log(`\n  usuarios con cédula QA_RLS%/QA_%/999%: ${usuariosQA.length}`);
  if (usuariosQA.length) {
    const porClub = new Map();
    for (const u of usuariosQA) {
      const c = u.club || '(sin club)';
      porClub.set(c, (porClub.get(c) || 0) + 1);
    }
    for (const [club, n] of [...porClub.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`     ${col(club, 34)} ${n}`);
    }
  }

  const gastosQA = await contarConFiltro('gastos', (q) => q.like('descripcion', 'QA_RLS%'));
  if (!gastosQA.existe) console.log('\n  gastos con descripción QA_RLS%: tabla ausente');
  else if (gastosQA.error) console.log(`\n  gastos con descripción QA_RLS%: error — ${gastosQA.error}`);
  else console.log(`\n  gastos con descripción QA_RLS%: ${gastosQA.count}`);

  const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const haceUnDia = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const intentosHora = await contarConFiltro('registro_intentos', (q) => q.gte('created_at', haceUnaHora));
  const intentosDia = await contarConFiltro('registro_intentos', (q) => q.gte('created_at', haceUnDia));
  if (!intentosHora.existe) {
    console.log('\n  registro_intentos: tabla ausente en este ambiente');
  } else {
    console.log(`\n  registro_intentos última hora: ${intentosHora.count ?? `error: ${intentosHora.error}`}`);
    console.log(`  registro_intentos último día:  ${intentosDia.count ?? `error: ${intentosDia.error}`}`);
  }

  return { usuariosQA, gastosQA, intentosDia };
}

// ---------- F. xp_eventos y pagos ----------
// Ninguna de las dos tablas tiene columna `club` propia: cuelgan de
// atleta_id → atletas.usuario_id → usuarios.club. Reconstruir eso en memoria
// significaría traer TODAS las filas de xp_eventos y pagos (potencialmente
// miles) solo para un desglose informativo — se opta por reportar el total y
// decirlo explícitamente, en vez de complicar el script para esto.

function seccionXpPagos(resultadosInventario) {
  titulo('F. XP_EVENTOS Y PAGOS');
  const xp = resultadosInventario.find((r) => r.tabla === 'xp_eventos');
  const pg = resultadosInventario.find((r) => r.tabla === 'pagos');
  console.log(`\n  xp_eventos: total = ${xp?.existe ? xp.count : 'tabla ausente'}`);
  console.log(`  pagos:      total = ${pg?.existe ? pg.count : 'tabla ausente'}`);
  console.log('\n  Ninguna tiene columna `club` directa (cuelgan de atleta_id, y el club vive');
  console.log('  en usuarios vía atletas.usuario_id). Desglose por club no disponible sin');
  console.log('  join costoso — se reporta solo el total.');
}

// ---------- G. storage ----------

async function seccionStorage() {
  titulo('G. STORAGE');
  const { data: buckets, error } = await svc.storage.listBuckets();
  if (error) { console.log(`  ❌ no se pudo listar buckets: ${error.message}`); return; }

  console.log('\n  Buckets:');
  for (const b of buckets) {
    console.log(`     ${col(b.id, 24)} público=${b.public}  creado=${b.created_at}`);
  }

  // El bucket real de comprobantes se llama 'comprobantes-pagos' (no
  // 'comprobantes' a secas) — se matchea por substring para cubrir el nombre
  // pedido y el real sin depender de adivinar cuál es cuál.
  const objetivo = buckets.filter((b) => /comprobantes/i.test(b.id) || b.id === 'fotos-atletas');
  const LIMITE = 1000;
  for (const b of objetivo) {
    const { data: objetos, error: eList } = await svc.storage.from(b.id).list('', { limit: LIMITE });
    if (eList) { console.log(`\n  ${b.id}: error al listar — ${eList.message}`); continue; }
    const n = (objetos || []).length;
    const truncado = n === LIMITE ? ` (posible truncamiento, hay ≥ ${LIMITE})` : '';
    console.log(`\n  ${b.id}: ${n} objetos/carpetas de primer nivel${truncado}`);
  }
  if (!objetivo.length) {
    console.log('\n  (no se encontró ningún bucket que matchee "comprobantes" ni "fotos-atletas")');
  }
}

// ---------- H. auth ----------

async function seccionAuth() {
  titulo('H. AUTH (supabase.auth.admin.listUsers)');
  const PATRONES = ['sinacceso', 'ejemplo.com', 'blackgoldapp.internal'];
  const porPatron = Object.fromEntries(PATRONES.map((p) => [p, 0]));
  let total = 0;
  let sinteticos = 0;
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage });
    if (error) { console.log(`  ❌ error listando Auth (página ${page}): ${error.message}`); break; }
    const pagina = data.users || [];
    total += pagina.length;
    for (const u of pagina) {
      const email = (u.email || '').toLowerCase();
      const match = PATRONES.filter((p) => email.includes(p));
      if (match.length) sinteticos++;
      for (const p of match) porPatron[p]++;
    }
    if (pagina.length < perPage) break;
    page++;
  }
  console.log(`\n  Total de cuentas en Auth: ${total}`);
  console.log(`  Cuentas con email sintético (sinacceso / ejemplo.com / blackgoldapp.internal): ${sinteticos}`);
  for (const p of PATRONES) console.log(`     ...${p}: ${porPatron[p]}`);
  return { total, sinteticos };
}

// ---------- orquestación ----------

async function main() {
  console.log(linea('═'));
  console.log('INVENTARIO PRE-PRODUCCIÓN — solo lectura — antes de la carga real (9-10 ago 2026)');
  console.log(`Generado: ${new Date().toISOString()}`);
  console.log(linea('═'));

  const { resultados: inventario } = await inventarioTablas();

  const usuarios = await cargarUsuarios();
  desgloseUsuarios(usuarios);

  const { porClub: atletasPorClub } = await desgloseAtletasPorClub(usuarios);

  const { usuariosPorClub, otros: otrosClubes } = seccionClubes(usuarios, atletasPorClub);

  const { usuariosQA, gastosQA, intentosDia } = await patronesQA(usuarios);

  seccionXpPagos(inventario);

  await seccionStorage();

  const { total: authTotal, sinteticos: authSinteticos } = await seccionAuth();

  // ---------- LECTURA RÁPIDA ----------
  titulo('=== LECTURA RÁPIDA ===');

  const totalSinteticoPorPatron = usuariosQA.length
    + (gastosQA.existe ? (gastosQA.count || 0) : 0)
    + (intentosDia.existe ? (intentosDia.count || 0) : 0);
  console.log(`\n  Filas sintéticas identificables por patrón`);
  console.log(`  (usuarios QA_RLS%/QA_%/999% + gastos QA_RLS% + registro_intentos del último día): ${totalSinteticoPorPatron}`);

  const clubesSinteticosPresentes = CLUBES_SINTETICOS_CONOCIDOS.filter(
    (c) => (usuariosPorClub.get(c) || 0) + (atletasPorClub.get(c) || 0) > 0,
  );
  console.log(`\n  Clubes sintéticos conocidos presentes: ${clubesSinteticosPresentes.length ? clubesSinteticosPresentes.join(', ') : '— ninguno —'}`);
  if (otrosClubes.length) console.log(`  Otros clubes fuera de la lista conocida: ${otrosClubes.join(', ')}`);

  // Heurística de "sintético" a nivel de usuario, solo para esta lectura
  // rápida: cédula con patrón QA, o club distinto al de producción (en un
  // ambiente de un solo club real, cualquier otro club es como mínimo
  // sospechoso). Es una heurística de LECTURA, no una verificación caso por
  // caso — el detalle real está en las secciones B, C, D y E de arriba.
  const idsSospechosos = new Set();
  for (const u of usuarios) {
    const cedulaQA = (u.cedula || '').startsWith('QA_RLS') || (u.cedula || '').startsWith('QA_') || (u.cedula || '').startsWith('999');
    const clubNoPrincipal = (u.club || '(sin club)') !== CLUB_PRINCIPAL;
    if (cedulaQA || clubNoPrincipal) idsSospechosos.add(u.id);
  }
  const usuariosSinteticosAparentes = idsSospechosos.size;
  const usuariosRealesAparentes = usuarios.length - usuariosSinteticosAparentes;

  console.log('\n  Las tres cifras clave para decidir la purga:');
  console.log(`    1. Usuarios: ${usuariosSinteticosAparentes} con pinta de sintéticos (cédula QA_*/999* o club distinto a "${CLUB_PRINCIPAL}") vs ${usuariosRealesAparentes} aparentemente reales, de un total de ${usuarios.length}.`);
  console.log(`    2. Atletas por club: ${[...atletasPorClub.entries()].map(([c, n]) => `${c}=${n}`).join(', ') || '(sin atletas)'}.`);
  console.log(`    3. Cuentas de Auth: ${authSinteticos} con email sintético (sinacceso/ejemplo.com/blackgoldapp.internal), de un total de ${authTotal}.`);

  console.log('\n  Este script INFORMA. No borra nada. Qué purgar antes del 9-10 de agosto');
  console.log('  es una decisión del dueño, con estos números delante.');
  console.log('\n' + linea('═'));
}

main().catch((err) => {
  console.error('\n❌ El inventario se interrumpió por un error inesperado:', err.message);
  process.exit(1);
});
