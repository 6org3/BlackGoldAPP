// CopilotoLauncher — Provider + FAB flotante "✦ Copiloto" + su panel (PR6,
// refactor a contexto en PR7 del retrofit visual). Referencia visual:
// docs/mockup_v6_comparar_graficos.html (.fab), con tokens (bg-mental,
// shadow-modal) en vez de los hex del mockup.
//
// CopilotoProvider se monta una vez por superficie (HomeShell, AthleteLayout,
// PadreDashboard) con un atletaIdPorDefecto opcional (contexto "natural" de
// esa pantalla: la ficha que el coach tiene abierta, el atleta dueño de su
// propio home, el hijo seleccionado por el padre). useCopiloto().abrir(id)
// permite abrir el panel con un atleta EXPLÍCITO distinto del default (p.ej.
// el botón "✦ Pregúntale" de una fila de atleta en el foco del coach).
import { useCallback, useState } from 'react';
import CopilotoPanel from './CopilotoPanel';
import { CopilotoContext } from '../hooks/useCopiloto';

/**
 * @param {string|null} [atletaIdPorDefecto] — atleta de contexto de esta
 *   superficie; reactivo (p.ej. el padre cambiando de hijo).
 */
export function CopilotoProvider({ children, atletaIdPorDefecto = null }) {
  const [abierto, setAbierto] = useState(false);
  // Override explícito de la sesión de chat abierta (p.ej. "Pregúntale" sobre
  // OTRO atleta distinto del default); null = usa atletaIdPorDefecto.
  const [contexto, setContexto] = useState(null);

  const abrir = useCallback((atletaId) => {
    setContexto(atletaId ?? null);
    setAbierto(true);
  }, []);
  const cerrar = useCallback(() => setAbierto(false), []);

  return (
    <CopilotoContext.Provider value={{ abrir, cerrar, abierto }}>
      {children}

      <button
        type="button"
        onClick={() => abrir()}
        aria-label="Abrir el Copiloto Black Gold"
        className="fixed bottom-[calc(74px+env(safe-area-inset-bottom)+16px)] md:bottom-6 right-4 z-40 h-12 pl-3.5 pr-4 flex items-center gap-2 rounded-full bg-gradient-to-br from-mental to-mental/70 text-fg text-sm font-extrabold shadow-modal hover:brightness-110 active:scale-95 transition"
      >
        <span className="w-6 h-6 grid place-items-center rounded-full bg-white/15 text-sm" aria-hidden="true">✦</span>
        Copiloto
      </button>

      <CopilotoPanel abierto={abierto} onCerrar={cerrar} atletaId={contexto ?? atletaIdPorDefecto} />
    </CopilotoContext.Provider>
  );
}
