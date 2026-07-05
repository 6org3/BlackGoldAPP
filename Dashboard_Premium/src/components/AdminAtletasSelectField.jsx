import { useId } from 'react';
import { ChevronDown } from 'lucide-react';

export default function SelectField({ label, value, options, optionLabels, onChange }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">{label}</label>
      <div className="relative">
        <select
          id={id} value={value} onChange={e => onChange(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-9 text-base sm:text-sm text-white focus:outline-none focus:border-[#FFD700]/50 transition-colors appearance-none cursor-pointer"
        >
          {options.map((o, i) => (
            <option key={o} value={o} className="bg-[#121214]">
              {optionLabels ? optionLabels[i] : o}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500" />
      </div>
    </div>
  );
}
