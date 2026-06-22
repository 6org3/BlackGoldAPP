import React, { createContext, useState, useContext, useEffect } from 'react';
import { loginUsuario, fetchUsuarioCompleto } from './api/sheetsService';
import { supabase } from './api/supabaseClient';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Intentar cargar la sesión guardada al iniciar la app y revalidar con BD
  useEffect(() => {
    const initSession = async () => {
      const savedUserStr = localStorage.getItem('bg_session');
      if (savedUserStr) {
        const savedUser = JSON.parse(savedUserStr);
        setUser(savedUser); // Optimistic UI
        
        // Revalidar en background
        try {
          const { data: usuarioBasico } = await supabase
            .from('usuarios')
            .select('*')
            .eq('id', savedUser.id)
            .single();
            
          if (usuarioBasico) {
            const usuarioFresco = await fetchUsuarioCompleto(usuarioBasico);
            setUser(usuarioFresco);
            localStorage.setItem('bg_session', JSON.stringify(usuarioFresco));
          } else {
             // Si el usuario fue borrado de la BD
             setUser(null);
             localStorage.removeItem('bg_session');
          }
        } catch (error) {
          console.error("Error revalidando sesión:", error);
        }
      }
      setLoading(false);
    };

    initSession();
  }, []);

  const login = async (correo, password) => {
    try {
      const userData = await loginUsuario(correo, password);
      setUser(userData);
      localStorage.setItem('bg_session', JSON.stringify(userData));
      return { success: true, user: userData };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('bg_session');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
