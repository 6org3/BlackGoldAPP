import { useState } from 'react';
import { Search, ListFilter, SlidersHorizontal, Target, ChevronDown } from 'lucide-react';

const categorias = ['Todas', 'Premini (Sub-9)', 'Mini (Sub-11)', 'Menores (Sub-14)', 'Prejuvenil (Sub-16)', 'Juvenil (Sub-18)', 'Mayores'];
const posiciones = ['Todas', 'Generador', 'Escolta', 'Alero Físico', 'Ala-Pívot', 'Ancla Fuerte'];
const nivelesDesarrollo = ['Todos', 'Micro', 'Desarrollo', 'Elite'];
const generos = ['Todos', 'Masculino', 'Femenino'];

// Reemplazo visible del chevron nativo que appearance-none elimina.
const SelectChevron = () => (
  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-fg-muted" />
);

export default function AppToolbar({ busqueda, setBusqueda, filtros, handleFiltroChange, ordenarPor, setOrdenarPor, setShowAsignador }) {
  // Patrón "barra de filtros colapsable" (design_system.md §4.3b): en móvil
  // los combos cuestan más pantalla que los atletas, así que arrancan
  // colapsados tras el botón Filtros; en lg+ siempre visibles.
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const filtrosActivos = [
    filtros.genero !== 'Todos',
    filtros.categoria !== 'Todas',
    filtros.posicion !== 'Todas',
    filtros.nivelDesarrollo !== 'Todos',
  ].filter(Boolean).length;

  return (
    <div className="mb-8 relative z-10 bg-white/5 border border-white/10 p-4 rounded-panel backdrop-blur-md space-y-3">

      {/* Fila fija: buscador + toggle de filtros (móvil) + Misiones */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
          <input
            type="text"
            placeholder="Buscar cédula o nombre..."
            aria-label="Buscar cédula o nombre"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full min-h-11 md:min-h-9 bg-surface-card border border-brand/30 text-white text-base md:text-[11px] font-bold tracking-wide rounded-control pl-9 pr-3 focus:outline-none focus:border-brand/60 focus:shadow-[0_0_15px_rgba(255,215,0,0.15)] transition"
          />
        </div>

        <button
          type="button"
          onClick={() => setFiltrosAbiertos(v => !v)}
          aria-expanded={filtrosAbiertos}
          aria-controls="panel-filtros-plantel"
          className="lg:hidden inline-flex items-center gap-2 min-h-11 px-3.5 rounded-control bg-white/5 border border-white/10 text-fg-secondary hover:bg-white/10 hover:text-white text-2xs font-black uppercase tracking-widest transition"
        >
          <SlidersHorizontal size={14} />
          <span>Filtros</span>
          {filtrosActivos > 0 && (
            <span className="size-5 grid place-items-center rounded-full bg-brand text-on-brand text-3xs font-black">
              {filtrosActivos}
            </span>
          )}
        </button>

        <button
          onClick={() => setShowAsignador(true)}
          aria-label="Asignar misiones"
          className="inline-flex items-center justify-center space-x-2 min-h-11 md:min-h-9 bg-brand/10 border border-brand/50 text-brand hover:bg-brand/20 px-4 rounded-control text-2xs font-black uppercase tracking-widest transition shadow-[0_0_20px_rgba(255,215,0,0.2)] shrink-0"
        >
          <Target size={16} />
          <span>Misiones</span>
        </button>
      </div>

      {/* Panel de filtros: colapsado por defecto en móvil, siempre visible en lg+ */}
      <div
        id="panel-filtros-plantel"
        className={`${filtrosAbiertos ? 'flex animate-fade-in-up' : 'hidden'} lg:flex flex-wrap items-end gap-3`}
      >
        <div className="flex flex-col flex-1 min-w-[140px] lg:flex-none">
          <label htmlFor="filtro-genero" className="text-2xs text-fg-muted font-bold uppercase tracking-widest mb-1 ml-1">Género</label>
          <div className="relative">
            <select id="filtro-genero" value={filtros.genero} onChange={e => handleFiltroChange('genero', e.target.value)}
              className="w-full min-h-11 md:min-h-9 bg-surface-card border border-brand/30 text-white text-base md:text-2xs font-black uppercase tracking-widest rounded-lg pl-2 pr-6 focus:outline-none cursor-pointer appearance-none shadow-[0_0_10px_rgba(255,215,0,0.05)]">
              {generos.map(g => <option key={g} value={g}>{g === 'Todos' ? 'Todos' : g}</option>)}
            </select>
            <SelectChevron />
          </div>
        </div>

        <div className="flex flex-col flex-1 min-w-[140px] lg:flex-none">
          <label htmlFor="filtro-categoria" className="text-2xs text-fg-muted font-bold uppercase tracking-widest mb-1 ml-1">Categoría FEB</label>
          <div className="relative">
            <select id="filtro-categoria" value={filtros.categoria} onChange={e => handleFiltroChange('categoria', e.target.value)}
              className="w-full min-h-11 md:min-h-9 bg-surface-card border border-brand/30 text-brand text-base md:text-2xs font-black uppercase tracking-widest rounded-lg pl-2 pr-6 focus:outline-none cursor-pointer appearance-none shadow-[0_0_10px_rgba(255,215,0,0.1)]">
              {categorias.map(c => <option key={c} value={c}>{c === 'Todas' ? 'Todas' : c}</option>)}
            </select>
            <SelectChevron />
          </div>
        </div>

        <div className="flex flex-col flex-1 min-w-[140px] lg:flex-none">
          <label htmlFor="filtro-posicion" className="text-2xs text-fg-muted font-bold uppercase tracking-widest mb-1 ml-1">Posición</label>
          <div className="relative">
            <select id="filtro-posicion" value={filtros.posicion} onChange={e => handleFiltroChange('posicion', e.target.value)}
              className="w-full min-h-11 md:min-h-9 bg-surface-card border border-white/10 text-white text-base md:text-2xs font-bold uppercase tracking-widest rounded-lg pl-2 pr-6 focus:outline-none cursor-pointer appearance-none hover:border-white/30 transition-colors">
              {posiciones.map(p => <option key={p} value={p}>{p === 'Todas' ? 'Todas' : p}</option>)}
            </select>
            <SelectChevron />
          </div>
        </div>

        <div className="flex flex-col flex-1 min-w-[140px] lg:flex-none">
          <label htmlFor="filtro-nivel" className="text-2xs text-fg-muted font-bold uppercase tracking-widest mb-1 ml-1">Nivel</label>
          <div className="relative">
            <select id="filtro-nivel" value={filtros.nivelDesarrollo} onChange={e => handleFiltroChange('nivelDesarrollo', e.target.value)}
              className="w-full min-h-11 md:min-h-9 bg-surface-card border border-white/10 text-success-soft text-base md:text-2xs font-bold uppercase tracking-widest rounded-lg pl-2 pr-6 focus:outline-none cursor-pointer appearance-none hover:border-success/30 transition-colors">
              {nivelesDesarrollo.map(n => <option key={n} value={n}>{n === 'Todos' ? 'Todos' : n}</option>)}
            </select>
            <SelectChevron />
          </div>
        </div>

        <div className="flex flex-col flex-1 min-w-[160px] lg:flex-none">
          <label htmlFor="ordenar-por" className="text-2xs text-fg-muted font-bold uppercase tracking-widest mb-1 ml-1">Ordenar Por</label>
          <div className="flex items-center space-x-2 bg-surface-card border border-white/10 rounded-control px-3 min-h-11 md:min-h-9">
            <ListFilter size={14} className="text-brand" />
            <select
              id="ordenar-por"
              value={ordenarPor} onChange={e => setOrdenarPor(e.target.value)}
              className="w-full bg-transparent border-none text-base md:text-2xs text-white font-bold uppercase tracking-widest focus:outline-none cursor-pointer"
            >
              <option value="overall" className="bg-surface-card">Experiencia Total</option>
              <option value="nombre" className="bg-surface-card">Nombre</option>
              <option value="edad" className="bg-surface-card">Edad</option>
              <option value="nivel_desarrollo" className="bg-surface-card">Nivel Desarrollo</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
