import { getSubPilarScores } from './radarCalc';

export function generateWhatsAppReport(atleta) {
  const phone = ''; // Optionally extract from atleta.telefono_padre if exists
  const monthName = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date());

  // Radar/Scores
  const subPilarScores = getSubPilarScores(atleta._evaluaciones || []);
  const overall = atleta.overall_score || 0;
  
  // Calculate attendance (mocked for now, assuming 1 eval = 1 session)
  const evaluaciones = atleta._evaluaciones || [];
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const evaluacionesMes = evaluaciones.filter(e => new Date(e.fecha_evaluacion) >= startOfMonth);
  const asistenciaPorcentaje = Math.min(100, Math.round((evaluacionesMes.length / 12) * 100)); // Assuming 12 sessions max per month

  const text = `🏆 *Reporte Mensual Black Gold* 🏆%0A%0A`
    + `Hola, el reporte mensual de *${atleta.nombre}* correspondiente a *${monthName.toUpperCase()}* ya está disponible.%0A%0A`
    + `En esta actualización podrás ver:%0A`
    + `📊 Comparativa de su progreso vs mes anterior%0A`
    + `📈 Histograma de esfuerzo en sus últimas clases%0A`
    + `🎯 Misiones de hábitos asignadas%0A%0A`
    + `👉 *Ingresa al Portal de Padres para revisarlo:*%0A`
    + `https://tu-dominio.com/login%0A%0A`
    + `¡Excelente trabajo en equipo!`;

  const waUrl = `https://wa.me/${phone}?text=${text}`;
  window.open(waUrl, '_blank');
}
