// Siembra un club COMPLETO y presentable para mostrar la app a terceros.
//
// A diferencia de los otros seeds de este directorio, este está pensado para
// que alguien de fuera lo vea: el club tiene nombre creíble (nada de "DEMO QA
// Compacto" en la cabecera), tres grupos con horarios y precios, medio año de
// evaluaciones que progresan —para que las tendencias y el radar tengan algo
// que contar—, asistencia, misiones con XP, encuestas de bienestar, pagos en
// los tres estados y un evento convocado.
//
// Una cuenta logueable por rol, de dueño para abajo: owner, coach, atleta y
// representante. Tres diferencias deliberadas con el producto real, porque una
// demostración no es un alta:
//
//   1. La contraseña NO es aleatoria-e-irrecuperable: la genera este script
//      (legible, para dictarla por teléfono) y la deja en un archivo local.
//   2. No se marca `debe_cambiar_password`, así que quien entre no se topa con
//      la pantalla de cambio obligatorio en medio de la demostración.
//   3. Las contraseñas se REESCRIBEN en cada corrida, así que el archivo de
//      credenciales siempre dice la verdad aunque las cuentas ya existieran.
//
// El archivo de credenciales (`scripts/credenciales_club_demo.json`) está
// cubierto por el .gitignore de la raíz (`credenciales*.json`). Este
// repositorio es PÚBLICO: ninguna contraseña puede entrar en un archivo
// versionado, ni siquiera la de un club de mentira, porque son credenciales
// vivas contra el proyecto Supabase real.
//
// Reusa la lógica pura de packages/analytics-core (baremos, categoría FEB, XP):
// no reinventa ningún cálculo.
//
// Dry-run por defecto. Para escribir:
//   SEED_REAL=1 node scripts/sembrar_club_demostracion.mjs
//
// Idempotente: reejecutarlo no duplica nada. Variables opcionales:
//   CLUB_DEMO="Otro nombre"   → cambia el nombre del club
//   DEMO_PASS_OWNER=...       → fija la contraseña en vez de generarla
//   DEMO_PASS_COACH / DEMO_PASS_ATLETA / DEMO_PASS_PADRE
//   DEMO_REHACER=evaluaciones,bienestar,misiones,sesiones
//        → borra esas secciones DE ESTE CLUB antes de sembrarlas de nuevo.
//          Necesario cuando se cambia cómo se generan: la idempotencia protege
//          lo ya escrito, así que sin esto un generador nuevo no se nota.

import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

import { BAREMOS, calcularOverall, resolverUmbrales } from '../../packages/analytics-core/baremos.js';
import { calcularCategoriaFEB } from '../../packages/analytics-core/categoriaFEB.js';
import { calcularXPMision } from '../../packages/analytics-core/recomendaciones.js';

const EJECUTAR = process.env.SEED_REAL === '1';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !serviceKey) {
  console.error('❌ Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Dashboard_Premium/.env.local');
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// ===================================================================
// CONFIGURACIÓN
// ===================================================================

const CLUB = process.env.CLUB_DEMO || 'Titanes de Sucumbíos';
const HOY = new Date();
const ARCHIVO_CREDENCIALES = path.join(__dirname, 'credenciales_club_demo.json');

// Dominio inexistente y propio: los correos de la demostración no pueden
// aterrizar en el buzón de nadie real, y `correo` es UNIQUE en toda la
// plataforma, así que tampoco pueden pisar el de una familia de verdad.
const DOMINIO = 'titanesdemo.ec';

// Cédulas de mentira que no pueden colisionar con una real: en Ecuador el
// tercer dígito de una cédula de persona natural es < 6, así que ningún
// 21·9·... existe. Se ven como una cédula a simple vista, que es lo que hace
// falta en una demostración.
const CED = {
  owner: '2199000001',
  coach1: '2199000011',
  coach2: '2199000012',
  atleta: '2199000101', // el atleta logueable
};
const TEL_PADRE_DEMO = '0999770001'; // el representante logueable

const GRUPOS = [
  {
    nombre: 'Titanes Sub-10', bucket: 'Sub12', edadMin: 9, edadMax: 10, atletas: 7,
    horario: 'Lun y Mié 15:00-16:15', dias_semana: ['Lunes', 'Miércoles'],
    hora_inicio: '15:00', hora_fin: '16:15', precio_mensual: 28, precio_sesion_ind: 9,
  },
  {
    nombre: 'Titanes Sub-13', bucket: 'Sub15', edadMin: 12, edadMax: 13, atletas: 9,
    horario: 'Mar y Jue 16:30-18:00', dias_semana: ['Martes', 'Jueves'],
    hora_inicio: '16:30', hora_fin: '18:00', precio_mensual: 32, precio_sesion_ind: 10,
  },
  {
    nombre: 'Titanes Sub-16', bucket: 'Sub18', edadMin: 15, edadMax: 16, atletas: 8,
    horario: 'Lun, Mié y Vie 18:00-19:30', dias_semana: ['Lunes', 'Miércoles', 'Viernes'],
    hora_inicio: '18:00', hora_fin: '19:30', precio_mensual: 38, precio_sesion_ind: 12,
  },
];

const NOMBRES_M = ['Mateo', 'Emilio', 'Thiago', 'Sebastián', 'Joaquín', 'Alejandro', 'Bruno', 'Andrés', 'Nicolás', 'Damián', 'Ismael', 'Adrián'];
const NOMBRES_F = ['Antonella', 'Valentina', 'Emilia', 'Renata', 'Amelia', 'Julieta', 'Fernanda', 'Camila', 'Doménica', 'Rafaela', 'Micaela', 'Paula'];
const APELLIDOS = ['Morán', 'Chuquimarca', 'Yépez', 'Cabrera', 'Grefa', 'Toapanta', 'Zambrano', 'Piaguaje', 'Naranjo', 'Cueva', 'Andi', 'Villamar', 'Shiguango', 'Peñafiel'];
const POSICIONES = ['Base', 'Escolta', 'Alero', 'Ala-Pívot', 'Pívot'];
const NIVELES = ['Micro', 'Desarrollo', 'Desarrollo', 'Desarrollo', 'Elite'];

// Las 12 claves cubren los 8 sub-pilares del radar. Según el bucket, dos de
// resistencia no aplican (carrera_600m solo Sub12, carrera_1000m solo Sub15):
// resolverUmbrales devuelve null y la prueba se salta sola.
const CLAVES = ['cmj_salto', 'pushups_30s', 'sentadilla_rel', 'sit_reach', 'course_navette', 'yoyo_ir1', 'carrera_600m_vinueza', 'carrera_1000m_vinueza', 'tiro_libre', 'zigzag_balon', 'eficiencia_tactica', 'resiliencia'];
const PUNT_TIER = { poor: 15, below_avg: 35, average: 55, above_avg: 75, excellent: 95 };

// Tres baterías a lo largo de medio año. `p` es el nivel del atleta en esa
// fecha (0 = tope inferior del baremo, 1 = tope superior); sube para que las
// gráficas de tendencia muestren progreso, que es lo que se quiere enseñar.
const BATERIAS = [
  { diasAtras: 168, p: 0.30, nota: 'Batería inicial de temporada' },
  { diasAtras: 84, p: 0.46, nota: 'Control de medio ciclo' },
  { diasAtras: 6, p: 0.63, nota: 'Última batería' },
];

// ===================================================================
// UTILIDADES
// ===================================================================

// Semilla fija: dos corridas producen el mismo club (los nombres y valores no
// bailan entre demostraciones). El azar criptográfico se reserva para las
// contraseñas, más abajo.
let semilla = 20260730;
const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
const entre = (a, b) => Math.floor(rnd() * (b - a + 1)) + a;
const decimal = (a, b, dec = 2) => { const f = 10 ** dec; return Math.round((rnd() * (b - a) + a) * f) / f; };
const uno = (arr) => arr[entre(0, arr.length - 1)];
const masDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const masMeses = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const soloFecha = (d) => d.toISOString().split('T')[0];

const correoSintetico = (cedula) => `${cedula.toLowerCase()}@sinacceso.blackgoldapp.internal`;

// Contraseñas para dictar por teléfono en medio de una demostración: dos
// palabras y cuatro dígitos, sin tildes ni caracteres que se confundan al
// hablar. 18 caracteres, por encima del mínimo de 12 de passwordPolicy.
const PALABRAS = ['Cancha', 'Rebote', 'Titan', 'Aro', 'Bloqueo', 'Pivote', 'Salto', 'Asiste', 'Triple', 'Base', 'Aguila', 'Rayo', 'Selva', 'Sucumbios', 'Aguarico', 'Coca'];
const generarPassword = () => {
  const a = PALABRAS[randomInt(PALABRAS.length)];
  let b = PALABRAS[randomInt(PALABRAS.length)];
  while (b === a) b = PALABRAS[randomInt(PALABRAS.length)];
  return `${a}-${b}-${String(randomInt(1000, 10000))}`;
};

const tierDe = (tipo, cortes, valor) => {
  const [t1, t2, t3, t4] = cortes;
  if (tipo === 'mas_es_mejor') return valor > t4 ? 'excellent' : valor > t3 ? 'above_avg' : valor > t2 ? 'average' : valor > t1 ? 'below_avg' : 'poor';
  return valor <= t1 ? 'excellent' : valor <= t2 ? 'above_avg' : valor <= t3 ? 'average' : valor <= t4 ? 'below_avg' : 'poor';
};

// `p` de 0 a 1 recorre el baremo de peor a mejor. En las pruebas donde menos es
// mejor los cortes van al revés (t1 es el mejor), así que el recorrido se
// invierte; sin esto, media demostración saldría con marcas de récord mundial.
//
// El recorrido se estira un 15% por cada extremo A PROPÓSITO. La app guarda solo
// cinco puntuaciones posibles, una por tier (TIER_CONFIG[tier].score), y los
// tiers extremos viven FUERA de [t1, t4]: 'poor' por debajo del primer corte y
// 'excellent' por encima del cuarto. Recorriendo solo [t1, t4] ningún atleta
// alcanzaba esos dos, así que sus ocho ejes caían en dos escalones y el radar
// era un círculo (medido: 2 puntuaciones distintas en 11 pruebas).
const MARGEN = 0.15;
const valorSegunNivel = (tipo, cortes, p) => {
  const [t1, , , t4] = cortes;
  const lo = Math.min(t1, t4);
  const alto = Math.max(t1, t4);
  const span = alto - lo;
  const q = Math.min(1, Math.max(0, p));
  const desde = lo - span * MARGEN;
  const recorrido = span * (1 + 2 * MARGEN);
  const v = tipo === 'mas_es_mejor' ? desde + recorrido * q : (alto + span * MARGEN) - recorrido * q;
  const dec = span < 5 ? 2 : 1;
  const f = 10 ** dec;
  return Math.round(v * f) / f;
};

// ===================================================================
// CUENTAS
// ===================================================================

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

// Crea (o repara) la fila de `usuarios`. Con `password`, además garantiza la
// cuenta de Auth y deja esa contraseña puesta, pase lo que pase antes.
async function upsertPersona({ cedula, nombre, rol, correo = null, telefono = null, categoria = null, fecha_nacimiento = null, genero = null, password = null }) {
  const email = correo || correoSintetico(cedula);
  if (!EJECUTAR) {
    console.log(`  · ${rol.padEnd(10)} ${cedula.padEnd(18)} ${nombre}${password ? '  [logueable]' : ''}`);
    return { id: null, email };
  }

  const { data: ya } = await db.from('usuarios').select('id, auth_user_id').eq('cedula', cedula).maybeSingle();
  let id = ya?.id;
  if (!id) {
    const fila = { cedula, nombre, rol, club: CLUB, correo, telefono, categoria };
    if (fecha_nacimiento) { fila.fecha_nacimiento = fecha_nacimiento; fila.genero = genero || 'Masculino'; }
    const { data, error } = await db.from('usuarios').insert(fila).select('id').single();
    if (error) throw new Error(`usuarios ${cedula} (${nombre}): ${error.message}`);
    id = data.id;
  }

  if (!password) return { id, email };

  // El acceso: crear la cuenta o, si ya estaba, reescribirle la contraseña.
  // `debe_cambiar_password: false` va explícito porque una cuenta que naciera
  // por otra vía (el panel, el registro público) llegaría marcada y mandaría al
  // tercero a la pantalla de cambio obligatorio.
  const metadatos = { debe_cambiar_password: false, club_demostracion: true };
  let authId = ya?.auth_user_id ?? null;

  if (!authId) {
    const { data, error } = await db.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { usuario_id: id, demo: true },
      app_metadata: metadatos,
    });
    if (!error && data?.user) {
      authId = data.user.id;
    } else {
      // Típico de una base reseteada: la fila se borró pero la cuenta de Auth
      // sobrevivió. Se re-vincula solo si no hay ambigüedad.
      const candidatos = await buscarAuthPorEmail(email);
      if (candidatos.length === 1) {
        authId = candidatos[0].id;
        console.log(`  🔗 ${cedula}: re-vinculado a la cuenta de Auth que ya existía.`);
      } else {
        throw new Error(`auth ${cedula}: ${error?.message || 'sin user'} y ${candidatos.length} candidatos para ${email}`);
      }
    }
  }

  const { error: eUpd } = await db.auth.admin.updateUserById(authId, {
    password, email_confirm: true, app_metadata: metadatos,
  });
  if (eUpd) throw new Error(`fijar contraseña de ${cedula}: ${eUpd.message}`);

  // El trigger de v24 vincula solo a atletas y representantes (por correo o por
  // cédula sintética); al staff hay que vincularlo aquí.
  const { data: fila } = await db.from('usuarios').select('auth_user_id').eq('id', id).single();
  if (fila?.auth_user_id !== authId) {
    const { error } = await db.from('usuarios').update({ auth_user_id: authId }).eq('id', id);
    if (error) throw new Error(`vincular ${cedula}: ${error.message}`);
  }

  return { id, email };
}

// ===================================================================
// SIEMBRA
// ===================================================================

// Borra las secciones que pida DEMO_REHACER, y SOLO de este club: la lista de
// atletas se resuelve desde `usuarios.club`, así que no puede alcanzar a otro.
async function rehacer() {
  const pedidas = (process.env.DEMO_REHACER || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!pedidas.length) return;
  const validas = ['evaluaciones', 'bienestar', 'misiones', 'sesiones'];
  const desconocidas = pedidas.filter((p) => !validas.includes(p));
  if (desconocidas.length) throw new Error(`DEMO_REHACER no entiende "${desconocidas.join(', ')}". Opciones: ${validas.join(', ')}`);
  if (!EJECUTAR) { console.log(`(DEMO_REHACER=${pedidas.join(',')} solo actúa con SEED_REAL=1)\n`); return; }

  const { data: personas } = await db.from('usuarios').select('id').eq('club', CLUB);
  if (!personas?.length) { console.log('DEMO_REHACER: el club aún no existe, nada que borrar.\n'); return; }
  const { data: filas } = await db.from('atletas').select('id').in('usuario_id', personas.map((p) => p.id));
  const ids = filas.map((f) => f.id);
  console.log(`── Rehaciendo: ${pedidas.join(', ')} ──`);

  if (pedidas.includes('evaluaciones') && ids.length) {
    const { count } = await db.from('evaluaciones_pruebas').delete({ count: 'exact' }).in('atleta_id', ids);
    await db.from('atletas').update({ overall_score: 0, rango: 'rookie' }).in('id', ids);
    console.log(`  ${count} pruebas borradas.`);
  }
  if (pedidas.includes('bienestar') && ids.length) {
    const { count } = await db.from('atleta_readiness').delete({ count: 'exact' }).in('atleta_id', ids);
    console.log(`  ${count} respuestas de bienestar borradas.`);
  }
  if (pedidas.includes('misiones') && ids.length) {
    const { count: cp } = await db.from('progreso_misiones').delete({ count: 'exact' }).in('atleta_id', ids);
    const { count: cx } = await db.from('xp_eventos').delete({ count: 'exact' }).eq('origen', 'club_demostracion').in('atleta_id', ids);
    await db.from('atletas').update({ xp_total: 0 }).in('id', ids);
    // Las misiones del catálogo se conservan: el reparto vuelve a apuntar a
    // ellas y borrarlas rompería la FK de cualquier progreso ajeno.
    console.log(`  ${cp} misiones asignadas y ${cx} eventos de XP borrados.`);
  }
  if (pedidas.includes('sesiones')) {
    const { data: staff } = await db.from('usuarios').select('id').eq('club', CLUB).in('rol', ['coach', 'owner']);
    const { count } = await db.from('sesiones_control').delete({ count: 'exact' }).in('coach_id', staff.map((s) => s.id));
    console.log(`  ${count} sesiones borradas.`);
  }
  console.log('');
}

async function sembrar() {
  console.log(`=== Club de demostración: "${CLUB}" ===`);
  console.log(`Modo: ${EJECUTAR ? '🚀 REAL (escribe en producción)' : '🔍 DRY-RUN (no escribe nada)'}\n`);
  await rehacer();

  const claves = {
    owner: process.env.DEMO_PASS_OWNER || generarPassword(),
    coach: process.env.DEMO_PASS_COACH || generarPassword(),
    atleta: process.env.DEMO_PASS_ATLETA || generarPassword(),
    padre: process.env.DEMO_PASS_PADRE || generarPassword(),
  };

  // ── 1. Staff ──────────────────────────────────────────────────────
  console.log('── 1. Staff ──');
  const owner = await upsertPersona({
    cedula: CED.owner, nombre: 'Ricardo Salazar Vinueza', rol: 'owner',
    correo: `direccion@${DOMINIO}`, telefono: '0999770010', password: claves.owner,
  });
  const coach1 = await upsertPersona({
    cedula: CED.coach1, nombre: 'Elena Chamorro Ruiz', rol: 'coach',
    correo: `elena.chamorro@${DOMINIO}`, telefono: '0999770011',
    categoria: 'Todas', password: claves.coach,
  });
  // El segundo coach acota su alcance a una categoría: así la demostración
  // puede mostrar que un entrenador no ve al club entero.
  const coach2 = await upsertPersona({
    cedula: CED.coach2, nombre: 'Iván Beltrán Ocaña', rol: 'coach',
    correo: `ivan.beltran@${DOMINIO}`, telefono: '0999770012',
    categoria: 'Menores (Sub-14)',
  });

  // ── 2. Grupos ─────────────────────────────────────────────────────
  console.log('\n── 2. Grupos ──');
  const idGrupo = {};
  for (const g of GRUPOS) {
    if (!EJECUTAR) { console.log(`  · ${g.nombre.padEnd(18)} ${g.horario}  $${g.precio_mensual}/mes`); continue; }
    const { data: ya } = await db.from('grupos_entrenamiento').select('id').eq('nombre', g.nombre).maybeSingle();
    if (ya) { idGrupo[g.nombre] = ya.id; continue; }
    const { data, error } = await db.from('grupos_entrenamiento').insert({
      nombre: g.nombre, horario: g.horario, club: CLUB,
      descripcion: `Grupo ${g.nombre} — ${CLUB}`,
      precio_mensual: g.precio_mensual, precio_sesion_ind: g.precio_sesion_ind,
      hora_inicio: g.hora_inicio, hora_fin: g.hora_fin, dias_semana: g.dias_semana,
    }).select('id').single();
    // El nombre del grupo es UNIQUE GLOBAL, no por club: si otro club ya usó
    // este nombre, decirlo claro en vez de dejar un error de Postgres crudo.
    if (error) throw new Error(`grupo ${g.nombre}: ${error.message}`);
    idGrupo[g.nombre] = data.id;
  }

  // ── 3. Atletas ────────────────────────────────────────────────────
  console.log('\n── 3. Atletas ──');
  const plantel = [];
  const nombresUsados = new Set();
  // Dos atletas con el mismo nombre en un plantel de 24 se ve a la primera
  // mirada, así que la combinación se rechaza y se vuelve a tirar.
  const nombreLibre = (genero, apellidoFijo = null) => {
    const pila = genero === 'Femenino' ? NOMBRES_F : NOMBRES_M;
    for (let intento = 0; intento < 60; intento++) {
      const candidato = `${uno(pila)} ${apellidoFijo || uno(APELLIDOS)}`;
      if (!nombresUsados.has(candidato)) { nombresUsados.add(candidato); return candidato; }
    }
    // Salida de emergencia: el espacio de nombres es de sobra (12 × 14 por
    // género), pero mejor un segundo apellido que un plantel con clones.
    const forzado = `${uno(pila)} ${uno(APELLIDOS)} ${uno(APELLIDOS)}`;
    nombresUsados.add(forzado);
    return forzado;
  };

  let n = 0;
  for (const g of GRUPOS) {
    for (let i = 0; i < g.atletas; i++) {
      const genero = rnd() < 0.42 ? 'Femenino' : 'Masculino';
      const edad = entre(g.edadMin, g.edadMax);
      const nac = new Date(HOY.getFullYear() - edad, entre(0, 11), entre(1, 28));
      plantel.push({
        // El rango arranca en 200 para no pisar CED.atleta (…101), que se
        // reserva para la cuenta logueable unas líneas más abajo. `cedula` es
        // UNIQUE: la colisión rompería el alta a mitad de la siembra.
        cedula: `2199${String(200 + n).padStart(6, '0')}`,
        nombre: nombreLibre(genero),
        fnac: soloFecha(nac), edad, genero,
        posicion: uno(POSICIONES), nivel: NIVELES[n % NIVELES.length],
        grupo: g.nombre, bucket: g.bucket,
        // Cada atleta rinde un poco distinto...
        sesgo: decimal(-0.13, 0.14, 3),
        // ...y además tiene fortalezas y flaquezas. Sin este perfil por prueba,
        // los ocho ejes de un atleta salen con la misma puntuación y el radar es
        // un círculo perfecto: se ve falso a la primera mirada.
        perfil: Object.fromEntries(CLAVES.map((c) => [c, decimal(-0.30, 0.30, 3)])),
        esCuenta: false, // el logueable se elige más abajo
      });
      n++;
    }
  }
  // El atleta logueable es el primero del grupo mediano: tiene baremos
  // completos (Sub15 usa las dos pruebas de resistencia) y edad de menor, que
  // es el caso normal del club.
  const logueable = plantel.find((a) => a.bucket === 'Sub15');
  logueable.cedula = CED.atleta;
  logueable.nombre = 'Antonella Morán Grefa';
  logueable.genero = 'Femenino';
  logueable.esCuenta = true;
  nombresUsados.add(logueable.nombre);
  // Su hermano, explícito: dos hijos de la misma representante es lo que hace
  // visible el descuento por hermanos en la pantalla de cobros.
  const hermano = plantel.filter((a) => a.bucket === 'Sub15')[1];
  hermano.nombre = 'Nicolás Morán Grefa';
  hermano.genero = 'Masculino';
  nombresUsados.add(hermano.nombre);

  const idAtleta = {};
  for (const a of plantel) {
    const usu = await upsertPersona({
      cedula: a.cedula, nombre: a.nombre, rol: 'atleta',
      fecha_nacimiento: a.fnac, genero: a.genero,
      password: a.esCuenta ? claves.atleta : null,
    });
    if (!EJECUTAR) continue;

    const { data: ya } = await db.from('atletas').select('id').eq('usuario_id', usu.id).maybeSingle();
    let aid = ya?.id;
    if (!aid) {
      const { data, error } = await db.from('atletas').insert({
        usuario_id: usu.id, edad: a.edad, posicion: a.posicion,
        nivel_desarrollo: a.nivel, grupo_id: idGrupo[a.grupo], grupo_nombre: a.grupo,
        fecha_alta: soloFecha(masMeses(HOY, -entre(1, 10))), estado_membresia: 'activo',
        altura_cm: a.bucket === 'Sub12' ? decimal(132, 148, 1) : a.bucket === 'Sub15' ? decimal(148, 168, 1) : decimal(162, 186, 1),
        peso_kg: a.bucket === 'Sub12' ? decimal(28, 42, 1) : a.bucket === 'Sub15' ? decimal(40, 58, 1) : decimal(52, 78, 1),
      }).select('id').single();
      if (error) throw new Error(`atletas ${a.cedula}: ${error.message}`);
      aid = data.id;
    }
    idAtleta[a.cedula] = aid;

    // `rol_membresia` explícito (v38): el DEFAULT es 'adicional', y sin grupo
    // básico el atleta no factura mensualidad.
    const { data: yaV } = await db.from('atleta_grupo').select('atleta_id')
      .eq('atleta_id', aid).eq('grupo_id', idGrupo[a.grupo]).maybeSingle();
    if (!yaV) {
      await db.from('atleta_grupo').insert({ atleta_id: aid, grupo_id: idGrupo[a.grupo], rol_membresia: 'basica' });
    }
  }
  console.log(`Atletas: ${plantel.length} en ${GRUPOS.length} grupos (cuenta logueable: ${CED.atleta}).`);

  // ── 4. Representantes ─────────────────────────────────────────────
  // Uno logueable, con dos hijos en el club para que se vea el descuento de
  // hermanos, y varios más sin acceso: el portal del dueño necesita
  // representantes de pago para que la cobranza no salga vacía.
  console.log('\n── 4. Representantes ──');
  const hermanos = plantel.filter((a) => a.bucket === 'Sub15').slice(0, 2);
  const padreDemo = await upsertPersona({
    cedula: `PADRE_${TEL_PADRE_DEMO}`, nombre: 'Gabriela Grefa Andi', rol: 'padre',
    correo: `familia.moran@${DOMINIO}`, telefono: TEL_PADRE_DEMO, password: claves.padre,
  });
  if (EJECUTAR) {
    for (const h of hermanos) {
      const aid = idAtleta[h.cedula];
      const { data: ya } = await db.from('padres_atletas').select('padre_id')
        .eq('padre_id', padreDemo.id).eq('atleta_id', aid).maybeSingle();
      if (!ya) await db.from('padres_atletas').insert({ padre_id: padreDemo.id, atleta_id: aid, es_rep_pagos: true });
    }
  }

  const restantes = plantel.filter((a) => !hermanos.includes(a));
  for (let i = 0; i < Math.min(9, restantes.length); i++) {
    const hijo = restantes[i];
    const tel = `09997701${String(20 + i).padStart(2, '0')}`;
    // Comparte el apellido del hijo (así la relación se lee sola) pero pasa por
    // el mismo control de nombres: una representante llamada igual que una
    // atleta del club desconcierta a quien está viendo la demostración.
    const rep = await upsertPersona({
      cedula: `PADRE_${tel}`,
      nombre: nombreLibre('Femenino', hijo.nombre.split(' ').slice(-1)[0]),
      rol: 'padre', telefono: tel, correo: `rep${i + 1}@${DOMINIO}`,
    });
    if (!EJECUTAR) continue;
    const aid = idAtleta[hijo.cedula];
    const { data: ya } = await db.from('padres_atletas').select('padre_id')
      .eq('padre_id', rep.id).eq('atleta_id', aid).maybeSingle();
    if (!ya) await db.from('padres_atletas').insert({ padre_id: rep.id, atleta_id: aid, es_rep_pagos: true });
  }
  console.log(`Representantes: 10 (logueable: ${TEL_PADRE_DEMO}, con ${hermanos.length} hijos).`);

  if (!EJECUTAR) {
    console.log('\n── 5-10. Histórico ──');
    console.log(`  · ${BATERIAS.length} baterías de evaluación por atleta, con progresión`);
    console.log('  · asistencia de las últimas 6 semanas');
    console.log('  · misiones del catálogo + XP reciente');
    console.log('  · encuestas de bienestar de los últimos 12 días');
    console.log('  · pagos de 3 meses (pagados, pendientes y vencidos) + transacciones');
    console.log('  · 1 evento convocado + 1 comunicado + configuración de cobros');
    console.log(`\n🔍 DRY-RUN: no se escribió nada. Para ejecutar:\n   SEED_REAL=1 node scripts/sembrar_club_demostracion.mjs`);
    return null;
  }

  // ── 5. Evaluaciones ───────────────────────────────────────────────
  console.log('\n── 5. Evaluaciones ──');
  let nEval = 0;
  for (const a of plantel) {
    const aid = idAtleta[a.cedula];
    const { data: ya } = await db.from('evaluaciones_pruebas').select('id').eq('atleta_id', aid).limit(1);
    if (ya?.length) continue;

    let ultimas = [];
    for (const bat of BATERIAS) {
      const cuando = masDias(HOY, -bat.diasAtras).toISOString();
      const filas = [];
      for (const clave of CLAVES) {
        const b = BAREMOS[clave];
        const cortes = resolverUmbrales(b.thresholds, { bucket: a.bucket, genero: a.genero, nivelDesarrollo: a.nivel });
        if (!cortes) continue;
        const valor = valorSegunNivel(b.tipo, cortes, bat.p + a.sesgo + (a.perfil[clave] ?? 0));
        const tier = tierDe(b.tipo, cortes, valor);
        filas.push({
          atleta_id: aid, prueba_tipo: b.label, pilar: b.pilar, sub_pilar: b.sub_pilar,
          tren: b.tren || null, lado: 'unico', valor_crudo: valor, unidad: b.unidad,
          puntuacion_normalizada: PUNT_TIER[tier], tier,
          registrado_por: coach1.id, created_at: cuando, notas: bat.nota,
        });
      }
      if (!filas.length) continue;
      const { error } = await db.from('evaluaciones_pruebas').insert(filas);
      if (error) throw new Error(`evaluaciones ${a.cedula}: ${error.message}`);
      nEval += filas.length;
      ultimas = filas;
    }
    if (ultimas.length) {
      const { overall, rango } = calcularOverall(ultimas);
      await db.from('atletas').update({ overall_score: overall, rango: rango.id, rango_tier: rango.nombre }).eq('id', aid);
    }
  }
  console.log(`  ${nEval} pruebas registradas (${BATERIAS.length} baterías × ${plantel.length} atletas).`);

  // ── 6. Asistencia ─────────────────────────────────────────────────
  console.log('\n── 6. Asistencia ──');
  const idsPlantel = Object.values(idAtleta);
  const { data: yaAsis } = await db.from('asistencia').select('id').in('atleta_id', idsPlantel).limit(1);
  if (yaAsis?.length) {
    console.log('  ⏭️  ya sembrada, se omite.');
  } else {
    const diasDe = new Map(GRUPOS.map((g) => [g.nombre, g.dias_semana]));
    const NOMBRE_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const filas = [];
    for (const a of plantel) {
      const dias = diasDe.get(a.grupo);
      for (let d = 0; d < 42; d++) {
        const fecha = masDias(HOY, -d);
        // Solo hay asistencia los días que ese grupo entrena: un club con
        // asistencia los domingos se nota a la primera mirada.
        if (!dias.includes(NOMBRE_DIA[fecha.getDay()])) continue;
        const r = rnd();
        filas.push({
          atleta_id: idAtleta[a.cedula], coach_id: coach1.id, fecha: soloFecha(fecha),
          estado: r < 0.86 ? 'Presente' : r < 0.94 ? 'Justificada' : 'Ausente',
        });
      }
    }
    const vistos = new Set();
    const unicos = filas.filter((f) => { const k = `${f.atleta_id}|${f.fecha}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
    for (let i = 0; i < unicos.length; i += 500) {
      const { error } = await db.from('asistencia').insert(unicos.slice(i, i + 500));
      if (error) throw new Error(`asistencia: ${error.message}`);
    }
    console.log(`  ${unicos.length} registros en las últimas 6 semanas.`);
  }

  // ── 7. Misiones y XP ──────────────────────────────────────────────
  console.log('\n── 7. Misiones y XP ──');
  const ORIGEN = 'club_demostracion';
  const catalogo = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed_catalogo_misiones.json'), 'utf8')).misiones;
  const bucketsUsados = [...new Set(GRUPOS.map((g) => g.bucket))];
  const { data: yaMis } = await db.from('misiones').select('id, titulo, categoria_bucket, xp_recompensa, nivel_objetivo')
    .eq('condicion_trigger', ORIGEN);
  let misiones = yaMis ?? [];
  const conocidas = new Set(misiones.map((m) => `${m.titulo}|${m.categoria_bucket}`));
  // El recorte va ANTES de descartar las conocidas: al revés, cada corrida
  // metía 24 misiones más —las 24 siguientes del catálogo— y el club acababa con
  // un listado inflado (medido: 48 tras la segunda corrida).
  const nuevas = catalogo
    .filter((m) => bucketsUsados.includes(m.categoria_bucket))
    .slice(0, 24)
    .filter((m) => !conocidas.has(`${m.titulo}|${m.categoria_bucket}`));
  if (nuevas.length) {
    const { data, error } = await db.from('misiones').insert(nuevas.map((m) => ({
      titulo: m.titulo, descripcion: m.descripcion, justificacion: m.justificacion,
      pilar: m.pilar, nivel_objetivo: null, categoria_bucket: m.categoria_bucket,
      complejidad: m.complejidad, xp_recompensa: m.xp_recompensa, activa: true,
      is_ai_generated: true, condicion_trigger: ORIGEN,
      created_by: coach1.id, autor_id: coach1.id,
    }))).select('id, titulo, categoria_bucket, xp_recompensa, nivel_objetivo');
    if (error) throw new Error(`misiones: ${error.message}`);
    misiones = misiones.concat(data);
  }

  const { data: yaXp } = await db.from('xp_eventos').select('id').eq('origen', ORIGEN).limit(1);
  if (yaXp?.length) {
    console.log('  ⏭️  XP ya sembrado, se omite.');
  } else {
    const eventosXp = [];
    for (const a of plantel) {
      const aid = idAtleta[a.cedula];
      const candidatas = misiones.filter((m) => m.categoria_bucket === a.bucket);
      if (!candidatas.length) continue;
      const cuantas = a.esCuenta ? 6 : entre(2, 4);
      // Al menos una aprobada por atleta: el XP sale de las misiones aprobadas,
      // y sin esto la mayoría del plantel arrancaba en cero (medido: 6 de 24).
      const aprobadas = Math.max(1, cuantas - 2);
      for (let i = 0; i < cuantas && i < candidatas.length; i++) {
        const m = candidatas[i];
        const estado = i < aprobadas ? 'aprobada' : uno(['pendiente', 'pendiente_aprobacion']);
        const completada = estado !== 'pendiente';
        const asignada = masDias(HOY, -entre(3, 40));
        const { data: yaP } = await db.from('progreso_misiones').select('id')
          .eq('atleta_id', aid).eq('mision_id', m.id).maybeSingle();
        if (!yaP) {
          await db.from('progreso_misiones').insert({
            atleta_id: aid, mision_id: m.id, completada,
            fecha_completada: completada ? masDias(asignada, 3).toISOString() : null,
            estado, asignado_por: coach1.id, tipo_asignacion: 'individual',
            fecha_asignacion: asignada.toISOString(), origen: 'coach',
          });
        }
        if (estado === 'aprobada') {
          eventosXp.push({
            atleta_id: aid, coach_id: coach1.id,
            delta: calcularXPMision({ xp_recompensa: m.xp_recompensa, nivel_objetivo: m.nivel_objetivo || null }, { nivel_desarrollo: a.nivel }),
            motivo: 'Misión aprobada', origen: ORIGEN,
            created_at: masDias(asignada, 3).toISOString(),
          });
        }
      }
      // Racha reciente para que el arcade del atleta no arranque en cero.
      if (a.esCuenta) {
        for (let d = 0; d < 10; d++) {
          if (rnd() < 0.35) continue;
          eventosXp.push({
            atleta_id: aid, coach_id: coach1.id, delta: entre(15, 45),
            motivo: 'Evaluación Modo Cancha', origen: ORIGEN,
            created_at: masDias(HOY, -d).toISOString(),
          });
        }
      }
    }
    for (let i = 0; i < eventosXp.length; i += 500) {
      const { error } = await db.from('xp_eventos').insert(eventosXp.slice(i, i + 500));
      if (error) throw new Error(`xp_eventos: ${error.message}`);
    }
    // `xp_total` del atleta: lo consume el HUD y no se recalcula solo.
    const porAtleta = new Map();
    for (const e of eventosXp) porAtleta.set(e.atleta_id, (porAtleta.get(e.atleta_id) ?? 0) + e.delta);
    for (const [aid, total] of porAtleta) await db.from('atletas').update({ xp_total: total }).eq('id', aid);
    console.log(`  ${misiones.length} misiones en catálogo, ${eventosXp.length} eventos de XP.`);
  }

  // ── 8. Encuestas de bienestar ─────────────────────────────────────
  console.log('\n── 8. Bienestar ──');
  const { data: yaRd } = await db.from('atleta_readiness').select('id').in('atleta_id', idsPlantel).limit(1);
  if (yaRd?.length) {
    console.log('  ⏭️  ya sembrado, se omite.');
  } else {
    // `readiness_score` es una columna generada: (sueño·0.4 + frescura·0.4 +
    // (9−orina)·0.2). Por debajo de 7 el atleta sale como "Fatiga Silenciosa" y
    // por debajo de 4 como "Agotamiento Activo" (metricas.js), y con orina ≥ 5
    // salta la alerta de hidratación (senalesAtleta.js). El panel "atletas a
    // mirar hoy" es una de las cosas que hay que poder mostrar, así que se
    // siembran a propósito los tres casos en vez de esperar que salgan solos.
    const PERFILES = {
      bien: () => ({ sueno_calidad: entre(7, 9), fatiga_fisica: entre(7, 9), color_orina: entre(1, 3) }),
      fatiga: () => ({ sueno_calidad: entre(5, 6), fatiga_fisica: entre(4, 6), color_orina: entre(3, 4) }),
      agotado: () => ({ sueno_calidad: entre(3, 4), fatiga_fisica: entre(2, 4), color_orina: entre(5, 7) }),
    };
    // Quiénes traen mala señal HOY. La señal exige respuesta del día: con una de
    // ayer, la pantalla dice "sin señales" y no habría nada que enseñar.
    const respondenHoy = plantel.filter((x) => x.esCuenta || rnd() < 0.42);
    const conAgotamiento = new Set(respondenHoy.filter((x) => !x.esCuenta).slice(0, 2).map((x) => x.cedula));
    const conFatiga = new Set(respondenHoy.filter((x) => !x.esCuenta && !conAgotamiento.has(x.cedula)).slice(0, 3).map((x) => x.cedula));

    const filas = [];
    for (const a of respondenHoy) {
      for (let d = 0; d < 12; d++) {
        if (d > 0 && !a.esCuenta && rnd() < 0.45) continue; // el día de hoy nunca se salta
        // La mala señal es de hoy y de ayer; más atrás, todos normales: un
        // atleta agotado dos semanas seguidas no es un caso, es un error de datos.
        const perfil = d <= 1 && conAgotamiento.has(a.cedula) ? 'agotado'
          : d <= 1 && conFatiga.has(a.cedula) ? 'fatiga'
            : rnd() < 0.15 ? 'fatiga' : 'bien';
        filas.push({
          atleta_id: idAtleta[a.cedula], fecha: soloFecha(masDias(HOY, -d)),
          ...PERFILES[perfil](),
        });
      }
    }
    const vistos = new Set();
    const unicos = filas.filter((f) => { const k = `${f.atleta_id}|${f.fecha}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
    if (unicos.length) {
      const { error } = await db.from('atleta_readiness').insert(unicos);
      if (error) throw new Error(`atleta_readiness: ${error.message}`);
    }
    console.log(`  ${unicos.length} respuestas en los últimos 12 días.`);
  }

  // ── 8b. Sesiones de la agenda ─────────────────────────────────────
  // `sesiones_control` es lo que alimenta el "HOY EN EL CLUB" del dueño y el
  // hero del coach. Sin esto las dos pantallas abren con "Sin sesiones hoy",
  // que es lo primero que ve quien está mirando la demostración.
  console.log('\n── 8b. Agenda de sesiones ──');
  const { data: yaSes } = await db.from('sesiones_control').select('id').eq('coach_id', coach1.id).limit(1);
  if (yaSes?.length) {
    console.log('  ⏭️  ya sembrada, se omite.');
  } else {
    const NOMBRE_DIA_SES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const OBJETIVOS = ['Técnico', 'Físico', 'Táctico', 'Recuperación'];
    const DESCRIPCIONES = {
      'Técnico': 'Mecánica de tiro y manejo con presión',
      'Físico': 'Fuerza de tren inferior y salto',
      'Táctico': 'Lectura de bloqueo directo y transición',
      'Recuperación': 'Movilidad, respiración y descarga',
    };
    const sesiones = [];
    for (const g of GRUPOS) {
      for (let d = 0; d < 28; d++) {
        const fecha = masDias(HOY, -d);
        if (!g.dias_semana.includes(NOMBRE_DIA_SES[fecha.getDay()])) continue;
        const objetivo = uno(OBJETIVOS);
        sesiones.push({
          tipo: 'Grupal', grupo_id: idGrupo[g.nombre], coach_id: coach1.id,
          fecha: soloFecha(fecha), objetivo_tipo: objetivo,
          objetivo_descripcion: DESCRIPCIONES[objetivo],
          // La de hoy todavía no ha pasado: sin veredicto. Las anteriores sí.
          se_logro: d === 0 ? null : uno(['Sí', 'Sí', 'Sí', 'Parcial']),
          notas_evaluacion: d === 0 ? '' : 'Grupo respondió bien al volumen previsto.',
        });
      }
    }
    for (let i = 0; i < sesiones.length; i += 200) {
      const { error } = await db.from('sesiones_control').insert(sesiones.slice(i, i + 200));
      if (error) throw new Error(`sesiones_control: ${error.message}`);
    }
    const hoyEntrenan = sesiones.filter((s) => s.fecha === soloFecha(HOY)).length;
    console.log(`  ${sesiones.length} sesiones en 4 semanas · ${hoyEntrenan} programada${hoyEntrenan === 1 ? '' : 's'} para hoy.`);
    if (!hoyEntrenan) {
      console.log('  ℹ️  Hoy ningún grupo entrena según su horario: la agenda del día saldrá vacía, como en el club real.');
    }
  }

  // ── 9. Cobros ─────────────────────────────────────────────────────
  console.log('\n── 9. Cobros ──');
  await db.from('club_config').upsert({
    club: CLUB,
    whatsapp_club: '593999770010',
    cuenta_bancaria_texto: `Banco Pichincha · Ahorros 2201234567 · ${CLUB} · RUC 2100000001001`,
    dia_vencimiento: 5, descuento_hermanos_pct: 10,
  }, { onConflict: 'club' });

  const precioDe = new Map(GRUPOS.map((g) => [g.nombre, g.precio_mensual]));
  const hijosDe = new Map(); // atleta → cuántos hermanos tiene en el club
  for (const h of hermanos) hijosDe.set(h.cedula, hermanos.length);

  // Tres meses cerrados y el siguiente ya generado. El mes que todavía no vence
  // es el que deja mensualidades en "Pendiente": sin él, la cobranza sale
  // partida solo entre pagado y vencido, que no es la foto de un club vivo.
  const meses = [2, 1, 0, -1].map((k) => { const d = masMeses(HOY, -k); return { mes: d.getMonth() + 1, anio: d.getFullYear() }; });
  const aCobrar = [];
  for (const { mes, anio } of meses) {
    for (const a of plantel) {
      const base = precioDe.get(a.grupo) ?? 30;
      const dto = (hijosDe.get(a.cedula) ?? 1) > 1 ? 10 : 0;
      const final = Math.round(base * (1 - dto / 100) * 100) / 100;
      aCobrar.push({
        atleta_id: idAtleta[a.cedula], tipo: 'Mensualidad', mes, anio,
        monto_base: base, descuento_pct: dto, monto_final: final,
        estado: 'Pendiente',
        fecha_vencimiento: `${anio}-${String(mes).padStart(2, '0')}-05`,
        registrado_por: owner.id, notas: '',
      });
    }
  }
  // Idempotencia por consulta previa: el índice único de `pagos` es PARCIAL
  // desde v39 y PostgREST no puede inferirlo, así que un onConflict aquí falla.
  const { data: yaPagos } = await db.from('pagos').select('atleta_id, mes, anio, tipo').in('atleta_id', idsPlantel);
  const registrados = new Set((yaPagos ?? []).map((p) => `${p.atleta_id}|${p.mes}|${p.anio}|${p.tipo}`));
  const nuevosPagos = aCobrar.filter((p) => !registrados.has(`${p.atleta_id}|${p.mes}|${p.anio}|${p.tipo}`));
  for (let i = 0; i < nuevosPagos.length; i += 500) {
    const { error } = await db.from('pagos').insert(nuevosPagos.slice(i, i + 500));
    if (error) throw new Error(`pagos: ${error.message}`);
  }

  // Cobros de lo ya vencido: la mayoría al día, unos cuantos sin pagar y unos
  // pocos a medias. El trigger trg_recalcular_pago (v27) traduce cada abono a
  // 'Pagado' o 'Abonado' según cubra el total o no.
  const { data: pagos } = await db.from('pagos').select('id, monto_final, monto_base, estado, fecha_vencimiento')
    .in('atleta_id', idsPlantel).eq('tipo', 'Mensualidad');
  const hoyISO = soloFecha(HOY);
  let nTx = 0;
  let nParciales = 0;
  for (const p of pagos ?? []) {
    if (p.estado === 'Becado') continue;
    if (p.fecha_vencimiento >= hoyISO) continue; // el mes que aún no vence se queda Pendiente
    const { data: tx } = await db.from('pago_transacciones').select('id').eq('pago_id', p.id).limit(1);
    if (tx?.length) continue;
    if (rnd() < 0.18) continue; // los morosos, que acabarán en Vencido
    const total = Number(p.monto_final ?? p.monto_base ?? 30);
    const parcial = rnd() < 0.14;
    const { error } = await db.from('pago_transacciones').insert({
      pago_id: p.id,
      monto: parcial ? Math.round(total * 0.5 * 100) / 100 : total,
      forma_pago: rnd() < 0.55 ? 'Transferencia' : 'Efectivo',
      referencia: parcial ? 'Abono parcial en secretaría' : 'Pago registrado en secretaría',
      registrado_por: owner.id,
    });
    if (error) throw new Error(`pago_transacciones: ${error.message}`);
    nTx++;
    if (parcial) nParciales++;
  }

  // Un abono ya deja el pago en 'Pagado' o 'Abonado' (trigger trg_recalcular_pago,
  // v27). Lo que queda pendiente de un mes cerrado es 'Vencido', y de eso se
  // encarga el pg_cron: aquí se adelanta, o la cobranza saldría entera en
  // "Pendiente" y el tablero del dueño no mostraría el caso que importa.
  const { data: vencidos, error: eVenc } = await db.from('pagos')
    .update({ estado: 'Vencido' })
    .in('atleta_id', idsPlantel)
    .eq('estado', 'Pendiente')
    .lt('fecha_vencimiento', soloFecha(HOY))
    .select('id');
  if (eVenc) throw new Error(`marcar vencidos: ${eVenc.message}`);
  console.log(`  ${nuevosPagos.length} mensualidades nuevas, ${nTx} cobros (${nParciales} parciales), ${vencidos?.length ?? 0} vencidos.`);

  // ── 10. Evento y comunicado ───────────────────────────────────────
  console.log('\n── 10. Evento y comunicado ──');
  const TITULO_EVENTO = 'Amistoso contra Escuela Municipal';
  const { data: yaEv } = await db.from('eventos').select('id').eq('club', CLUB).eq('titulo', TITULO_EVENTO).maybeSingle();
  let eventoId = yaEv?.id;
  if (!eventoId) {
    const { data, error } = await db.from('eventos').insert({
      club: CLUB, creado_por: coach1.id, tipo: 'partido', estado: 'publicado',
      titulo: TITULO_EVENTO, descripcion: 'Presentarse 45 minutos antes, con uniforme completo.',
      rival: 'Escuela Municipal Nueva Loja',
      fecha_evento: masDias(HOY, 5).toISOString(), hora_inicio: '10:00',
      sede: 'Coliseo Mayor de Nueva Loja',
    }).select('id').single();
    if (error) throw new Error(`eventos: ${error.message}`);
    eventoId = data.id;
  }
  const convocables = plantel.filter((a) => a.bucket === 'Sub18' || a.esCuenta);
  for (const a of convocables) {
    const aid = idAtleta[a.cedula];
    const { data: ya } = await db.from('evento_convocados').select('id')
      .eq('evento_id', eventoId).eq('atleta_id', aid).maybeSingle();
    if (!ya) {
      await db.from('evento_convocados').insert({
        evento_id: eventoId, atleta_id: aid,
        estado_rsvp: uno(['asiste', 'asiste', 'asiste', 'duda', 'pendiente']),
      });
    }
  }

  const TITULO_COM = 'Suspensión del entrenamiento del viernes';
  const { data: yaCom } = await db.from('comunicaciones').select('id').eq('autor_id', owner.id).eq('titulo', TITULO_COM).maybeSingle();
  if (!yaCom) {
    // Sin columna de club: la RLS lo deriva del autor (v44), así que el
    // comunicado tiene que firmarlo alguien del club.
    const { error } = await db.from('comunicaciones').insert({
      autor_id: owner.id, tipo: 'Anuncio', titulo: TITULO_COM,
      mensaje: 'Por mantenimiento del coliseo, el viernes no habrá entrenamiento. Recuperamos el sábado a las 09:00.',
      segmento_tipo: 'general', canal: 'in_app', proposito: 'comunicado',
      incluir_representantes: true,
    });
    if (error) throw new Error(`comunicaciones: ${error.message}`);
  }
  console.log(`  1 evento con ${convocables.length} convocados y 1 comunicado.`);

  return {
    club: CLUB,
    cuentas: [
      { rol: 'Dueño', nombre: 'Ricardo Salazar Vinueza', usuario: CED.owner, correo: `direccion@${DOMINIO}`, password: claves.owner },
      { rol: 'Entrenadora', nombre: 'Elena Chamorro Ruiz', usuario: CED.coach1, correo: `elena.chamorro@${DOMINIO}`, password: claves.coach },
      { rol: 'Atleta', nombre: logueable.nombre, usuario: CED.atleta, correo: correoSintetico(CED.atleta), password: claves.atleta },
      { rol: 'Representante', nombre: 'Gabriela Grefa Andi', usuario: TEL_PADRE_DEMO, correo: `familia.moran@${DOMINIO}`, password: claves.padre },
    ],
  };
}

// ===================================================================
// VERIFICACIÓN
// ===================================================================

// Un `signInWithPassword` que funciona NO prueba que la cuenta sirva: la app
// resuelve el identificador con `resolver_email_login` y después exige
// `usuarios.auth_user_id = auth.uid()` (fetchUsuarioPorAuthId). Cuando ese
// vínculo falta, la autenticación pasa y la app revienta con "No se encontró un
// perfil de usuario vinculado a esta cuenta". Aquí se replica el camino
// completo, en el mismo proceso que fijó la contraseña.
async function verificar(cuentas) {
  if (!anonKey) {
    console.log('\n⚠️  Sin VITE_SUPABASE_ANON_KEY no se puede probar el login como lo hace la app.');
    return false;
  }
  console.log('\n── Verificación: login real de cada cuenta ──');
  let ok = 0;
  for (const c of cuentas) {
    const cliente = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    try {
      const { data: email, error: eRpc } = await cliente.rpc('resolver_email_login', { p_identificador: c.usuario });
      if (eRpc) throw new Error(`resolver_email_login: ${eRpc.message}`);
      const { data: auth, error: eAuth } = await cliente.auth.signInWithPassword({
        email: email || correoSintetico(c.usuario), password: c.password,
      });
      if (eAuth || !auth?.user) throw new Error(eAuth?.message || 'sin sesión');

      const { data: perfil, error: ePerfil } = await cliente
        .from('usuarios').select('id, nombre, rol, club, estado').eq('auth_user_id', auth.user.id).maybeSingle();
      if (ePerfil) throw new Error(`perfil: ${ePerfil.message}`);
      if (!perfil) throw new Error('autentica pero no hay perfil vinculado (auth_user_id sin escribir)');
      if (perfil.estado && perfil.estado !== 'activo') throw new Error(`la cuenta está "${perfil.estado}", no entra`);
      if (auth.user.app_metadata?.debe_cambiar_password) throw new Error('marcada para cambio obligatorio de contraseña');

      console.log(`  ✅ ${c.rol.padEnd(14)} ${c.usuario.padEnd(14)} → ${perfil.nombre} (${perfil.rol}, ${perfil.club})`);
      ok++;
      await cliente.auth.signOut();
    } catch (e) {
      console.log(`  ❌ ${c.rol.padEnd(14)} ${c.usuario.padEnd(14)} → ${e.message}`);
    }
  }
  console.log(`\n  ${ok}/${cuentas.length} cuentas entran de verdad.`);
  return ok === cuentas.length;
}

// ===================================================================

const resultado = await sembrar().catch((e) => { console.error(`\n❌ ${e.message}`); process.exit(1); });
if (!resultado) process.exit(0);

const todoOk = await verificar(resultado.cuentas);

fs.writeFileSync(ARCHIVO_CREDENCIALES, `${JSON.stringify({
  club: resultado.club,
  generado: HOY.toISOString(),
  aviso: 'Archivo LOCAL. El repositorio es público: no versionar ni pegar estas claves en ningún sitio compartido.',
  como_entrar: 'En la pantalla de ingreso, el campo de usuario acepta la cédula, el correo o el teléfono. Cualquiera de los tres sirve.',
  cuentas: resultado.cuentas,
}, null, 2)}\n`, 'utf8');

console.log(`\n=== ${resultado.club} ===`);
console.table(resultado.cuentas.map(({ rol, usuario, password }) => ({ rol, usuario, password })));
console.log(`Credenciales guardadas en scripts/${path.basename(ARCHIVO_CREDENCIALES)} (ignorado por git).`);
if (!todoOk) {
  console.log('\n⚠️  Alguna cuenta no entra: revisar el detalle de arriba antes de usar el club en una demostración.');
  process.exit(1);
}
