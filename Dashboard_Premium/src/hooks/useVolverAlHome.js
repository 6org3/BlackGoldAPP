import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { rutaHomeParaRol } from '../lib/featureFlags';

/**
 * Vuelta de un módulo /admin/* al home de quien lo abrió.
 *
 * Los botones "Volver" nacieron apuntando a /dashboard, cuando ese era el hogar
 * de todo el staff. Ya no: cada rol tiene su home nativo (/club, /coach,
 * /sistema) y el dueño ni siquiera pasa por /dashboard — el login lo lleva a
 * /club (#84). Un "volver" fijo a /dashboard lo dejaba en el shell legacy, que
 * no es de donde venía.
 *
 * Misma fuente que RootRedirect, el Login y el Sidebar: rutaHomeParaRol respeta
 * los feature flags del rediseño, así que un rol con su home apagado sigue
 * cayendo en /dashboard como antes.
 */
export default function useVolverAlHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const rol = user?.rol;
  return useCallback(() => navigate(rutaHomeParaRol(rol)), [navigate, rol]);
}
