import { useId } from 'react';

export default function FilterSelect({ label, value, options, optionLabels, onChange }) {
  const labelId = useId();
  return (
    <div className="flex flex-col space-y-2" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="text-[11px] text-fg-secondary font-bold uppercase tracking-widest">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o, i) => {
          const isSelected = value === o;
          return (
            <button
              key={o}
              onClick={() => onChange(o)}
              aria-pressed={isSelected}
              className={`px-3.5 py-2.5 min-h-10 text-[11px] font-bold tracking-widest uppercase rounded-lg transition-all ${
                isSelected
                  ? 'bg-brand/20 text-brand border border-brand/50 shadow-[0_0_10px_rgba(255,215,0,0.2)]'
                  : 'bg-white/[0.02] text-fg-secondary border border-white/5 hover:bg-white/10 hover:text-white'
              }`}
            >
              {optionLabels ? optionLabels[i] : o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
