// Siembra la ESTRUCTURA REAL SIMULADA de 5 clubes (2026-07-22), tras el reset
// total (tmp_reset_total_5clubes.mjs). Cinco perfiles deliberadamente distintos
// para evaluar cargas, seguridad multi-club, facturación v42 y UX por rol:
//
//   1. Nueva Loja Basket (Lago Agrio)   — GRANDE: ~320 atletas, 12 grupos,
//      4 coaches, co-dueño, 6 meses de historial. Stress de cargas.
//   2. Cascabel BC (Shushufindi)        — mediano: 60 atl, grupo extra con
//      ADD-ONS facturables (v39), 4 meses.
//   3. Águilas del Coca (El Coca)       — chico: 36 atl, muchas becas, 3 meses.
//   4. Cuyabeno Jr (Tarapoa)            — nuevo: 14 atl, solo mes actual.
//   5. Petroleros BC (Sachas)           — gobernanza: pendientes, rechazado,
//      bajas, grupo archivado y 2 atletas SIN grupo (v42: no facturan).
//
// Pagos por la RPC REAL generar_pagos_mes (ejercita v42 + hermanos + add-ons).
// Catálogo de misiones: usa el GLOBAL preservado por el reset.
// Dry-run por defecto. Real: SEED_REAL=1 node scripts/tmp_sembrar_5clubes.mjs
// Idempotencia gruesa: si un club ya tiene usuarios, se SALTA entero.
// Credenciales → consola + C:\Users\jorge\dev\backups-blackgold\credenciales_5clubes.json
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { BAREMOS, calcularOverall } from '../../packages/analytics-core/baremos.js';
import { calcularCategoriaFEB } from '../../packages/analytics-core/categoriaFEB.js';

const EJECUTAR = process.env.SEED_REAL === '1';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const HOY = new Date('2026-07-22T12:00:00Z');
const MES_ACTUAL = { mes: 7, anio: 2026 };
const emailInterno = (c) => `${c.toLowerCase()}@sinacceso.blackgoldapp.internal`;
const CRED_PATH = 'C:/Users/jorge/dev/backups-blackgold/credenciales_5clubes.json';

// RNG determinista
let seed = 20260722;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const randInt = (a, b) => Math.floor(rand() * (b - a + 1)) + a;
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const iso = (d) => d.toISOString().split('T')[0];

const NOMBRES_M = ['Mateo','Lucas','Samuel','Emilio','Daniel','Iker','Joaquín','Gael','Thiago','Benjamín','Dylan','Adrián','Bruno','Damián','Elías','Ían','Julián','Leo','Martín','Nico','Óscar','Pablo','Rafael','Santiago','Tomás','Axel','Caleb','Dante','Enzo','Franco'];
const NOMBRES_F = ['Sofía','Valentina','Isabella','Camila','Martina','Paula','Emma','Luciana','Victoria','Renata','Amelia','Bianca','Carla','Daniela','Elena','Fernanda','Gabriela','Helena','Irene','Julieta','Karla','Lía','Mía','Noa','Olivia','Pilar','Romina','Salomé','Tania','Valeria'];
const APELLIDOS = ['Vera','Rosero','Ortiz','Jiménez','Chávez','Andrade','Salazar','Mora','Cedeño','Zambrano','Quintero','Paredes','Naranjo','Montaño','López','Guerrero','Flores','Espinoza','Delgado','Castillo','Bravo','Aguirre','Vallejo','Torres','Suárez','Ramírez','Ponce','Núñez','Mendoza','Loor'];
const POSICIONES = ['Base','Escolta','Alero','Ala-Pívot','Pívot'];
const CLAVES = ['cmj_salto','pushups_30s','sentadilla_rel','sit_reach','tiro_libre','zigzag_balon','eficiencia_tactica','resiliencia'];
const PUNT_TIER = { poor: 15, below_avg: 35, average: 55, above_avg: 75, excellent: 95 };
const NIVELES3 = ['Micro','Desarrollo','Elite'];

// ── Perfiles de los 5 clubes ─────────────────────────────────────────────────
// grupos: [nombre, precio, edadMin, edadMax, esPrincipal, nivel, extra(no edad, pool add-on), activo]
const PERFILES = [
  {
    club: 'Nueva Loja Basket', ciudad: 'Lago Agrio', prefijo: 'NLB', nAtletas: 320,
    coaches: 4, coDueno: true, mesesHist: 6, descHermanos: 10, pctBeca: 0.06, pctDescInd: 0.05,
    pctPadre: 0.75, nFamilias: 30, pendientes: 6, bajas: 10, rechazados: 0, sinGrupo: 0,
    pctAddon: 0.08, whatsapp: '+593 99 210 0001', meta: 8500,
    grupos: [
      ['Premini A', 22, 6, 8, true, 'Micro'], ['Premini B', 22, 6, 8, false, 'Micro'],
      ['Mini A', 25, 9, 10, true, 'Desarrollo'], ['Mini B', 25, 9, 10, false, 'Desarrollo'],
      ['Menores A', 28, 11, 13, true, 'Elite'], ['Menores B', 28, 11, 13, false, 'Desarrollo'],
      ['Prejuvenil A', 30, 14, 15, false, 'Elite'], ['Prejuvenil B', 30, 14, 15, false, 'Desarrollo'],
      ['Juvenil A', 32, 16, 17, false, 'Elite'], ['Juvenil B', 32, 16, 17, false, 'Desarrollo'],
      ['Mayores', 35, 18, 22, false, 'Elite'],
      ['Tecnificación de Tiro', 15, null, null, false, null, true],
    ],
  },
  {
    club: 'Cascabel BC', ciudad: 'Shushufindi', prefijo: 'CAS', nAtletas: 60,
    coaches: 2, coDueno: false, mesesHist: 4, descHermanos: 15, pctBeca: 0.05, pctDescInd: 0.08,
    pctPadre: 0.7, nFamilias: 8, pendientes: 2, bajas: 2, rechazados: 0, sinGrupo: 0,
    pctAddon: 0.2, whatsapp: '+593 99 210 0002', meta: 1500,
    grupos: [
      ['Mini', 24, 8, 10, true, 'Micro'], ['Menores', 26, 11, 13, true, 'Desarrollo'],
      ['Juvenil', 28, 14, 17, true, 'Elite'],
      ['Acondicionamiento Físico', 12, null, null, false, null, true],
    ],
  },
  {
    club: 'Águilas del Coca', ciudad: 'El Coca', prefijo: 'AGC', nAtletas: 36,
    coaches: 1, coDueno: false, mesesHist: 3, descHermanos: 0, pctBeca: 0.2, pctDescInd: 0,
    pctPadre: 0.8, nFamilias: 4, pendientes: 0, bajas: 1, rechazados: 0, sinGrupo: 0,
    pctAddon: 0, whatsapp: '+593 99 210 0003', meta: 750,
    grupos: [
      ['Mini', 20, 8, 10, true, 'Micro'], ['Menores', 22, 11, 13, true, 'Desarrollo'],
      ['Juvenil', 25, 14, 17, true, 'Elite'],
    ],
  },
  {
    club: 'Cuyabeno Jr', ciudad: 'Tarapoa', prefijo: 'CUY', nAtletas: 14,
    coaches: 1, coDueno: false, mesesHist: 0, descHermanos: 5, pctBeca: 0, pctDescInd: 0,
    pctPadre: 0.9, nFamilias: 2, pendientes: 1, bajas: 0, rechazados: 0, sinGrupo: 0,
    pctAddon: 0, whatsapp: '+593 99 210 0004', meta: 280,
    grupos: [
      ['Formativo', 18, 7, 11, true, 'Micro'], ['Juvenil', 20, 12, 17, true, 'Desarrollo'],
    ],
  },
  {
    club: 'Petroleros BC', ciudad: 'La Joya de los Sachas', prefijo: 'PET', nAtletas: 48,
    coaches: 2, coDueno: false, mesesHist: 5, descHermanos: 10, pctBeca: 0.08, pctDescInd: 0.04,
    pctPadre: 0.7, nFamilias: 6, pendientes: 3, bajas: 2, rechazados: 1, sinGrupo: 2,
    pctAddon: 0, whatsapp: '+593 99 210 0005', meta: 1200,
    grupos: [
      ['Mini', 25, 8, 10, true, 'Micro'], ['Menores', 27, 11, 13, true, 'Desarrollo'],
      ['Juvenil', 30, 14, 17, true, 'Elite'],
      ['Verano 2026', 20, null, null, false, null, true, false], // ARCHIVADO
    ],
  },
];

const credenciales = [];
const cred = (club, rol, cedula, password) => credenciales.push({ club, rol, identificador: cedula, password });

async function crearAuth(usuarioId, cedula, password) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: emailInterno(cedula), password, email_confirm: true, user_metadata: { usuario_id: usuarioId, demo: true },
  });
  if (error || !data?.user) { console.warn(`  ⚠️ auth ${cedula}: ${error?.message}`); return; }
  await supabase.from('usuarios').update({ auth_user_id: data.user.id }).eq('id', usuarioId);
}

async function insertLote(tabla, filas, chunk = 400) {
  for (let i = 0; i < filas.length; i += chunk) {
    const { error } = await supabase.from(tabla).insert(filas.slice(i, i + chunk));
    if (error) throw new Error(`${tabla} [${i}..${i + chunk}]: ${error.message}`);
  }
}

// bucket de baremos por edad (patrón del seeder QA compacto)
const bucketDe = (edad) => (edad <= 11 ? 'Sub12' : 'Sub18');
function valorMedio(clave, bucket) {
  const th = BAREMOS[clave]?.thresholds?.[bucket]; if (!th) return null;
  const [, t2, t3] = th; const f = 100;
  return Math.round((rand() * (t3 - t2) + t2) * f) / f;
}
function tierDe(clave, valor, bucket) {
  const b = BAREMOS[clave]; const th = b.thresholds[bucket]; if (!th) return null;
  const [t1, t2, t3, t4] = th;
  if (b.tipo === 'mas_es_mejor') return valor > t4 ? 'excellent' : valor > t3 ? 'above_avg' : valor > t2 ? 'average' : valor > t1 ? 'below_avg' : 'poor';
  return valor <= t1 ? 'excellent' : valor <= t2 ? 'above_avg' : valor <= t3 ? 'average' : valor <= t4 ? 'below_avg' : 'poor';
}

async function sembrarClub(P) {
  console.log(`\n════ ${P.club} (${P.ciudad}) — ${P.nAtletas} atletas ════`);
  const { count: yaUsuarios } = await supabase.from('usuarios').select('*', { count: 'exact', head: true }).eq('club', P.club);
  if (yaUsuarios > 0) { console.log(`  ⏭️  Ya tiene ${yaUsuarios} usuarios — se salta entero (idempotencia gruesa).`); return; }
  if (!EJECUTAR) {
    console.log(`  [dry] staff: 1 owner${P.coDueno ? ' + co-dueño' : ''} + ${P.coaches} coaches · ${P.grupos.length} grupos · ${P.nAtletas} atletas · ${P.mesesHist + 1} meses de pagos`);
    return;
  }

  // ── 1. Staff ──
  const staff = [];
  const mkStaff = async (cedula, nombre, rol) => {
    const { data, error } = await supabase.from('usuarios').insert({ cedula, nombre, rol, club: P.club, correo: null, telefono: null, estado: 'activo' }).select('id').single();
    if (error) throw new Error(`usuarios ${cedula}: ${error.message}`);
    const pass = `${cedula}#2026`; // v41: password de staff ≠ cédula
    await crearAuth(data.id, cedula, pass);
    cred(P.club, rol, cedula, pass);
    staff.push({ id: data.id, cedula, rol });
    return data.id;
  };
  const ownerId = await mkStaff(`${P.prefijo}-OWNER`, `${pick(NOMBRES_M)} ${pick(APELLIDOS)} (Dueño ${P.club})`, 'owner');
  if (P.coDueno) await mkStaff(`${P.prefijo}-OWNER-2`, `${pick(NOMBRES_F)} ${pick(APELLIDOS)} (Co-dueña)`, 'owner');
  const coachIds = [];
  for (let i = 1; i <= P.coaches; i++) coachIds.push(await mkStaff(`${P.prefijo}-COACH-${i}`, `Coach ${pick([...NOMBRES_M, ...NOMBRES_F])} ${pick(APELLIDOS)}`, 'coach'));
  console.log(`  ✅ staff: ${staff.length}`);

  // ── 2. Grupos + config + catálogo ──
  const gruposIns = P.grupos.map(([nombre, precio, eMin, eMax, esPrincipal, nivel, esExtra, activo]) => ({
    nombre, club: P.club, precio_mensual: precio, precio_sesion_ind: Math.max(8, Math.round(precio / 3)),
    horario: esExtra ? 'Sábados 09:00-11:00' : 'Lun-Mié-Vie 16:00-18:00',
    dias_semana: esExtra ? ['Sábado'] : ['Lunes', 'Miércoles', 'Viernes'],
    hora_inicio: esExtra ? '09:00' : '16:00', hora_fin: esExtra ? '11:00' : '18:00',
    descripcion: `Grupo ${nombre} — ${P.club}`, nivel: nivel || null, es_principal: !!esPrincipal,
    activo: activo !== false,
  }));
  const { data: gruposRows, error: eG } = await supabase.from('grupos_entrenamiento').insert(gruposIns).select('id, nombre, precio_mensual');
  if (eG) throw new Error(`grupos: ${eG.message}`);
  const grupoId = new Map(gruposRows.map((g) => [g.nombre, g.id]));
  const gruposEdad = P.grupos.filter((g) => g[2] !== null && g[7] !== false);
  const gruposExtra = P.grupos.filter((g) => g[6] === true && g[7] !== false);

  await supabase.from('club_config').upsert({
    club: P.club, whatsapp_club: P.whatsapp, dia_vencimiento: 5,
    cuenta_bancaria_texto: `Banco Pichincha · Cta. Ahorros · ${P.club}`,
    descuento_hermanos_pct: P.descHermanos, meta_recaudacion_mensual: P.meta,
  }, { onConflict: 'club' });
  const { data: serv } = await supabase.from('catalogo_servicios')
    .insert({ club: P.club, nombre: 'Mensualidad', descripcion: 'Cuota mensual de entrenamiento', recurrencia: 'mensual', precio_base: gruposEdad[0][1], activo: true })
    .select('id').single();
  if (serv) await insertLote('servicio_tarifas', gruposRows.filter((g) => grupoId.has(g.nombre)).map((g) => ({ servicio_id: serv.id, grupo_id: g.id, precio: g.precio_mensual })));
  console.log(`  ✅ grupos: ${gruposRows.length} + config + catálogo`);

  // ── 3. Atletas (bulk) ──
  // Genera perfiles en memoria primero (con evaluaciones para overall upfront).
  const atlDefs = [];
  for (let i = 0; i < P.nAtletas; i++) {
    const g = gruposEdad[i % gruposEdad.length];
    const edad = randInt(g[2], g[3]);
    const genero = rand() < 0.55 ? 'Masculino' : 'Femenino';
    const nombre = `${genero === 'Masculino' ? pick(NOMBRES_M) : pick(NOMBRES_F)} ${pick(APELLIDOS)} ${pick(APELLIDOS)}`;
    const fnac = `${2026 - edad}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`;
    const cedula = i < 2 ? `${P.prefijo}-ATLETA-${i + 1}` : `${P.prefijo}-ATL-${String(i + 1).padStart(4, '0')}`;
    const bucket = bucketDe(edad);
    // 2 baterías: hace ~60 días y hace ~10 días (progresión)
    const evals = [];
    for (const [k, dias] of [[0.92, 60], [1.0, 10]]) {
      for (const clave of CLAVES) {
        const v = valorMedio(clave, bucket); if (v == null) continue;
        const valor = Math.round(v * k * 100) / 100;
        const tier = tierDe(clave, valor, bucket);
        evals.push({ clave, valor, tier, dias });
      }
    }
    const evalsRecientes = evals.filter((e) => e.dias === 10).map((e) => ({ ...BAREMOS[e.clave] && {}, prueba_tipo: BAREMOS[e.clave].label, pilar: BAREMOS[e.clave].pilar, puntuacion_normalizada: PUNT_TIER[e.tier] }));
    const { overall, rango } = calcularOverall(evalsRecientes);
    const talla = edad <= 10 ? randInt(120, 150) : edad <= 14 ? randInt(140, 172) : randInt(155, 195);
    const peso = Math.round(talla * (edad <= 10 ? 0.28 : 0.36) + randInt(-6, 8));
    atlDefs.push({ i, cedula, nombre, fnac, edad, genero, bucket, grupo: g[0], evals, overall, rango,
      posicion: pick(POSICIONES), nivel: NIVELES3[i % 3], talla, peso,
      featured: i < 2 });
  }

  // estados especiales al final de la lista (nunca los featured)
  const colas = atlDefs.slice(2);
  const marcar = (n, fn) => { for (let k = 0; k < n; k++) { const a = colas[colas.length - 1 - k - (marcar._off || 0)]; fn(a); } marcar._off = (marcar._off || 0) + n; };
  marcar._off = 0;
  marcar(P.pendientes, (a) => (a.estadoUsuario = 'pendiente'));
  marcar(P.rechazados, (a) => (a.estadoUsuario = 'rechazado'));
  marcar(P.bajas, (a) => (a.baja = true));
  marcar(P.sinGrupo, (a) => (a.sinGrupo = true));

  // usuarios bulk
  const usuRows = atlDefs.map((a) => ({ cedula: a.cedula, nombre: a.nombre, rol: 'atleta', club: P.club, correo: null, telefono: null, fecha_nacimiento: a.fnac, genero: a.genero, estado: a.estadoUsuario || 'activo' }));
  const usuIds = new Map();
  for (let i = 0; i < usuRows.length; i += 400) {
    const { data, error } = await supabase.from('usuarios').insert(usuRows.slice(i, i + 400)).select('id, cedula');
    if (error) throw new Error(`usuarios atletas: ${error.message}`);
    data.forEach((r) => usuIds.set(r.cedula, r.id));
  }

  // atletas bulk (overall precalculado; el espejo de atleta_grupo pondrá grupo_id)
  const atlRows = atlDefs.map((a) => ({
    usuario_id: usuIds.get(a.cedula), edad: a.edad, posicion: a.posicion, nivel_desarrollo: a.nivel,
    grupo_nombre: a.sinGrupo ? null : a.grupo, overall_score: a.overall, rango: a.rango.id, rango_tier: a.rango.nombre,
    talla_cm: a.talla, peso_kg: a.peso, // imc NO es columna: lo deriva fichaFisica() en el cliente
    fecha_alta: iso(addMonths(HOY, -randInt(0, Math.max(1, P.mesesHist)))),
    estado_membresia: a.baja ? 'baja' : 'activo', fecha_baja: a.baja ? iso(addDays(HOY, -randInt(5, 60))) : null,
    beca_pct: 0, es_becado: false, descuento_pct: 0,
  }));
  // becas / descuentos individuales
  for (const r of atlRows) {
    if (rand() < P.pctBeca) { r.beca_pct = pick([50, 100]); r.es_becado = r.beca_pct === 100; }
    else if (rand() < P.pctDescInd) r.descuento_pct = pick([5, 10, 15]);
  }
  const atlIds = new Map();
  for (let i = 0; i < atlRows.length; i += 400) {
    const { data, error } = await supabase.from('atletas').insert(atlRows.slice(i, i + 400)).select('id, usuario_id');
    if (error) throw new Error(`atletas: ${error.message}`);
    data.forEach((r) => atlIds.set(r.usuario_id, r.id));
  }
  const idDe = (a) => atlIds.get(usuIds.get(a.cedula));

  // atleta_grupo básica (espejo → atletas.grupo_id) + add-ons
  const agRows = atlDefs.filter((a) => !a.sinGrupo).map((a) => ({ atleta_id: idDe(a), grupo_id: grupoId.get(a.grupo), rol_membresia: 'basica', facturable: true }));
  await insertLote('atleta_grupo', agRows, 300);
  let nAddons = 0;
  if (gruposExtra.length && P.pctAddon > 0) {
    const addonRows = atlDefs.filter((a) => !a.sinGrupo && !a.baja && rand() < P.pctAddon)
      .map((a) => ({ atleta_id: idDe(a), grupo_id: grupoId.get(gruposExtra[0][0]), rol_membresia: 'adicional', facturable: true }));
    nAddons = addonRows.length;
    if (addonRows.length) await insertLote('atleta_grupo', addonRows, 300);
  }
  // auth para los 2 destacados (password = cédula, como los QA de siempre)
  for (const a of atlDefs.filter((x) => x.featured)) {
    await crearAuth(usuIds.get(a.cedula), a.cedula, a.cedula);
    cred(P.club, 'atleta', a.cedula, a.cedula);
  }
  console.log(`  ✅ atletas: ${atlDefs.length} (básicas ${agRows.length}, add-ons ${nAddons}, sin grupo ${P.sinGrupo})`);

  // ── 4. Padres + familias (hermanos para el descuento) ──
  const padreRows = []; const vincRows = [];
  let pIdx = 0; const mkPadreCedula = () => `${P.prefijo}-${pIdx < 2 ? `PADRE-${pIdx + 1}` : `PAD-${String(pIdx + 1).padStart(4, '0')}`}`;
  const activosConGrupo = atlDefs.filter((a) => !a.baja && a.estadoUsuario !== 'rechazado');
  const usados = new Set();
  // familias con 2-3 hermanos (mismo padre ⇒ descuento hermanos vía RPC)
  for (let f = 0; f < P.nFamilias; f++) {
    const nHijos = pick([2, 2, 3]);
    const hijos = activosConGrupo.filter((a) => !usados.has(a.cedula)).slice(f * 3, f * 3 + nHijos);
    if (hijos.length < 2) break;
    hijos.forEach((h) => usados.add(h.cedula));
    const ced = mkPadreCedula(); pIdx++;
    const apellido = hijos[0].nombre.split(' ')[1] || pick(APELLIDOS);
    padreRows.push({ cedula: ced, nombre: `${pick([...NOMBRES_M, ...NOMBRES_F])} ${apellido}`, rol: 'padre', club: P.club, correo: null, telefono: null, estado: 'activo', _hijos: hijos.map((h) => h.cedula) });
  }
  // padres individuales hasta cubrir pctPadre
  for (const a of activosConGrupo) {
    if (usados.has(a.cedula) || rand() > P.pctPadre) continue;
    usados.add(a.cedula);
    const ced = mkPadreCedula(); pIdx++;
    padreRows.push({ cedula: ced, nombre: `Rep. de ${a.nombre.split(' ')[0]} ${a.nombre.split(' ')[1] || ''}`.trim(), rol: 'padre', club: P.club, correo: null, telefono: null, estado: 'activo', _hijos: [a.cedula] });
  }
  const padreIds = new Map();
  for (let i = 0; i < padreRows.length; i += 400) {
    const lote = padreRows.slice(i, i + 400).map(({ _hijos, ...r }) => r);
    const { data, error } = await supabase.from('usuarios').insert(lote).select('id, cedula');
    if (error) throw new Error(`padres: ${error.message}`);
    data.forEach((r) => padreIds.set(r.cedula, r.id));
  }
  for (const p of padreRows) for (const hc of p._hijos) {
    const aid = atlIds.get(usuIds.get(hc));
    if (aid) vincRows.push({ padre_id: padreIds.get(p.cedula), atleta_id: aid, es_rep_pagos: true });
  }
  await insertLote('padres_atletas', vincRows, 400);
  // auth para los 2 primeros padres (los featured: PADRE-1 es de familia con hermanos)
  for (const p of padreRows.slice(0, 2)) {
    await crearAuth(padreIds.get(p.cedula), p.cedula, p.cedula);
    cred(P.club, 'padre', p.cedula, p.cedula);
  }
  console.log(`  ✅ padres: ${padreRows.length} (familias con hermanos: ${P.nFamilias}, vínculos: ${vincRows.length})`);

  // ── 5. Evaluaciones (2 baterías) ──
  const evalRows = [];
  for (const a of atlDefs) {
    if (a.estadoUsuario === 'rechazado') continue;
    const aid = idDe(a);
    for (const e of a.evals) {
      const b = BAREMOS[e.clave];
      evalRows.push({ atleta_id: aid, prueba_tipo: b.label, pilar: b.pilar, sub_pilar: b.sub_pilar, tren: b.tren || null, lado: 'unico', valor_crudo: e.valor, unidad: b.unidad, puntuacion_normalizada: PUNT_TIER[e.tier], tier: e.tier, registrado_por: pick(coachIds), created_at: addDays(HOY, -e.dias).toISOString(), notas: 'Batería simulada' });
    }
  }
  await insertLote('evaluaciones_pruebas', evalRows);
  console.log(`  ✅ evaluaciones: ${evalRows.length}`);

  // ── 6. Asistencia (últimas 3 semanas) + sesiones de control ──
  const asisRows = []; const vistosAsis = new Set();
  for (const a of atlDefs.filter((x) => !x.baja && x.estadoUsuario !== 'rechazado' && x.estadoUsuario !== 'pendiente')) {
    const aid = idDe(a);
    for (let d = 0; d < 21; d++) {
      if (rand() < 0.62) continue;
      const k = `${aid}|${iso(addDays(HOY, -d))}`;
      if (vistosAsis.has(k)) continue; vistosAsis.add(k);
      asisRows.push({ atleta_id: aid, coach_id: pick(coachIds), fecha: iso(addDays(HOY, -d)), estado: rand() < 0.85 ? 'Presente' : pick(['Ausente', 'Justificada']) });
    }
  }
  await insertLote('asistencia', asisRows);
  const sesRows = [];
  for (const cid of coachIds) for (let s = 0; s < randInt(4, 8); s++) {
    sesRows.push({ tipo: 'Grupal', grupo_id: gruposRows[randInt(0, gruposRows.length - 1)].id, coach_id: cid, fecha: iso(addDays(HOY, -randInt(0, 21))), objetivo_tipo: pick(['Técnico', 'Físico', 'Táctico', 'Evaluación', 'Recuperación']), objetivo_descripcion: 'Sesión simulada', se_logro: pick(['Sí', 'Sí', 'Parcial']) });
  }
  await insertLote('sesiones_control', sesRows);
  console.log(`  ✅ asistencia: ${asisRows.length} · sesiones: ${sesRows.length}`);

  // ── 7. Misiones (catálogo GLOBAL preservado) + XP ──
  const { data: catalogo } = await supabase.from('misiones').select('id, categoria_bucket, xp_recompensa').eq('activa', true).limit(200);
  const porBucket = new Map();
  for (const m of catalogo || []) (porBucket.get(m.categoria_bucket) || porBucket.set(m.categoria_bucket, []).get(m.categoria_bucket)).push(m);
  const progRows = []; const xpRows = [];
  for (const a of atlDefs.filter((x) => x.featured || rand() < (P.nAtletas > 100 ? 0.12 : 0.4))) {
    if (a.baja || a.estadoUsuario) continue;
    const aid = idDe(a);
    const cand = porBucket.get(a.bucket) || [...(catalogo || [])].slice(0, 6);
    const n = a.featured ? 4 : randInt(1, 2);
    for (let i = 0; i < n && i < cand.length; i++) {
      const m = cand[i]; const estado = pick(['aprobada', 'aprobada', 'pendiente', 'pendiente_aprobacion']);
      const fAsig = addDays(HOY, -randInt(2, 20));
      progRows.push({ atleta_id: aid, mision_id: m.id, completada: estado !== 'pendiente', fecha_completada: estado === 'aprobada' ? addDays(fAsig, 3).toISOString() : null, estado, asignado_por: pick(coachIds), tipo_asignacion: 'individual', fecha_asignacion: fAsig.toISOString(), origen: 'coach' });
      if (estado === 'aprobada') xpRows.push({ atleta_id: aid, coach_id: pick(coachIds), delta: m.xp_recompensa || randInt(20, 60), motivo: 'Misión aprobada', origen: 'seed_5clubes', created_at: addDays(fAsig, 3).toISOString() });
    }
    if (a.featured) for (let d = 0; d < 10; d++) if (rand() > 0.4) xpRows.push({ atleta_id: aid, coach_id: coachIds[0], delta: randInt(15, 45), motivo: pick(['Evaluación Modo Cancha', 'Asistencia perfecta semanal', 'Reto de tiro superado']), origen: 'seed_5clubes', created_at: addDays(HOY, -d).toISOString() });
  }
  await insertLote('progreso_misiones', progRows);
  await insertLote('xp_eventos', xpRows);
  // readiness reciente para los featured
  const readyRows = [];
  for (const a of atlDefs.filter((x) => x.featured)) for (let d = 0; d < 6; d++) readyRows.push({ atleta_id: idDe(a), fecha: iso(addDays(HOY, -d)), sueno_calidad: randInt(5, 9), fatiga_fisica: randInt(3, 8), color_orina: randInt(1, 4) });
  await insertLote('atleta_readiness', readyRows);
  console.log(`  ✅ misiones: ${progRows.length} · xp: ${xpRows.length} · readiness: ${readyRows.length}`);

  // ── 8. Eventos + comunicaciones ──
  const evDefs = [
    { titulo: `Amistoso ${P.club} vs Escuela Rival`, tipo: 'partido', estado: 'publicado', off: randInt(4, 12), extra: {} },
    { titulo: `Liga cantonal — Jornada pasada`, tipo: 'partido', estado: 'cerrado', off: -randInt(6, 15), extra: { resultado: pick(['ganado', 'perdido']), marcador_propio: randInt(40, 70), marcador_rival: randInt(35, 65) } },
  ];
  for (const ev of evDefs) {
    const { data: evRow, error: eEv } = await supabase.from('eventos').insert({ club: P.club, creado_por: coachIds[0], tipo: ev.tipo, estado: ev.estado, titulo: ev.titulo, descripcion: 'Evento simulado', rival: 'Escuela Rival', fecha_evento: addDays(HOY, ev.off).toISOString(), hora_inicio: '10:00', sede: `Coliseo de ${P.ciudad}`, ...ev.extra }).select('id').single();
    if (eEv) { console.warn(`  ⚠️ evento: ${eEv.message}`); continue; }
    const convocados = atlDefs.filter((a) => !a.baja && !a.estadoUsuario).slice(0, 12)
      .map((a) => ({ evento_id: evRow.id, atleta_id: idDe(a), estado_rsvp: ev.estado === 'cerrado' ? pick(['asiste', 'asiste', 'no_asiste']) : pick(['pendiente', 'asiste', 'asiste', 'duda']) }));
    await insertLote('evento_convocados', convocados);
  }
  const { data: usuariosClub } = await supabase.from('usuarios').select('id').eq('club', P.club);
  for (const c of [{ t: 'Bienvenida a la temporada', m: 'Arrancamos la nueva temporada. Revisen sus horarios de grupo.' }, { t: 'Recordatorio de cuotas', m: 'Las mensualidades vencen el día 5. Gracias por su puntualidad.' }]) {
    const { data: com, error: eC } = await supabase.from('comunicaciones').insert({ autor_id: ownerId, tipo: 'Anuncio', titulo: c.t, mensaje: c.m, segmento_tipo: 'general', canal: 'ambos', proposito: 'comunicado' }).select('id').single();
    if (eC) { console.warn(`  ⚠️ comunicación: ${eC.message}`); continue; }
    await insertLote('comunicacion_destinatarios', (usuariosClub || []).map((u) => ({ comunicacion_id: com.id, usuario_id: u.id, leido: rand() < 0.4 })));
  }
  console.log(`  ✅ eventos: 2 · comunicaciones: 2`);

  // ── 9. Pagos por la RPC REAL (v42 + hermanos + add-ons) + transacciones ──
  let totalPagos = 0;
  for (let k = P.mesesHist; k >= 0; k--) {
    const d = addMonths(new Date(`${MES_ACTUAL.anio}-${String(MES_ACTUAL.mes).padStart(2, '0')}-15T12:00:00Z`), -k);
    const { data: n, error: eR } = await supabase.rpc('generar_pagos_mes', { p_mes: d.getMonth() + 1, p_anio: d.getFullYear(), p_club: P.club });
    if (eR) throw new Error(`generar_pagos_mes ${d.getMonth() + 1}/${d.getFullYear()}: ${eR.message}`);
    totalPagos += n || 0;
  }
  // transacciones: meses viejos ~85% pagados / 8% abono; mes actual 45%/15%
  const idsAtlClub = [...atlIds.values()];
  const txRows = [];
  for (let i = 0; i < idsAtlClub.length; i += 200) {
    const { data: pagos } = await supabase.from('pagos').select('id, mes, anio, monto_final, monto_base, estado').in('atleta_id', idsAtlClub.slice(i, i + 200));
    for (const p of pagos || []) {
      if (p.estado === 'Becado') continue;
      const esActual = p.mes === MES_ACTUAL.mes && p.anio === MES_ACTUAL.anio;
      const dado = rand();
      const [uPag, uAb] = esActual ? [0.45, 0.6] : [0.85, 0.93];
      if (dado > uAb) continue;
      const monto = Number(p.monto_final ?? p.monto_base);
      txRows.push({ pago_id: p.id, monto: dado <= uPag ? monto : Math.round(monto * 50) / 100, forma_pago: pick(['Efectivo', 'Transferencia', 'Transferencia']), referencia: 'Abono simulado', registrado_por: ownerId });
    }
  }
  await insertLote('pago_transacciones', txRows, 200);
  console.log(`  ✅ pagos RPC: ${totalPagos} (${P.mesesHist + 1} meses) · transacciones: ${txRows.length}`);
}

async function run() {
  console.log(`=== SEED 5 CLUBES — modo ${EJECUTAR ? '🚀 REAL' : '🔍 DRY-RUN'} ===`);
  // superadmin global de la nueva estructura (además de la escotilla SA_001)
  if (EJECUTAR) {
    const { data: ya } = await supabase.from('usuarios').select('id').eq('cedula', 'BG-SUPERADMIN').maybeSingle();
    if (!ya) {
      const { data, error } = await supabase.from('usuarios').insert({ cedula: 'BG-SUPERADMIN', nombre: 'Superadmin Plataforma', rol: 'superadmin', club: 'Global', correo: null, estado: 'activo' }).select('id').single();
      if (error) throw new Error(`superadmin: ${error.message}`);
      await crearAuth(data.id, 'BG-SUPERADMIN', 'BG-SUPERADMIN#2026');
      cred('(global)', 'superadmin', 'BG-SUPERADMIN', 'BG-SUPERADMIN#2026');
    }
  } else console.log('  [dry] superadmin global BG-SUPERADMIN');

  for (const P of PERFILES) await sembrarClub(P);

  if (EJECUTAR && credenciales.length) {
    fs.mkdirSync(path.dirname(CRED_PATH), { recursive: true });
    fs.writeFileSync(CRED_PATH, JSON.stringify(credenciales, null, 2));
  }
  console.log('\n=== CREDENCIALES ===');
  for (const c of credenciales) console.log(`  [${c.rol}] ${c.club}: ${c.identificador} / ${c.password}`);
  if (EJECUTAR) console.log(`\n(guardadas en ${CRED_PATH})`);
  else console.log('\n🔍 DRY-RUN. Para ejecutar: SEED_REAL=1 node scripts/tmp_sembrar_5clubes.mjs');
}

run().catch((e) => { console.error('❌', e.message); process.exit(1); });
