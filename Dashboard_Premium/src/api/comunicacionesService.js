// src/api/comunicacionesService.js
import { supabase } from './supabaseClient';

export async function crearComunicacion({ autor_id, tipo, grupo_id, atleta_id, titulo, mensaje, destinatarios_ids = [] }) {
  const { data, error } = await supabase
    .from('comunicaciones')
    .insert({ autor_id, tipo, grupo_id: grupo_id || null, atleta_id: atleta_id || null, titulo, mensaje })
    .select()
    .single();
  if (error) throw error;

  // Si es Personalizado, insertar destinatarios
  if (tipo === 'Personalizado' && destinatarios_ids.length > 0) {
    await supabase.from('comunicacion_destinatarios').insert(
      destinatarios_ids.map(uid => ({ comunicacion_id: data.id, usuario_id: uid }))
    );
  }
  return data;
}

export async function fetchComunicaciones({ tipo = null, limit = 30 } = {}) {
  let q = supabase
    .from('comunicaciones')
    .select(`
      *,
      grupos_entrenamiento (nombre),
      atletas (id, usuarios!inner(nombre))
    `)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (tipo) q = q.eq('tipo', tipo);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return data || [];
}

export async function fetchComunicacionesParaPadre(usuarioId, atletaId) {
  // Anuncios generales + mensajes del grupo del atleta + notas individuales del atleta
  const { data, error } = await supabase
    .from('comunicaciones')
    .select('*, grupos_entrenamiento(nombre)')
    .or(`tipo.eq.Anuncio,atleta_id.eq.${atletaId}`)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) { console.error(error); return []; }
  return data || [];
}

// Genera el texto pre-formateado para abrir en wa.me
export function generarLinkWhatsApp(numero, mensaje) {
  const texto = encodeURIComponent(mensaje);
  return `https://wa.me/${numero}?text=${texto}`;
}

export function generarMensajeRecordatorioPago(atleta, monto, mes) {
  const meses = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `Hola! 👋 Le recordamos que la mensualidad de *${atleta}* correspondiente a *${meses[mes]}* está pendiente de pago por *$${monto}*.\n\n¡Gracias por ser parte de *Black Gold Basketball*! 🏀⭐`;
}

export function generarMensajeSesion(grupo, objetivo, logrado, notas) {
  const emoji = logrado === 'Sí' ? '✅' : logrado === 'Parcial' ? '⚡' : '❌';
  return `*Black Gold Basketball — Resumen de Sesión*\n\n📋 Grupo: ${grupo}\n🎯 Objetivo: ${objetivo}\n${emoji} Resultado: ${logrado}\n${notas ? `📝 Notas: ${notas}` : ''}`;
}
