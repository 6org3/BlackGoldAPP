// src/api/atletasService.js
import { supabase } from './supabaseClient';
import { calculateRank } from './authService';
import { calcularCategoriaFEB, calcularMetricasDerivadas } from './utilsAtletas';
import { fechaNacimientoDeEdad } from '../lib/edad';
import { coincideBusqueda, patronBusquedaRelajado } from '../lib/normalizarTexto';

// ============================
// FETCH ATLETAS (Supabase)
// ============================

export const fetchTodosLosAtletas = async (user = null, options = {}) => {
  const {
    page = 1,
    limit = 0,
    search = '',
    categoria = '',
    posicion = '',
    nivelDesarrollo = '',
    genero = '',
    edadMin = null,
    edadMax = null,
    // Por defecto, plantel OPERATIVO: los dados de baja no entran en cancha,
    // asistencia, comunicaciones, eventos ni KPIs (v34 — es lo que promete el
    // panel al dar de baja: "sale del plantel activo"). La gestión de atletas
    // pide 'Todos' explícitamente, que es donde se les reactiva.
    estadoMembresia = 'activo',
    orderBy = null,
  } = options;

  let query = supabase
    .from('atletas')
    .select(`
      *,
      usuarios!inner!atletas_usuario_id_fkey (
        id,
        cedula,
        nombre,
        rol,
        club,
        categoria,
        categoria_feb,
        correo,
        fecha_nacimiento,
        genero,
        estado
      )
    `, { count: 'exact' });

  // Solo cuentas aprobadas: los pendientes/rechazados del registro público
  // (v33) viven en la bandeja de solicitudes, no en el plantel operativo.
  query = query.eq('usuarios.estado', 'activo');

  if (user && user.rol !== 'superadmin' && user.club) {
    query = query.eq('usuarios.club', user.club);
  }

  // Un coach con categoría asignada solo puede ver esa categoría: se aplica
  // en SQL (antes se traía el club entero y se descartaba en el cliente).
  if (user && user.rol === 'coach' && user.categoria && user.categoria !== 'Todas') {
    query = query.eq('usuarios.categoria_feb', user.categoria);
  }

  // `,`, `(`, `)` y `%` tienen significado especial en la sintaxis de
  // filtros de PostgREST (separan términos de `.or()` / delimitan valores);
  // se retiran del texto de búsqueda para que no se pueda inyectar una
  // condición de filtro arbitraria a través del cuadro de búsqueda.
  const sanitizedSearch = search.replace(/[,()%]/g, '').trim();
  if (sanitizedSearch) {
    // `ilike` es sensible a tildes ('Nuñez' jamás encontraría 'Núñez' y la BD
    // no tiene `unaccent`): al servidor se le pide un SUPERCONJUNTO con el
    // patrón relajado (letras acentuables → `_`) y la coincidencia real — con
    // ambos lados normalizados sin diacríticos — se refina en memoria más
    // abajo con `coincideBusqueda`.
    const patronRelajado = patronBusquedaRelajado(sanitizedSearch);
    query = query.or(`nombre.ilike.%${patronRelajado}%,cedula.ilike.%${patronRelajado}%`, { foreignTable: 'usuarios' });
  }
  if (categoria && categoria !== 'Todas') {
    query = query.eq('usuarios.categoria_feb', categoria);
  }
  // Rango de edad traducido a fechas límite de nacimiento (ver src/lib/edad.js
  // para por qué no se filtra por `atletas.edad` ni por `categoria_feb`).
  if (Number.isFinite(edadMin)) {
    // Nacer en o antes de esta fecha ⇒ tener al menos `edadMin`.
    query = query.lte('usuarios.fecha_nacimiento', fechaNacimientoDeEdad(edadMin));
  }
  if (Number.isFinite(edadMax)) {
    // Nacer después de esta fecha ⇒ no haber cumplido aún `edadMax + 1`.
    query = query.gt('usuarios.fecha_nacimiento', fechaNacimientoDeEdad(edadMax + 1));
  }
  if (genero && genero !== 'Todos') {
    query = query.eq('usuarios.genero', genero);
  }
  if (posicion && posicion !== 'Todas') {
    query = query.eq('posicion', posicion);
  }
  // Membresía deportiva (v31): activo/inactivo/baja. 'Todos' desactiva el
  // filtro — lo usa /admin/atletas, que muestra las bajas con badge para
  // poder reactivarlas.
  if (estadoMembresia && estadoMembresia !== 'Todos') {
    query = query.eq('estado_membresia', estadoMembresia);
  }
  if (nivelDesarrollo && nivelDesarrollo !== 'Todos') {
    if (nivelDesarrollo === 'Por Asignar') {
      // 'Por Asignar' es una etiqueta de UI para nivel_desarrollo vacío, no
      // un valor real en la base de datos.
      query = query.is('nivel_desarrollo', null);
    } else {
      query = query.eq('nivel_desarrollo', nivelDesarrollo);
    }
  }

  if (orderBy?.column) {
    query = query.order(orderBy.column, {
      foreignTable: orderBy.foreignTable,
      ascending: orderBy.ascending ?? true,
    });
  }
  // Desempate estable: sin esto, `.range()` sobre un orden con empates (o sin
  // orden) puede repetir o saltarse filas entre páginas consecutivas.
  query = query.order('id');

  if (limit > 0) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);
  }

  const { data: atletas, count, error } = await query;

  if (error || !atletas) {
    console.error('Error fetching atletas:', error);
    return limit > 0 ? { data: [], hasMore: false } : [];
  }

  if (atletas.length === 0) {
    return limit > 0 ? { data: [], hasMore: false } : [];
  }

  // Fetch evaluaciones for all athletes
  const atletaIds = atletas.map(a => a.id);
  const { data: evaluaciones } = await supabase
    .from('evaluaciones_pruebas')
    .select('*')
    .in('atleta_id', atletaIds)
    .order('created_at', { ascending: false });

  // Fetch readiness diario (solo del día de hoy)
  const hoy = new Date().toISOString().split('T')[0];
  const { data: readinessData } = await supabase
    .from('atleta_readiness')
    .select('*')
    .in('atleta_id', atletaIds)
    .eq('fecha', hoy);

  // PR-7: `atletas.grupo_id`/`grupo_nombre` es la CACHÉ de la membresía básica,
  // con un único escritor: el espejo `sync_grupo_basico` de v38, que dispara
  // toda alta/cambio de grupo por la app (RPCs asignar_grupo_basico/
  // set_grupo_adicional). Antes esta capa RE-DERIVABA la pertenencia desde
  // `atleta_grupo` en cada lectura (2º deriver de la caché) para tapar clubes
  // importados en crudo — el caso LAGO AGRIO, ya purgado en el reset de 5 clubes.
  // Se retiró: la columna es fiable para el flujo normal. Si una importación
  // futura inserta `atleta_grupo` en crudo sin poblar la columna, el hero del
  // coach saldrá en blanco hasta correr `scripts/reparar_pertenencia_grupos.mjs`
  // (backfill on-demand documentado), no perpetuamente en cada fetch.

  const readinessByAtleta = {};
  (readinessData || []).forEach(r => {
    readinessByAtleta[r.atleta_id] = r;
  });

  // Group evaluaciones by atleta_id (latest per prueba_tipo)
  const evalByAtleta = {};
  (evaluaciones || []).forEach(e => {
    if (!evalByAtleta[e.atleta_id]) evalByAtleta[e.atleta_id] = {};
    // Keep only the latest evaluation per prueba_tipo
    if (!evalByAtleta[e.atleta_id][e.prueba_tipo]) {
      evalByAtleta[e.atleta_id][e.prueba_tipo] = e;
    }
  });

  const mappedAtletas = (atletas || [])
    .filter(a => a.usuarios) // Previene error de pantalla en negro si hay atletas sin usuario
    .map(a => {
    const atletaEvals = evalByAtleta[a.id] || {};
    const evalsArray = Object.values(atletaEvals);
    const readinessHoy = readinessByAtleta[a.id] || null;

    const merged = {
      id: a.usuarios.id,
      atleta_id: a.id,
      cedula: a.usuarios.cedula,
      nombre: a.usuarios.nombre,
      rol: a.usuarios.rol,
      club: a.usuarios.club,
      categoria: calcularCategoriaFEB(a.usuarios.fecha_nacimiento || a.edad) || a.usuarios.categoria,
      correo: a.usuarios.correo,
      fecha_nacimiento: a.usuarios.fecha_nacimiento,
      genero: a.usuarios.genero || 'Masculino',
      edad: a.edad,
      posicion: a.posicion,
      grupo_id: a.grupo_id || null,
      grupo_nombre: a.grupo_nombre || null,
      es_becado: a.es_becado || false,
      descuento_pct: a.descuento_pct || 0,
      overall_score: a.overall_score || 0,
      xp_total: a.xp_total || 0,
      nivel_desarrollo: a.nivel_desarrollo,
      perfil_mental: a.perfil_mental,
      estado_recuperacion: a.estado_recuperacion,
      estado_membresia: a.estado_membresia, // v31: ciclo de vida de membresía (activo/inactivo/baja)
      fecha_baja: a.fecha_baja,
      restriccion_movilidad: a.restriccion_movilidad,
      prevencion_impacto: a.prevencion_impacto,
      peso_kg: a.peso_kg,
      talla_cm: a.talla_cm,
      envergadura_cm: a.envergadura_cm,
      readiness_hoy: readinessHoy,
      _evaluaciones: evalsArray,
    };

    calcularMetricasDerivadas(merged, readinessHoy, evalsArray);

    merged.rango = calculateRank(merged);
    return merged;
  });

  // El scoping por club y por categoría de coach ya se aplicó en SQL arriba
  // (usuarios.club / usuarios.categoria_feb), así que no hace falta repetirlo aquí.

  // Refino insensible a tildes de la búsqueda: el patrón relajado enviado a
  // Postgres devuelve un superconjunto (p. ej. 'nunez' → '____z' también
  // atrapa 'Sánchez'); aquí queda solo lo que de verdad contiene el término,
  // comparando nombre y cédula normalizados (NFD sin diacríticos, minúsculas)
  // contra el texto tecleado normalizado igual.
  const atletasBuscados = sanitizedSearch
    ? mappedAtletas.filter(a => coincideBusqueda(a.nombre, sanitizedSearch) || coincideBusqueda(a.cedula, sanitizedSearch))
    : mappedAtletas;

  if (limit > 0) {
    const hasMore = (page * limit) < count;
    return { data: atletasBuscados, hasMore };
  }

  return atletasBuscados;
};
