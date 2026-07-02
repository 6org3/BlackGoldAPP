export default function FilterSelect({ label, value, options, optionLabels, onChange }) {
  return (
    <div className="flex flex-col space-y-2">
      <label className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((o, i) => {
          const isSelected = value === o;
          return (
            <button
              key={o}
              onClick={() => onChange(o)}
              className={`px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase rounded-lg transition-all ${
                isSelected
                  ? 'bg-[#FFD700]/20 text-[#FFD700] border border-[#FFD700]/50 shadow-[0_0_10px_rgba(255,215,0,0.2)]'
                  : 'bg-white/[0.02] text-gray-400 border border-white/5 hover:bg-white/10 hover:text-white'
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
