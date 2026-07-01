import { fetchHistorialAtleta } from '../api/asistenciaService';

/**
 * Genera y abre el reporte de WhatsApp del progreso de un atleta.
 * `atleta` debe venir del objeto "merged" de atletasService.js: `atleta.id` es el
 * usuario, `atleta.atleta_id` es la fila real de `atletas` (la que usa `asistencia`).
 */
export async function generateWhatsAppReport(atleta) {
  const phone = ''; // Sin número precargado: WhatsApp abre el selector de contacto
  const monthName = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date());

  // Abrir la pestaña ANTES del await: si se abre después, el navegador puede
  // bloquearla por no venir directamente de un gesto del usuario (popup blocker).
  const ventana = window.open('', '_blank');

  // Asistencia real de los últimos 30 días (tabla `asistencia`), no un valor inventado.
  const historial = await fetchHistorialAtleta(atleta.atleta_id);
  const presentes = historial.filter(r => r.estado === 'Presente').length;
  const asistenciaPorcentaje = historial.length > 0
    ? Math.round((presentes / historial.length) * 100)
    : null; // sin registros de asistencia todavía: no inventamos un porcentaje

  const lineaAsistencia = asistenciaPorcentaje !== null
    ? `📅 Asistencia de los últimos 30 días: *${asistenciaPorcentaje}%*%0A`
    : '';

  const urlPortal = `${window.location.origin}/login`;

  const text = `🏆 *Reporte Mensual Black Gold* 🏆%0A%0A`
    + `Hola, el reporte mensual de *${atleta.nombre}* correspondiente a *${monthName.toUpperCase()}* ya está disponible.%0A%0A`
    + `En esta actualización podrás ver:%0A`
    + `📊 Comparativa de su progreso vs mes anterior%0A`
    + lineaAsistencia
    + `🎯 Misiones de hábitos asignadas%0A%0A`
    + `👉 *Ingresa al Portal de Padres para revisarlo:*%0A`
    + `${urlPortal}%0A%0A`
    + `¡Excelente trabajo en equipo!`;

  const waUrl = `https://wa.me/${phone}?text=${text}`;

  if (ventana) {
    ventana.location.href = waUrl;
  } else {
    // El navegador bloqueó la ventana emergente (poco común, pero posible).
    window.open(waUrl, '_blank');
  }
}
