// Clases de la pill de estado de recuperación (clases completas para que
// Tailwind las genere; no concatenar colores dinámicamente). Compartida por
// AthleteGridCard y la franja "Atletas a mirar hoy" de CoachHomePage; vive
// en lib/ y no en un componente para no romper react-refresh.
export function recoveryPill(estado) {
  if (!estado || estado === 'Óptimo') return null;
  if (estado === 'Agotamiento Activo') return 'border-warning/40 text-warning-soft bg-warning/10';
  if (estado === 'Fatiga Silenciosa') return 'border-mental/40 text-mental-soft bg-mental/10';
  return 'border-danger/40 text-danger-soft bg-danger/10';
}
