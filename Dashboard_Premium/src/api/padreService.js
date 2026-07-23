// src/api/padreService.js
import { supabase } from './supabaseClient';
import { calculateRank } from './authService';

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
      usuarios!atletas_usuario_id_fkey (id, nombre, categoria, estado)
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

  // Un padre activo con un segundo hijo aún pendiente/rechazado (v33) no debe
  // ver la ficha vacía de ese hijo: solo se listan cuentas aprobadas.
  const hijosFormat = (atletas || []).filter(a => (a.usuarios?.estado ?? 'activo') === 'activo').map(a => {
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
      id, fecha, tipo, objetivo_tipo, objetivo_descripcion, ejercicios_ids, ejercicios_notas, notas_evaluacion, se_logro, atleta_id,
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
