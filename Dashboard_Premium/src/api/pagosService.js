// src/api/pagosService.js
import { supabase } from './supabaseClient';

const BUCKET_COMPROBANTES = 'comprobantes-pagos';

export async function fetchPagosMes(mes, anio, grupoId = null) {
  // Traer pagos del mes + datos del atleta + grupo
  let q = supabase
    .from('pagos')
    .select(`
      *,
      atletas!inner (
        id,
        grupo_id,
        grupo_nombre,
        es_becado,
        beca_pct,
        descuento_pct,
        recordatorios_pausados,
        usuarios!inner!atletas_usuario_id_fkey (nombre, cedula, club)
      )
    `)
    .eq('mes', mes)
    .eq('anio', anio)
    .eq('tipo', 'Mensualidad');

  const { data, error } = await q;
  if (error) { console.error(error); return []; }

  let result = data || [];
  if (grupoId && grupoId !== 'Todos') {
    result = result.filter(p => p.atletas?.grupo_id === grupoId);
  }
  return result;
}

// Grupos reales del club para el filtro de AdminPagos (reemplaza la lista hardcodeada).
export async function fetchGruposClub() {
  const { data, error } = await supabase
    .from('grupos_entrenamiento')
    .select('id, nombre, club, precio_mensual')
    .order('nombre');
  if (error) { console.error(error); return []; }
  return data || [];
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

// ── Transacciones (abonos) — v27 ─────────────────────────────────────────────
// Cada entrega de dinero es una fila de pago_transacciones; un trigger en la
// base recalcula monto_pagado y el estado del pago (Pagado / Abonado).

export async function registrarTransaccion(pagoId, { monto, forma_pago, referencia = '', notas = '' }, registradoPor) {
  const { error } = await supabase
    .from('pago_transacciones')
    .insert({
      pago_id: pagoId,
      monto,
      forma_pago,
      referencia,
      notas,
      registrado_por: registradoPor,
    });
  if (error) throw error;
  // El trigger ya recalculó el pago: devolver la fila fresca para la UI.
  const { data, error: e2 } = await supabase.from('pagos').select('*').eq('id', pagoId).single();
  if (e2) throw e2;
  return data;
}

export async function revertirTransaccion(transaccionId) {
  const { error } = await supabase.from('pago_transacciones').delete().eq('id', transaccionId);
  if (error) throw error;
}

export async function fetchTransacciones(pagoId) {
  const { data, error } = await supabase
    .from('pago_transacciones')
    .select('*, usuarios!pago_transacciones_registrado_por_fkey (nombre)')
    .eq('pago_id', pagoId)
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return data || [];
}

// Suma de efectivo por registrador en un rango (arqueo simple para el owner).
export async function fetchArqueoEfectivo(desdeISO, hastaISO) {
  const { data, error } = await supabase
    .from('pago_transacciones')
    .select('monto, forma_pago, created_at, registrado_por, usuarios!pago_transacciones_registrado_por_fkey (nombre)')
    .eq('forma_pago', 'Efectivo')
    .gte('created_at', desdeISO)
    .lte('created_at', hastaISO);
  if (error) { console.error(error); return []; }
  const porRegistrador = new Map();
  (data || []).forEach(t => {
    const clave = t.registrado_por;
    const prev = porRegistrador.get(clave) || { nombre: t.usuarios?.nombre || '—', total: 0, transacciones: 0 };
    prev.total += Number(t.monto) || 0;
    prev.transacciones += 1;
    porRegistrador.set(clave, prev);
  });
  return [...porRegistrador.values()].sort((a, b) => b.total - a.total);
}

/**
 * @deprecated Usar registrarTransaccion() — este atajo marca el pago completo
 * sin detalle por transacción (se conserva para scripts/compatibilidad).
 */
export async function marcarPagado(pagoId, { forma_pago, referencia_comprobante = '', notas = '' }) {
  const { data: pago, error: e0 } = await supabase
    .from('pagos').select('monto_final, monto_base').eq('id', pagoId).single();
  if (e0) throw e0;
  const { data, error } = await supabase
    .from('pagos')
    .update({
      estado: 'Pagado',
      fecha_pago: new Date().toISOString().split('T')[0],
      forma_pago,
      referencia_comprobante,
      notas,
      // coherencia con el modelo de saldos v27 aunque no haya transacción
      monto_pagado: pago.monto_final ?? pago.monto_base,
    })
    .eq('id', pagoId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function actualizarEstadoVencidos() {
  // v27: la fuente de verdad es la función SQL (también programada en pg_cron).
  const { error } = await supabase.rpc('marcar_pagos_vencidos');
  if (!error) return;
  // Fallback pre-v27 (proyecto sin la función todavía)
  const hoy = new Date().toISOString().split('T')[0];
  const { error: e2 } = await supabase
    .from('pagos')
    .update({ estado: 'Vencido' })
    .in('estado', ['Pendiente', 'Abonado'])
    .lt('fecha_vencimiento', hoy);
  if (e2) console.error(e2);
}

// v28: la generación vive en la función SQL generar_pagos_mes (mismo cálculo
// para el botón y el pg_cron): precio por grupo, descuento individual, becas
// parciales (beca_pct) y descuento por hermanos a las mensualidades más baratas
// de la familia — el mayor de los aplicables, sin acumular. Idempotente por el
// UNIQUE de v27. Devuelve el nº de pagos creados.
export async function generarPagosMensuales(mes, anio, club, registradoPor) {
  const { data, error } = await supabase.rpc('generar_pagos_mes', {
    p_mes: mes,
    p_anio: anio,
    p_club: club || null,
    p_registrado_por: registradoPor || null,
  });
  if (error) throw error;
  return data; // nº de pagos creados
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

// ── Contactos para WhatsApp dirigido — v27 ───────────────────────────────────
// Mapa atleta_id → { usuarioId, nombre, telefono } del representante de pagos
// (es_rep_pagos primero; si no hay marcado, el primer vínculo). El teléfono es
// PII y credencial de login: solo lo ve staff (RLS de usuarios ya lo scopea) y
// NUNCA se normaliza en la base — solo al armar el link wa.me.
export async function fetchContactosPago(atletaIds) {
  if (!atletaIds || atletaIds.length === 0) return {};
  const { data, error } = await supabase
    .from('padres_atletas')
    .select('atleta_id, es_rep_pagos, usuarios!padres_atletas_padre_id_fkey (id, nombre, telefono)')
    .in('atleta_id', atletaIds);
  if (error) { console.error(error); return {}; }
  const map = {};
  (data || []).forEach(v => {
    const contacto = {
      usuarioId: v.usuarios?.id,
      nombre: v.usuarios?.nombre,
      telefono: v.usuarios?.telefono || null,
      esRepPagos: v.es_rep_pagos,
      // migrar_deportistas.js genera este nombre como placeholder temporal
      // ("Representante de <Apellido>") cuando el atleta importado no traía
      // un padre/madre real — nunca debe mostrarse como si fuera un contacto
      // real confirmado.
      esPlaceholder: /^Representante de /.test(v.usuarios?.nombre || ''),
    };
    if (!map[v.atleta_id] || (v.es_rep_pagos && !map[v.atleta_id].esRepPagos)) {
      map[v.atleta_id] = contacto;
    }
  });
  return map;
}

// ── Comprobantes de transferencia — v27 ──────────────────────────────────────

/**
 * Sube la imagen del comprobante al bucket privado y crea la fila de
 * pago_comprobantes (el trigger pasa el pago a 'Por Verificar').
 * Convención de path: <atleta_id>/<pago_id>/<timestamp>.<ext> — el primer
 * segmento habilita la política de Storage de la familia.
 */
export async function subirComprobante({ pagoId, atletaId, file, banco = '', numeroDocumento = '', montoDeclarado = null, fechaTransferencia = null }, subidoPor) {
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase();
  const path = `${atletaId}/${pagoId}/${Date.now()}.${ext}`;

  const { error: eUp } = await supabase.storage
    .from(BUCKET_COMPROBANTES)
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
  if (eUp) throw eUp;

  const { data, error } = await supabase
    .from('pago_comprobantes')
    .insert({
      pago_id: pagoId,
      subido_por: subidoPor,
      storage_path: path,
      banco,
      numero_documento: numeroDocumento,
      monto_declarado: montoDeclarado,
      fecha_transferencia: fechaTransferencia,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Aprueba/rechaza vía la RPC SECURITY DEFINER (solo staff; deja rastro de quién
// verificó y, al aprobar, crea la transacción de Transferencia).
export async function resolverComprobante(comprobanteId, aprobar, motivo = null) {
  const { error } = await supabase.rpc('resolver_comprobante', {
    p_comprobante_id: comprobanteId,
    p_aprobar: aprobar,
    p_motivo: motivo,
  });
  if (error) throw error;
}

// Camino asistido: el padre mandó la foto por WhatsApp y el staff la registra
// en su nombre (sube el comprobante y lo aprueba en un solo gesto).
export async function registrarTransferenciaAsistida({ pagoId, atletaId, file, numeroDocumento = '', montoDeclarado = null }, staffUsuarioId) {
  const comprobante = await subirComprobante(
    { pagoId, atletaId, file, numeroDocumento, montoDeclarado },
    staffUsuarioId
  );
  await resolverComprobante(comprobante.id, true, null);
  return comprobante;
}

export async function fetchComprobantesPendientes() {
  const { data, error } = await supabase
    .from('pago_comprobantes')
    .select(`
      *,
      pagos!inner (
        id, tipo, concepto, mes, anio, monto_base, monto_final, monto_pagado, estado, atleta_id,
        atletas!inner (
          id, grupo_nombre,
          usuarios!atletas_usuario_id_fkey (nombre)
        )
      )
    `)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true });
  if (error) { console.error(error); return []; }
  return data || [];
}

// URL firmada de vida corta para ver la imagen del comprobante (bucket privado).
export async function getComprobanteUrl(storagePath, segundos = 600) {
  const { data, error } = await supabase.storage
    .from(BUCKET_COMPROBANTES)
    .createSignedUrl(storagePath, segundos);
  if (error) { console.error(error); return null; }
  return data?.signedUrl || null;
}

// ── Estado de cuenta del padre — v27 ─────────────────────────────────────────
// Se apoya en la política pagos_select_propio de v24 (mis_atletas()): cero
// cambios de RLS necesarios. Devuelve pagos abiertos + historial reciente +
// el último comprobante de cada pago abierto (para mostrar motivo de rechazo).
export async function fetchEstadoCuentaPadre(atletaId) {
  const { data: pagos, error } = await supabase
    .from('pagos')
    .select('*')
    .eq('atleta_id', atletaId)
    .order('anio', { ascending: false })
    .order('mes', { ascending: false })
    .limit(18);
  if (error) { console.error(error); return { abiertos: [], historial: [] }; }

  const todos = pagos || [];
  const abiertos = todos.filter(p => ['Pendiente', 'Vencido', 'Abonado', 'Por Verificar'].includes(p.estado));
  const historial = todos.filter(p => ['Pagado', 'Becado'].includes(p.estado)).slice(0, 12);

  if (abiertos.length > 0) {
    const { data: comprobantes } = await supabase
      .from('pago_comprobantes')
      .select('id, pago_id, estado, motivo_rechazo, created_at')
      .in('pago_id', abiertos.map(p => p.id))
      .order('created_at', { ascending: false });
    const ultimoPorPago = {};
    (comprobantes || []).forEach(c => {
      if (!ultimoPorPago[c.pago_id]) ultimoPorPago[c.pago_id] = c;
    });
    abiertos.forEach(p => { p.ultimo_comprobante = ultimoPorPago[p.id] || null; });
  }

  return { abiertos, historial };
}

// Instrucciones de pago del club (cuenta bancaria, WhatsApp, día de vencimiento).
export async function fetchClubConfig(club) {
  let q = supabase.from('club_config').select('*');
  q = club ? q.eq('club', club) : q.limit(1);
  const { data, error } = await q;
  if (error) { console.error(error); return null; }
  return (data && data[0]) || null;
}

// ── Configuración del club (owner) — P1 ──────────────────────────────────────
// RLS v27: club_config_write es owner/superadmin. El teléfono se guarda tal
// cual lo escribe el owner; se normaliza solo al armar el link wa.me.
export async function upsertClubConfig(club, campos) {
  const { data, error } = await supabase
    .from('club_config')
    .upsert({ club, ...campos }, { onConflict: 'club' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Catálogo de servicios (owner) — P1 ───────────────────────────────────────
export async function fetchCatalogo(club, { soloActivos = false } = {}) {
  let q = supabase.from('catalogo_servicios').select('*').order('nombre');
  if (club) q = q.eq('club', club);
  if (soloActivos) q = q.eq('activo', true);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return data || [];
}

export async function upsertServicio(servicio) {
  // servicio: { id?, club, nombre, descripcion, recurrencia, precio_base, activo }
  const { data, error } = await supabase
    .from('catalogo_servicios')
    .upsert(servicio, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function toggleServicioActivo(servicioId, activo) {
  const { error } = await supabase
    .from('catalogo_servicios')
    .update({ activo })
    .eq('id', servicioId);
  if (error) throw error;
}

// ── Tarifas por dimensión (grupo / categoría FEB / género) — P1 ──────────────
export async function fetchTarifas(servicioId) {
  const { data, error } = await supabase
    .from('servicio_tarifas')
    .select('*, grupos_entrenamiento (nombre)')
    .eq('servicio_id', servicioId)
    .order('vigente_desde', { ascending: false });
  if (error) { console.error(error); return []; }
  return data || [];
}

export async function upsertTarifa(tarifa) {
  // tarifa: { id?, servicio_id, grupo_id|null, categoria_feb|null, genero|null, precio, vigente_desde }
  const { data, error } = await supabase
    .from('servicio_tarifas')
    .upsert(tarifa, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTarifa(tarifaId) {
  const { error } = await supabase.from('servicio_tarifas').delete().eq('id', tarifaId);
  if (error) throw error;
}

// Precio sugerido de un servicio para un atleta (categoría FEB al vuelo en SQL).
export async function precioSugerido(servicioId, atletaId) {
  const { data, error } = await supabase.rpc('precio_servicio_atleta', {
    p_servicio_id: servicioId,
    p_atleta_id: atletaId,
  });
  if (error) { console.error(error); return null; }
  return data;
}

// ── Cargos extra individualizados — P1 ───────────────────────────────────────
// Una fila de `pagos` con tipo 'Otro'/'Sesion Individual', servicio_id +
// concepto, mes/anio NULL y fecha_servicio/vencimiento puntuales. INSERT normal
// (el UNIQUE de v27 no aplica porque mes/anio son NULL).
export async function crearCargo({ atletaId, servicioId, tipo = 'Otro', concepto, monto, fechaVencimiento = null }, registradoPor) {
  const { data, error } = await supabase
    .from('pagos')
    .insert({
      atleta_id: atletaId,
      tipo,
      servicio_id: servicioId || null,
      concepto,
      mes: null,
      anio: null,
      fecha_servicio: new Date().toISOString().split('T')[0],
      monto_base: monto,
      descuento_pct: 0,
      monto_final: monto,
      estado: 'Pendiente',
      fecha_vencimiento: fechaVencimiento,
      registrado_por: registradoPor,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Cargos extra abiertos/recientes del club (no mensualidades) para la pestaña Servicios.
export async function fetchCargosExtra(grupoId = null) {
  let q = supabase
    .from('pagos')
    .select(`
      *,
      atletas!inner (
        id, grupo_id, grupo_nombre,
        usuarios!inner!atletas_usuario_id_fkey (nombre)
      )
    `)
    .neq('tipo', 'Mensualidad')
    .order('created_at', { ascending: false })
    .limit(200);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  let result = data || [];
  if (grupoId && grupoId !== 'Todos') {
    result = result.filter(p => p.atletas?.grupo_id === grupoId);
  }
  return result;
}

export async function anularCargo(pagoId, motivo) {
  const { error } = await supabase
    .from('pagos')
    .update({ estado: 'Anulado', anulado_motivo: motivo })
    .eq('id', pagoId);
  if (error) throw error;
}

// ── Auditoría formal — v30 ────────────────────────────────────────────────────
// pagos_auditoria se alimenta sola vía trigger (trg_registrar_auditoria_pago);
// nadie escribe aquí desde el cliente. Solo lectura, RLS ya scopea por club.
export async function fetchAuditoriaPago(pagoId) {
  const { data, error } = await supabase
    .from('pagos_auditoria')
    .select('*, usuarios (nombre)')
    .eq('pago_id', pagoId)
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return data || [];
}

// ── Exportes CSV — v30 ────────────────────────────────────────────────────────
// Generación client-side (sin librería): construir el string y descargar por
// Blob. Escapa comillas/comas/saltos de línea por celda (RFC 4180 básico).
const csvCelda = (valor) => {
  const s = valor == null ? '' : String(valor);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const descargarCSV = (filas, nombreArchivo) => {
  const contenido = filas.map(fila => fila.map(csvCelda).join(',')).join('\r\n');
  // BOM UTF-8 para que Excel abra tildes/ñ sin pedir encoding manual.
  const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// Un CSV por pago del mes visible en AdminPagos (mismo dataset que la tabla).
export function exportarPagosCSV(pagos, { mes, anio } = {}) {
  const cabecera = ['Atleta', 'Grupo', 'Concepto', 'Monto', 'Pagado', 'Saldo', 'Estado', 'Forma de pago', 'Fecha de pago', 'Vencimiento'];
  const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const filas = pagos.map(p => [
    p.atletas?.usuarios?.nombre || '',
    p.atletas?.grupo_nombre || '',
    p.concepto || (p.tipo === 'Mensualidad' ? `Mensualidad ${MESES[p.mes] || ''}` : p.tipo),
    (p.monto_final || 0).toFixed(2),
    (p.monto_pagado || 0).toFixed(2),
    Math.max((p.monto_final || 0) - (p.monto_pagado || 0), 0).toFixed(2),
    p.estado,
    p.forma_pago || '',
    p.fecha_pago || '',
    p.fecha_vencimiento || '',
  ]);
  const sufijo = mes && anio ? `${String(mes).padStart(2, '0')}-${anio}` : new Date().toISOString().slice(0, 10);
  descargarCSV([cabecera, ...filas], `pagos_${sufijo}.csv`);
}

// Un CSV por transacción recibida en el rango (para el contador: cada
// entrada de dinero real, no el estado agregado del pago). Reusa el mismo
// filtro de fechas que CajaResumen (createdAt de pago_transacciones).
export async function fetchTransaccionesRango(desdeISO, hastaISO) {
  const { data, error } = await supabase
    .from('pago_transacciones')
    .select(`
      monto, forma_pago, referencia, created_at,
      usuarios!pago_transacciones_registrado_por_fkey (nombre),
      pagos!inner (
        concepto, tipo, mes, anio,
        atletas!inner (usuarios!inner!atletas_usuario_id_fkey (nombre))
      )
    `)
    .gte('created_at', desdeISO)
    .lte('created_at', hastaISO)
    .order('created_at', { ascending: true });
  if (error) { console.error(error); return []; }
  return data || [];
}

export function exportarTransaccionesCSV(transacciones, { mes, anio } = {}) {
  const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const cabecera = ['Fecha', 'Atleta', 'Concepto', 'Monto', 'Forma de pago', 'Referencia', 'Registrado por'];
  const filas = transacciones.map(t => [
    new Date(t.created_at).toLocaleString('es-EC'),
    t.pagos?.atletas?.usuarios?.nombre || '',
    t.pagos?.concepto || (t.pagos?.tipo === 'Mensualidad' ? `Mensualidad ${MESES[t.pagos.mes] || ''}` : t.pagos?.tipo || ''),
    (t.monto || 0).toFixed(2),
    t.forma_pago || '',
    t.referencia || '',
    t.usuarios?.nombre || '',
  ]);
  const sufijo = mes && anio ? `${String(mes).padStart(2, '0')}-${anio}` : new Date().toISOString().slice(0, 10);
  descargarCSV([cabecera, ...filas], `transacciones_contador_${sufijo}.csv`);
}
