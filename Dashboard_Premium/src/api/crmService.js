// Cliente del CRM de Dirección.
//
// No consulta tablas CRM desde el navegador: todas las lecturas y mutaciones
// pasan por la Edge Function crm-console, que valida JWT, rol y club antes de
// utilizar permisos de servidor.
import { supabase } from './supabaseClient';

const mensajeDesdeError = async (error, fallback) => {
  try {
    const body = await error.context?.json?.();
    if (body?.error) return body.error;
  } catch {
    // Conserva el mensaje seguro de respaldo ante respuestas no JSON.
  }
  return fallback;
};

const invocarCrm = async (body) => {
  const { data, error } = await supabase.functions.invoke('crm-console', { body });
  if (error) {
    throw new Error(await mensajeDesdeError(error, 'No pudimos comunicarte con el CRM.'));
  }
  if (!data) throw new Error('El CRM no devolvió una respuesta.');
  return data;
};

export const cargarResumenCrm = (offset = 0) => invocarCrm({ accion: 'resumen', offset });

export const cargarDetalleContactoCrm = (contactId) =>
  invocarCrm({ accion: 'detalle_contacto', contact_id: contactId });

export const actualizarEtapaCrm = (payload) =>
  invocarCrm({ accion: 'actualizar_etapa', ...payload });

export const actualizarPreferenciasCrm = (payload) =>
  invocarCrm({ accion: 'actualizar_preferencias', ...payload });

export const programarActividadCrm = (payload) =>
  invocarCrm({ accion: 'programar_actividad', ...payload });

export const registrarNotaCrm = (payload) =>
  invocarCrm({ accion: 'registrar_nota', ...payload });

export const marcarNoContactarCrm = (payload) =>
  invocarCrm({ accion: 'marcar_no_contactar', ...payload });

export const configurarContactoInternoCrm = (payload) =>
  invocarCrm({ accion: 'configurar_contacto_interno', ...payload });
