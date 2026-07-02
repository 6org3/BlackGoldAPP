export default function SelectField({ label, value, options, optionLabels, onChange }) {
  return (
    <div>
      <label className="block text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-2">{label}</label>
      <select
        value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FFD700]/50 transition-colors appearance-none cursor-pointer"
      >
        {options.map((o, i) => (
          <option key={o} value={o} className="bg-[#121214]">
            {optionLabels ? optionLabels[i] : o}
          </option>
        ))}
      </select>
    </div>
  );
}
