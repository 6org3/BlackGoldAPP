import { Search, ListFilter, Target } from 'lucide-react';

const categorias = ['Todas', 'Premini (Sub-9)', 'Mini (Sub-11)', 'Menores (Sub-14)', 'Prejuvenil (Sub-16)', 'Juvenil (Sub-18)', 'Mayores'];
const posiciones = ['Todas', 'Generador', 'Escolta', 'Alero Físico', 'Ala-Pívot', 'Ancla Fuerte'];
const nivelesDesarrollo = ['Todos', 'Micro', 'Desarrollo', 'Elite'];
const generos = ['Todos', 'Masculino', 'Femenino'];

export default function AppToolbar({ busqueda, setBusqueda, filtros, handleFiltroChange, ordenarPor, setOrdenarPor, setShowAsignador }) {
  return (
    <div className="flex flex-wrap items-center justify-between mb-8 relative z-10 gap-4 bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-md">

      {/* Buscador */}
      <div className="w-full lg:w-1/4 min-w-[200px]">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar cédula o nombre..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full bg-[#121214] border border-[#FFD700]/30 text-white text-[11px] font-bold tracking-wide rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:border-[#FFD700]/60 focus:shadow-[0_0_15px_rgba(255,215,0,0.15)] transition-all"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto pb-2 lg:pb-0">
        <div className="flex flex-col">
          <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest mb-1 ml-1">Género</span>
          <select value={filtros.genero} onChange={e => handleFiltroChange('genero', e.target.value)}
            className="bg-[#121214] border border-[#FFD700]/30 text-white text-[10px] font-black uppercase tracking-widest rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer appearance-none shadow-[0_0_10px_rgba(255,215,0,0.05)]">
            {generos.map(g => <option key={g} value={g}>{g === 'Todos' ? 'Todos' : g}</option>)}
          </select>
        </div>

        <div className="flex flex-col">
          <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest mb-1 ml-1">Categoría FEB</span>
          <select value={filtros.categoria} onChange={e => handleFiltroChange('categoria', e.target.value)}
            className="bg-[#121214] border border-[#FFD700]/30 text-[#FFD700] text-[10px] font-black uppercase tracking-widest rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer appearance-none shadow-[0_0_10px_rgba(255,215,0,0.1)]">
            {categorias.map(c => <option key={c} value={c}>{c === 'Todas' ? 'Todas' : c}</option>)}
          </select>
        </div>

        <div className="flex flex-col">
          <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest mb-1 ml-1">Posición</span>
          <select value={filtros.posicion} onChange={e => handleFiltroChange('posicion', e.target.value)}
            className="bg-[#121214] border border-white/10 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer appearance-none hover:border-white/30 transition-colors">
            {posiciones.map(p => <option key={p} value={p}>{p === 'Todas' ? 'Todas' : p}</option>)}
          </select>
        </div>

        <div className="flex flex-col">
          <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest mb-1 ml-1">Nivel</span>
          <select value={filtros.nivelDesarrollo} onChange={e => handleFiltroChange('nivelDesarrollo', e.target.value)}
            className="bg-[#121214] border border-white/10 text-emerald-400 text-[10px] font-bold uppercase tracking-widest rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer appearance-none hover:border-emerald-500/30 transition-colors">
            {nivelesDesarrollo.map(n => <option key={n} value={n}>{n === 'Todos' ? 'Todos' : n}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center space-x-3 w-full lg:w-auto mt-2 lg:mt-0 pt-2 lg:pt-0 border-t border-white/10 lg:border-none">
        <div className="flex flex-col items-end w-full lg:w-auto">
          <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest mb-1 mr-1">Ordenar Por</span>
          <div className="flex items-center space-x-2 bg-[#121214] border border-white/10 rounded-xl px-3 py-1.5">
            <ListFilter size={14} className="text-[#FFD700]" />
            <select
              value={ordenarPor} onChange={e => setOrdenarPor(e.target.value)}
              className="bg-transparent border-none text-[10px] text-white font-bold uppercase tracking-widest focus:outline-none cursor-pointer"
            >
              <option value="overall" className="bg-[#121214]">Experiencia Total</option>
              <option value="nombre" className="bg-[#121214]">Nombre</option>
              <option value="edad" className="bg-[#121214]">Edad</option>
              <option value="nivel_desarrollo" className="bg-[#121214]">Nivel Desarrollo</option>
            </select>
          </div>
        </div>

        <button
          onClick={() => setShowAsignador(true)}
          className="flex items-center justify-center space-x-2 bg-[#FFD700]/10 border border-[#FFD700]/50 text-[#FFD700] hover:bg-[#FFD700]/20 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(255,215,0,0.2)] shrink-0 self-end"
        >
          <Target size={16} />
          <span className="hidden md:inline">Misiones</span>
        </button>
      </div>
    </div>
  );
}
