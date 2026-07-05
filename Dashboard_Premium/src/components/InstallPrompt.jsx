import React, { useState, useEffect } from 'react';
import { Download, X, Share } from 'lucide-react';

const DISMISS_KEY = 'bg-install-dismissed';
const DISMISS_DIAS = 30;

// El banner se monta global (main.jsx) y también dentro del dashboard
// (AppSecondaryModals): solo la primera instancia montada renderiza, para
// no duplicar overlays ni listeners.
let instanciaActiva = false;

const fueDescartadoRecientemente = () => {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return ts > 0 && Date.now() - ts < DISMISS_DIAS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
};

export default function InstallPrompt() {
  const [esPrimaria, setEsPrimaria] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  // Propiedad del dispositivo, no estado: se resuelve una sola vez al montar.
  const [isIOS] = useState(() => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    if (instanciaActiva) return undefined;
    instanciaActiva = true;
    // El reclamo del singleton debe ocurrir al montar (no en el initializer,
    // que StrictMode puede invocar dos veces sin cleanup emparejado).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEsPrimaria(true);
    return () => { instanciaActiva = false; };
  }, []);

  useEffect(() => {
    if (!esPrimaria) return undefined;

    // Detect if already installed (standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

    if (isStandalone || fueDescartadoRecientemente()) {
      return undefined;
    }

    // En Android el evento pudo dispararse antes de montar este componente
    // (p. ej. durante el login); main.jsx lo captura a nivel módulo.
    if (window.__bgDeferredPrompt) {
      setDeferredPrompt(window.__bgDeferredPrompt);
      setShowPrompt(true);
    }

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      window.__bgDeferredPrompt = e;
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // For iOS, show prompt after a few seconds if not installed
    let timer;
    if (isIOS) {
      timer = setTimeout(() => setShowPrompt(true), 3000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      if (timer) clearTimeout(timer);
    };
  }, [esPrimaria, isIOS]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      window.__bgDeferredPrompt = null;
      setDeferredPrompt(null);
    } else if (isIOS) {
      // Apple no soporta el prompt automatizado: instrucciones en el banner.
      setShowIOSHelp(true);
    }
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Sin almacenamiento disponible: solo se oculta en esta visita.
    }
    setShowPrompt(false);
  };

  if (!esPrimaria || !showPrompt) return null;

  return (
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-4 z-50 animate-fade-in-up">
      <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl shadow-2xl">
        {showIOSHelp ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-amber-500/20 p-2 rounded-lg shrink-0">
                <Share className="text-amber-500 w-6 h-6" />
              </div>
              <p className="text-zinc-300 text-sm">
                Toca el botón <span className="text-white font-semibold">Compartir</span> de Safari y elige{' '}
                <span className="text-white font-semibold">“Agregar a Inicio”</span>.
              </p>
            </div>
            <button
              onClick={handleDismiss}
              className="self-end bg-amber-500 hover:bg-amber-600 text-black px-4 py-2 min-h-11 rounded-lg font-bold text-sm transition-colors"
            >
              Entendido
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-amber-500/20 p-2 rounded-lg shrink-0">
                <Download className="text-amber-500 w-6 h-6" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">Instalar Black Gold</h3>
                <p className="text-zinc-400 text-xs">Añadir a la pantalla de inicio para acceso rápido.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleDismiss}
                aria-label="Cerrar aviso de instalación"
                className="p-2.5 text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <button
                onClick={handleInstallClick}
                className="bg-amber-500 hover:bg-amber-600 text-black px-4 py-2 min-h-11 rounded-lg font-bold text-sm transition-colors"
              >
                Instalar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
