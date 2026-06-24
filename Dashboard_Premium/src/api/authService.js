// src/api/authService.js
import { supabase } from './supabaseClient';
import { getRango } from '../lib/baremosEngine';

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
