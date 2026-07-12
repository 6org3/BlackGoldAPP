import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Megaphone, Users, User, UserCheck, Layers, Tag, Calendar, Filter,
  Search, Send, MessageSquare, CheckCircle2, UsersRound, AlertTriangle,
} from 'lucide-react';
import {
  crearComunicacion, fetchComunicaciones, generarLinkWhatsApp,
  resolverAudienciaLocal, fetchMembresiaGrupos,
} from '../api/comunicacionesService';
import { fetchGrupos } from '../api/sesionesService';

// Catálogo de los 8 criterios de segmentación
const SEGMENTO_CONFIG = {
  general:          { icon: Megaphone, color: 'text-brand bg-brand/10 border-brand/30',     label: 'General' },
  individual:       { icon: User,      color: 'text-success-soft bg-success/10 border-success/30', label: 'Individual' },
  individualizado:  { icon: UserCheck, color: 'text-mental-soft bg-mental/10 border-mental/30',   label: 'Lista a la carta' },
  grupo:            { icon: Users,     color: 'text-info-soft bg-info/10 border-info/30',          label: 'Un grupo' },
  grupos_limitados: { icon: Layers,    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',          label: 'Varios grupos' },
  categoria:        { icon: Tag,       color: 'text-caution-soft bg-caution/10 border-caution/30',    label: 'Por categoría' },
  edad:             { icon: Calendar,  color: 'text-pink-400 bg-pink-500/10 border-pink-500/30',          label: 'Por edad' },
  genero:           { icon: Filter,    color: 'text-teal-400 bg-teal-500/10 border-teal-500/30',          label: 'Por género' },
};

// Etiqueta legible para el feed (incluye registros legados que sólo tienen `tipo`)
const labelSegmento = (c) => {
  const cfg = SEGMENTO_CONFIG[c.segmento_tipo];
  if (cfg) return cfg.label;
  const legado = { Anuncio: 'General', Grupal: 'Un grupo', Personalizado: 'Lista a la carta', Individual: 'Individual' };
  return legado[c.tipo] || c.tipo || 'Mensaje';
};
const iconSegmento = (c) => SEGMENTO_CONFIG[c.segmento_tipo]?.icon || Megaphone;
const colorSegmento = (c) => SEGMENTO_CONFIG[c.segmento_tipo]?.color || 'text-fg-secondary bg-white/5 border-white/10';

export default function AdminComunicaciones({ user, atletas = [] }) {
  const club = user?.club;
  const [comunicaciones, setComunicaciones] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [gruposByAtleta, setGruposByAtleta] = useState({});

  const [segmentoTipo, setSegmentoTipo] = useState('general');
  const [params, setParams] = useState({});
  const [incluirReps, setIncluirReps] = useState(true);
  const [titulo, setTitulo] = useState('');
  const [mensaje, setMensaje] = useState('');

  const [destinatariosCustom, setDestinatariosCustom] = useState([]); // objetos atleta para 'individualizado'
  const [busquedaDest, setBusquedaDest] = useState('');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorCarga, setErrorCarga] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, g, m] = await Promise.all([
        fetchComunicaciones({ limit: 30 }),
        fetchGrupos(club),
        fetchMembresiaGrupos(),
      ]);
      setComunicaciones(c);
      setGrupos(g);
      setGruposByAtleta(m);
      setErrorCarga(false);
    } catch (e) {
      console.error('Error cargando comunicaciones:', e);
      setErrorCarga(true);
    }
  }, [club]);

  useEffect(() => { load(); }, [load]);

  // Categorías disponibles (derivadas de los atletas)
  const categorias = useMemo(
    () => [...new Set(atletas.map((a) => a.categoria).filter(Boolean))].sort(),
    [atletas]
  );

  // Al cambiar de criterio, reiniciar parámetros y lista a la carta
  const cambiarSegmento = (tipo) => {
    setSegmentoTipo(tipo);
    setParams({});
    setDestinatariosCustom([]);
    setBusquedaDest('');
  };

  // Construye los segmento_params según el criterio actual
  const segmentoParams = useMemo(() => {
    if (segmentoTipo === 'individualizado') return { usuario_ids: destinatariosCustom.map((d) => d.id) };
    return params;
  }, [segmentoTipo, params, destinatariosCustom]);

  // Contador de alcance en vivo
  const alcance = useMemo(
    () => resolverAudienciaLocal(atletas, { segmento_tipo: segmentoTipo, segmento_params: segmentoParams }, gruposByAtleta),
    [atletas, segmentoTipo, segmentoParams, gruposByAtleta]
  );

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

  // Se puede enviar si hay mensaje y (es general o el segmento alcanza a alguien)
  const puedeEnviar = !!mensaje.trim() && (segmentoTipo === 'general' || alcance.atletas > 0);

  const handleEnviar = async () => {
    if (!mensaje.trim()) return;
    setSaving(true);
    try {
      await crearComunicacion({
        autor_id: user.id,
        segmento_tipo: segmentoTipo,
        segmento_params: segmentoParams,
        incluir_representantes: incluirReps,
        titulo: titulo || SEGMENTO_CONFIG[segmentoTipo]?.label || 'Comunicado',
        mensaje,
        canal: 'whatsapp',
        destinatarios_ids: segmentoTipo === 'individualizado' ? destinatariosCustom.map((d) => d.id) : [],
      });
      setSaved(true);
      setTitulo(''); setMensaje('');
      setDestinatariosCustom([]); setParams({});
      const c = await fetchComunicaciones({ limit: 30 });
      setComunicaciones(c);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const abrirWA = (com) => {
    const texto = `*${com.titulo}*\n\n${com.mensaje}`;
    window.open(generarLinkWhatsApp('', texto), '_blank');
  };

  return (
    <div className="min-h-screen bg-surface-base text-white p-6 md:p-10">
      <div className="fixed top-[-20%] left-[20%] w-[600px] h-[500px] bg-mental/3 blur-[150px] pointer-events-none rounded-full" />

      {/* Header */}
      <header className="mb-8 border-b border-white/5 pb-8 relative z-10">
        <div className="flex items-center space-x-3">
          <MessageSquare className="text-brand" size={28} />
          <div>
            <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tighter">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand to-brand-strong">Comunicaciones</span>
            </h2>
            <p className="text-2xs text-fg-muted font-bold uppercase tracking-[0.3em] mt-1">
              Club · Coach · Familia
            </p>
          </div>
        </div>
      </header>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* PANEL IZQUIERDO: Redactar */}
        <div className="space-y-5">
          <h3 className="text-sm font-black text-white uppercase tracking-widest">Nuevo Mensaje</h3>

          {/* Selector de criterio de audiencia */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(SEGMENTO_CONFIG).map(([tipo, cfg]) => {
              const Icon = cfg.icon;
              return (
                <button key={tipo} onClick={() => cambiarSegmento(tipo)}
                  className={`flex flex-col items-center justify-center space-y-1 p-3 rounded-control border text-2xs font-black uppercase tracking-wider transition ${
                    segmentoTipo === tipo ? cfg.color : 'border-white/10 text-fg-muted hover:text-white hover:bg-white/5'
                  }`}>
                  <Icon size={16} />
                  <span className="text-center leading-tight">{cfg.label}</span>
                </button>
              );
            })}
          </div>

          {/* Panel de parámetros según el criterio */}
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
                  <button key={g.id} onClick={() => setParams({ grupo_id: g.id })}
                    className={`flex-1 min-w-[100px] p-2.5 rounded-control border text-2xs font-black uppercase transition ${
                      params.grupo_id === g.id ? 'bg-info/10 border-info/40 text-blue-300' : 'border-white/10 text-fg-secondary hover:bg-white/5'
                    }`}>
                    {g.nombre}<br /><span className="text-[8px] text-fg-muted normal-case font-normal">{g.horario}</span>
                  </button>
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
                    <button key={g.id} onClick={() => toggleEnArray('grupo_ids', g.id)}
                      className={`p-2.5 rounded-control border text-2xs font-black uppercase transition ${
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
                    <button key={cat} onClick={() => toggleEnArray('categorias', cat)}
                      className={`p-2.5 rounded-control border text-2xs font-black uppercase transition ${
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
                  <button key={gen} onClick={() => setParams({ genero: gen })}
                    className={`flex-1 p-2.5 rounded-control border text-xs font-black uppercase transition ${
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
                      <button aria-label={`Quitar ${d.nombre}`}
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
                <button key={a.id} onClick={() => { setDestinatariosCustom((p) => [...p, a]); setBusquedaDest(''); }}
                  className="w-full flex items-center space-x-2 px-3 py-2 mt-1 rounded-lg hover:bg-white/5 text-left transition-colors">
                  <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-black text-white/50">{a.nombre?.charAt(0)}</span>
                  <span className="text-xs font-bold text-white">{a.nombre}</span>
                  <span className="text-3xs text-fg-muted">{a.categoria}</span>
                </button>
              ))}
            </div>
          )}

          {/* Toggle representantes + contador de alcance en vivo */}
          <div className="glass-card rounded-panel p-4 border border-white/8 flex items-center justify-between">
            <button onClick={() => setIncluirReps((v) => !v)}
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

          {/* Título y Mensaje */}
          <input type="text" placeholder="Título del mensaje (opcional)"
            value={titulo} onChange={(e) => setTitulo(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-control px-4 py-3 text-base md:text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand/50 transition-colors" />
          <textarea rows={4} placeholder="Escribe el mensaje..."
            value={mensaje} onChange={(e) => setMensaje(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-control px-4 py-3 text-base md:text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand/50 resize-none transition-colors" />

          <button onClick={handleEnviar} disabled={saving || !puedeEnviar}
            className={`w-full flex items-center justify-center space-x-2 py-4 rounded-panel font-black uppercase tracking-widest text-sm transition ${
              saved
                ? 'bg-success/20 border border-success/40 text-success-soft'
                : 'bg-brand/10 border border-brand/30 text-brand hover:bg-brand/20 disabled:opacity-40'
            }`}>
            {saving ? <span className="animate-pulse">Enviando...</span>
              : saved ? <><CheckCircle2 size={16} /><span>¡Mensaje Enviado!</span></>
              : <><Send size={16} /><span>Registrar Mensaje</span></>}
          </button>
        </div>

        {/* PANEL DERECHO: Feed de mensajes */}
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">Feed Reciente</h3>
          {errorCarga && (
            <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-panel border border-danger/40 bg-danger/10 p-4">
              <AlertTriangle size={18} className="text-danger-soft shrink-0" />
              <p className="flex-1 min-w-[180px] text-xs font-bold text-danger-soft">
                No se pudo cargar el feed. Esto no significa que esté vacío — puede ser un problema de conexión.
              </p>
              <button
                type="button"
                onClick={load}
                className="inline-flex items-center min-h-11 md:min-h-9 px-3.5 rounded-control bg-danger/20 border border-danger/50 text-danger-soft text-2xs font-black uppercase tracking-widest hover:bg-danger/30 transition"
              >
                Reintentar
              </button>
            </div>
          )}
          <div className="space-y-3 lg:max-h-[70vh] lg:overflow-y-auto overscroll-contain lg:pr-1">
            {!errorCarga && comunicaciones.length === 0 && (
              <div className="text-center py-16 text-fg-faint">
                <MessageSquare size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-bold">No hay mensajes aún</p>
              </div>
            )}
            {comunicaciones.map((c) => {
              const Icon = iconSegmento(c);
              return (
                <motion.div key={c.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                  className="glass-card rounded-panel p-4 border border-white/8 hover:border-white/15 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className={`flex items-center space-x-1.5 px-2 py-0.5 rounded-full border text-3xs font-black uppercase ${colorSegmento(c)}`}>
                      <Icon size={10} />
                      <span>{labelSegmento(c)}</span>
                      {c.grupos_entrenamiento && <span>· {c.grupos_entrenamiento.nombre}</span>}
                    </div>
                    <span className="text-3xs text-fg-faint">{new Date(c.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })}</span>
                  </div>
                  {c.titulo && <p className="text-sm font-black text-white mb-1">{c.titulo}</p>}
                  <p className="text-xs text-fg-secondary leading-relaxed">{c.mensaje}</p>
                  <div className="mt-3 pt-3 border-t border-white/5 flex justify-end">
                    <button onClick={() => abrirWA(c)}
                      className="flex items-center gap-1.5 px-3 py-2.5 min-h-11 rounded-lg border border-success/30 text-xs font-bold text-success-soft hover:text-emerald-300 hover:bg-success/10 transition-colors">
                      <MessageSquare size={13} />
                      <span>Abrir en WhatsApp</span>
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
