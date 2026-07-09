// BottomNav — bottom nav móvil, espejo de .bnav del mockup v6 (línea 114):
// barra highlight superior de 3px que se traslada al ítem activo, oculta en
// md+ (el Sidebar cubre desktop). 100% presentacional: la navegación/estado
// la resuelve quien la monta — HomeShell navega por ruta, AthleteLayout
// cambia de tab, PadreDashboard hace scroll a anclas.
export default function BottomNav({ items, activo, onSelect }) {
  const idx = Math.max(0, items.findIndex((it) => it.key === activo));

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 h-[74px] bg-surface-base/85 backdrop-blur-xl border-t border-white/5 pb-[env(safe-area-inset-bottom)]">
      <div
        className="absolute top-0 h-[3px] rounded-b bg-gradient-to-r from-brand-strong to-brand shadow-glow-gold transition-transform duration-300 motion-reduce:transition-none"
        style={{ width: `${100 / items.length}%`, transform: `translateX(${idx * 100}%)` }}
        aria-hidden="true"
      />
      <div className="flex h-full">
        {items.map((item) => {
          const active = item.key === activo;
          const Icono = item.Icono;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.key)}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-1 text-[9.5px] font-bold uppercase tracking-wide transition-colors ${
                active ? 'text-brand' : 'text-fg-muted'
              }`}
            >
              <Icono
                size={20}
                className={`transition-transform duration-200 motion-reduce:transition-none ${active ? '-translate-y-0.5 scale-105' : ''}`}
              />
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
