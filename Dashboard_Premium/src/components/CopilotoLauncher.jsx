// CopilotoLauncher — FAB flotante "✦ Copiloto" + su panel (PR6).
// Referencia visual: docs/mockup_v6_comparar_graficos.html (.fab), con tokens
// (bg-mental, shadow-modal) en vez de los hex del mockup.
// NO está montado en ninguna página: el orquestador del rediseño lo monta en
// las homes por rol (blueprint §4.4 — "el pregúntale más" de las cards IA).
import { useState } from 'react';
import CopilotoPanel from './CopilotoPanel';

/**
 * Botón flotante que abre el copiloto.
 * @param {string|null} [atletaId] — atleta de contexto (p.ej. la home del
 *   atleta o la ficha que el coach tiene abierta); viaja al panel tal cual.
 */
const CopilotoLauncher = ({ atletaId = null }) => {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir el Copiloto Black Gold"
        className="fixed bottom-24 right-4 z-40 h-12 pl-3.5 pr-4 flex items-center gap-2 rounded-full bg-gradient-to-br from-mental to-mental/70 text-fg text-sm font-extrabold shadow-modal hover:brightness-110 active:scale-95 transition"
      >
        <span className="w-6 h-6 grid place-items-center rounded-full bg-white/15 text-sm" aria-hidden="true">✦</span>
        Copiloto
      </button>

      <CopilotoPanel abierto={abierto} onCerrar={() => setAbierto(false)} atletaId={atletaId} />
    </>
  );
};

export default CopilotoLauncher;
