// src/hooks/useToast.js
// Contexto + hook del sistema de toast del portal (reemplazo no bloqueante de
// alert()/confirm() nativos). Separado de Toast.jsx —que exporta el componente
// ToastProvider— por la misma razón que useCopiloto.js: react-refresh exige que
// un archivo de componentes solo exporte componentes.
import { createContext, useContext } from 'react';

export const ToastContext = createContext(null);

/**
 * @returns {{
 *   mostrarToast: (mensaje: string, opts?: { tipo?: 'info'|'error'|'success' }) => void,
 *   pedirConfirmacion: (mensaje: string) => Promise<boolean>,
 * }}
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast() debe usarse dentro de <ToastProvider>');
  return ctx;
}
