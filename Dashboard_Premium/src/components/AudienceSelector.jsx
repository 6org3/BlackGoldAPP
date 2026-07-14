import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Megaphone, Users, User, UserCheck, Layers, Tag, Calendar, Filter,
  Search, UsersRound,
} from 'lucide-react';
import { resolverAudienciaLocal, fetchMembresiaGrupos } from '../api/comunicacionesService';
import { fetchGrupos } from '../api/sesionesService';
import CutCard from './arcade/CutCard';
import HexAvatar from './arcade/HexAvatar';
import MicroLabel from './arcade/MicroLabel';
import { C, BORDER, TINT, cut } from './arcade/arcadeTokens';

// Catálogo de los 8 criterios de segmentación (compartido). En el idioma Arcade
// el segmento activo se distingue por acento oro único + icono (§7.4), no por un
// color por criterio (antes: paleta cruda pink/teal/cyan).
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

// Superficie de sub-panel de parámetros (CutCard con eyebrow).
const PanelParam = ({ label, children }) => (
  <CutCard cut={10} padding="16px">
    <MicroLabel style={{ marginBottom: 12 }}>{label}</MicroLabel>
    {children}
  </CutCard>
);

// Botón de sub-selección: activo = oro, inactivo = neutro.
const subBtnStyle = (on) => ({
  clipPath: cut(7),
  background: on ? TINT.gold : C.card,
  border: `1px solid ${on ? BORDER.goldStrong : BORDER.neutral}`,
  color: on ? C.gold : C.text2,
});

// Campo del Formulario-HUD (§6.3).
const FIELD_CLASS = 'cut-focus arcade-input min-h-11 md:min-h-9 px-3.5 py-2.5 text-base md:text-sm border border-white/10 focus:outline-none focus:border-brand/60 transition-colors';
const fieldStyle = { clipPath: cut(7), background: C.cardAlt1, color: C.text };

/**
 * Selector de audiencia reutilizable. Maneja su propio estado y notifica al
 * padre vía onChange({ segmento_tipo, segmento_params, incluir_representantes, seleccion }).
 */
export default function AudienceSelector({ atletas = [], club = null, onChange }) {
  const [grupos, setGrupos] = useState([]);
  const [gruposByAtleta, setGruposByAtleta] = useState({});

  const [segmentoTipo, setSegmentoTipo] = useState('general');
  const [params, setParams] = useState({});
  const [incluirReps, setIncluirReps] = useState(true);
  const [destinatariosCustom, setDestinatariosCustom] = useState([]);
  const [busquedaDest, setBusquedaDest] = useState('');

  useEffect(() => {
    (async () => {
      const [g, m] = await Promise.all([fetchGrupos(club), fetchMembresiaGrupos()]);
      setGrupos(g);
      setGruposByAtleta(m);
    })();
  }, [club]);

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
          const on = segmentoTipo === tipo;
          return (
            <button key={tipo} type="button" onClick={() => cambiarSegmento(tipo)}
              className="cut-focus flex flex-col items-center justify-center gap-1 p-3 min-h-[64px] text-2xs font-black uppercase tracking-wider transition-colors"
              style={subBtnStyle(on)}>
              <Icon size={16} />
              <span className="text-center leading-tight">{cfg.label}</span>
            </button>
          );
        })}
      </div>

      {/* Paneles de parámetros */}
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
              <button key={g.id} type="button" onClick={() => setParams({ grupo_id: g.id })}
                className="cut-focus flex-1 min-w-[100px] min-h-11 md:min-h-9 p-2.5 text-2xs font-black uppercase transition-colors"
                style={subBtnStyle(params.grupo_id === g.id)}>{g.nombre}</button>
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
                <button key={g.id} type="button" onClick={() => toggleEnArray('grupo_ids', g.id)}
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
                <button key={cat} type="button" onClick={() => toggleEnArray('categorias', cat)}
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
              <button key={gen} type="button" onClick={() => setParams({ genero: gen })}
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
                  <button type="button" aria-label={`Quitar ${d.nombre}`}
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
            <button key={a.id} type="button" onClick={() => { setDestinatariosCustom((p) => [...p, a]); setBusquedaDest(''); }}
              className="cut-focus w-full flex items-center gap-2 px-3 min-h-11 mt-1 hover:bg-white/5 text-left transition-colors">
              <HexAvatar size={24}>{a.nombre?.charAt(0)}</HexAvatar>
              <span className="text-xs font-bold" style={{ color: C.text }}>{a.nombre}</span>
              <MicroLabel style={{ margin: 0 }}>{a.categoria}</MicroLabel>
            </button>
          ))}
        </PanelParam>
      )}

      {/* Toggle representantes + contador de alcance */}
      <CutCard cut={10} padding="16px">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setIncluirReps((v) => !v)} aria-pressed={incluirReps}
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
    </div>
  );
}
