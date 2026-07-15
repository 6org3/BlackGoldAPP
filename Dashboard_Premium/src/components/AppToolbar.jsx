import { useState } from 'react';
import { Search, ListFilter, SlidersHorizontal, Target, ChevronDown } from 'lucide-react';
import { cut } from './arcade/arcadeTokens';
import { parseEdad } from '../lib/edad';

const categorias = ['Todas', 'Premini (Sub-9)', 'Mini (Sub-11)', 'Menores (Sub-14)', 'Prejuvenil (Sub-16)', 'Juvenil (Sub-18)', 'Mayores'];
const posiciones = ['Todas', 'Generador', 'Escolta', 'Alero Físico', 'Ala-Pívot', 'Ancla Fuerte'];
const nivelesDesarrollo = ['Todos', 'Micro', 'Desarrollo', 'Elite'];
const generos = ['Todos', 'Masculino', 'Femenino'];

// Reemplazo visible del chevron nativo que appearance-none elimina.
const SelectChevron = () => (
  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-fg-muted" />
);

// Corte de esquina compartido de los selects del panel (§6.3 Formulario-HUD → cut(7)).
const CUT_FIELD = { clipPath: cut(7) };

const EDAD_INPUT_CLASS = 'cut-focus arcade-input w-full min-w-0 min-h-11 md:min-h-9 bg-surface-sunken border border-white/10 text-white text-base md:text-2xs font-bold tracking-widest px-2.5 focus:outline-none focus:border-brand/60 hover:border-white/30 transition';

export default function AppToolbar({ busqueda, setBusqueda, filtros, handleFiltroChange, ordenarPor, setOrdenarPor, setShowAsignador }) {
  // Patrón "barra de filtros colapsable" (design_system_arcade.md §6.4): en móvil
  // los combos cuestan más pantalla que los atletas, así que arrancan
  // colapsados tras el botón Filtros; en lg+ siempre visibles.
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const filtrosActivos = [
    filtros.genero !== 'Todos',
    filtros.categoria !== 'Todas',
    filtros.posicion !== 'Todas',
    filtros.nivelDesarrollo !== 'Todos',
    // El rango de edad cuenta como un solo filtro aunque tenga dos extremos.
    filtros.edadMin !== undefined || filtros.edadMax !== undefined,
  ].filter(Boolean).length;

  return (
    <div
      style={{ clipPath: cut(10) }}
      className="mb-8 relative z-10 bg-surface-card border border-white/10 p-4 space-y-3"
    >

      {/* Fila fija: buscador + toggle de filtros (móvil) + Misiones */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted z-10" />
          <input
            type="text"
            placeholder="Buscar cédula o nombre..."
            aria-label="Buscar cédula o nombre"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ clipPath: cut(7) }}
            className="cut-focus arcade-input w-full min-h-11 md:min-h-9 bg-surface-sunken border border-brand/30 text-white text-base md:text-[11px] font-bold tracking-wide pl-9 pr-3 focus:outline-none focus:border-brand/60 transition"
          />
        </div>

        <button
          type="button"
          onClick={() => setFiltrosAbiertos(v => !v)}
          aria-expanded={filtrosAbiertos}
          aria-controls="panel-filtros-plantel"
          style={{ clipPath: cut(7) }}
          className="cut-focus lg:hidden inline-flex items-center gap-2 min-h-11 px-3.5 bg-white/5 border border-white/10 text-fg-secondary hover:bg-white/10 hover:text-white text-2xs font-black uppercase tracking-widest transition"
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
          style={{ clipPath: cut(7) }}
          className="cut-focus inline-flex items-center justify-center space-x-2 min-h-11 md:min-h-9 bg-brand/10 border border-brand/50 text-brand hover:bg-brand/20 px-4 text-2xs font-black uppercase tracking-widest transition shrink-0"
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
          <label htmlFor="filtro-genero" className="font-pixel text-2xs text-fg-muted uppercase tracking-widest mb-1.5 ml-1">Género</label>
          <div className="relative">
            <select id="filtro-genero" value={filtros.genero} onChange={e => handleFiltroChange('genero', e.target.value)}
              style={CUT_FIELD}
              className="cut-focus w-full min-h-11 md:min-h-9 bg-surface-sunken border border-brand/30 text-white text-base md:text-2xs font-black uppercase tracking-widest pl-2.5 pr-6 focus:outline-none cursor-pointer appearance-none">
              {generos.map(g => <option key={g} value={g}>{g === 'Todos' ? 'Todos' : g}</option>)}
            </select>
            <SelectChevron />
          </div>
        </div>

        <div className="flex flex-col flex-1 min-w-[140px] lg:flex-none">
          <label htmlFor="filtro-categoria" className="font-pixel text-2xs text-fg-muted uppercase tracking-widest mb-1.5 ml-1">Categoría FEB</label>
          <div className="relative">
            <select id="filtro-categoria" value={filtros.categoria} onChange={e => handleFiltroChange('categoria', e.target.value)}
              style={CUT_FIELD}
              className="cut-focus w-full min-h-11 md:min-h-9 bg-surface-sunken border border-brand/30 text-brand text-base md:text-2xs font-black uppercase tracking-widest pl-2.5 pr-6 focus:outline-none cursor-pointer appearance-none">
              {categorias.map(c => <option key={c} value={c}>{c === 'Todas' ? 'Todas' : c}</option>)}
            </select>
            <SelectChevron />
          </div>
        </div>

        <div className="flex flex-col flex-1 min-w-[160px] lg:flex-none">
          <label htmlFor="filtro-edad-min" className="font-pixel text-2xs text-fg-muted uppercase tracking-widest mb-1.5 ml-1">Edad</label>
          <div className="flex items-center gap-2">
            <input
              id="filtro-edad-min"
              type="number" inputMode="numeric" min="0" max="99"
              placeholder="Mín"
              aria-label="Edad mínima"
              value={filtros.edadMin ?? ''}
              onChange={e => handleFiltroChange('edadMin', parseEdad(e.target.value))}
              style={CUT_FIELD}
              className={EDAD_INPUT_CLASS}
            />
            <span aria-hidden="true" className="text-2xs font-bold text-fg-muted shrink-0">a</span>
            <input
              id="filtro-edad-max"
              type="number" inputMode="numeric" min="0" max="99"
              placeholder="Máx"
              aria-label="Edad máxima"
              value={filtros.edadMax ?? ''}
              onChange={e => handleFiltroChange('edadMax', parseEdad(e.target.value))}
              style={CUT_FIELD}
              className={EDAD_INPUT_CLASS}
            />
          </div>
        </div>

        <div className="flex flex-col flex-1 min-w-[140px] lg:flex-none">
          <label htmlFor="filtro-posicion" className="font-pixel text-2xs text-fg-muted uppercase tracking-widest mb-1.5 ml-1">Posición</label>
          <div className="relative">
            <select id="filtro-posicion" value={filtros.posicion} onChange={e => handleFiltroChange('posicion', e.target.value)}
              style={CUT_FIELD}
              className="cut-focus w-full min-h-11 md:min-h-9 bg-surface-sunken border border-white/10 text-white text-base md:text-2xs font-bold uppercase tracking-widest pl-2.5 pr-6 focus:outline-none cursor-pointer appearance-none hover:border-white/30 transition-colors">
              {posiciones.map(p => <option key={p} value={p}>{p === 'Todas' ? 'Todas' : p}</option>)}
            </select>
            <SelectChevron />
          </div>
        </div>

        <div className="flex flex-col flex-1 min-w-[140px] lg:flex-none">
          <label htmlFor="filtro-nivel" className="font-pixel text-2xs text-fg-muted uppercase tracking-widest mb-1.5 ml-1">Nivel</label>
          <div className="relative">
            <select id="filtro-nivel" value={filtros.nivelDesarrollo} onChange={e => handleFiltroChange('nivelDesarrollo', e.target.value)}
              style={CUT_FIELD}
              className="cut-focus w-full min-h-11 md:min-h-9 bg-surface-sunken border border-white/10 text-success-soft text-base md:text-2xs font-bold uppercase tracking-widest pl-2.5 pr-6 focus:outline-none cursor-pointer appearance-none hover:border-success/30 transition-colors">
              {nivelesDesarrollo.map(n => <option key={n} value={n}>{n === 'Todos' ? 'Todos' : n}</option>)}
            </select>
            <SelectChevron />
          </div>
        </div>

        <div className="flex flex-col flex-1 min-w-[160px] lg:flex-none">
          <label htmlFor="ordenar-por" className="font-pixel text-2xs text-fg-muted uppercase tracking-widest mb-1.5 ml-1">Ordenar Por</label>
          <div style={CUT_FIELD} className="flex items-center space-x-2 bg-surface-sunken border border-white/10 px-3 min-h-11 md:min-h-9">
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
