// src/hooks/useCopiloto.js
// Contexto + hook del Copiloto (PR7): separado de CopilotoLauncher.jsx (que
// exporta el componente CopilotoProvider) porque react-refresh exige que un
// archivo de componentes solo exporte componentes.
import { createContext, useContext } from 'react';

export const CopilotoContext = createContext(null);

/** @returns {{ abrir: (atletaId?: string) => void, cerrar: () => void, abierto: boolean }} */
export function useCopiloto() {
  const ctx = useContext(CopilotoContext);
  if (!ctx) throw new Error('useCopiloto() debe usarse dentro de <CopilotoProvider>');
  return ctx;
}
