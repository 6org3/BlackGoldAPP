// src/api/sheetsService.js
// Ahora conectado a SUPABASE (Base de Datos Real)

import { supabase } from './supabaseClient';
import { getRango } from '../lib/baremosEngine';

// ============================================================
// MOTOR DE NIVELES — Basketball Developmental Progression
// ============================================================
// Los atletas progresan dentro de 3 fases formativas:
//   Micro      → Sub-6, Sub-8, Sub-10, y sub-12/13/14 sin baremos
//   Desarrollo → Sub-12+ que superan baremos de fuerza/técnica
//   Elite      → Sub-15+ de alto rendimiento
//
// Dentro de cada fase hay 3 Niveles que reflejan qué tan cerca
// está el atleta de "graduarse" al siguiente grupo.
// Esto es análogo a cómo USA Basketball evalúa prospectos por
// etapas de maduración, no sólo por edad.
// ============================================================

const FASE_CONFIG = {
  Micro: {
    textColor: 'text-emerald-400',
    glow: 'shadow-[0_0_15px_rgba(52,211,153,0.25)]',
    thresholds: [0, 28, 52], // Nv.1 < 28%, Nv.2 28-52%, Nv.3 > 52%
  },
  Desarrollo: {
    textColor: 'text-[#FFD700]',
    glow: 'shadow-[0_0_15px_rgba(255,215,0,0.25)]',
    thresholds: [0, 35, 62], // Nv.1 < 35%, Nv.2 35-62%, Nv.3 > 62%
  },
  Elite: {
    textColor: 'text-purple-400',
    glow: 'shadow-[0_0_20px_rgba(168,85,247,0.35)]',
    thresholds: [0, 45, 70], // Nv.1 < 45%, Nv.2 45-70%, Nv.3 > 70%
  },
};

// Deriva la fase formativa desde la categoría de edad
// (fallback mientras no esté grupo_id cargado de la DB)
function getFaseByCategoria(categoria) {
  const microCats = ['Sub-6', 'Sub-8', 'Sub-10', 'Sub6', 'Sub8', 'Sub10'];
  const desarrolloCats = ['Sub-12', 'Sub12'];
  if (microCats.includes(categoria)) return 'Micro';
  if (desarrolloCats.includes(categoria)) return 'Desarrollo';
  return 'Elite'; // Sub-15, Sub-18, Senior, Femenino
}


export const calculateRank = (atleta) => {
  const overallScore = atleta.overall_score || 0;
  const rango = getRango(overallScore);
  return {
    nombre: rango.nombre,
    tier: rango.id,
    textColor: rango.color,
    glow: '',
    pct: overallScore,
    rango,
  };
};

// ============================
// AUTENTICACIÓN (Supabase)
// ============================

export const loginUsuario = async (identificador, password) => {
  // Buscar usuario por correo, teléfono o cédula
  // Es importante sanitizar los espacios y usar comillas dobles en Supabase .or()
  const cleanId = identificador.trim();
  const { data: usuario, error } = await supabase
    .from('usuarios')
    .select('*')
    .or(`correo.eq."${cleanId}",telefono.eq."${cleanId}",cedula.eq."${cleanId}"`)
    .maybeSingle();

  if (error || !usuario) {
    throw new Error('Credenciales (correo, teléfono o cédula) no encontradas en el sistema.');
  }

  // Validar contraseña según el rol
  let isValid = false;
  if (usuario.rol === 'atleta') {
    isValid = (password === usuario.cedula);
  } else if (usuario.rol === 'padre') {
    // La contraseña del padre debe coincidir con la cédula de al menos uno de sus hijos
    const { data: vinculos, error: errVinculos } = await supabase
      .from('padres_atletas')
      .select('atletas!inner(usuarios!atletas_usuario_id_fkey!inner(cedula))')
      .eq('padre_id', usuario.id);
      
    if (!errVinculos && vinculos && vinculos.length > 0) {
      isValid = vinculos.some(v => v.atletas.usuarios.cedula === password);
    }
  } else {
    // Staff: coach, owner, superadmin
    isValid = (password === usuario.contrasena_hash);
  }

  if (!isValid) {
    throw new Error('Contraseña incorrecta.');
  }

  return fetchUsuarioCompleto(usuario);
};

export const fetchUsuarioCompleto = async (usuarioBase) => {
  if (usuarioBase.rol === 'atleta') {
    const { data: atletaData } = await supabase
      .from('atletas')
      .select('*')
      .eq('usuario_id', usuarioBase.id)
      .single();

    if (atletaData) {
      // Obtener evaluaciones del atleta
      const { data: evaluaciones } = await supabase
        .from('evaluaciones_pruebas')
        .select('*')
        .eq('atleta_id', atletaData.id)
        .order('created_at', { ascending: false });

      const evalUnicas = {};
      (evaluaciones || []).forEach(e => {
        if (!evalUnicas[e.prueba_tipo]) {
          evalUnicas[e.prueba_tipo] = e;
        }
      });
      const evalsArray = Object.values(evalUnicas);

      // Obtener readiness del día
      const hoy = new Date().toISOString().split('T')[0];
      const { data: readinessData } = await supabase
        .from('atleta_readiness')
        .select('*')
        .eq('atleta_id', atletaData.id)
        .eq('fecha', hoy)
        .maybeSingle();

      const merged = {
        ...usuarioBase,
        ...atletaData,
        id: usuarioBase.id,
        atleta_id: atletaData.id,
        _evaluaciones: evalsArray,
        _readiness_hoy: readinessData || null
      };
      merged.rango = calculateRank(merged);
      return merged;
    }
  }

  return usuarioBase;
};

// ============================
// DASHBOARD PADRE
// ============================

export const fetchPadreData = async (padreId) => {
  // 1. Obtener hijos vinculados
  const { data: vinculos } = await supabase
    .from('padres_atletas')
    .select('atleta_id')
    .eq('padre_id', padreId);

  if (!vinculos || vinculos.length === 0) return { hijos: [], sesiones: [] };

  const idsHijos = vinculos.map(v => v.atleta_id);

  // 2. Traer datos de los atletas (hijos)
  const { data: atletas } = await supabase
    .from('atletas')
    .select(`
      *,
      usuarios!atletas_usuario_id_fkey (id, nombre, categoria)
    `)
    .in('id', idsHijos);

  // Traer evaluaciones para construir radar correctamente
  const { data: evaluaciones } = await supabase
    .from('evaluaciones_pruebas')
    .select('*')
    .in('atleta_id', idsHijos)
    .order('created_at', { ascending: false });

  const evalByAtleta = {};
  (evaluaciones || []).forEach(e => {
    if (!evalByAtleta[e.atleta_id]) evalByAtleta[e.atleta_id] = {};
    if (!evalByAtleta[e.atleta_id][e.prueba_tipo]) {
      evalByAtleta[e.atleta_id][e.prueba_tipo] = e;
    }
  });

  const hijosFormat = (atletas || []).map(a => {
    const atletaEvals = evalByAtleta[a.id] || {};
    const evalsArray = Object.values(atletaEvals);

    const merged = {
      ...a,
      id: a.usuarios.id,
      atleta_id: a.id,
      nombre: a.usuarios.nombre,
      categoria: a.usuarios.categoria,
      _evaluaciones: evalsArray
    };
    merged.rango = calculateRank(merged);
    return merged;
  });

  // 3. Traer sesiones recientes de los hijos
  const { data: sesiones } = await supabase
    .from('sesiones_control')
    .select(`
      id, fecha, tipo, objetivo_tipo, objetivo_descripcion, ejercicios_notas, notas_evaluacion, se_logro, atleta_id,
      coach_id,
      usuarios!sesiones_control_coach_id_fkey(nombre)
    `)
    .in('atleta_id', idsHijos)
    .order('fecha', { ascending: false })
    .limit(20);

  // 4. Traer anuncios del club
  const { data: anuncios } = await supabase
    .from('comunicaciones')
    .select('id, titulo, mensaje, created_at, autor_id, usuarios!comunicaciones_autor_id_fkey(nombre)')
    .eq('tipo', 'Anuncio')
    .order('created_at', { ascending: false })
    .limit(5);

  return { 
    hijos: hijosFormat, 
    sesiones: sesiones || [],
    anuncios: anuncios || []
  };
};

// ============================
// REGISTRO PÚBLICO (Formulario Padre)
// ============================

export const registrarDesdeFormularioPublico = async (datosAtleta, datosPadre = null) => {
  const edad = calcularEdad(datosAtleta.fecha_nacimiento);
  const categoriaAsignada = calcularCategoriaFEB(datosAtleta.fecha_nacimiento);

  // 1. Crear usuario atleta
  const { data: nuevoAtletaUsuario, error: errUsuAtleta } = await supabase
    .from('usuarios')
    .insert({
      cedula: datosAtleta.cedula,
      nombre: datosAtleta.nombre,
      correo: datosAtleta.correo || null,
      telefono: datosAtleta.telefono || null,
      fecha_nacimiento: datosAtleta.fecha_nacimiento,
      rol: 'atleta',
      club: datosAtleta.club || 'Black Gold',
      categoria: categoriaAsignada,
      genero: datosAtleta.genero || 'Masculino'
    })
    .select()
    .single();
  
  if (errUsuAtleta) {
    if (errUsuAtleta.code === '23505' || errUsuAtleta.message.includes('unique constraint')) {
      throw new Error(`La cédula "${datosAtleta.cedula}" ya se encuentra registrada en el sistema. Por favor, verifica los datos.`);
    }
    throw new Error('Error al registrar usuario atleta: ' + errUsuAtleta.message);
  }

  // 2. Crear registro atleta
  const { data: nuevoAtleta, error: errAtleta } = await supabase
    .from('atletas')
    .insert({
      usuario_id: nuevoAtletaUsuario.id,
      edad: edad,
      posicion: datosAtleta.posicion || 'N/A'
    })
    .select()
    .single();

  if (errAtleta) throw new Error('Error al registrar métricas del atleta: ' + errAtleta.message);

  // 3. Crear y vincular Padre/Representante si se proporcionaron los datos
  if (datosPadre && datosPadre.telefono) {
    const padreCedula = `PADRE_${datosPadre.telefono}`;

    // Revisar si ya existe el padre
    let padreId = null;
    const { data: padreExistente } = await supabase
      .from('usuarios')
      .select('id')
      .eq('cedula', padreCedula)
      .single();

    if (padreExistente) {
      padreId = padreExistente.id;
    } else {
      // Crear nuevo padre
      const { data: nuevoPadre, error: errPadre } = await supabase
        .from('usuarios')
        .insert({
          cedula: padreCedula,
          nombre: datosPadre.nombre,
          correo: datosPadre.correo,
          telefono: datosPadre.telefono,
          rol: 'padre',
          club: datosAtleta.club || 'Black Gold'
        })
        .select()
        .single();
      
      if (errPadre) {
        if (errPadre.code === '23505' || errPadre.message.includes('unique constraint')) {
          throw new Error(`El teléfono del representante "${datosPadre.telefono}" ya está registrado con otro padre.`);
        }
        throw new Error('Error al registrar representante: ' + errPadre.message);
      }
      padreId = nuevoPadre.id;
    }

    // Vincular en padres_atletas
    if (padreId) {
      const { error: errVinculo } = await supabase
        .from('padres_atletas')
        .insert({ padre_id: padreId, atleta_id: nuevoAtleta.id });
      if (errVinculo) throw new Error('Error al vincular el representante con el atleta: ' + errVinculo.message);
    }
  }

  return { success: true, atletaId: nuevoAtleta.id };
};

// ============================
// FETCH ATLETAS (Supabase)
// ============================

export const fetchTodosLosAtletas = async (user = null, page = 1, limit = 0) => {
  let query = supabase
    .from('atletas')
    .select(`
      *,
      usuarios!atletas_usuario_id_fkey (
        id,
        cedula,
        nombre,
        rol,
        club,
        categoria,
        correo,
        fecha_nacimiento,
        genero
      )
    `, { count: 'exact' });

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

  let mappedAtletas = (atletas || [])
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

  if (user && user.rol === 'coach') {
    mappedAtletas = mappedAtletas.filter(a => {
      if (a.club !== user.club) return false;
      // If coach has a specific category assigned, filter by it
      if (user.categoria && user.categoria !== 'Todas') {
        return a.categoria === user.categoria;
      }
      return true;
    });
  }

  if (limit > 0) {
    const hasMore = (page * limit) < count;
    return { data: mappedAtletas, hasMore };
  }

  return mappedAtletas;
};

// ============================
// MISIONES (Supabase)
// ============================

export const fetchMisiones = async (atletaId) => {
  // atletaId aquí es el usuario.id, necesitamos el atleta_id
  const { data: atletaData } = await supabase
    .from('atletas')
    .select('id')
    .eq('usuario_id', atletaId)
    .single();

  if (!atletaData) return [];

  const { data: progreso, error } = await supabase
    .from('progreso_misiones')
    .select(`
      *,
      misiones!inner (
        id,
        titulo,
        descripcion,
        tipo,
        video_url,
        xp_recompensa,
        quiz
      )
    `)
    .eq('atleta_id', atletaData.id);

  if (error) {
    console.error('Error fetching misiones:', error);
    return [];
  }

  return progreso.map(p => ({
    id: p.misiones.id,
    progreso_id: p.id,
    titulo: p.misiones.titulo,
    descripcion: p.misiones.descripcion,
    tipo: p.misiones.tipo,
    videoUrl: p.misiones.video_url,
    xpRecompensa: p.misiones.xp_recompensa,
    quiz: p.misiones.quiz || [],
    completada: p.completada,
    estado: p.estado,
    fechaCompletada: p.fecha_completada,
  }));
};

// ============================
// COMPLETAR MISIÓN (Supabase)
// ============================

export const completarMision = async (atletaUserId, misionId) => {
  // Obtener atleta_id desde usuario_id
  const { data: atletaData } = await supabase
    .from('atletas')
    .select('id')
    .eq('usuario_id', atletaUserId)
    .single();

  if (!atletaData) return { success: false };

  // Marcar misión como completada pero pendiente de aprobación por el coach
  const { error: updateError } = await supabase
    .from('progreso_misiones')
    .update({
      completada: true,
      fecha_completada: new Date().toISOString(),
      estado: 'pendiente_aprobacion'
    })
    .eq('atleta_id', atletaData.id)
    .eq('mision_id', misionId);

  if (updateError) {
    console.error('Error completing mission:', updateError);
    return { success: false };
  }

  return { success: true };
};

// ============================
// SESIONES DE ENTRENAMIENTO
// ============================

export const fetchSesionesAtleta = async (atletaId) => {
  const { data, error } = await supabase
    .from('sesiones_entrenamiento')
    .select('*')
    .eq('atleta_id', atletaId)
    .order('fecha', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching sesiones:', error);
    return [];
  }

  return data || [];
};

export const crearSesionEntrenamiento = async (sesionData) => {
  const { data, error } = await supabase
    .from('sesiones_entrenamiento')
    .insert(sesionData)
    .select()
    .single();

  if (error) {
    console.error('Error creating sesion:', error);
    throw error;
  }

  return data;
};

// ============================
// SCREENING FUNCIONAL
// ============================

export const fetchScreeningFuncional = async (atletaId) => {
  const { data, error } = await supabase
    .from('screening_funcional')
    .select('*')
    .eq('atleta_id', atletaId)
    .order('fecha', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error('Error fetching screening:', error);
    return null;
  }

  return data;
};

// ============================
// OBSERVACIONES CANCHA (Phase 4)
// ============================

export const fetchObservaciones = async (atletaId) => {
  const { data, error } = await supabase
    .from('observaciones_cancha')
    .select('*')
    .eq('atleta_id', atletaId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching observaciones:', error);
    return [];
  }
  return data || [];
};

export const insertarObservacion = async (data) => {
  const { data: obsData, error } = await supabase
    .from('observaciones_cancha')
    .insert([data])
    .select()
    .single();

  if (error) throw error;

  if (data.xp_agregado) {
    const { data: atletaData } = await supabase
      .from('atletas')
      .select('id, xp_total')
      .eq('id', data.atleta_id)
      .single();

    if (atletaData) {
      await supabase
        .from('atletas')
        .update({ xp_total: (atletaData.xp_total || 0) + data.xp_agregado })
        .eq('id', data.atleta_id);
    }
  }

  return obsData;
};

// ============================
// NOTAS COACH (Phase 4)
// ============================

export const fetchNotasCoach = async (atletaId) => {
  const { data, error } = await supabase
    .from('notas_coach')
    .select('*')
    .eq('atleta_id', atletaId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching notas coach:', error);
    return [];
  }
  return data || [];
};

export const insertarNotaCoach = async (data) => {
  const { data: notaData, error } = await supabase
    .from('notas_coach')
    .insert([data])
    .select()
    .single();

  if (error) throw error;
  return notaData;
};

// ============================
// MISIONES - APROBAR/RECHAZAR/ASIGNAR (Phase 4)
// ============================


export function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return 0;
  const hoy = new Date();
  const fechaNac = new Date(fechaNacimiento);
  if (isNaN(fechaNac.getTime())) return 0;
  let edad = hoy.getFullYear() - fechaNac.getFullYear();
  const mes = hoy.getMonth() - fechaNac.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < fechaNac.getDate())) {
    edad--;
  }
  return edad;
}

export function calcularCategoriaFEB(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  let edad;
  if (typeof fechaNacimiento === 'number') {
    edad = fechaNacimiento;
  } else {
    edad = calcularEdad(fechaNacimiento);
  }
  if (edad <= 0) return null;
  if (edad <= 9) return 'Premini (Sub-9)';
  if (edad <= 11) return 'Mini (Sub-11)';
  if (edad <= 14) return 'Menores (Sub-14)';
  if (edad <= 16) return 'Prejuvenil (Sub-16)';
  if (edad <= 18) return 'Juvenil (Sub-18)';
  return 'Mayores';
}

export const aprobarMision = async (progresoId) => {
  // 1. Obtener la misión y el atleta para sumar el XP
  const { data: progresoData } = await supabase
    .from('progreso_misiones')
    .select(`
      atleta_id, 
      misiones (xp_recompensa)
    `)
    .eq('id', progresoId)
    .single();

  if (progresoData && progresoData.misiones) {
    const baseXP = progresoData.misiones.xp_recompensa || 0;
    const atletaId = progresoData.atleta_id;

    // Obtener XP y Nivel actual del atleta
    const { data: atletaData } = await supabase
      .from('atletas')
      .select('xp_total, nivel_desarrollo')
      .eq('id', atletaId)
      .single();

    if (atletaData) {
      let finalXP = baseXP;
      const titleLower = (progresoData.misiones.titulo || '').toLowerCase();

      // Ajustar XP según palabras clave del nivel en el título de la misión
      if (titleLower.includes('micro')) {
        finalXP = 25; // Recompensa estándar para misiones Micro
      } else if (titleLower.includes('desarrollo')) {
        finalXP = 50; // Recompensa estándar para misiones Desarrollo
      } else if (titleLower.includes('elite') || titleLower.includes('élite')) {
        finalXP = 75; // Recompensa estándar para misiones Élite
      } else {
        // Ajuste fallback según el nivel del atleta si la misión no tiene nivel explícito
        if (atletaData.nivel_desarrollo === 'Micro') {
          finalXP = Math.min(baseXP, 30);
        } else if (atletaData.nivel_desarrollo === 'Desarrollo') {
          finalXP = Math.min(baseXP, 60);
        } else if (atletaData.nivel_desarrollo === 'Elite') {
          finalXP = Math.max(baseXP, 75);
        }
      }

      await supabase
        .from('atletas')
        .update({ xp_total: (atletaData.xp_total || 0) + finalXP })
        .eq('id', atletaId);
    }
  }

  // 2. Marcar como aprobada
  const { error } = await supabase
    .from('progreso_misiones')
    .update({ estado: 'aprobada' })
    .eq('id', progresoId);
  if (error) throw error;
  return { success: true };
};

export const rechazarMision = async (progresoId) => {
  const { error } = await supabase
    .from('progreso_misiones')
    .update({ estado: 'rechazada' })
    .eq('id', progresoId);
  if (error) throw error;
  return { success: true };
};

export const asignarMisionAAtleta = async (atletaId, misionId) => {
  const { data, error } = await supabase
    .from('progreso_misiones')
    .insert([{
      atleta_id: atletaId,
      mision_id: misionId,
      estado: 'pendiente'
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

// ============================
// EVALUACIONES POR PRUEBAS (Fase 4D)
// ============================

export const guardarEvaluacion = async (evaluacion) => {
  const { data, error } = await supabase
    .from('evaluaciones_pruebas')
    .insert([evaluacion])
    .select()
    .single();
  if (error) throw error;

  // Recalculate overall score for the athlete
  await recalcularOverall(evaluacion.atleta_id);
  
  return data;
};

export const fetchEvaluacionesAtleta = async (atletaId) => {
  const { data, error } = await supabase
    .from('evaluaciones_pruebas')
    .select('*')
    .eq('atleta_id', atletaId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const recalcularOverall = async (atletaId) => {
  const { calcularOverall } = await import('../lib/baremosEngine');
  
  // Fetch latest evaluaciones
  const evaluaciones = await fetchEvaluacionesAtleta(atletaId);
  
  // Keep only latest per prueba_tipo
  const latest = {};
  evaluaciones.forEach(e => {
    if (!latest[e.prueba_tipo]) latest[e.prueba_tipo] = e;
  });
  
  const { overall, rango } = calcularOverall(Object.values(latest));
  
  // Update atleta
  const { error } = await supabase
    .from('atletas')
    .update({ 
      overall_score: overall, 
      rango: rango.id 
    })
    .eq('id', atletaId);
  
  if (error) throw error;
  
  // Check if rank changed → create recompensas
  await checkAndCreateRecompensas(atletaId, rango.id);
  
  return { overall, rango };
};

// ============================
// ENCUESTAS DE HÁBITOS
// ============================

export const guardarEncuestaHabitos = async (encuesta) => {
  const { data, error } = await supabase
    .from('encuestas_habitos')
    .insert([encuesta])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const fetchEncuestasSemana = async (atletaId, semana) => {
  const { data, error } = await supabase
    .from('encuestas_habitos')
    .select('*')
    .eq('atleta_id', atletaId)
    .eq('semana', semana)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const validarEncuestaPorPadre = async (encuestaId, correcciones) => {
  const { error } = await supabase
    .from('encuestas_habitos')
    .update({
      validado_por_padre: true,
      correcciones_padre: correcciones,
    })
    .eq('id', encuestaId);
  if (error) throw error;
  return { success: true };
};

// ============================
// RECOMPENSAS
// ============================

export const fetchRecompensasAtleta = async (atletaId) => {
  const { data, error } = await supabase
    .from('recompensas_desbloqueadas')
    .select('*')
    .eq('atleta_id', atletaId)
    .order('fecha_desbloqueo', { ascending: false });
  if (error) throw error;
  return data || [];
};

const checkAndCreateRecompensas = async (atletaId, nuevoRangoId) => {
  const { RECOMPENSAS_POR_RANGO } = await import('../lib/baremosEngine');
  
  // Fetch existing recompensas
  const existentes = await fetchRecompensasAtleta(atletaId);
  const rangosExistentes = new Set(existentes.map(r => r.rango_alcanzado));
  
  // If the new rank has recompensas and they haven't been created yet
  if (RECOMPENSAS_POR_RANGO[nuevoRangoId] && !rangosExistentes.has(nuevoRangoId)) {
    const nuevasRecompensas = RECOMPENSAS_POR_RANGO[nuevoRangoId].map(r => ({
      atleta_id: atletaId,
      rango_alcanzado: nuevoRangoId,
      recompensa: r.nombre,
      descripcion: r.descripcion,
    }));
    
    await supabase.from('recompensas_desbloqueadas').insert(nuevasRecompensas);
  }
};

export const marcarRecompensaEntregada = async (recompensaId) => {
  const { error } = await supabase
    .from('recompensas_desbloqueadas')
    .update({ entregado: true, fecha_entrega: new Date().toISOString() })
    .eq('id', recompensaId);
  if (error) throw error;
  return { success: true };
};

// ============================
// READINESS ENGINE (FIBA/NBA)
// ============================

export const guardarReadinessDiario = async (readinessData) => {
  const { data, error } = await supabase
    .from('atleta_readiness')
    .insert([readinessData])
    .select()
    .single();
  if (error) {
    if (error.code === '23505') {
      throw new Error('Ya realizaste tu Check-in de Readiness hoy.');
    }
    throw error;
  }
  return data;
};

export const fetchReadinessHoy = async (atletaId) => {
  const hoy = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('atleta_readiness')
    .select('*')
    .eq('atleta_id', atletaId)
    .eq('fecha', hoy)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error; // Ignorar error si no hay datos
  return data;
};
