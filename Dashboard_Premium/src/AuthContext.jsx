import React, { createContext, useState, useContext, useEffect, useRef, useCallback, useMemo } from 'react';
import { loginUsuario, fetchUsuarioPorAuthId } from './api/authService';
import { supabase } from './api/supabaseClient';
import { purgarSesionLocal } from './lib/sesionLocal';
import { limpiarCacheFotos } from './api/fotosAtletasService';
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
  // cambian de usuario (evita refetch + re-render global de toda la app), y
  // también es la referencia contra la que cargarPerfil decide si hubo un
  // cambio real de IDENTIDAD (ver la purga de fotos más abajo).
  const lastAuthIdRef = useRef(null);

  // La sesión real (JWT + refresh token) la persiste supabase-js por su
  // cuenta; acá solo reaccionamos a sus cambios y resolvemos el perfil
  // de `usuarios` asociado a la sesión de Supabase Auth vigente.
  useEffect(() => {
    let activo = true;

    const cargarPerfil = async (session) => {
      const uidEntrante = session?.user?.id ?? null;
      // Purga de la caché de URLs firmadas de fotos SOLO en una transición real
      // de identidad (uid distinto al de la última vez que se cargó perfil,
      // incluida la caída a null). Son URLs vivas a rostros de menores: sin
      // esto, cerrar sesión sin pasar por logout() (p. ej. que el token quede
      // inválido y Supabase Auth dispare SIGNED_OUT por su cuenta) o que otro
      // usuario inicie sesión en la misma pestaña dejarían accesible el
      // retrato del usuario anterior.
      //
      // Por qué la comparación y no "purgar siempre que se llama a
      // cargarPerfil": esta función corre también en cada TOKEN_REFRESHED del
      // MISMO usuario (~cada hora, y al volver la PWA al primer plano en
      // móvil) — purgar ahí vaciaría el caché en cada refresh y dispararía una
      // refirma masiva de todos los avatares en pantalla sin que haya cambiado
      // nada. Comparar contra el uid anterior es lo que distingue "cambió de
      // usuario" de "el mismo usuario renovó su token".
      if (uidEntrante !== lastAuthIdRef.current) limpiarCacheFotos();
      lastAuthIdRef.current = uidEntrante;

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
    // Igual que en logout(): no se puede confiar en que este signOut() vaya a
    // disparar el listener de onAuthStateChange (el mismo motivo documentado
    // ahí — un fallo de red intermedio deja el _removeSession() de
    // supabase-js sin correr). La cuenta que se estaba yendo bien pudo tener
    // foto propia visible en el HUD; se purga aquí explícito, sin depender de
    // ese evento.
    limpiarCacheFotos();
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
      // Las URLs firmadas de las fotos viven en un Map de módulo: sin
      // limpiarlas, sobrevivirían al cambio de usuario en el mismo navegador
      // y dejarían accesibles rostros de menores de otro club.
      limpiarCacheFotos();
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
