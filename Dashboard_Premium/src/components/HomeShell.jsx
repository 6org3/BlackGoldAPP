import { useState } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';

/**
 * HomeShell — layout compartido de los homes por rol (Fase 1 del rediseño,
 * blueprint §2.1): Sidebar + main scrolleable con el glow ambiental de la
 * casa, botón de menú móvil y cabecera saludo/contexto al estilo del
 * mockup v6 (eyebrow + titular + chip de contexto).
 *
 * Props:
 * - eyebrow: línea micro sobre el titular (ej. fecha o rol).
 * - titulo: nodo del titular (puede traer <em> dorado vía text-gradient-gold).
 * - contexto: chip/nodo de contexto de alcance bajo el titular (opcional).
 */
export default function HomeShell({ eyebrow, titulo, contexto, children }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-dvh bg-surface-base overflow-hidden text-white selection:bg-brand selection:text-black">
      <Sidebar
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 md:p-10 pb-[calc(env(safe-area-inset-bottom)+24px)] relative">
        {/* Glow ambiental solo en desktop (mismo criterio que /dashboard:
            el blur gigante es caro en móviles de gama baja). */}
        <div className="hidden md:block absolute top-[-20%] left-[10%] w-[800px] h-[600px] bg-brand/5 blur-[150px] pointer-events-none rounded-full mix-blend-screen"></div>

        <header className="flex items-start justify-between gap-4 mb-2 relative z-10">
          <div className="min-w-0">
            <p className="text-fg-muted text-xs md:text-sm font-semibold mb-1">{eyebrow}</p>
            <h1 className="text-3xl md:text-4xl font-black tracking-tighter leading-tight">{titulo}</h1>
          </div>
          <button
            aria-label="Abrir menú"
            className="md:hidden shrink-0 text-brand p-2.5 bg-white/5 rounded-control hover:bg-white/10 transition-colors"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu size={24} />
          </button>
        </header>

        {contexto && <div className="relative z-10 mb-4">{contexto}</div>}

        <div className="relative z-10">{children}</div>
      </main>
    </div>
  );
}

/** Chip de contexto de alcance bajo el titular (receta chip del design system). */
export function ContextChip({ tono = 'brand', children }) {
  const tonos = {
    brand: 'text-brand bg-brand/10 border-brand/25',
    info: 'text-info-soft bg-info/10 border-info/25',
    success: 'text-success-soft bg-success/10 border-success/25',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-2xs font-extrabold tracking-wide px-2.5 py-1 rounded-full border ${tonos[tono] || tonos.brand}`}>
      {children}
    </span>
  );
}

/** Eyebrow de sección (label micro uppercase, patrón del mockup v6). */
export function SectionEyebrow({ children, pill, pillTono = 'brand' }) {
  const pillTonos = {
    brand: 'text-brand bg-brand/10 border-brand/25',
    mental: 'text-mental-soft bg-mental/10 border-mental/25',
    success: 'text-success-soft bg-success/10 border-success/25',
  };
  return (
    <div className="flex items-center gap-2 text-2xs font-extrabold uppercase tracking-eyebrow text-fg-muted mt-6 mb-3">
      <span>{children}</span>
      {pill && (
        <span className={`ml-auto normal-case tracking-normal font-bold px-2 py-0.5 rounded-full border ${pillTonos[pillTono] || pillTonos.brand}`}>
          {pill}
        </span>
      )}
    </div>
  );
}

/** Stat-card: número grande + label micro (patrón .stat del mockup v6). */
export function StatCard({ valor, label, tonoTexto = 'text-white' }) {
  return (
    <div className="bg-surface-sunken border border-white/5 rounded-panel p-4">
      <p className={`text-2xl font-black tracking-tight leading-none ${tonoTexto}`}>{valor}</p>
      <p className="text-2xs uppercase tracking-widest text-fg-muted font-bold mt-2">{label}</p>
    </div>
  );
}
