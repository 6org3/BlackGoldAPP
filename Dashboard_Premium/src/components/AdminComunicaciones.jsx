import { useState, useEffect, useCallback, useMemo } from 'react';
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
import CutCard from './arcade/CutCard';
import HexAvatar from './arcade/HexAvatar';
import BotonVolver from './arcade/BotonVolver';
import MicroLabel from './arcade/MicroLabel';
import { C, BORDER, GRAD, TINT, cut } from './arcade/arcadeTokens';

// Catálogo de los 8 criterios de segmentación. En el idioma Arcade el segmento
// activo se distingue por acento oro único + su icono (§7.4), no por un color
// por criterio — antes cada uno traía una paleta cruda (pink/teal/cyan).
const SEGMENTO_CONFIG = {
  general:          { icon: Megaphone, label: 'General' },
  individual:       { icon: User,      label: 'Individual' },
  individualizado:  { icon: UserCheck, label: 'Lista a la carta' },
  grupo:            { icon: Users,     label: 'Un grupo' },
  grupos_limitados: { icon: Layers,    label: 'Varios grupos' },
  categoria:        { icon: Tag,       label: 'Por categoría' },
  edad:             { icon: Calendar,  label: 'Por edad' },
  genero:           { icon: Filter,    label: 'Por género' },
};

// Etiqueta legible para el feed (incluye registros legados que sólo tienen `tipo`)
const labelSegmento = (c) => {
  const cfg = SEGMENTO_CONFIG[c.segmento_tipo];
  if (cfg) return cfg.label;
  const legado = { Anuncio: 'General', Grupal: 'Un grupo', Personalizado: 'Lista a la carta', Individual: 'Individual' };
  return legado[c.tipo] || c.tipo || 'Mensaje';
};
const iconSegmento = (c) => SEGMENTO_CONFIG[c.segmento_tipo]?.icon || Megaphone;

// Superficie de sub-panel de parámetros (CutCard con eyebrow) — reutilizada por
// los 8 criterios para mantener una sola gramática.
const PanelParam = ({ label, children }) => (
  <CutCard cut={10} padding="16px">
    <MicroLabel style={{ marginBottom: 12 }}>{label}</MicroLabel>
    {children}
  </CutCard>
);

// Botón de sub-selección (grupo/categoría/género…): activo = oro, inactivo = neutro.
const subBtnStyle = (on) => ({
  clipPath: cut(7),
  background: on ? TINT.gold : C.card,
  border: `1px solid ${on ? BORDER.goldStrong : BORDER.neutral}`,
  color: on ? C.gold : C.text2,
});

// Campo de texto/número/select del Formulario-HUD (§6.3).
const FIELD_CLASS = 'cut-focus arcade-input min-h-11 md:min-h-9 px-3.5 py-2.5 text-base md:text-sm border border-white/10 focus:outline-none focus:border-brand/60 transition-colors';
const fieldStyle = { clipPath: cut(7), background: C.cardAlt1, color: C.text };

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
    <div className="p-6 md:p-10" style={{ color: C.text }}>
      {/* Header */}
      <header className="mb-8 pb-8" style={{ borderBottom: `1px solid ${BORDER.neutral}` }}>
        <div className="flex items-center gap-3">
          <BotonVolver />
          <HexAvatar size={44} background={GRAD.goldHex} color={C.ink}>
            <MessageSquare size={22} strokeWidth={2.5} />
          </HexAvatar>
          <div>
            <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight" style={{ color: C.text }}>
              Comunica<span style={{ color: C.gold }}>ciones</span>
            </h2>
            <MicroLabel style={{ marginTop: 4 }}>Club · Coach · Familia</MicroLabel>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* PANEL IZQUIERDO: Redactar */}
        <div className="space-y-5">
          <MicroLabel as="h3" size={11}>Nuevo mensaje</MicroLabel>

          {/* Selector de criterio de audiencia */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(SEGMENTO_CONFIG).map(([tipo, cfg]) => {
              const Icon = cfg.icon;
              const on = segmentoTipo === tipo;
              return (
                <button key={tipo} onClick={() => cambiarSegmento(tipo)}
                  className="cut-focus flex flex-col items-center justify-center gap-1 p-3 min-h-[64px] text-2xs font-black uppercase tracking-wider transition-colors"
                  style={subBtnStyle(on)}>
                  <Icon size={16} />
                  <span className="text-center leading-tight">{cfg.label}</span>
                </button>
              );
            })}
          </div>

          {/* Panel de parámetros según el criterio */}
          {segmentoTipo === 'individual' && (
            <PanelParam label="Destinatario">
              <select value={params.atleta_id || ''} onChange={(e) => setParams({ atleta_id: e.target.value })}
                className={`${FIELD_CLASS} w-full appearance-none cursor-pointer`} style={fieldStyle}>
                <option value="">Seleccionar jugador...</option>
                {atletas.map((a) => <option key={a.atleta_id} value={a.atleta_id}>{a.nombre} ({a.categoria})</option>)}
              </select>
            </PanelParam>
          )}

          {segmentoTipo === 'grupo' && (
            <PanelParam label="Grupo destino">
              <div className="flex flex-wrap gap-2">
                {grupos.map((g) => (
                  <button key={g.id} onClick={() => setParams({ grupo_id: g.id })}
                    className="cut-focus flex-1 min-w-[100px] min-h-11 md:min-h-9 p-2.5 text-2xs font-black uppercase transition-colors"
                    style={subBtnStyle(params.grupo_id === g.id)}>
                    {g.nombre}<br /><span className="text-3xs font-normal normal-case" style={{ color: C.text3 }}>{g.horario}</span>
                  </button>
                ))}
              </div>
            </PanelParam>
          )}

          {segmentoTipo === 'grupos_limitados' && (
            <PanelParam label={`Grupos incluidos (${(params.grupo_ids || []).length})`}>
              <div className="flex flex-wrap gap-2">
                {grupos.map((g) => {
                  const on = (params.grupo_ids || []).includes(g.id);
                  return (
                    <button key={g.id} onClick={() => toggleEnArray('grupo_ids', g.id)}
                      className="cut-focus min-h-11 md:min-h-9 p-2.5 text-2xs font-black uppercase transition-colors"
                      style={subBtnStyle(on)}>{g.nombre}</button>
                  );
                })}
              </div>
            </PanelParam>
          )}

          {segmentoTipo === 'categoria' && (
            <PanelParam label={`Categorías (${(params.categorias || []).length})`}>
              <div className="flex flex-wrap gap-2">
                {categorias.map((cat) => {
                  const on = (params.categorias || []).includes(cat);
                  return (
                    <button key={cat} onClick={() => toggleEnArray('categorias', cat)}
                      className="cut-focus min-h-11 md:min-h-9 p-2.5 text-2xs font-black uppercase transition-colors"
                      style={subBtnStyle(on)}>{cat}</button>
                  );
                })}
                {categorias.length === 0 && <span className="text-xs" style={{ color: C.text3 }}>No hay categorías cargadas.</span>}
              </div>
            </PanelParam>
          )}

          {segmentoTipo === 'edad' && (
            <PanelParam label="Rango de edad">
              <div className="flex items-center gap-3">
                <input type="number" inputMode="numeric" min="0" placeholder="Mín" value={params.edad_min ?? ''}
                  onChange={(e) => setParams((p) => ({ ...p, edad_min: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  className={`${FIELD_CLASS} w-24`} style={fieldStyle} />
                <span className="text-xs font-bold" style={{ color: C.text3 }}>a</span>
                <input type="number" inputMode="numeric" min="0" placeholder="Máx" value={params.edad_max ?? ''}
                  onChange={(e) => setParams((p) => ({ ...p, edad_max: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  className={`${FIELD_CLASS} w-24`} style={fieldStyle} />
                <span className="text-xs" style={{ color: C.text3 }}>años</span>
              </div>
            </PanelParam>
          )}

          {segmentoTipo === 'genero' && (
            <PanelParam label="Género">
              <div className="flex gap-2">
                {['Masculino', 'Femenino'].map((gen) => (
                  <button key={gen} onClick={() => setParams({ genero: gen })}
                    className="cut-focus flex-1 min-h-11 md:min-h-9 p-2.5 text-xs font-black uppercase transition-colors"
                    style={subBtnStyle(params.genero === gen)}>{gen}</button>
                ))}
              </div>
            </PanelParam>
          )}

          {segmentoTipo === 'individualizado' && (
            <PanelParam label={`Lista a la carta (${destinatariosCustom.length} seleccionados)`}>
              {destinatariosCustom.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {destinatariosCustom.map((d) => (
                    <span key={d.id} className="flex items-center gap-1.5 px-2.5 py-1.5 text-2xs font-bold" style={{ clipPath: cut(6), background: TINT.gold, border: `1px solid ${BORDER.goldMid}`, color: C.gold }}>
                      <span>{d.nombre}</span>
                      <button aria-label={`Quitar ${d.nombre}`}
                        onClick={() => setDestinatariosCustom((p) => p.filter((x) => x.id !== d.id))}
                        className="cut-focus grid place-items-center min-w-11 min-h-11 -my-2" style={{ color: C.text3 }}>✕</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 px-3" style={{ background: C.cardAlt1, border: `1px solid ${BORDER.neutralSoft}`, clipPath: cut(7) }}>
                <Search size={14} style={{ color: C.text3 }} />
                <input type="text" placeholder="Agregar por nombre..." value={busquedaDest}
                  onChange={(e) => setBusquedaDest(e.target.value)}
                  className="cut-focus arcade-input min-h-11 md:min-h-9 bg-transparent text-base md:text-sm focus:outline-none w-full" style={{ color: C.text }} />
              </div>
              {atletasFiltrados.slice(0, 5).map((a) => (
                <button key={a.id} onClick={() => { setDestinatariosCustom((p) => [...p, a]); setBusquedaDest(''); }}
                  className="cut-focus w-full flex items-center gap-2 px-3 min-h-11 mt-1 hover:bg-white/5 text-left transition-colors">
                  <HexAvatar size={24}>{a.nombre?.charAt(0)}</HexAvatar>
                  <span className="text-xs font-bold" style={{ color: C.text }}>{a.nombre}</span>
                  <MicroLabel style={{ margin: 0 }}>{a.categoria}</MicroLabel>
                </button>
              ))}
            </PanelParam>
          )}

          {/* Toggle representantes + contador de alcance en vivo */}
          <CutCard cut={10} padding="16px">
            <div className="flex items-center justify-between">
              <button onClick={() => setIncluirReps((v) => !v)} aria-pressed={incluirReps}
                className="cut-focus flex items-center gap-2 min-h-11 text-xs font-bold transition-colors" style={{ color: C.text2 }}>
                <span className="p-0.5 transition-colors" style={{ width: 36, height: 20, borderRadius: 999, background: incluirReps ? BORDER.okStrong : BORDER.neutralSoft }}>
                  <span className="block transition-transform" style={{ width: 16, height: 16, borderRadius: 999, background: C.text, transform: incluirReps ? 'translateX(16px)' : 'none' }} />
                </span>
                <span className="flex items-center gap-1"><UsersRound size={13} /><span>Incluir representantes</span></span>
              </button>
              <div className="text-right">
                <p className="leading-none" style={{ fontSize: 24, fontWeight: 900, color: C.gold }}>{alcance.atletas}</p>
                <MicroLabel style={{ marginTop: 2 }}>atletas{incluirReps ? ' + repres.' : ''}</MicroLabel>
              </div>
            </div>
          </CutCard>

          {/* Título y Mensaje */}
          <input type="text" placeholder="Título del mensaje (opcional)"
            value={titulo} onChange={(e) => setTitulo(e.target.value)}
            className={`${FIELD_CLASS} w-full`} style={fieldStyle} />
          <textarea rows={4} placeholder="Escribe el mensaje..."
            value={mensaje} onChange={(e) => setMensaje(e.target.value)}
            className={`${FIELD_CLASS} w-full resize-none`} style={fieldStyle} />

          <button onClick={handleEnviar} disabled={saving || !puedeEnviar}
            className={`cut-focus w-full flex items-center justify-center gap-2 min-h-11 py-3.5 font-black uppercase tracking-widest text-sm transition active:scale-[0.99] ${saved ? '' : 'disabled:opacity-40'}`}
            style={saved
              ? { clipPath: cut(10), background: TINT.ok, border: `1px solid ${BORDER.okStrong}`, color: C.ok }
              : { clipPath: cut(10), background: GRAD.goldCTA, color: C.ink, border: 'none' }}>
            {saving ? <span className="animate-pulse">Enviando...</span>
              : saved ? <><CheckCircle2 size={16} /><span>¡Mensaje enviado!</span></>
              : <><Send size={16} /><span>Registrar mensaje</span></>}
          </button>
        </div>

        {/* PANEL DERECHO: Feed de mensajes */}
        <div>
          <MicroLabel as="h3" size={11} style={{ marginBottom: 16 }}>Feed reciente</MicroLabel>
          {errorCarga && (
            <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 p-4" style={{ clipPath: cut(10), background: TINT.danger, border: `1px solid ${BORDER.danger}` }}>
              <AlertTriangle size={18} className="shrink-0" style={{ color: C.danger }} />
              <p className="flex-1 min-w-[180px] text-xs font-bold" style={{ color: C.danger }}>
                No se pudo cargar el feed. Esto no significa que esté vacío — puede ser un problema de conexión.
              </p>
              <button
                type="button"
                onClick={load}
                className="cut-focus inline-flex items-center min-h-11 md:min-h-9 px-3.5 text-2xs font-black uppercase tracking-widest transition-colors"
                style={{ clipPath: cut(7), background: TINT.danger, border: `1px solid ${BORDER.danger}`, color: C.danger }}
              >
                Reintentar
              </button>
            </div>
          )}
          <div className="space-y-3 lg:max-h-[70vh] lg:overflow-y-auto overscroll-contain lg:pr-1">
            {!errorCarga && comunicaciones.length === 0 && (
              <div className="text-center py-16" style={{ color: C.text3 }}>
                <MessageSquare size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-bold">No hay mensajes aún</p>
              </div>
            )}
            {comunicaciones.map((c) => {
              const Icon = iconSegmento(c);
              return (
                <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <CutCard cut={10} padding="16px">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 px-2 py-1 text-3xs font-black uppercase" style={{ clipPath: cut(5), background: C.cardAlt1, border: `1px solid ${BORDER.neutral}`, color: C.text2 }}>
                        <Icon size={10} />
                        <span>{labelSegmento(c)}</span>
                        {c.grupos_entrenamiento && <span>· {c.grupos_entrenamiento.nombre}</span>}
                      </div>
                      <MicroLabel style={{ margin: 0 }}>{new Date(c.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })}</MicroLabel>
                    </div>
                    {c.titulo && <p className="text-sm font-black mb-1" style={{ color: C.text }}>{c.titulo}</p>}
                    <p className="text-xs leading-relaxed" style={{ color: C.text2 }}>{c.mensaje}</p>
                    <div className="mt-3 pt-3 flex justify-end" style={{ borderTop: `1px solid ${BORDER.neutral}` }}>
                      <button onClick={() => abrirWA(c)}
                        className="cut-focus flex items-center gap-1.5 px-3 min-h-11 text-xs font-bold transition-colors"
                        style={{ clipPath: cut(7), border: `1px solid ${BORDER.ok}`, color: C.whatsapp }}>
                        <MessageSquare size={13} />
                        <span>Abrir en WhatsApp</span>
                      </button>
                    </div>
                  </CutCard>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
