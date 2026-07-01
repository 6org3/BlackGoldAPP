import React, { createContext, useState, useContext, useEffect } from 'react';
import { loginUsuario, fetchUsuarioPorAuthId } from './api/authService';
import { supabase } from './api/supabaseClient';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // La sesión real (JWT + refresh token) la persiste supabase-js por su
  // cuenta; acá solo reaccionamos a sus cambios y resolvemos el perfil
  // de `usuarios` asociado a la sesión de Supabase Auth vigente.
  useEffect(() => {
    let activo = true;

    const cargarPerfil = async (session) => {
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

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      cargarPerfil(session);
    });

    return () => {
      activo = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const login = async (identificador, password) => {
    try {
      const userData = await loginUsuario(identificador, password);
      setUser(userData);
      return { success: true, user: userData };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
