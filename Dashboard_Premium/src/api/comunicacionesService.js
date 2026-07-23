// src/api/comunicacionesService.js
import { supabase } from './supabaseClient';
import { PLANTILLAS, renderPlantilla, linkWhatsApp } from '../lib/plantillasWhatsApp';

// Mapea el nuevo segmento al valor legado de la columna `tipo` (compatibilidad)
export function segmentoATipoLegado(segmentoTipo) {
  switch (segmentoTipo) {
    case 'general':         return 'Anuncio';
    case 'grupo':           return 'Grupal';
    case 'individualizado': return 'Personalizado';
    case 'individual':      return 'Individual';
    default:                return 'Anuncio'; // grupos_limitados, categoria, edad, genero, compuesto
  }
}

export async function crearComunicacion({
  autor_id,
  segmento_tipo,
  segmento_params = {},
  incluir_representantes = true,
  titulo,
  mensaje,
  canal = 'whatsapp',
  proposito = 'comunicado',
  destinatarios_ids = [],
}) {
  const tipoLegado = segmentoATipoLegado(segmento_tipo);

  const { data, error } = await supabase
    .from('comunicaciones')
    .insert({
      autor_id,
      tipo: tipoLegado,
      segmento_tipo,
      segmento_params,
      incluir_representantes,
      canal,
      proposito,
      titulo,
      mensaje,
      // Se conservan por compatibilidad con el feed del padre y vistas existentes
      grupo_id: segmento_tipo === 'grupo' ? (segmento_params.grupo_id || null) : null,
      atleta_id: segmento_tipo === 'individual' ? (segmento_params.atleta_id || null) : null,
    })
    .select()
    .single();
  if (error) throw error;

  // Para listas a la carta, congelar destinatarios (alimenta el feed in-app)
  if (segmento_tipo === 'individualizado' && destinatarios_ids.length > 0) {
    await supabase.from('comunicacion_destinatarios').insert(
      destinatarios_ids.map(uid => ({ comunicacion_id: data.id, usuario_id: uid }))
    );
  }
  return data;
}

// Lee la membresía atleta↔grupo (tabla atleta_grupo, migración v18).
// Devuelve un mapa { atleta_id: [grupo_id, ...] }. Si la tabla aún no existe, mapa vacío.
export async function fetchMembresiaGrupos() {
  const { data, error } = await supabase.from('atleta_grupo').select('atleta_id, grupo_id');
  if (error) { console.warn('atleta_grupo no disponible aún:', error.message); return {}; }
  const map = {};
  (data || []).forEach(({ atleta_id, grupo_id }) => {
    (map[atleta_id] = map[atleta_id] || []).push(grupo_id);
  });
  return map;
}

// Resolución de audiencia EN CLIENTE para el contador de alcance (previsualización
// antes de enviar). Opera sobre el array de atletas ya cargado. Espera atletas con
// { id (usuario_id), atleta_id, nombre, categoria, genero, edad }.
export function resolverAudienciaLocal(atletas = [], { segmento_tipo, segmento_params = {} }, gruposByAtleta = {}) {
  const p = segmento_params || {};
  const seleccion = atletas.filter((a) => {
    const gruposDe = gruposByAtleta[a.atleta_id] || [];
    switch (segmento_tipo) {
      case 'general':          return true;
      case 'individual':       return a.atleta_id === p.atleta_id;
      case 'individualizado':  return (p.usuario_ids || []).includes(a.id);
      case 'grupo':            return gruposDe.includes(p.grupo_id);
      case 'grupos_limitados': return gruposDe.some((g) => (p.grupo_ids || []).includes(g));
      case 'categoria':        return (p.categorias || []).includes(a.categoria);
      case 'edad':             return a.edad >= (p.edad_min ?? 0) && a.edad <= (p.edad_max ?? 200);
      case 'genero':           return a.genero === p.genero;
      case 'compuesto': {
        const f = p.filtros || {};
        if (f.genero && a.genero !== f.genero) return false;
        if (f.categoria && a.categoria !== f.categoria) return false;
        if (f.grupo_id && !gruposDe.includes(f.grupo_id)) return false;
        if (f.edad_min != null && a.edad < f.edad_min) return false;
        if (f.edad_max != null && a.edad > f.edad_max) return false;
        return true;
      }
      default: return false;
    }
  });
  return { atletas: seleccion.length, seleccion };
}

// Lanza si la consulta falla: devolver [] aquí sería indistinguible de "sin
// mensajes todavía" (auditoría UX owner 2026-07-09) — quien llama decide
// cómo mostrar el error, en vez de que el feed se vea silenciosamente vacío.
export async function fetchComunicaciones({ tipo = null, limit = 30 } = {}) {
  let q = supabase
    .from('comunicaciones')
    .select(`
      *,
      grupos_entrenamiento (nombre)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (tipo) q = q.eq('tipo', tipo);
  const { data, error } = await q;
  if (error) { console.error(error); throw error; }
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

// Registra en `comunicaciones` cada envío individual por WhatsApp (recordatorio
// de pago, confirmación, etc.) para que quede rastro y sirva de contador para
// los umbrales de automatización (docs/pagos_diseno.md §6.5). Fire-and-forget:
// un fallo aquí no debe bloquear la apertura de WhatsApp.
export async function registrarEnvioWhatsApp({ autorId, usuarioDestinoId, plantilla, titulo, mensaje }) {
  try {
    await crearComunicacion({
      autor_id: autorId,
      segmento_tipo: 'individualizado',
      segmento_params: { usuario_ids: usuarioDestinoId ? [usuarioDestinoId] : [] },
      incluir_representantes: false,
      canal: 'whatsapp',
      proposito: PLANTILLAS[plantilla]?.proposito || 'comunicado',
      titulo,
      mensaje,
      destinatarios_ids: usuarioDestinoId ? [usuarioDestinoId] : [],
    });
  } catch (e) {
    console.warn('No se pudo registrar el envío de WhatsApp:', e.message);
  }
}

// Genera el texto pre-formateado para abrir en wa.me
// @deprecated Usar linkWhatsApp de src/lib/plantillasWhatsApp.js (shim, mismo comportamiento).
export function generarLinkWhatsApp(numero, mensaje) {
  return linkWhatsApp(numero || null, mensaje);
}

// @deprecated Usar renderPlantilla('recordatorio_pago'|'pago_vencido', ...) de
// src/lib/plantillasWhatsApp.js. Se conserva la firma para los consumidores viejos.
// Coerce a '' para no lanzar si algún campo viene null (leniencia del código viejo).
export function generarMensajeRecordatorioPago(atleta, monto, mes) {
  const meses = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return renderPlantilla('recordatorio_pago', {
    nombre_atleta: atleta ?? '',
    concepto: `Mensualidad ${meses[mes] || ''}`.trim(),
    monto: monto ?? '',
    fecha_limite: `05/${String(mes ?? '').padStart(2, '0')}`,
  });
}

// @deprecated Usar renderPlantilla('resumen_sesion', ...) de src/lib/plantillasWhatsApp.js.
// `drillNombres`: nombres ya resueltos (ver resolverNombresEjercicios en
// src/lib/ejerciciosCatalogo.js) — el call-site filtra los huérfanos antes de
// pasarlos aquí. Se muestran hasta 6, con sufijo "(+N más)" si hay más.
export function generarMensajeSesion(grupo, objetivo, logrado, notas, drillNombres = []) {
  const emoji = logrado === 'Sí' ? '✅' : logrado === 'Parcial' ? '⚡' : '❌';
  const lista = (drillNombres || []).slice(0, 6);
  const restantes = (drillNombres || []).length - lista.length;
  const bloqueEjercicios = lista.length
    ? `\n🏋️ Ejercicios: ${lista.join(', ')}${restantes > 0 ? ` (+${restantes} más)` : ''}`
    : '';
  return renderPlantilla('resumen_sesion', {
    grupo: grupo ?? '', objetivo: objetivo ?? '', emoji, logrado: logrado ?? '',
    bloque_ejercicios: bloqueEjercicios,
    bloque_notas: notas ? `\n📝 Notas: ${notas}` : '',
  });
}
