import { Search, ClipboardList } from 'lucide-react';

export default function ModoCanchaModalAsistencia({
  tipoClase,
  busquedaAtleta,
  setBusquedaAtleta,
  nivelSeleccionado,
  setNivelSeleccionado,
  uniqueCategorias,
  uniqueEdades,
  atletasParaSesion,
  asistencia,
  handleMarcarAsistencia,
  checkAllAsistencia,
  handleStartSession,
  saving
}) {
  return (
    <div className="space-y-6 flex flex-col flex-1 min-h-0">
      <div className="flex justify-between items-center mb-2">
        <p className="text-sm text-brand font-bold uppercase tracking-widest">Paso 3: Pasar Lista</p>
        <div className="flex space-x-2">
          <button onClick={() => checkAllAsistencia(true)} className="text-xs bg-success/20 text-success-soft px-4 py-2.5 min-h-11 rounded-full font-bold uppercase hover:bg-success/30">Todos Presentes</button>
        </div>
      </div>

      {tipoClase === 'grupal_ind' && (
        <div className="flex flex-col sm:flex-row gap-2 mb-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-fg-muted" size={14} />
            <input type="search" autoComplete="off" placeholder="Buscar nombre o cédula..."
                   value={busquedaAtleta} onChange={(e) => setBusquedaAtleta(e.target.value)}
                   className="w-full bg-black/40 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-base text-white placeholder-gray-500 focus:border-caution-soft focus:outline-none" />
          </div>
          <select value={nivelSeleccionado} onChange={(e) => setNivelSeleccionado(e.target.value)}
                  className="w-full sm:w-1/3 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-base text-white focus:border-caution-soft focus:outline-none">
            <option value="">Categoría / Edad...</option>
            {uniqueCategorias.length > 0 && (
              <optgroup label="Categorías">
                {uniqueCategorias.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </optgroup>
            )}
            {uniqueEdades.length > 0 && (
              <optgroup label="Edades">
                {uniqueEdades.map(edad => <option key={edad} value={edad}>{edad} años</option>)}
              </optgroup>
            )}
          </select>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2 pr-2">
        {atletasParaSesion.length === 0 ? (
          <p className="text-center text-fg-muted py-10 text-xs">No hay atletas en este grupo.</p>
        ) : (
          atletasParaSesion.map(a => (
            <div key={a.atleta_id} className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-control hover:border-white/30 transition-colors">
              <span className="font-bold text-white text-sm flex-1 min-w-0 truncate pr-2">{a.nombre}</span>
              <div className="flex gap-1 bg-surface-base rounded-lg p-1 border border-white/10">
                <button onClick={() => handleMarcarAsistencia(a.atleta_id, true)}
                  aria-pressed={asistencia[a.atleta_id] === true}
                  className={`px-5 py-3 min-h-11 rounded-md text-sm font-bold transition-all ${asistencia[a.atleta_id] === true ? 'bg-success text-black shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'text-fg-muted hover:text-white'}`}>P</button>
                <button onClick={() => handleMarcarAsistencia(a.atleta_id, false)}
                  aria-pressed={asistencia[a.atleta_id] === false}
                  className={`px-5 py-3 min-h-11 rounded-md text-sm font-bold transition-all ${asistencia[a.atleta_id] === false ? 'bg-danger text-white shadow-[0_0_10px_rgba(239,68,68,0.3)]' : 'text-fg-muted hover:text-white'}`}>A</button>
              </div>
            </div>
          ))
        )}
      </div>

      <button onClick={handleStartSession} disabled={saving || Object.values(asistencia).filter(Boolean).length === 0}
        className="w-full bg-brand text-black font-black uppercase tracking-widest py-4 rounded-control flex items-center justify-center hover:bg-brand-hover transition-colors disabled:opacity-50 mt-4 shadow-[0_0_20px_rgba(255,215,0,0.2)]">
        {saving ? 'Registrando...' : 'Empezar Clase y Minimizar'} <ClipboardList size={18} className="ml-2"/>
      </button>
    </div>
  );
}
