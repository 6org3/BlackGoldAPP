export default function ActionButton({ children, onClick, title, className = '', isActive }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-2 rounded-lg text-gray-500 hover:bg-white/5 transition-all ${isActive ? 'text-[#FFD700]' : ''} ${className}`}
    >
      {children}
    </button>
  );
}
