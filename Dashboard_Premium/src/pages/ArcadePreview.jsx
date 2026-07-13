import { useState } from 'react';
import ModoCanchaArcade from '../components/arcade/ModoCanchaArcade';
import VistaPadreArcade from '../components/arcade/VistaPadreArcade';

// Harness de verificación visual SOLO-DEV del rediseño Arcade HUD (ruta
// /arcade-preview, gateada por import.meta.env.DEV en main.jsx). No forma
// parte del entregable; se retira tras validar. Renderiza el takeover de
// Modo Cancha y la Vista Padre sin pasar por auth.
export default function ArcadePreview() {
  const [view, setView] = useState('cancha');
  const [open, setOpen] = useState(true);
  return (
    <div style={{ minHeight: '100dvh', background: '#050506' }}>
      <div style={{ position: 'fixed', top: 6, left: 6, zIndex: 200, display: 'flex', gap: 6 }}>
        <button onClick={() => { setView('cancha'); setOpen(true); }} style={{ padding: '4px 8px', fontSize: 11 }}>Cancha</button>
        <button onClick={() => setView('padre')} style={{ padding: '4px 8px', fontSize: 11 }}>Padre</button>
      </div>
      {view === 'cancha' && <ModoCanchaArcade isOpen={open} onClose={() => setOpen(false)} />}
      {view === 'padre' && <VistaPadreArcade />}
    </div>
  );
}
