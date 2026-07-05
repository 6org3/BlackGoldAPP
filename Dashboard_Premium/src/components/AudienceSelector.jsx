import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Megaphone, Users, User, UserCheck, Layers, Tag, Calendar, Filter,
  Search, UsersRound,
} from 'lucide-react';
import { resolverAudienciaLocal, fetchMembresiaGrupos } from '../api/comunicacionesService';
import { fetchGrupos } from '../api/sesionesService';

// Catálogo de los 8 criterios de segmentación (compartido)
export const SEGMENTO_CONFIG = {
  general:          { icon: Megaphone, color: 'text-brand bg-brand/10 border-brand/30',     label: 'General' },
  individual:       { icon: User,      color: 'text-success-soft bg-success/10 border-success/30', label: 'Individual' },
  individualizado:  { icon: UserCheck, color: 'text-mental-soft bg-mental/10 border-mental/30',   label: 'Lista a la carta' },
  grupo:            { icon: Users,     color: 'text-info-soft bg-info/10 border-info/30',          label: 'Un grupo' },
  grupos_limitados: { icon: Layers,    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',          label: 'Varios grupos' },
  categoria:        { icon: Tag,       color: 'text-caution-soft bg-caution/10 border-caution/30',    label: 'Por categoría' },
  edad:             { icon: Calendar,  color: 'text-pink-400 bg-pink-500/10 border-pink-500/30',          label: 'Por edad' },
  genero:           { icon: Filter,    color: 'text-teal-400 bg-teal-500/10 border-teal-500/30',          label: 'Por género' },
};

/**
 * Selector de audiencia reutilizable. Maneja su propio estado y notifica al
 * padre vía onChange({ segmento_tipo, segmento_params, incluir_representantes, seleccion }).
 */
export default function AudienceSelector({ atletas = [], onChange }) {
  const [grupos, setGrupos] = useState([]);
  const [gruposByAtleta, setGruposByAtleta] = useState({});

  const [segmentoTipo, setSegmentoTipo] = useState('general');
  const [params, setParams] = useState({});
  const [incluirReps, setIncluirReps] = useState(true);
  const [destinatariosCustom, setDestinatariosCustom] = useState([]);
  const [busquedaDest, setBusquedaDest] = useState('');

  useEffect(() => {
    (async () => {
      const [g, m] = await Promise.all([fetchGrupos(), fetchMembresiaGrupos()]);
      setGrupos(g);
      setGruposByAtleta(m);
    })();
  }, []);

  const categorias = useMemo(
    () => [...new Set(atletas.map((a) => a.categoria).filter(Boolean))].sort(),
    [atletas]
  );

  const cambiarSegmento = (tipo) => {
    setSegmentoTipo(tipo);
    setParams({});
    setDestinatariosCustom([]);
    setBusquedaDest('');
  };

  const segmentoParams = useMemo(() => {
    if (segmentoTipo === 'individualizado') return { usuario_ids: destinatariosCustom.map((d) => d.id) };
    return params;
  }, [segmentoTipo, params, destinatariosCustom]);

  const alcance = useMemo(
    () => resolverAudienciaLocal(atletas, { segmento_tipo: segmentoTipo, segmento_params: segmentoParams }, gruposByAtleta),
    [atletas, segmentoTipo, segmentoParams, gruposByAtleta]
  );

  // Notificar al padre. onChange va en un ref para que un handler inline
  // (identidad nueva en cada render del padre) no provoque un bucle emit→render.
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });
  useEffect(() => {
    onChangeRef.current?.({
      segmento_tipo: segmentoTipo,
      segmento_params: segmentoParams,
      incluir_representantes: incluirReps,
      seleccion: alcance.seleccion,
      total: alcance.atletas,
    });
  }, [segmentoTipo, segmentoParams, incluirReps, alcance]);

  const atletasFiltrados = atletas.filter((a) =>
    busquedaDest &&
    a.nombre?.toLowerCase().includes(busquedaDest.toLowerCase()) &&
    !destinatariosCustom.find((d) => d.id === a.id)
  );

  const toggleEnArray = (key, value) => {
    setParams((prev) => {
      const arr = prev[key] || [];
      return { ...prev, [key]: arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value] };
    });
  };

  return (
    <div className="space-y-4">
      {/* Selector de criterio */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Object.entries(SEGMENTO_CONFIG).map(([tipo, cfg]) => {
          const Icon = cfg.icon;
          return (
            <button key={tipo} type="button" onClick={() => cambiarSegmento(tipo)}
              className={`flex flex-col items-center justify-center space-y-1 p-3 rounded-control border text-2xs font-black uppercase tracking-wider transition-all ${
                segmentoTipo === tipo ? cfg.color : 'border-white/10 text-fg-muted hover:text-white hover:bg-white/5'
              }`}>
              <Icon size={16} />
              <span className="text-center leading-tight">{cfg.label}</span>
            </button>
          );
        })}
      </div>

      {/* Paneles de parámetros */}
      {segmentoTipo === 'individual' && (
        <div className="glass-card rounded-panel p-4 border border-white/8">
          <label className="block text-3xs text-fg-muted font-black uppercase tracking-[0.25em] mb-3">Destinatario</label>
          <select value={params.atleta_id || ''} onChange={(e) => setParams({ atleta_id: e.target.value })}
            className="w-full bg-black/40 border border-white/10 rounded-control px-3 py-2.5 text-base md:text-sm text-white focus:outline-none appearance-none cursor-pointer">
            <option value="" className="bg-surface-card">Seleccionar jugador...</option>
            {atletas.map((a) => <option key={a.atleta_id} value={a.atleta_id} className="bg-surface-card">{a.nombre} ({a.categoria})</option>)}
          </select>
        </div>
      )}

      {segmentoTipo === 'grupo' && (
        <div className="glass-card rounded-panel p-4 border border-white/8">
          <label className="block text-3xs text-fg-muted font-black uppercase tracking-[0.25em] mb-3">Grupo destino</label>
          <div className="flex flex-wrap gap-2">
            {grupos.map((g) => (
              <button key={g.id} type="button" onClick={() => setParams({ grupo_id: g.id })}
                className={`flex-1 min-w-[100px] p-2.5 rounded-control border text-2xs font-black uppercase transition-all ${
                  params.grupo_id === g.id ? 'bg-info/10 border-info/40 text-blue-300' : 'border-white/10 text-fg-secondary hover:bg-white/5'
                }`}>{g.nombre}</button>
            ))}
          </div>
        </div>
      )}

      {segmentoTipo === 'grupos_limitados' && (
        <div className="glass-card rounded-panel p-4 border border-white/8">
          <label className="block text-3xs text-fg-muted font-black uppercase tracking-[0.25em] mb-3">Grupos incluidos ({(params.grupo_ids || []).length})</label>
          <div className="flex flex-wrap gap-2">
            {grupos.map((g) => {
              const on = (params.grupo_ids || []).includes(g.id);
              return (
                <button key={g.id} type="button" onClick={() => toggleEnArray('grupo_ids', g.id)}
                  className={`p-2.5 rounded-control border text-2xs font-black uppercase transition-all ${
                    on ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300' : 'border-white/10 text-fg-secondary hover:bg-white/5'
                  }`}>{g.nombre}</button>
              );
            })}
          </div>
        </div>
      )}

      {segmentoTipo === 'categoria' && (
        <div className="glass-card rounded-panel p-4 border border-white/8">
          <label className="block text-3xs text-fg-muted font-black uppercase tracking-[0.25em] mb-3">Categorías ({(params.categorias || []).length})</label>
          <div className="flex flex-wrap gap-2">
            {categorias.map((cat) => {
              const on = (params.categorias || []).includes(cat);
              return (
                <button key={cat} type="button" onClick={() => toggleEnArray('categorias', cat)}
                  className={`p-2.5 rounded-control border text-2xs font-black uppercase transition-all ${
                    on ? 'bg-caution/10 border-caution/40 text-orange-300' : 'border-white/10 text-fg-secondary hover:bg-white/5'
                  }`}>{cat}</button>
              );
            })}
            {categorias.length === 0 && <span className="text-xs text-fg-muted">No hay categorías cargadas.</span>}
          </div>
        </div>
      )}

      {segmentoTipo === 'edad' && (
        <div className="glass-card rounded-panel p-4 border border-white/8">
          <label className="block text-3xs text-fg-muted font-black uppercase tracking-[0.25em] mb-3">Rango de edad</label>
          <div className="flex items-center gap-3">
            <input type="number" inputMode="numeric" min="0" placeholder="Mín" value={params.edad_min ?? ''}
              onChange={(e) => setParams((p) => ({ ...p, edad_min: e.target.value === '' ? undefined : Number(e.target.value) }))}
              className="w-24 bg-black/40 border border-white/10 rounded-control px-3 py-2.5 text-base md:text-sm text-white focus:outline-none" />
            <span className="text-fg-muted text-xs font-bold">a</span>
            <input type="number" inputMode="numeric" min="0" placeholder="Máx" value={params.edad_max ?? ''}
              onChange={(e) => setParams((p) => ({ ...p, edad_max: e.target.value === '' ? undefined : Number(e.target.value) }))}
              className="w-24 bg-black/40 border border-white/10 rounded-control px-3 py-2.5 text-base md:text-sm text-white focus:outline-none" />
            <span className="text-fg-muted text-xs">años</span>
          </div>
        </div>
      )}

      {segmentoTipo === 'genero' && (
        <div className="glass-card rounded-panel p-4 border border-white/8">
          <label className="block text-3xs text-fg-muted font-black uppercase tracking-[0.25em] mb-3">Género</label>
          <div className="flex gap-2">
            {['Masculino', 'Femenino'].map((gen) => (
              <button key={gen} type="button" onClick={() => setParams({ genero: gen })}
                className={`flex-1 p-2.5 rounded-control border text-xs font-black uppercase transition-all ${
                  params.genero === gen ? 'bg-teal-500/10 border-teal-500/40 text-teal-300' : 'border-white/10 text-fg-secondary hover:bg-white/5'
                }`}>{gen}</button>
            ))}
          </div>
        </div>
      )}

      {segmentoTipo === 'individualizado' && (
        <div className="glass-card rounded-panel p-4 border border-white/8">
          <label className="block text-3xs text-fg-muted font-black uppercase tracking-[0.25em] mb-3">
            Lista a la carta ({destinatariosCustom.length} seleccionados)
          </label>
          {destinatariosCustom.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {destinatariosCustom.map((d) => (
                <span key={d.id} className="flex items-center space-x-1.5 bg-mental/10 border border-mental/30 rounded-full px-2.5 py-1.5 text-2xs text-mental-soft font-bold">
                  <span>{d.nombre}</span>
                  <button type="button" aria-label={`Quitar ${d.nombre}`}
                    onClick={() => setDestinatariosCustom((p) => p.filter((x) => x.id !== d.id))}
                    className="p-1.5 -m-1 min-w-[24px] min-h-[24px] flex items-center justify-center hover:text-white">✕</button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center space-x-2 bg-black/40 border border-white/10 rounded-control px-3 py-2">
            <Search size={13} className="text-fg-muted" />
            <input type="text" placeholder="Agregar por nombre..." value={busquedaDest}
              onChange={(e) => setBusquedaDest(e.target.value)}
              className="bg-transparent text-base md:text-sm text-white placeholder-gray-600 focus:outline-none w-full" />
          </div>
          {atletasFiltrados.slice(0, 5).map((a) => (
            <button key={a.id} type="button" onClick={() => { setDestinatariosCustom((p) => [...p, a]); setBusquedaDest(''); }}
              className="w-full flex items-center space-x-2 px-3 py-2 mt-1 rounded-lg hover:bg-white/5 text-left transition-colors">
              <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-black text-white/50">{a.nombre?.charAt(0)}</span>
              <span className="text-xs font-bold text-white">{a.nombre}</span>
              <span className="text-3xs text-fg-muted">{a.categoria}</span>
            </button>
          ))}
        </div>
      )}

      {/* Toggle representantes + contador de alcance */}
      <div className="glass-card rounded-panel p-4 border border-white/8 flex items-center justify-between">
        <button type="button" onClick={() => setIncluirReps((v) => !v)}
          className="flex items-center space-x-2 text-xs font-bold text-gray-300 hover:text-white transition-colors">
          <span className={`w-9 h-5 rounded-full p-0.5 transition-colors ${incluirReps ? 'bg-success/40' : 'bg-white/10'}`}>
            <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${incluirReps ? 'translate-x-4' : ''}`} />
          </span>
          <span className="flex items-center space-x-1"><UsersRound size={13} /><span>Incluir representantes</span></span>
        </button>
        <div className="text-right">
          <p className="text-2xl font-black text-brand leading-none">{alcance.atletas}</p>
          <p className="text-3xs text-fg-muted font-bold uppercase tracking-wider">
            atletas{incluirReps ? ' + repres.' : ''}
          </p>
        </div>
      </div>
    </div>
  );
}
