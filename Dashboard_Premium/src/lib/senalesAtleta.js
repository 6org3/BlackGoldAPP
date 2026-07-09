// src/lib/senalesAtleta.js
// Señal de atención para franjas tipo "Atletas a mirar hoy": estado de
// recuperación distinto de Óptimo o alerta de hidratación del readiness
// diario (mismos umbrales que ya usa AthleteGridCard). Campos que ya trae
// fetchTodosLosAtletas — sin llamadas nuevas al gateway. Extraído de
// CoachHomePage.jsx para reutilizarlo también en ClubHomePage (owner).
export const tieneSenal = (a) =>
  (a.estado_recuperacion && a.estado_recuperacion !== 'Óptimo') ||
  (a.readiness_hoy && a.readiness_hoy.color_orina >= 5);
