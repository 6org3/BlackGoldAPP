// src/api/registroPublicoService.js
import { supabase } from './supabaseClient';

// ============================
// REGISTRO PÚBLICO (Formulario Padre)
// ============================
// Desde la migración v24 (RLS real) el rol `anon` no puede tocar ninguna
// tabla: todos los INSERT (usuario atleta, fila de atletas, usuario padre,
// vínculo padres_atletas) los hace la RPC `registrar_publico()` en una sola
// transacción server-side, que además fuerza rol atleta/padre (por este
// camino no puede nacer staff). Aquí solo quedan las cuentas de Auth: el
// signUp sigue siendo del cliente, y la vinculación usuarios.auth_user_id
// la hace automáticamente el trigger sobre auth.users (v24) — ya no hay
// UPDATE de vinculación desde el navegador.

// Debe reflejar la misma regla que resolver_email_login() (migración v19):
// correo real si existe, o email sintético e inalcanzable derivado de la
// cédula (muchos atletas no cargan correo).
const emailParaAuth = (correo, cedula) =>
  correo || `${cedula}@sinacceso.blackgoldapp.internal`;

// Crea la cuenta de Supabase Auth. La contraseña inicial es la cédula del
// atleta (igual que el login histórico); el usuario puede cambiarla luego.
const crearCuentaAuth = async (correo, cedula, password) => {
  const { data: authData, error: errAuth } = await supabase.auth.signUp({
    email: emailParaAuth(correo, cedula),
    password,
  });

  if (errAuth || !authData.user) {
    throw new Error('El perfil se creó pero no se pudo generar la cuenta de acceso: ' + (errAuth?.message || 'error desconocido'));
  }
};

export const registrarDesdeFormularioPublico = async (datosAtleta, datosPadre = null) => {
  const { data: resultado, error: errRegistro } = await supabase.rpc('registrar_publico', {
    p_atleta: {
      cedula: datosAtleta.cedula,
      nombre: datosAtleta.nombre,
      correo: datosAtleta.correo || null,
      telefono: datosAtleta.telefono || null,
      fecha_nacimiento: datosAtleta.fecha_nacimiento,
      posicion: datosAtleta.posicion || null,
      club: datosAtleta.club || null,
      genero: datosAtleta.genero || null,
    },
    p_padre: datosPadre && datosPadre.telefono
      ? {
          nombre: datosPadre.nombre,
          telefono: datosPadre.telefono,
          correo: datosPadre.correo || null,
        }
      : null,
  });

  if (errRegistro) {
    // La RPC ya lanza mensajes amigables (cédula duplicada, teléfono de
    // representante repetido, campos obligatorios); se propagan tal cual.
    throw new Error(errRegistro.message);
  }

  // Cuenta de acceso del atleta (password = su cédula).
  await crearCuentaAuth(datosAtleta.correo, datosAtleta.cedula, datosAtleta.cedula);

  // Cuenta de acceso del padre solo si la RPC lo creó en esta llamada
  // (si ya existía, conserva su cuenta y contraseña actuales). Password
  // inicial: la cédula de este hijo — a diferencia del login viejo, ya
  // no vale "cualquier cédula de cualquier hijo".
  if (resultado?.padre_id && !resultado.padre_existente) {
    await crearCuentaAuth(datosPadre.correo, resultado.padre_cedula, datosAtleta.cedula);
  }

  return { success: true, atletaId: resultado?.atleta_id };
};
