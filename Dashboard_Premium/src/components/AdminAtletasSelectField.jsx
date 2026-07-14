import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { C, BORDER, cut } from './arcade/arcadeTokens';

export default function SelectField({ label, value, options, optionLabels, onChange }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-2xs font-bold uppercase tracking-widest mb-2" style={{ color: C.text2 }}>{label}</label>
      <div className="relative">
        <select
          id={id} value={value} onChange={e => onChange(e.target.value)}
          className="cut-focus arcade-input w-full min-h-11 px-4 py-3 pr-9 text-base sm:text-sm font-bold focus:outline-none appearance-none cursor-pointer"
          style={{ clipPath: cut(6), background: C.cardAlt1, border: `1px solid ${BORDER.neutralSoft}`, color: C.text }}
        >
          {options.map((o, i) => (
            <option key={o} value={o}>
              {optionLabels ? optionLabels[i] : o}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: C.text3 }} />
      </div>
    </div>
  );
}
