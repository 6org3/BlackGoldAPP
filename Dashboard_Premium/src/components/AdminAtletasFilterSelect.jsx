import { useId } from 'react';
import { C, BORDER, TINT, cut } from './arcade/arcadeTokens';

export default function FilterSelect({ label, value, options, optionLabels, onChange }) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-2" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="text-[11px] font-bold uppercase tracking-widest" style={{ color: C.text2 }}>{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o, i) => {
          const isSelected = value === o;
          return (
            <button
              key={o}
              onClick={() => onChange(o)}
              aria-pressed={isSelected}
              className="cut-focus px-3.5 py-2.5 min-h-11 text-[11px] font-bold tracking-widest uppercase transition-colors"
              style={{
                clipPath: cut(5),
                background: isSelected ? TINT.gold : 'transparent',
                border: `1px solid ${isSelected ? BORDER.goldStrong : BORDER.neutralSoft}`,
                color: isSelected ? C.gold : C.text2,
              }}
            >
              {optionLabels ? optionLabels[i] : o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
