import { useId } from 'react';

export default function InputField({ label, value, onChange, type = 'text', disabled, placeholder, ...rest }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-2xs text-fg-secondary font-bold uppercase tracking-widest mb-2">{label}</label>
      <input
        id={id} type={type} value={value} onChange={e => onChange(e.target.value)}
        disabled={disabled} placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-control px-4 py-3 text-base sm:text-sm text-white focus:outline-none focus:border-brand/50 focus:shadow-[0_0_10px_rgba(255,215,0,0.06)] transition-all disabled:opacity-40"
        {...rest}
      />
    </div>
  );
}
