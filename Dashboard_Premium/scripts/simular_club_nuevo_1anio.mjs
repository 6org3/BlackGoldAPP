// Simula UN AÑO completo de datos históricos para un club ficticio nuevo
// ("DEMO Simulación 1 Año"): 1 coach, 3 grupos (Sub-8/Sub-12/Sub-16) de 10
// atletas cada uno, con evaluaciones físicas, sesiones (grupales e
// individualizadas), asistencia y misiones con XP, distribuido a lo largo
// de 12 meses.
//
// Sigue EXACTAMENTE el patrón de scripts/crear_cuentas_prueba.js:
// - carga .env.local con process.loadEnvFile
// - cliente Supabase con SERVICE_ROLE_KEY
// - const SIMULAR = true por defecto: NO escribe nada, solo imprime resumen
// - reintentable (idempotente): vuelve a correr sin duplicar si ya existe
//
// Fuente de verdad reutilizada (NO se reinventa lógica):
// - packages/analytics-core/baremos.js → BAREMOS (pruebas/thresholds/tiers),
//   calcularOverall (fórmula EXACTA de recalcularOverall en evaluacionesService.js).
// - packages/analytics-core/categoriaFEB.js → calcularEdad/calcularCategoriaFEB.
// - packages/analytics-core/recomendaciones.js → calcularXPMision (fórmula EXACTA
//   de aprobarMision en misionesService.js), ultimasPorPrueba.
// - scripts/seed_catalogo_misiones.json → catálogo de misiones (reusado, no inventado).
//
// Valores de columnas "enum-like" verificados leyendo la UI/servicios reales
// (no inventados): ver comentarios inline en cada sección.
//
// IMPORTANTE: este script NUNCA debe correr en modo real sin que un humano
// revise el contenido primero. Por eso el modo real está detrás de una
// variable de entorno explícita (SEED_REAL=1) y el default sigue siendo el
// dry-run seguro que no escribe nada.

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import { BAREMOS, calcularOverall, resolverUmbrales } from '../../packages/analytics-core/baremos.js';
import { calcularEdad, calcularCategoriaFEB } from '../../packages/analytics-core/categoriaFEB.js';
import { calcularXPMision } from '../../packages/analytics-core/recomendaciones.js';
import { SUB_PILARES } from '../../packages/analytics-core/taxonomia.js';

// Dry-run por defecto. Para escribir de verdad: SEED_REAL=1 node scripts/simular_club_nuevo_1anio.mjs
const SIMULAR = process.env.SEED_REAL !== '1';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Dashboard_Premium/.env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ===================================================================
// CONFIGURACIÓN GENERAL
// ===================================================================

const CLUB = 'DEMO Simulación 1 Año';

// Rango del año simulado: HOY es 2026-07-05 (ver CLAUDE.md/system prompt) →
// simulamos 2025-07-01 .. 2026-06-30 (12 meses justos, terminando antes de hoy
// para que todo el histórico quede en el pasado real).
const INICIO_ANIO = new Date('2025-07-01T12:00:00Z');
const FIN_ANIO = new Date('2026-06-30T12:00:00Z');

const emailInterno = (cedula) => `${cedula}@sinacceso.blackgoldapp.internal`;

// Semilla determinista simple (mismo resultado en cada corrida → dry-run
// reproducible, y si algún día se corre en real, reintentable sin sorpresas
// de aleatoriedad en lo ya insertado).
let seed = 42;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function randFloat(min, max, decimales = 1) {
  const v = rand() * (max - min) + min;
  const f = Math.pow(10, decimales);
  return Math.round(v * f) / f;
}
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
// Sortea `n` offsets de día (0-6) DISTINTOS dentro de una semana — evita que
// dos registros de asistencia del mismo atleta caigan en la misma fecha,
// lo cual viola la constraint UNIQUE(atleta_id, fecha) de la tabla real.
function diasDistintos(n) {
  const dias = [0, 1, 2, 3, 4, 5, 6];
  const elegidos = [];
  for (let i = 0; i < n && dias.length > 0; i++) {
    const idx = randInt(0, dias.length - 1);
    elegidos.push(dias.splice(idx, 1)[0]);
  }
  return elegidos;
}
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function addMonths(date, months) { const d = new Date(date); d.setMonth(d.getMonth() + months); return d; }
function toISODate(date) { return date.toISOString().split('T')[0]; }

// ===================================================================
// GRUPOS
// ===================================================================
// grupos_entrenamiento NO tiene coach_id/categoria/nivel (ver esquema real
// documentado en la tarea) — el coach se asocia por convención de horario/
// nombre, y el nivel de desarrollo vive en atletas.nivel_desarrollo.

const GRUPOS_DEF = [
  {
    nombre: 'Sub-8',
    horario: 'Lunes, Miércoles y Viernes 15:00-16:00',
    descripcion: 'Grupo de iniciación Sub-8 — club ficticio de simulación',
    dias_semana: ['Lunes', 'Miércoles', 'Viernes'],
    hora_inicio: '15:00',
    hora_fin: '16:00',
    precio_mensual: 25,
    precio_sesion_ind: 8,
    // Rango de fecha_nacimiento para categoría Sub-8 (~7-8 años a la fecha actual)
    edadMin: 7, edadMax: 8,
  },
  {
    nombre: 'Sub-12',
    horario: 'Martes y Jueves 16:00-17:30',
    descripcion: 'Grupo formativo Sub-12 — club ficticio de simulación',
    dias_semana: ['Martes', 'Jueves'],
    hora_inicio: '16:00',
    hora_fin: '17:30',
    precio_mensual: 30,
    precio_sesion_ind: 10,
    edadMin: 11, edadMax: 12,
  },
  {
    nombre: 'Sub-16',
    horario: 'Lunes, Miércoles y Viernes 17:30-19:30',
    descripcion: 'Grupo competitivo Sub-16 — club ficticio de simulación',
    dias_semana: ['Lunes', 'Miércoles', 'Viernes'],
    hora_inicio: '17:30',
    hora_fin: '19:30',
    precio_mensual: 35,
    precio_sesion_ind: 12,
    edadMin: 15, edadMax: 16,
  },
];

const ATLETAS_POR_GRUPO = 10;
// Mezcla realista de nivel_desarrollo dentro de cada grupo de 10 (no exactamente
// un tercio): más "Desarrollo" en el medio, pocos extremos.
const NIVELES_MEZCLA = ['Micro', 'Micro', 'Micro', 'Desarrollo', 'Desarrollo', 'Desarrollo', 'Desarrollo', 'Desarrollo', 'Elite', 'Elite'];

const POSICIONES = ['Base', 'Escolta', 'Alero', 'Ala-Pívot', 'Pívot'];
const NOMBRES = [
  'Mateo', 'Sofía', 'Lucas', 'Valentina', 'Samuel', 'Isabella', 'Emilio', 'Camila',
  'Daniel', 'Martina', 'Joaquín', 'Renata', 'Sebastián', 'Amelia', 'Nicolás', 'Regina',
  'Adrián', 'Doménica', 'Iker', 'Paula', 'Thiago', 'Emilia', 'Benjamín', 'Antonella',
  'Gael', 'Julieta', 'Máximo', 'Victoria', 'Diego', 'Ariana',
];
const APELLIDOS = [
  'Vera', 'Rosero', 'Ortiz', 'Jiménez', 'Chávez', 'Andrade', 'Quiñónez', 'Cevallos',
  'Salazar', 'Mora', 'Yépez', 'Suárez', 'Guerrero', 'Pinto', 'Villacís', 'Erazo',
];

// ===================================================================
// EVALUACIONES: pruebas por batería (variadas, cubriendo los 3 pilares y
// los sub-pilares del radar, resistencia incluida desde v42)
// ===================================================================
// Se seleccionan claves de BAREMOS que aplican ampliamente (sin inputs_requeridos
// bilaterales, para simplificar). Son 12 claves, pero por atleta aplican ~10-11:
// carrera_600m solo tiene cortes en Sub12 y carrera_1000m solo en Sub15 —
// resolverUmbrales devuelve null para el resto y la prueba se salta sin romper.
const CLAVES_EVALUACION = [
  'cmj_salto',        // fisico/explosividad
  'pushups_30s',      // fisico/explosividad
  'sentadilla_rel',   // fisico/fuerza
  'sit_reach',        // fisico/movilidad
  'course_navette',        // fisico/resistencia
  'yoyo_ir1',              // fisico/resistencia
  'carrera_600m_vinueza',  // fisico/resistencia (solo bucket Sub12)
  'carrera_1000m_vinueza', // fisico/resistencia (solo bucket Sub15)
  'tiro_libre',       // tecnico/tiro
  'zigzag_balon',      // tecnico/agilidad
  'eficiencia_tactica', // mental/tactica
  'resiliencia',        // mental/resiliencia
];

const BUCKET_POR_GRUPO = { 'Sub-8': 'Sub12', 'Sub-12': 'Sub12', 'Sub-16': 'Sub18' };

// Valor crudo inicial realista por prueba y perfil del atleta: arrancamos cerca
// del límite inferior de "average" (tier average = cortes[1]..cortes[2]) y
// mejoramos progresivamente batería a batería (entrenamiento efectivo).
// Los cortes se resuelven SIEMPRE con resolverUmbrales (baremos.js), que entiende
// tanto los arrays planos viejos como las capas Género→Bucket→Nivel de las pruebas
// de resistencia (v42) — nunca leer BAREMOS[clave].thresholds[bucket] directo.
function valorInicial(clave, atleta) {
  const th = resolverUmbrales(BAREMOS[clave]?.thresholds, {
    bucket: atleta.grupoBucket, genero: atleta.genero, nivelDesarrollo: atleta.nivel_desarrollo,
  });
  if (!th) return null;
  const [t1, t2, t3] = th;
  const invertido = BAREMOS[clave].tipo === 'menos_es_mejor';
  // Arranca en la banda "below_avg/average" con algo de variación aleatoria.
  if (invertido) {
    // menos_es_mejor: valores altos = peor. Arranca cerca de t3 (average/below_avg).
    return randFloat(t2, t3, 2);
  }
  return randFloat(t1, t2, 2);
}

// Progresión: cada batería mejora el valor un 6-14% hacia la dirección buena,
// con algo de ruido, sin garantizar que siempre suba (a veces se estanca).
function progresar(valorAnterior, clave) {
  const invertido = BAREMOS[clave].tipo === 'menos_es_mejor';
  const factorMejora = randFloat(0.06, 0.14, 3);
  const ruido = randFloat(-0.02, 0.02, 3);
  if (invertido) {
    // mejorar = reducir el valor
    return Math.max(0.1, Math.round(valorAnterior * (1 - factorMejora + ruido) * 100) / 100);
  }
  // mas_es_mejor con valor <= 0 (Sit & Reach arranca negativo en Sub12/Sub15):
  // multiplicar por (1 + factor) alejaría de 0 (empeora). Progresar con paso
  // absoluto, con piso de 0.5 para poder cruzar el 0 y no quedar asintótico.
  if (valorAnterior <= 0) {
    const paso = Math.max(Math.abs(valorAnterior), 0.5) * (factorMejora + ruido);
    return Math.round((valorAnterior + paso) * 100) / 100;
  }
  return Math.round(valorAnterior * (1 + factorMejora + ruido) * 100) / 100;
}

// 4 baterías a lo largo del año: aprox. cada 3 meses.
const OFFSETS_BATERIA_MESES = [0, 3, 6, 9];

// ===================================================================
// ASISTENCIA
// ===================================================================
// Valores reales confirmados en AdminAsistencia.jsx (ESTADO_CONFIG):
// 'Presente' | 'Ausente' | 'Justificada' | 'Lesionado'.
const ESTADOS_ASISTENCIA_PONDERADOS = [
  ...Array(85).fill('Presente'),
  ...Array(8).fill('Ausente'),
  ...Array(5).fill('Justificada'),
  ...Array(2).fill('Lesionado'),
];
function estadoAsistenciaAleatorio() { return pick(ESTADOS_ASISTENCIA_PONDERADOS); }

// ===================================================================
// SESIONES_CONTROL (grupales) — el string descriptivo que arma la UI
// (ModoCanchaModal.jsx: "Grupal (Niveles) - <Nivel>") NO es lo que acepta
// el CHECK constraint real de la tabla (probado empíricamente: solo
// 'Grupal' | 'Individual' — vocabularios desalineados, ver
// docs/unificacion-sesiones-cancha en memoria). El detalle del nivel va
// en objetivo_descripcion en su lugar.
const TIPO_SESION_GRUPAL_DB = 'Grupal';

// ===================================================================
// SESIONES_ENTRENAMIENTO (individualizadas) — pilar_objetivo variado.
// Derivado de la taxonomía canónica (SUB_PILARES, 8 sub-pilares con resistencia)
// en vez de una lista hardcodeada que se quedaba corta al crecer la taxonomía.
// ===================================================================
const PILARES_OBJETIVO = SUB_PILARES.map(s => s.key);

// ===================================================================
// HELPERS DE INSERT POR LOTES
// ===================================================================
const BATCH_SIZE = 500;

async function insertarEnLotes(tabla, filas, { onConflict } = {}) {
  if (!SIMULAR) {
    for (let i = 0; i < filas.length; i += BATCH_SIZE) {
      const lote = filas.slice(i, i + BATCH_SIZE);
      let q = supabase.from(tabla).insert(lote);
      const { error } = await q;
      if (error) throw new Error(`Insert en ${tabla} falló (lote ${i}-${i + lote.length}): ${error.message}`);
    }
  }
  return filas.length;
}

// ===================================================================
// PASO 0: verificar si el club ficticio ya existe (idempotencia)
// ===================================================================
async function clubYaExiste() {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id')
    .eq('club', CLUB)
    .eq('rol', 'coach')
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(`❌ Error verificando existencia del club ficticio: ${error.message}`);
    process.exit(1);
  }
  return !!data;
}

// ===================================================================
// CONSTRUCCIÓN DE DATOS EN MEMORIA (siempre corre, SIMULAR o no, para poder
// imprimir el resumen esperado en dry-run)
// ===================================================================

function construirCoach() {
  return {
    cedula: 'DEMO-COACH-001',
    nombre: 'Coach Demo Simulación',
    rol: 'coach',
    club: CLUB,
    correo: null,
    telefono: null,
  };
}

function construirGrupos() {
  return GRUPOS_DEF.map(g => ({
    nombre: g.nombre,
    horario: g.horario,
    descripcion: g.descripcion,
    club: CLUB,
    precio_mensual: g.precio_mensual,
    precio_sesion_ind: g.precio_sesion_ind,
    hora_inicio: g.hora_inicio,
    hora_fin: g.hora_fin,
    dias_semana: g.dias_semana,
  }));
}

function fechaNacimientoParaEdad(edadMin, edadMax) {
  const edad = randInt(edadMin, edadMax);
  // calcularEdad() (categoriaFEB.js) usa new Date() del sistema como "hoy" —
  // hoy real ≈ 2026-07-05 (ver contexto del proyecto). Para que la edad
  // resultante sea EXACTAMENTE `edad` (sin el ±1 que introduciría un mes/día
  // aleatorio cerca del corte de cumpleaños), fijamos el cumpleaños al mismo
  // mes/día de "hoy" menos `edad` años: así hoy es siempre su cumpleaños
  // número `edad` exacto, sin importar en qué momento del año se corra esto.
  const hoy = new Date();
  const anioNac = hoy.getFullYear() - edad;
  const mes = hoy.getMonth() + 1;
  const dia = hoy.getDate();
  return `${anioNac}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function construirAtletasDeGrupo(grupoDef, indiceGlobalInicial) {
  const atletas = [];
  for (let i = 0; i < ATLETAS_POR_GRUPO; i++) {
    const nombre = `${pick(NOMBRES)} ${pick(APELLIDOS)}`;
    const fechaNacimiento = fechaNacimientoParaEdad(grupoDef.edadMin, grupoDef.edadMax);
    const edad = calcularEdad(fechaNacimiento);
    const categoriaFEB = calcularCategoriaFEB(fechaNacimiento);
    const cedula = `DEMO-ATL-${String(indiceGlobalInicial + i + 1).padStart(3, '0')}`;
    atletas.push({
      cedula,
      nombre,
      fechaNacimiento,
      edad,
      categoriaFEB,
      genero: pick(['Masculino', 'Femenino']),
      posicion: pick(POSICIONES),
      nivel_desarrollo: NIVELES_MEZCLA[i % NIVELES_MEZCLA.length],
      grupoNombre: grupoDef.nombre,
      grupoBucket: BUCKET_POR_GRUPO[grupoDef.nombre],
    });
  }
  return atletas;
}

// ===================================================================
// RUN PRINCIPAL
// ===================================================================
async function run() {
  console.log('=== Simulación de 1 año de datos — club ficticio "%s" ===', CLUB);
  console.log(`Modo: ${SIMULAR ? '🔍 SIMULACIÓN (no escribe nada)' : '🚀 REAL (escribe datos de verdad)'}`);
  console.log(`Rango simulado: ${toISODate(INICIO_ANIO)} .. ${toISODate(FIN_ANIO)}\n`);

  const yaExiste = await clubYaExiste();
  if (yaExiste) {
    console.log(`⏭️  El club ficticio "${CLUB}" ya existe (coach encontrado). Este script no vuelve a crear el club`);
    console.log('    completo si ya existe, para evitar duplicar 30 atletas + miles de filas en cada corrida.');
    console.log('    Si necesitas regenerar desde cero, borra manualmente los datos de este club primero.');
    if (!SIMULAR) {
      process.exit(0);
    }
    console.log('    (Continuando en modo SIMULACIÓN solo para mostrar qué haría igualmente.)\n');
  }

  // ── Construcción en memoria ──
  const coach = construirCoach();
  const grupos = construirGrupos();

  let atletasTodos = [];
  GRUPOS_DEF.forEach((g, idx) => {
    const desde = idx * ATLETAS_POR_GRUPO;
    atletasTodos = atletasTodos.concat(construirAtletasDeGrupo(g, desde));
  });

  // Catálogo de misiones: reusa seed_catalogo_misiones.json (64 misiones,
  // 8 sub-pilares × 2 complejidades × 4 buckets). Para la simulación las
  // insertamos con activa=true (a diferencia del seed real, que nace
  // inactiva para curaduría del coach) porque necesitamos que
  // seleccionarMisiones/asignación funcione de punta a punta sin depender
  // de un paso manual de aprobación adicional.
  const catalogoJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'seed_catalogo_misiones.json'), 'utf8'),
  );
  const misionesCatalogo = catalogoJson.misiones;

  // ============================
  // RESUMEN / CONTADORES
  // ============================
  const contadores = {
    usuarios: 1 + atletasTodos.length, // coach + atletas
    grupos: grupos.length,
    atletas: atletasTodos.length,
    atleta_grupo: atletasTodos.length,
    evaluaciones: 0,
    asistencia: 0,
    sesiones_control: 0,
    sesiones_entrenamiento: 0,
    misiones_catalogo: misionesCatalogo.length,
    progreso_misiones: 0,
    progreso_misiones_completadas: 0,
    recompensas_desbloqueadas: 0,
  };

  // ============================
  // 1. USUARIOS: coach + atletas
  // ============================
  console.log('── 1. Usuarios (coach + atletas) ──');
  console.log(`Coach: ${coach.nombre} (${coach.cedula})`);

  let coachId = null;
  if (!SIMULAR) {
    const { data: coachExistente } = await supabase
      .from('usuarios').select('id').eq('cedula', coach.cedula).maybeSingle();
    if (coachExistente) {
      coachId = coachExistente.id;
    } else {
      const { data, error } = await supabase.from('usuarios').insert(coach).select().single();
      if (error) throw new Error(`Insert coach falló: ${error.message}`);
      coachId = data.id;
    }
  } else {
    console.log(`[SIMULACIÓN] Insertaría usuario coach → cedula=${coach.cedula}`);
  }

  console.log(`Atletas a crear: ${atletasTodos.length} (10 por grupo × 3 grupos)`);
  if (SIMULAR) {
    atletasTodos.slice(0, 3).forEach(a => {
      console.log(`[SIMULACIÓN] Ej. usuario+atleta: ${a.nombre} (${a.cedula}) · nac=${a.fechaNacimiento} · edad=${a.edad} · categoriaFEB=${a.categoriaFEB} · grupo=${a.grupoNombre} · nivel=${a.nivel_desarrollo}`);
    });
    console.log(`... (+${atletasTodos.length - 3} más)`);
  }

  // ============================
  // 2. GRUPOS_ENTRENAMIENTO
  // ============================
  console.log('\n── 2. Grupos de entrenamiento ──');
  grupos.forEach(g => console.log(`  - ${g.nombre}: ${g.horario} (${g.dias_semana.join('/')})`));

  let gruposIds = {}; // nombre -> id
  if (!SIMULAR) {
    for (const g of grupos) {
      const { data: existente } = await supabase
        .from('grupos_entrenamiento').select('id').eq('nombre', g.nombre).eq('club', CLUB).maybeSingle();
      if (existente) {
        gruposIds[g.nombre] = existente.id;
        continue;
      }
      const { data, error } = await supabase.from('grupos_entrenamiento').insert(g).select().single();
      if (error) throw new Error(`Insert grupo ${g.nombre} falló: ${error.message}`);
      gruposIds[g.nombre] = data.id;
    }
  }

  // ============================
  // 3. Insertar usuarios/atletas reales + atleta_grupo (solo si !SIMULAR)
  // ============================
  let atletaIdsPorCedula = {}; // cedula -> atletas.id
  if (!SIMULAR) {
    for (const a of atletasTodos) {
      const { data: usuarioExistente } = await supabase
        .from('usuarios').select('id').eq('cedula', a.cedula).maybeSingle();

      let usuarioId;
      if (usuarioExistente) {
        usuarioId = usuarioExistente.id;
      } else {
        const { data: nuevoUsuario, error: errUsuario } = await supabase
          .from('usuarios')
          .insert({
            cedula: a.cedula,
            nombre: a.nombre,
            rol: 'atleta',
            club: CLUB,
            categoria: a.categoriaFEB,
            // categoria_feb es columna GENERATED por la BD (calcular_categoria_feb) — no se inserta a mano.
            fecha_nacimiento: a.fechaNacimiento,
            genero: a.genero,
          })
          .select().single();
        if (errUsuario) throw new Error(`Insert usuario atleta ${a.cedula} falló: ${errUsuario.message}`);
        usuarioId = nuevoUsuario.id;
      }

      const { data: atletaExistente } = await supabase
        .from('atletas').select('id').eq('usuario_id', usuarioId).maybeSingle();

      let atletaId;
      if (atletaExistente) {
        atletaId = atletaExistente.id;
      } else {
        const { data: nuevoAtleta, error: errAtleta } = await supabase
          .from('atletas')
          .insert({
            usuario_id: usuarioId,
            edad: a.edad,
            posicion: a.posicion,
            nivel_desarrollo: a.nivel_desarrollo,
            grupo_id: gruposIds[a.grupoNombre],
            grupo_nombre: a.grupoNombre,
          })
          .select().single();
        if (errAtleta) throw new Error(`Insert atleta ${a.cedula} falló: ${errAtleta.message}`);
        atletaId = nuevoAtleta.id;
      }

      atletaIdsPorCedula[a.cedula] = atletaId;

      // atleta_grupo (idempotente: PK compuesta atleta_id+grupo_id).
      // rol_membresia explícito (v38): el DEFAULT es 'adicional', así que sin
      // esto el atleta quedaría sin grupo básico — el que factura su mensualidad.
      const { data: vinculoExistente } = await supabase
        .from('atleta_grupo').select('atleta_id').eq('atleta_id', atletaId).eq('grupo_id', gruposIds[a.grupoNombre]).maybeSingle();
      if (!vinculoExistente) {
        const { error: errVinculo } = await supabase
          .from('atleta_grupo').insert({ atleta_id: atletaId, grupo_id: gruposIds[a.grupoNombre], rol_membresia: 'basica' });
        if (errVinculo) throw new Error(`Insert atleta_grupo ${a.cedula} falló: ${errVinculo.message}`);
      }
    }
  } else {
    console.log('[SIMULACIÓN] Insertaría atleta_grupo vinculando cada atleta a su grupo (atleta_id + grupo_id)');
  }

  // ============================
  // 4. CATÁLOGO DE MISIONES
  // ============================
  console.log(`\n── 3. Catálogo de misiones (reusado de seed_catalogo_misiones.json) ──`);
  console.log(`Misiones en el catálogo: ${misionesCatalogo.length} (activa=true para esta simulación, a diferencia del seed real)`);

  let misionesIds = []; // [{id, pilar, categoria_bucket, complejidad, xp_recompensa, nivel_objetivo, created_at}]
  if (!SIMULAR) {
    const { data: existentes } = await supabase
      .from('misiones').select('id, titulo, categoria_bucket, pilar, complejidad, xp_recompensa, nivel_objetivo, created_at')
      .eq('condicion_trigger', 'simulacion_club_demo');
    const yaInsertadas = new Set((existentes || []).map(m => `${m.titulo}|${m.categoria_bucket}`));
    misionesIds = [...(existentes || [])];

    const nuevas = misionesCatalogo.filter(m => !yaInsertadas.has(`${m.titulo}|${m.categoria_bucket}`));
    if (nuevas.length > 0) {
      const filas = nuevas.map(m => ({
        titulo: m.titulo,
        descripcion: m.descripcion,
        justificacion: m.justificacion,
        pilar: m.pilar,
        nivel_objetivo: null,
        categoria_bucket: m.categoria_bucket,
        complejidad: m.complejidad,
        xp_recompensa: m.xp_recompensa,
        activa: true,
        is_ai_generated: true,
        condicion_trigger: 'simulacion_club_demo',
        created_by: coachId,
        autor_id: coachId,
      }));
      const { data: insertadas, error: errMisiones } = await supabase
        .from('misiones').insert(filas)
        .select('id, titulo, categoria_bucket, pilar, complejidad, xp_recompensa, nivel_objetivo, created_at');
      if (errMisiones) throw new Error(`Insert catálogo de misiones falló: ${errMisiones.message}`);
      misionesIds = misionesIds.concat(insertadas);
    }
  }

  // ============================
  // 5. EVALUACIONES + RECÁLCULO DE OVERALL (4 baterías/atleta)
  // ============================
  console.log('\n── 4. Evaluaciones (4 baterías/atleta, ~cada 3 meses, ~10-11 pruebas/batería) ──');
  console.log(`Pruebas usadas por batería: ${CLAVES_EVALUACION.map(k => BAREMOS[k].label).join(', ')}`);

  const evaluacionesPorAtleta = {}; // cedula -> [{prueba_tipo, pilar, sub_pilar, puntuacion_normalizada, created_at, ...}]
  let totalEvaluaciones = 0;

  for (const a of atletasTodos) {
    const bucket = a.grupoBucket;
    let valoresActuales = {};
    CLAVES_EVALUACION.forEach(clave => { valoresActuales[clave] = valorInicial(clave, a); });

    const evaluacionesAtleta = [];

    for (const offsetMeses of OFFSETS_BATERIA_MESES) {
      const fechaBateria = addMonths(INICIO_ANIO, offsetMeses);
      const filasBateria = [];

      for (const clave of CLAVES_EVALUACION) {
        const baremo = BAREMOS[clave];
        const th = resolverUmbrales(baremo.thresholds, {
          bucket, genero: a.genero, nivelDesarrollo: a.nivel_desarrollo,
        });
        if (!th) continue; // prueba sin cortes para este perfil (p.ej. carrera_600m fuera de Sub12)

        // Progresión batería a batería (la primera usa el valor inicial).
        if (offsetMeses > 0) {
          valoresActuales[clave] = progresar(valoresActuales[clave], clave);
        }
        const valorCrudo = valoresActuales[clave];

        // Normalización: replica normalizarValor (mismo criterio de tiers
        // que packages/analytics-core/baremos.js, para no duplicar lógica
        // con una fórmula distinta).
        const [t1, t2, t3, t4] = th;
        let tier;
        if (baremo.tipo === 'mas_es_mejor') {
          if (valorCrudo > t4) tier = 'excellent';
          else if (valorCrudo > t3) tier = 'above_avg';
          else if (valorCrudo > t2) tier = 'average';
          else if (valorCrudo > t1) tier = 'below_avg';
          else tier = 'poor';
        } else {
          if (valorCrudo <= t1) tier = 'excellent';
          else if (valorCrudo <= t2) tier = 'above_avg';
          else if (valorCrudo <= t3) tier = 'average';
          else if (valorCrudo <= t4) tier = 'below_avg';
          else tier = 'poor';
        }
        const puntuacionPorTier = { poor: 15, below_avg: 35, average: 55, above_avg: 75, excellent: 95 };

        filasBateria.push({
          // atleta_id se resuelve más abajo cuando ya tenemos el id real (!SIMULAR)
          prueba_tipo: baremo.label,
          pilar: baremo.pilar,
          sub_pilar: baremo.sub_pilar,
          tren: baremo.tren || null,
          lado: 'unico',
          valor_crudo: valorCrudo,
          unidad: baremo.unidad,
          puntuacion_normalizada: puntuacionPorTier[tier],
          tier,
          registrado_por: null, // se completa con coachId más abajo si !SIMULAR
          created_at: fechaBateria.toISOString(),
          notas: `Batería de evaluación #${OFFSETS_BATERIA_MESES.indexOf(offsetMeses) + 1} — simulación`,
        });
      }

      evaluacionesAtleta.push({ fecha: fechaBateria, filas: filasBateria });
      totalEvaluaciones += filasBateria.length;
    }

    evaluacionesPorAtleta[a.cedula] = evaluacionesAtleta;
  }

  contadores.evaluaciones = totalEvaluaciones;
  console.log(`Total evaluaciones a insertar: ${totalEvaluaciones} (${atletasTodos.length} atletas × 4 baterías × ~10-11 pruebas según bucket)`);

  if (!SIMULAR) {
    for (const a of atletasTodos) {
      const atletaId = atletaIdsPorCedula[a.cedula];
      const historialCompleto = [];

      for (const bateria of evaluacionesPorAtleta[a.cedula]) {
        const filas = bateria.filas.map(f => ({ ...f, atleta_id: atletaId, registrado_por: coachId }));
        const { error: errEval } = await supabase.from('evaluaciones_pruebas').insert(filas);
        if (errEval) throw new Error(`Insert evaluaciones atleta ${a.cedula} falló: ${errEval.message}`);
        historialCompleto.push(...filas);

        // Recalcular overall/rango con la MISMA fórmula que recalcularOverall:
        // última evaluación por prueba_tipo → calcularOverall (analytics-core).
        const ultimasPorTipo = {};
        historialCompleto.forEach(e => { ultimasPorTipo[e.prueba_tipo] = e; });
        const { overall, rango } = calcularOverall(Object.values(ultimasPorTipo));

        const rangoAnteriorRes = await supabase.from('atletas').select('rango').eq('id', atletaId).single();
        const rangoAnterior = rangoAnteriorRes.data?.rango;

        const { error: errUpdate } = await supabase
          .from('atletas')
          .update({ overall_score: overall, rango: rango.id, rango_tier: rango.nombre })
          .eq('id', atletaId);
        if (errUpdate) throw new Error(`Update overall atleta ${a.cedula} falló: ${errUpdate.message}`);

        // recompensas_desbloqueadas al cruzar umbral de rango (igual que
        // checkAndCreateRecompensas): si el rango es nuevo para este atleta.
        if (rango.id !== rangoAnterior) {
          const { RECOMPENSAS_POR_RANGO } = await import('../../packages/analytics-core/baremos.js');
          const { data: existentesRecompensa } = await supabase
            .from('recompensas_desbloqueadas').select('rango_alcanzado').eq('atleta_id', atletaId);
          const rangosYaDados = new Set((existentesRecompensa || []).map(r => r.rango_alcanzado));
          if (RECOMPENSAS_POR_RANGO[rango.id] && !rangosYaDados.has(rango.id)) {
            const nuevasRecompensas = RECOMPENSAS_POR_RANGO[rango.id].map(r => ({
              atleta_id: atletaId,
              rango_alcanzado: rango.id,
              recompensa: r.nombre,
              descripcion: r.descripcion,
              fecha_desbloqueo: bateria.fecha.toISOString(),
            }));
            const { error: errRecompensa } = await supabase.from('recompensas_desbloqueadas').insert(nuevasRecompensas);
            if (errRecompensa) throw new Error(`Insert recompensas atleta ${a.cedula} falló: ${errRecompensa.message}`);
            contadores.recompensas_desbloqueadas += nuevasRecompensas.length;
          }
        }
      }
    }
  } else {
    // Estimación de recompensas para el resumen dry-run: simulamos el cálculo
    // de overall en memoria (sin escribir) para contar cuántos cruces de rango habría.
    let estimadoRecompensas = 0;
    for (const a of atletasTodos) {
      let rangoAnterior = null;
      const historial = [];
      for (const bateria of evaluacionesPorAtleta[a.cedula]) {
        historial.push(...bateria.filas);
        const ultimasPorTipo = {};
        historial.forEach(e => { ultimasPorTipo[e.prueba_tipo] = e; });
        const { rango } = calcularOverall(Object.values(ultimasPorTipo));
        if (rango.id !== rangoAnterior && rango.id !== 'rookie') {
          estimadoRecompensas += 1; // aproximado: 1 "evento" de cruce, no cuenta ítems individuales
        }
        rangoAnterior = rango.id;
      }
    }
    contadores.recompensas_desbloqueadas = estimadoRecompensas;
    console.log(`[SIMULACIÓN] Recalcularía overall_score/rango/rango_tier tras cada batería (fórmula calcularOverall de analytics-core)`);
    console.log(`[SIMULACIÓN] Cruces de rango estimados (→ recompensas_desbloqueadas): ~${estimadoRecompensas}`);

    // Muestra de progresión: serie de valor_crudo por prueba (todas las baterías)
    // del primer atleta, para revisar a ojo que TODAS las pruebas mejoran entre baterías.
    const atletaMuestra = atletasTodos[0];
    const seriesPorPrueba = {};
    for (const bateria of evaluacionesPorAtleta[atletaMuestra.cedula]) {
      for (const fila of bateria.filas) {
        (seriesPorPrueba[fila.prueba_tipo] ||= []).push(fila.valor_crudo);
      }
    }
    console.log(`[SIMULACIÓN] Series por prueba (${atletaMuestra.nombre}, valor_crudo batería 1→${OFFSETS_BATERIA_MESES.length}):`);
    for (const [prueba, serie] of Object.entries(seriesPorPrueba)) {
      console.log(`  - ${prueba}: ${serie.join(' → ')}`);
    }
  }

  // ============================
  // 6. ASISTENCIA (2-3/semana por atleta durante el año)
  // ============================
  console.log('\n── 5. Asistencia (2-3 registros/semana por atleta) ──');
  const diasTotales = Math.round((FIN_ANIO - INICIO_ANIO) / (1000 * 60 * 60 * 24));
  const semanasTotales = Math.round(diasTotales / 7);

  let totalAsistencia = 0;
  const asistenciaBuffer = [];
  for (const a of atletasTodos) {
    for (let semana = 0; semana < semanasTotales; semana++) {
      const registrosSemana = randInt(2, 3);
      for (const diaOffset of diasDistintos(registrosSemana)) {
        const fecha = addDays(INICIO_ANIO, semana * 7 + diaOffset);
        if (fecha > FIN_ANIO) continue;
        asistenciaBuffer.push({
          cedula: a.cedula,
          fecha: toISODate(fecha),
          estado: estadoAsistenciaAleatorio(),
        });
        totalAsistencia++;
      }
    }
  }
  contadores.asistencia = totalAsistencia;
  console.log(`Total registros de asistencia a insertar: ${totalAsistencia} (~${semanasTotales} semanas × 2-3/semana × ${atletasTodos.length} atletas)`);

  if (!SIMULAR) {
    const filas = asistenciaBuffer.map(r => ({
      atleta_id: atletaIdsPorCedula[r.cedula],
      coach_id: coachId,
      fecha: r.fecha,
      estado: r.estado,
    }));
    await insertarEnLotes('asistencia', filas);
  }

  // ============================
  // 7. SESIONES_CONTROL (grupales, ~2/semana por grupo)
  // ============================
  console.log('\n── 6. Sesiones de control grupales (~2/semana por grupo) ──');
  const sesionesControlBuffer = [];
  for (const g of GRUPOS_DEF) {
    for (let semana = 0; semana < semanasTotales; semana++) {
      const sesionesSemana = 2;
      for (let s = 0; s < sesionesSemana; s++) {
        const fecha = addDays(INICIO_ANIO, semana * 7 + s * 3);
        if (fecha > FIN_ANIO) continue;
        const nivel = pick(['Micro', 'Desarrollo', 'Elite']);
        sesionesControlBuffer.push({
          grupoNombre: g.nombre,
          tipo: TIPO_SESION_GRUPAL_DB,
          fecha: toISODate(fecha),
          objetivo_tipo: pick(['Técnico', 'Físico', 'Táctico']),
          objetivo_descripcion: `Grupal (Niveles) - ${nivel} — Sesión grupal ${g.nombre} — enfoque ${pick(['tiro', 'defensa', 'transición', 'fundamentos', 'acondicionamiento'])}`,
          se_logro: pick(['Sí', 'Sí', 'Parcial', 'No']),
        });
      }
    }
  }
  contadores.sesiones_control = sesionesControlBuffer.length;
  console.log(`Total sesiones_control a insertar: ${sesionesControlBuffer.length} (3 grupos × ~2/semana × ${semanasTotales} semanas)`);

  if (!SIMULAR) {
    const filas = sesionesControlBuffer.map(s => ({
      tipo: s.tipo,
      grupo_id: gruposIds[s.grupoNombre],
      coach_id: coachId,
      fecha: s.fecha,
      objetivo_tipo: s.objetivo_tipo,
      objetivo_descripcion: s.objetivo_descripcion,
      se_logro: s.se_logro,
    }));
    await insertarEnLotes('sesiones_control', filas);
  }

  // ============================
  // 8. SESIONES_ENTRENAMIENTO (individualizadas, ~1/semana por atleta)
  // ============================
  console.log('\n── 7. Sesiones de entrenamiento individualizadas (~1/semana por atleta) ──');
  const sesionesIndBuffer = [];
  for (const a of atletasTodos) {
    for (let semana = 0; semana < semanasTotales; semana++) {
      const fecha = addDays(INICIO_ANIO, semana * 7 + randInt(0, 6));
      if (fecha > FIN_ANIO) continue;
      sesionesIndBuffer.push({
        cedula: a.cedula,
        fecha: toISODate(fecha),
        pilar_objetivo: pick(PILARES_OBJETIVO),
        volumen_series_reps: `${randInt(3, 5)}x${randInt(6, 12)}`,
        eva_registro: randInt(6, 9), // escala de esfuerzo percibido 1-10, notas realistas
      });
    }
  }
  contadores.sesiones_entrenamiento = sesionesIndBuffer.length;
  console.log(`Total sesiones_entrenamiento a insertar: ${sesionesIndBuffer.length} (${atletasTodos.length} atletas × ~1/semana × ${semanasTotales} semanas)`);

  if (!SIMULAR) {
    const filas = sesionesIndBuffer.map(s => ({
      atleta_id: atletaIdsPorCedula[s.cedula],
      coach_id: coachId,
      fecha: s.fecha,
      pilar_objetivo: s.pilar_objetivo,
      volumen_series_reps: s.volumen_series_reps,
      eva_registro: s.eva_registro,
    }));
    await insertarEnLotes('sesiones_entrenamiento', filas);
  }

  // ============================
  // 9. PROGRESO_MISIONES (asignación periódica + XP)
  // ============================
  console.log('\n── 8. Progreso de misiones (asignación periódica, estados variados, XP) ──');
  // Valores reales de estado (progreso_misiones): 'pendiente' | 'pendiente_aprobacion'
  // | 'aprobada' | 'rechazada' (ver misionesService.js). completada es boolean aparte.
  const ESTADOS_PONDERADOS = [
    ...Array(35).fill('aprobada'),        // completada=true
    ...Array(15).fill('pendiente_aprobacion'), // completada=true (en revisión)
    ...Array(40).fill('pendiente'),       // completada=false (asignada, sin completar)
    ...Array(10).fill('rechazada'),       // completada=false
  ];

  const progresoBuffer = [];
  let xpPorAtleta = {}; // cedula -> xp acumulado (solo aprobadas)

  for (const a of atletasTodos) {
    xpPorAtleta[a.cedula] = 0;
    // ~1 misión asignada cada 3-4 semanas durante el año → ~13-17 misiones/atleta.
    const misionesDelAtleta = [];
    for (let semana = 0; semana < semanasTotales; semana += randInt(3, 4)) {
      const fechaAsignacion = addDays(INICIO_ANIO, semana * 7);
      if (fechaAsignacion > FIN_ANIO) continue;

      // Elegir misión del catálogo cuyo pilar/bucket calcen razonablemente
      // con el atleta (mismo criterio de seleccionarMisiones: pilar +
      // categoria_bucket null-o-igual), evitando repetir la misma misión.
      const bucket = a.grupoBucket;
      const candidatas = misionesCatalogo.filter(m =>
        (m.categoria_bucket === bucket) &&
        !misionesDelAtleta.includes(m.titulo)
      );
      if (candidatas.length === 0) continue;
      const mision = pick(candidatas);
      misionesDelAtleta.push(mision.titulo);

      const estado = pick(ESTADOS_PONDERADOS);
      const completada = estado === 'aprobada' || estado === 'pendiente_aprobacion';
      const fechaCompletada = completada ? addDays(fechaAsignacion, randInt(3, 14)) : null;

      let xpOtorgado = 0;
      if (estado === 'aprobada') {
        xpOtorgado = calcularXPMision(
          { xp_recompensa: mision.xp_recompensa, nivel_objetivo: mision.nivel_objetivo || null },
          { nivel_desarrollo: a.nivel_desarrollo },
        );
        xpPorAtleta[a.cedula] += xpOtorgado;
      }

      progresoBuffer.push({
        cedula: a.cedula,
        misionTitulo: mision.titulo,
        misionBucket: mision.categoria_bucket,
        estado,
        completada,
        fecha_asignacion: fechaAsignacion.toISOString(),
        fecha_completada: fechaCompletada ? fechaCompletada.toISOString() : null,
        // Valores reales verificados empíricamente contra el CHECK constraint:
        // origen solo acepta 'coach'|'auto_baremo'|'ia'; tipo_asignacion solo
        // acepta 'individual'|'categoria'|'grupo'|'todos'.
        origen: 'coach',
        tipo_asignacion: 'individual',
        sub_pilar_objetivo: mision.pilar,
        xpOtorgado,
      });
    }
  }

  contadores.progreso_misiones = progresoBuffer.length;
  contadores.progreso_misiones_completadas = progresoBuffer.filter(p => p.completada).length;
  const xpTotalAOtorgar = Object.values(xpPorAtleta).reduce((a, b) => a + b, 0);

  console.log(`Total progreso_misiones a insertar: ${progresoBuffer.length}`);
  console.log(`  - completadas (aprobada + pendiente_aprobacion): ${contadores.progreso_misiones_completadas}`);
  console.log(`  - aprobadas (suman XP): ${progresoBuffer.filter(p => p.estado === 'aprobada').length}`);
  console.log(`  - pendiente_aprobacion (en revisión): ${progresoBuffer.filter(p => p.estado === 'pendiente_aprobacion').length}`);
  console.log(`  - pendiente (asignada, sin empezar): ${progresoBuffer.filter(p => p.estado === 'pendiente').length}`);
  console.log(`  - rechazada: ${progresoBuffer.filter(p => p.estado === 'rechazada').length}`);
  console.log(`XP total a otorgar (suma de atletas.xp_total): ${xpTotalAOtorgar}`);

  if (!SIMULAR) {
    // Mapear título+bucket -> mision.id real (ya insertado en el paso 4).
    const misionIdPorClave = new Map(misionesIds.map(m => [`${m.titulo}|${m.categoria_bucket}`, m.id]));

    const filas = progresoBuffer.map(p => ({
      atleta_id: atletaIdsPorCedula[p.cedula],
      mision_id: misionIdPorClave.get(`${p.misionTitulo}|${p.misionBucket}`),
      completada: p.completada,
      fecha_completada: p.fecha_completada,
      estado: p.estado,
      asignado_por: coachId,
      tipo_asignacion: p.tipo_asignacion,
      fecha_asignacion: p.fecha_asignacion,
      origen: p.origen,
      sub_pilar_objetivo: p.sub_pilar_objetivo,
    })).filter(f => f.mision_id); // por si alguna misión no calzó (defensivo)

    await insertarEnLotes('progreso_misiones', filas);

    // Otorgar XP acumulado por atleta (una sola suma, igual que aprobarMision
    // pero en batch en vez de una llamada por misión aprobada).
    for (const a of atletasTodos) {
      const xp = xpPorAtleta[a.cedula];
      if (xp <= 0) continue;
      const atletaId = atletaIdsPorCedula[a.cedula];
      const { data: atletaActual } = await supabase.from('atletas').select('xp_total').eq('id', atletaId).single();
      const { error: errXp } = await supabase
        .from('atletas')
        .update({ xp_total: (atletaActual?.xp_total || 0) + xp })
        .eq('id', atletaId);
      if (errXp) throw new Error(`Update xp_total atleta ${a.cedula} falló: ${errXp.message}`);
    }
  }

  // ============================
  // RESUMEN FINAL
  // ============================
  console.log('\n=== RESUMEN ===');
  console.log(`Club ficticio: "${CLUB}"`);
  console.log(`Usuarios (coach + atletas): ${contadores.usuarios}`);
  console.log(`Grupos de entrenamiento: ${contadores.grupos}`);
  console.log(`Atletas: ${contadores.atletas} (${ATLETAS_POR_GRUPO}/grupo × ${GRUPOS_DEF.length} grupos)`);
  console.log(`Vínculos atleta_grupo: ${contadores.atleta_grupo}`);
  console.log(`Evaluaciones (evaluaciones_pruebas): ${contadores.evaluaciones}`);
  console.log(`Asistencia: ${contadores.asistencia}`);
  console.log(`Sesiones de control (grupales): ${contadores.sesiones_control}`);
  console.log(`Sesiones de entrenamiento (individualizadas): ${contadores.sesiones_entrenamiento}`);
  console.log(`Misiones en catálogo: ${contadores.misiones_catalogo}`);
  console.log(`Progreso de misiones asignado: ${contadores.progreso_misiones}`);
  console.log(`  - completadas: ${contadores.progreso_misiones_completadas}`);
  console.log(`XP total a otorgar: ${xpTotalAOtorgar}`);
  console.log(`Recompensas desbloqueadas (cruces de rango): ${contadores.recompensas_desbloqueadas}`);

  if (SIMULAR) {
    console.log('\nNada se escribió. Para ejecutar de verdad: SEED_REAL=1 node scripts/simular_club_nuevo_1anio.mjs');
    console.log('(Revisa el script con el club antes de hacerlo — este dry-run es para revisión humana.)');
  } else {
    console.log('\n✅ Simulación completa insertada en la base de datos.');
  }
}

run().catch((err) => {
  console.error('❌ Error inesperado:', err);
  process.exit(1);
});
