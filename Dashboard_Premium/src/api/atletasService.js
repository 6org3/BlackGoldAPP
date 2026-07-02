// src/api/atletasService.js
import { supabase } from './supabaseClient';
import { calculateRank } from './authService';
import { calcularCategoriaFEB } from './utilsAtletas';

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
        genero
      )
    `, { count: 'exact' });

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
      overall_score: a.overall_score || 0,
      xp_total: a.xp_total || 0,
      nivel_desarrollo: a.nivel_desarrollo,
      perfil_mental: a.perfil_mental,
      estado_recuperacion: a.estado_recuperacion,
      restriccion_movilidad: a.restriccion_movilidad,
      prevencion_impacto: a.prevencion_impacto,
      peso_kg: a.peso_kg,
      talla_cm: a.talla_cm,
      envergadura_cm: a.envergadura_cm,
      readiness_hoy: readinessHoy,
      _evaluaciones: evalsArray,
    };

    // IMC calculation: peso_kg / (talla_m)^2
    if (merged.peso_kg && merged.talla_cm) {
      const talla_m = merged.talla_cm / 100;
      merged.imc = (merged.peso_kg / (talla_m * talla_m)).toFixed(1);
    } else {
      merged.imc = 'N/A';
    }

    // Índice Córmico or Brazada Relativa (Wingspan / Height)
    if (merged.envergadura_cm && merged.talla_cm) {
      merged.brazada_relativa = (merged.envergadura_cm / merged.talla_cm).toFixed(2);
    } else {
      merged.brazada_relativa = 'N/A';
    }

    // Dynamic estado_recuperacion based on 'Carga Subjetiva y Sueño' test
    const recoveryEval = evalsArray
      .filter(e => e.prueba_tipo === 'Carga Subjetiva y Sueño')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

    if (readinessHoy) {
      if (readinessHoy.readiness_score < 4) merged.estado_recuperacion = 'Agotamiento Activo';
      else if (readinessHoy.readiness_score < 7) merged.estado_recuperacion = 'Fatiga Silenciosa';
      else merged.estado_recuperacion = 'Óptimo';
    } else if (recoveryEval) {
      // Fallback a la evaluación antigua si no hay check-in hoy
      if (recoveryEval.resultado <= 3) merged.estado_recuperacion = 'Agotamiento Activo';
      else if (recoveryEval.resultado <= 6) merged.estado_recuperacion = 'Fatiga Silenciosa';
      else merged.estado_recuperacion = 'Óptimo';
    } else {
      merged.estado_recuperacion = 'Sin datos';
    }

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
