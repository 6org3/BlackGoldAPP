// src/lib/senalesAtleta.js
// Señal de atención para franjas tipo "Atletas a mirar hoy": estado de
// recuperación en alerta REAL (Agotamiento Activo / Fatiga Silenciosa, que
// solo salen de un readiness de hoy o de un test de carga reciente) o alerta
// de hidratación del readiness diario (mismos umbrales que ya usa
// AthleteGridCard). OJO: no comparar contra !== 'Óptimo' — cuando el atleta no
// tiene readiness ni test, calcularMetricasDerivadas estampa 'Sin datos', y esa
// AUSENCIA de datos no es una señal (marcaba "en riesgo" al ~100% de un club
// recién sembrado). Campos que ya trae fetchTodosLosAtletas — sin llamadas
// nuevas al gateway. Extraído de CoachHomePage.jsx para reutilizarlo también
// en ClubHomePage (owner) y el panel Arcade del dueño.
export const tieneSenal = (a) =>
  a.estado_recuperacion === 'Agotamiento Activo' ||
  a.estado_recuperacion === 'Fatiga Silenciosa' ||
  (a.readiness_hoy && a.readiness_hoy.color_orina >= 5);
