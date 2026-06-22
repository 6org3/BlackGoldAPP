// src/api/pagosService.js
import { supabase } from './supabaseClient';

export async function fetchPagosMes(mes, anio, grupoNombre = null) {
  // Traer pagos del mes + datos del atleta + grupo
  let q = supabase
    .from('pagos')
    .select(`
      *,
      atletas!inner (
        id,
        grupo_nombre,
        es_becado,
        descuento_pct,
        usuarios!inner (nombre, cedula, club)
      )
    `)
    .eq('mes', mes)
    .eq('anio', anio)
    .eq('tipo', 'Mensualidad');

  const { data, error } = await q;
  if (error) { console.error(error); return []; }

  let result = data || [];
  if (grupoNombre && grupoNombre !== 'Todos') {
    result = result.filter(p => p.atletas?.grupo_nombre === grupoNombre);
  }
  return result;
}

export async function upsertPago(payload) {
  // Calcular monto final con descuento
  const monto_final = payload.monto_base * (1 - (payload.descuento_pct || 0) / 100);
  const { data, error } = await supabase
    .from('pagos')
    .upsert({ ...payload, monto_final }, { onConflict: 'atleta_id,mes,anio,tipo' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function marcarPagado(pagoId, { forma_pago, referencia_comprobante = '', notas = '' }) {
  const { data, error } = await supabase
    .from('pagos')
    .update({
      estado: 'Pagado',
      fecha_pago: new Date().toISOString().split('T')[0],
      forma_pago,
      referencia_comprobante,
      notas,
    })
    .eq('id', pagoId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function actualizarEstadoVencidos() {
  // Marcar como Vencido los pagos Pendientes cuya fecha_vencimiento ya pasó
  const hoy = new Date().toISOString().split('T')[0];
  const { error } = await supabase
    .from('pagos')
    .update({ estado: 'Vencido' })
    .eq('estado', 'Pendiente')
    .lt('fecha_vencimiento', hoy);
  if (error) console.error(error);
}

export async function generarPagosMensuales(mes, anio, atletas, registradoPor) {
  // Genera pagos pendientes para todos los atletas activos del mes
  const payloads = atletas.map(a => ({
    atleta_id: a.atleta_id,
    tipo: 'Mensualidad',
    mes,
    anio,
    monto_base: 30.00,
    descuento_pct: a.descuento_pct || 0,
    monto_final: 30.00 * (1 - (a.descuento_pct || 0) / 100),
    estado: a.es_becado ? 'Becado' : 'Pendiente',
    fecha_vencimiento: `${anio}-${String(mes).padStart(2, '0')}-05`, // vence el día 5 de cada mes
    registrado_por: registradoPor,
  }));

  const { error } = await supabase
    .from('pagos')
    .upsert(payloads, { onConflict: 'atleta_id,mes,anio,tipo', ignoreDuplicates: true });
  if (error) throw error;
}

export async function fetchHistorialPagosAtleta(atletaId) {
  const { data, error } = await supabase
    .from('pagos')
    .select('*')
    .eq('atleta_id', atletaId)
    .order('anio', { ascending: false })
    .order('mes', { ascending: false })
    .limit(24);
  if (error) { console.error(error); return []; }
  return data || [];
}
