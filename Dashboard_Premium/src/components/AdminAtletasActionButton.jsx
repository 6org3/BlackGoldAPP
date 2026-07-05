export default function ActionButton({ children, onClick, title, className = '', isActive }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`p-2.5 min-w-11 min-h-11 flex items-center justify-center rounded-lg text-fg-muted hover:bg-white/5 active:bg-white/10 transition-all ${isActive ? 'text-brand' : ''} ${className}`}
    >
      {children}
    </button>
  );
}
