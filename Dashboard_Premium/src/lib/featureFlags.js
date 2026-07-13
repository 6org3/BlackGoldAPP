// src/lib/featureFlags.js
// Flags del rediseño de homes por rol (blueprint §2.1, handoff PR3).
// Permiten lanzar gradual: con el flag activo, RootRedirect y el ítem
// "Inicio" del Sidebar mandan al home nativo del rol; con el flag apagado
// el rol conserva su destino actual. atleta y padre ya tienen vista nativa
// (AthleteLayout vía /dashboard | /atleta, PadreDashboard vía /padre) y
// siguen ahí hasta su rediseño (fases posteriores del blueprint).
export const HOMES_POR_ROL = {
  superadmin: true,
  owner: true,
  coach: true,
  atleta: true, // portal Atleta Arcade HUD montado en /atleta (rediseño del handoff)
  padre: false,
};

// Home nativo de cada rol cuando su flag está activo.
export const RUTA_HOME_POR_ROL = {
  superadmin: '/sistema',
  owner: '/club',
  coach: '/coach',
  atleta: '/atleta',
  padre: '/padre',
};

// Destino de entrada de un rol respetando su feature flag. Con el flag
// apagado se conserva el comportamiento previo al rediseño: /padre para
// padres y /dashboard para el resto.
export function rutaHomeParaRol(rol) {
  if (HOMES_POR_ROL[rol]) return RUTA_HOME_POR_ROL[rol];
  return rol === 'padre' ? '/padre' : '/dashboard';
}
