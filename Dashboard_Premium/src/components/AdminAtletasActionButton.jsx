import { cut } from './arcade/arcadeTokens';

// Botón de icono de las cards/filas del roster. La forma es Arcade (esquina
// cortada + foco dorado); el color base y el hover llegan por clase semántica
// desde cada llamador (hover:text-brand/danger/success-soft) para conservar la
// señal por acción — un color inline pisaría esos hover.
export default function ActionButton({ children, onClick, title, className = '', isActive }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{ clipPath: cut(5) }}
      className={`cut-focus p-2.5 min-w-11 min-h-11 flex items-center justify-center transition hover:bg-white/[0.03] ${isActive ? 'text-brand' : 'text-fg-muted'} ${className}`}
    >
      {children}
    </button>
  );
}
