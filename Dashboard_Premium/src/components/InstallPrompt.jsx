import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detect iOS
    const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(isIosDevice);

    // Detect if already installed (standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    
    if (isStandalone) {
      return; // Already installed, do nothing
    }

    // For Android/Chrome
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // For iOS, show prompt after a few seconds if not installed
    if (isIosDevice && !isStandalone) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
      return () => clearTimeout(timer);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    } else if (isIOS) {
      // Show iOS specific instructions since Apple doesn't support the automated prompt
      alert("Para instalar en iOS: Toca el ícono de 'Compartir' en la parte inferior de Safari y selecciona 'Agregar a Inicio'.");
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-fade-in-up">
      <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl shadow-2xl flex items-center justify-between gap-4">
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
            className="p-2 text-zinc-500 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <button
            onClick={handleInstallClick}
            className="bg-amber-500 hover:bg-amber-600 text-black px-4 py-2 rounded-lg font-bold text-sm transition-colors"
          >
            Instalar
          </button>
        </div>
      </div>
    </div>
  );
}
