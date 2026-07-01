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
// AUTENTICACIÓN (Supabase Auth)
// ============================

export const loginUsuario = async (identificador, password) => {
  const cleanId = identificador.trim();

  // El login histórico acepta correo, teléfono o cédula; Supabase Auth
  // solo entiende email, así que primero traducimos el identificador
  // al email real (o sintético) vinculado a esa cuenta.
  const { data: email, error: errResolver } = await supabase
    .rpc('resolver_email_login', { p_identificador: cleanId });

  if (errResolver || !email) {
    throw new Error('Credenciales (correo, teléfono o cédula) no encontradas en el sistema.');
  }

  const { data: authData, error: errAuth } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (errAuth || !authData.user) {
    throw new Error('Contraseña incorrecta.');
  }

  return fetchUsuarioPorAuthId(authData.user.id);
};

export const fetchUsuarioPorAuthId = async (authUserId) => {
  const { data: usuarioBase, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('auth_user_id', authUserId)
    .single();

  if (error || !usuarioBase) {
    throw new Error('No se encontró un perfil de usuario vinculado a esta cuenta.');
  }

  return fetchUsuarioCompleto(usuarioBase);
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
