// src/api/authService.js
import { supabase } from './supabaseClient';
import { getRango } from '../lib/baremosEngine';
import { calcularMetricasDerivadas } from './utilsAtletas';
import { hoyLocal } from '../lib/fechasLocal';

export const calculateRank = (atleta) => {
  const overallScore = atleta.overall_score || 0;
  const rango = getRango(overallScore);
  return {
    nombre: rango.nombre,
    textColor: rango.color,
    glow: '',
    pct: overallScore,
    rango,
  };
};

// ============================
// AUTENTICACIÓN (Supabase Auth)
// ============================

// Un ÚNICO mensaje para todo fallo de credenciales. Distinguir "no encontrado"
// de "contraseña incorrecta" convertía el login en un oráculo de existencia
// sobre cédulas y teléfonos de menores: bastaba probar identificadores y leer
// cuál de los dos mensajes salía. v52 §4 lo cerró en la base (resolver_email_login
// ya no devuelve NULL); esto lo cierra también en el cliente, para que no
// dependa de que esa migración siga aplicada.
const CREDENCIALES_INVALIDAS = 'Correo, teléfono, cédula o contraseña incorrectos.';

export const loginUsuario = async (identificador, password) => {
  const cleanId = identificador.trim();

  // El login histórico acepta correo, teléfono o cédula; Supabase Auth
  // solo entiende email, así que primero traducimos el identificador
  // al email real (o sintético) vinculado a esa cuenta.
  const { data: email, error: errResolver } = await supabase
    .rpc('resolver_email_login', { p_identificador: cleanId });

  if (errResolver) {
    // Un fallo de transporte NO depende del identificador, así que no delata
    // nada y merece mensaje propio. En 3G/4G rural, mandar a un padre a revisar
    // su cédula cuando lo que falló fue la red es el error caro.
    throw new Error('No pudimos verificar tus datos ahora mismo. Revisa tu conexión e inténtalo de nuevo.');
  }

  // Espejo de v52 §4: si la RPC no devuelve correo (base sin v52 aplicada),
  // se sintetiza uno con la MISMA forma y se sigue hasta signInWithPassword.
  // Sin esto quedaría un oráculo de TIEMPO: un identificador desconocido
  // respondería en un round-trip y uno conocido en dos, medible con un reloj.
  const emailLogin = email || `${cleanId}@sinacceso.blackgoldapp.internal`;

  const { data: authData, error: errAuth } = await supabase.auth.signInWithPassword({
    email: emailLogin,
    password,
  });

  if (errAuth || !authData.user) {
    throw new Error(CREDENCIALES_INVALIDAS);
  }

  return fetchUsuarioPorAuthId(authData.user.id);
};

// ── Recuperación por correo (entrega 3) ─────────────────────────────────────
// Solo sirve para quien tiene un correo REAL en su cuenta de Auth. Casi ningún
// atleta lo tiene —su cuenta nace con el sintético `<cédula>@sinacceso…`, un
// dominio que no existe—, así que en la práctica esto es la vía del
// representante, que desde la entrega 3 sí está obligado a dar el suyo.
//
// `resetPasswordForEmail` NO distingue un correo desconocido de uno real: es
// deliberado en GoTrue y también lo que queremos aquí, porque si respondiera
// distinto sería un oráculo para saber qué correos tienen cuenta en el club.
// Por eso la pantalla muestra siempre el mismo mensaje, pase lo que pase.
export const enviarEnlaceRecuperacion = async (correo) => {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(correo.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/recuperar`,
    });
    // Un error DEVUELTO por el servidor se traga a propósito. Depende del
    // destinatario —GoTrue limita los reenvíos por correo, así que insistir con
    // una dirección registrada devuelve 429 mientras una inventada sigue
    // respondiendo 200—, y pintarlo como fallo convertiría esta pantalla en un
    // oráculo: "error" significaría "esa cuenta existe". Se registra en consola
    // para poder depurarlo y se sigue mostrando el mismo mensaje que al éxito.
    if (error) console.warn('resetPasswordForEmail devolvió error (no se muestra):', error.message);
  } catch (error) {
    // Aquí solo caen los fallos de TRANSPORTE: la petición no llegó a salir.
    // Eso no depende del correo escrito, así que no delata nada — y callarlo
    // dejaría a la persona esperando un enlace que nunca se pidió.
    console.warn('resetPasswordForEmail no llegó a salir:', error);
    throw new Error('No pudimos enviar el enlace ahora mismo. Revisa tu conexión e inténtalo de nuevo.', { cause: error });
  }
};

// Conteo de usuarios visibles según RLS (home /sistema del superadmin).
// head: true no descarga filas, solo el count.
export const contarUsuarios = async () => {
  const { count, error } = await supabase
    .from('usuarios')
    .select('id', { count: 'exact', head: true });
  if (error) {
    console.error('Error contando usuarios:', error);
    return null;
  }
  return count ?? 0;
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

      // Obtener readiness del día (día LOCAL, no UTC — api-01)
      const hoy = hoyLocal();
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
        // La clave que leen didacticEngine y las tarjetas es readiness_hoy
        // (antes se guardaba como _readiness_hoy y nadie la consumía).
        readiness_hoy: readinessData || null
      };
      calcularMetricasDerivadas(merged, readinessData || null, evalsArray);
      merged.rango = calculateRank(merged);
      return merged;
    }
  }

  return usuarioBase;
};
