import React, { createContext, useState, useContext, useEffect, useRef, useCallback, useMemo } from 'react';
import { loginUsuario, fetchUsuarioPorAuthId } from './api/authService';
import { supabase } from './api/supabaseClient';
import PageLoader from './components/PageLoader.jsx';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
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
      return { success: true, user: userData };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, login, logout, loading }),
    [user, loading, login, logout]
  );

  return (
    <AuthContext.Provider value={value}>
      {loading ? <PageLoader /> : children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
