// src/api/atletasService.js
import { supabase } from './supabaseClient';
import { calculateRank } from './authService';
import { calcularCategoriaFEB, calcularMetricasDerivadas } from './utilsAtletas';

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
    query = query.or(`nombre.ilike.%${sanitizedSearch}%,cedula.ilike.%${sanitizedSearch}%`, { foreignTable: 'usuarios' });
  }
  if (categoria && categoria !== 'Todas') {
    query = query.eq('usuarios.categoria_feb', categoria);
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

  // Fallback de pertenencia atleta↔grupo: cuando `atletas.grupo_id` está vacío
  // (clubes cuya pertenencia vive solo en `atleta_grupo` — la fuente de verdad
  // de v18, poblada por la importación y la segmentación de comunicaciones) lo
  // derivamos del vínculo `atleta_grupo` del MISMO club. Sin esto el hero del
  // coach (nivel de la clase, conteo de atletas) y cualquier consumidor de
  // `a.grupo_id` quedan en blanco. Validamos el club para no heredar un grupo
  // ajeno (existe data legacy de importación con vínculos cross-club); la RLS
  // `grupos_select` scopea por club como segunda barrera. Solo consulta cuando
  // hace falta (en clubes con la columna ya poblada, `idsSinGrupo` es vacío).
  const clubPorAtleta = {};
  atletas.forEach((a) => { clubPorAtleta[a.id] = a.usuarios?.club; });
  const idsSinGrupo = atletas.filter((a) => !a.grupo_id).map((a) => a.id);
  const grupoDerivado = {};
  if (idsSinGrupo.length > 0) {
    const { data: vinculos } = await supabase
      .from('atleta_grupo')
      .select('atleta_id, grupo_id, added_at, grupos_entrenamiento (nombre, club)')
      .in('atleta_id', idsSinGrupo)
      .order('added_at', { ascending: false });
    (vinculos || []).forEach((v) => {
      const g = v.grupos_entrenamiento;
      // Nos quedamos con el vínculo mismo-club más reciente (order desc + primer
      // match gana). Un atleta puede tener varios grupos; para colapsar a la
      // columna single se elige el más reciente de su propio club.
      if (g && g.club === clubPorAtleta[v.atleta_id] && !grupoDerivado[v.atleta_id]) {
        grupoDerivado[v.atleta_id] = { grupo_id: v.grupo_id, grupo_nombre: g.nombre };
      }
    });
  }

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
      grupo_id: a.grupo_id || grupoDerivado[a.id]?.grupo_id || null,
      grupo_nombre: a.grupo_nombre || grupoDerivado[a.id]?.grupo_nombre || null,
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

  if (limit > 0) {
    const hasMore = (page * limit) < count;
    return { data: mappedAtletas, hasMore };
  }

  return mappedAtletas;
};
