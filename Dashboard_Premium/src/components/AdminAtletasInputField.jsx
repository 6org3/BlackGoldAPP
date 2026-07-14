import { useId } from 'react';
import { C, BORDER, cut } from './arcade/arcadeTokens';

export default function InputField({ label, value, onChange, type = 'text', disabled, placeholder, ...rest }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-2xs font-bold uppercase tracking-widest mb-2" style={{ color: C.text2 }}>{label}</label>
      <input
        id={id} type={type} value={value} onChange={e => onChange(e.target.value)}
        disabled={disabled} placeholder={placeholder}
        className="cut-focus arcade-input w-full min-h-11 px-4 py-3 text-base sm:text-sm font-bold focus:outline-none disabled:opacity-40"
        style={{ clipPath: cut(6), background: C.cardAlt1, border: `1px solid ${BORDER.neutralSoft}`, color: C.text }}
        {...rest}
      />
    </div>
  );
}
