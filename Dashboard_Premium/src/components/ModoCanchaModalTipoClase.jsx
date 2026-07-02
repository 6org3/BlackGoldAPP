import { Search, Users, User, ArrowRight } from 'lucide-react';

export default function ModoCanchaModalTipoClase({
  tipoClase,
  setTipoClase,
  nivelSeleccionado,
  setNivelSeleccionado,
  setStep,
  busquedaAtleta,
  setBusquedaAtleta,
  setAtletaIndividual,
  atletasFiltradosIndividual
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400 font-bold uppercase tracking-widest text-center">Paso 1: ¿Qué tipo de clase darás hoy?</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button onClick={() => { setTipoClase('grupal_nivel'); }}
          className={`p-4 bg-white/5 hover:bg-white/10 border ${tipoClase === 'grupal_nivel' ? 'border-[#FFD700]' : 'border-white/10'} rounded-2xl flex flex-col items-center justify-center space-y-3 transition-colors`}>
          <Users size={28} className="text-[#FFD700]"/>
          <span className="font-bold text-white text-xs uppercase tracking-widest text-center">Grupal<br/>(Niveles)</span>
        </button>
        <button onClick={() => { setTipoClase('grupal_ind'); }}
          className={`p-4 bg-white/5 hover:bg-white/10 border ${tipoClase === 'grupal_ind' ? 'border-orange-400' : 'border-white/10'} rounded-2xl flex flex-col items-center justify-center space-y-3 transition-colors`}>
          <Users size={28} className="text-orange-400"/>
          <span className="font-bold text-white text-xs uppercase tracking-widest text-center">Grupal<br/>Individualizada</span>
        </button>
        <button onClick={() => { setTipoClase('privada_1v1'); }}
          className={`p-4 bg-white/5 hover:bg-white/10 border ${tipoClase === 'privada_1v1' ? 'border-cyan-400' : 'border-white/10'} rounded-2xl flex flex-col items-center justify-center space-y-3 transition-colors`}>
          <User size={28} className="text-cyan-400"/>
          <span className="font-bold text-white text-xs uppercase tracking-widest text-center">Privada<br/>1v1</span>
        </button>
      </div>

      {tipoClase === 'grupal_nivel' && (
        <div className="mt-8 space-y-4 animate-in fade-in slide-in-from-bottom-4">
          <p className="text-xs text-[#FFD700] font-bold uppercase tracking-widest">Selecciona el Bloque (Nivel de Desarrollo)</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {['Micro', 'Desarrollo', 'Elite'].map(lvl => (
              <button key={lvl} onClick={() => { setNivelSeleccionado(lvl); setStep(2); }}
                className={`py-3 bg-black/40 border ${nivelSeleccionado === lvl ? 'border-[#FFD700]' : 'border-white/10'} hover:border-[#FFD700]/50 rounded-xl text-white font-bold transition-all text-sm uppercase tracking-widest`}>
                {lvl}
              </button>
            ))}
          </div>
        </div>
      )}

      {tipoClase === 'grupal_ind' && (
        <div className="mt-8 flex justify-center animate-in fade-in slide-in-from-bottom-4">
          <button onClick={() => setStep(2)}
            className="px-8 py-3 bg-orange-500 hover:bg-orange-400 text-black font-black uppercase tracking-widest rounded-xl transition-all shadow-[0_0_15px_rgba(249,115,22,0.3)]">
            Continuar a Configuración <ArrowRight size={18} className="inline ml-2" />
          </button>
        </div>
      )}

      {tipoClase === 'privada_1v1' && (
        <div className="mt-8 space-y-4 animate-in fade-in slide-in-from-bottom-4">
          <p className="text-xs text-cyan-400 font-bold uppercase tracking-widest">Buscar Atleta</p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
            <input type="text" placeholder="Buscar por nombre o cédula..." value={busquedaAtleta} onChange={(e) => setBusquedaAtleta(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-gray-500 focus:border-cyan-400 focus:outline-none transition-colors" />
          </div>

          {busquedaAtleta && (
            <div className="space-y-2 mt-4 max-h-48 overflow-y-auto">
              {atletasFiltradosIndividual.map(a => (
                <button key={a.atleta_id} onClick={() => { setAtletaIndividual(a); setStep(2); }}
                  className="w-full text-left px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex justify-between items-center transition-colors">
                  <span className="font-bold text-white text-sm">{a.nombre}</span>
                  {a.categoria && <span className="text-[10px] text-gray-500 px-2 py-0.5 border border-white/10 rounded uppercase">{a.categoria}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
