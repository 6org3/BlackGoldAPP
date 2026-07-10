// Clases de la pill de estado de recuperación (clases completas para que
// Tailwind las genere; no concatenar colores dinámicamente). Compartida por
// AthleteGridCard y la franja "Atletas a mirar hoy" de CoachHomePage; vive
// en lib/ y no en un componente para no romper react-refresh.
export function recoveryPill(estado) {
  if (!estado || estado === 'Óptimo') return null;
  if (estado === 'Agotamiento Activo') return 'border-warning/40 text-warning-soft bg-warning/10';
  if (estado === 'Fatiga Silenciosa') return 'border-mental/40 text-mental-soft bg-mental/10';
  // 'Sin datos' (nadie ha hecho el check-in de hoy) es el caso más común y no
  // es una alerta real — usa el mismo gris neutral de "sin datos" que el resto
  // del sistema (getBaremoLevel), no el rojo de riesgo real, para que no
  // compita visualmente con Agotamiento Activo / Fatiga Silenciosa.
  if (estado === 'Sin datos') return 'border-tier-sindatos/40 text-tier-sindatos bg-tier-sindatos/10';
  return null;
}
