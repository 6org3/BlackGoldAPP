import React, { createContext, useState, useContext, useEffect, useRef, useCallback, useMemo } from 'react';
import { loginUsuario, fetchUsuarioPorAuthId } from './api/authService';
import { supabase } from './api/supabaseClient';
import { purgarSesionLocal } from './lib/sesionLocal';
import PageLoader from './components/PageLoader.jsx';

const AuthContext = createContext(null);

// La cuenta todavía usa la contraseña que repartió el club. La marca la siembra
// el alta (supabase/functions/_shared/credenciales.ts) en `app_metadata`, que
// viaja firmada dentro del JWT: el navegador la lee, pero no puede falsificarla
// —a diferencia de `user_metadata`, que el propio usuario reescribe con
// supabase.auth.updateUser—. Ausente o false = ya eligió la suya.
const leerMarcaPassword = (session) =>
  session?.user?.app_metadata?.debe_cambiar_password === true;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [debeCambiarPassword, setDebeCambiarPassword] = useState(false);
  // Último auth id resuelto: permite ignorar eventos de Supabase Auth que no
  // cambian de usuario (evita refetch + re-render global de toda la app).
  const lastAuthIdRef = useRef(null);

  // La sesión real (JWT + refresh token) la persiste supabase-js por su
  // cuenta; acá solo reaccionamos a sus cambios y resolvemos el perfil
  // de `usuarios` asociado a la sesión de Supabase Auth vigente.
  useEffect(() => {
    let activo = true;

    const cargarPerfil = async (session) => {
      lastAuthIdRef.current = session?.user?.id ?? null;
      if (activo) setDebeCambiarPassword(leerMarcaPassword(session));
      if (!session) {
        if (activo) setUser(null);
        return;
      }
      try {
        const usuarioFresco = await fetchUsuarioPorAuthId(session.user.id);
        if (activo) setUser(usuarioFresco);
      } catch (error) {
        console.error('Error cargando perfil de usuario:', error);
        if (activo) setUser(null);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      cargarPerfil(session).finally(() => {
        if (activo) setLoading(false);
      });
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // TOKEN_REFRESHED se dispara ~cada hora y al volver la PWA al primer
      // plano en móvil: el perfil no cambió, no hay que recargar nada.
      if (event === 'TOKEN_REFRESHED') return;
      if ((session?.user?.id ?? null) === lastAuthIdRef.current) return;
      cargarPerfil(session);
    });

    return () => {
      activo = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (identificador, password) => {
    try {
      const userData = await loginUsuario(identificador, password);
      setUser(userData);
      // La marca se lee de la sesión recién abierta y no del perfil: vive en el
      // JWT, no en la tabla `usuarios`. Aquí explícitamente porque login() fija
      // el usuario por su cuenta, sin pasar por cargarPerfil.
      const { data: { session } } = await supabase.auth.getSession();
      setDebeCambiarPassword(leerMarcaPassword(session));
      return { success: true, user: userData };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, []);

  // La llaman las dos pantallas de cambio de contraseña cuando la Edge Function
  // ya lo confirmó.
  //
  // Cambiar la contraseña por la Admin API revoca TODAS las sesiones del
  // usuario, incluida la que está usando: sin adoptar la que devuelve la
  // función, la persona se quedaría fuera justo después de hacer lo que le
  // pedimos, y con un token muerto en localStorage. Por eso `setSession` y no
  // `refreshSession` — no hay nada que refrescar.
  //
  // Si la función no pudo devolver sesión, se baja la barrera igual y se cierra
  // la sesión local: la contraseña YA cambió, así que mantener el gate solo
  // encerraría a la persona en una pantalla que ya cumplió. `signOut` la deja
  // en el login, donde entra con la nueva.
  const confirmarPasswordCambiada = useCallback(async (sesionNueva) => {
    setDebeCambiarPassword(false);
    if (sesionNueva?.access_token) {
      const { error } = await supabase.auth.setSession(sesionNueva);
      if (!error) return true;
      console.warn('No se pudo adoptar la sesión devuelta tras cambiar la contraseña.', error);
    }
    await supabase.auth.signOut().catch(() => {});
    setUser(null);
    return false;
  }, []);

  // Cerrar sesión tiene que dejar el dispositivo limpio SIEMPRE, también sin
  // red. supabase-js no lo garantiza: en GoTrueClient._signOut, si el POST a
  // /auth/v1/logout falla por algo que no sea 401/403/404, hay un return
  // anticipado ANTES de _removeSession(), así que el token se queda en
  // localStorage y al recargar la sesión revive. Y no lanza —devuelve
  // { error }—, así que un try/catch alrededor tampoco lo captura.
  // Importa aquí más que en otras apps: en el club, padres y atletas comparten
  // teléfono, y la conexión es 3G/4G rural.
  const logout = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.warn('Cierre de sesión remoto falló; se purga la sesión local.', error);
        purgarSesionLocal();
      }
    } catch (error) {
      console.warn('Cierre de sesión lanzó; se purga la sesión local.', error);
      purgarSesionLocal();
    } finally {
      setUser(null);
      setDebeCambiarPassword(false);
    }
  }, []);

  const value = useMemo(
    () => ({ user, login, logout, loading, debeCambiarPassword, confirmarPasswordCambiada }),
    [user, loading, login, logout, debeCambiarPassword, confirmarPasswordCambiada]
  );

  return (
    <AuthContext.Provider value={value}>
      {loading ? <PageLoader /> : children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
