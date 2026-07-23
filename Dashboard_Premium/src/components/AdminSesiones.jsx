import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ClipboardList, Users, User, Calendar,
  CheckCircle2, AlertCircle, XCircle, Search, Plus,
  MessageSquare, Dumbbell, Brain, Activity, Shield, Zap,
  Clock, ChevronRight, AlertTriangle
} from 'lucide-react';
import {
  fetchGrupos, fetchEjercicios,
  crearSesionControl, evaluarSesion, fetchSesionesControl,
  crearPlantilla, fetchPruebasEvaluacion, programarEvaluacionGrupal
} from '../api/sesionesService';
import { labelSubPilar } from '../../../packages/analytics-core/taxonomia.js';
import { generarMensajeSesion, generarLinkWhatsApp } from '../api/comunicacionesService';
import { filtrarEjerciciosPorTipoYNivel, resolverNombresEjercicios } from '../lib/ejerciciosCatalogo';
import { NIVEL_BADGE } from './AdminAtletasConstants';
import { NIVELES_GRUPO } from '../api/gruposService';
import CutCard from './arcade/CutCard';
import HexAvatar from './arcade/HexAvatar';
import BotonVolver from './arcade/BotonVolver';
import MicroLabel from './arcade/MicroLabel';
import ModalHUD from './arcade/ModalHUD';
import { C, BORDER, GRAD, TINT, cut } from './arcade/arcadeTokens';

const TIPOS = ['Técnico', 'Físico', 'Táctico', 'Evaluación', 'Recuperación'];

// Icono + color Arcade por tipo de objetivo. Antes eran clases semánticas DS v1
// (info/caution/mental/brand/success); aquí componen con las constantes C.* del HUD.
const TIPO_META = {
  'Técnico':      { icon: Brain,    c: C.info },
  'Físico':       { icon: Dumbbell, c: C.warn },
  'Táctico':      { icon: Shield,   c: C.ai },
  'Evaluación':   { icon: Activity, c: C.gold },
  'Recuperación': { icon: Zap,      c: C.ok },
};

// Resultado de la evaluación → color semántico Arcade (antes "Parcial" usaba yellow crudo).
const LOGRO_META = {
  'Sí':      { c: C.ok,     tint: TINT.ok,     icon: CheckCircle2 },
  'Parcial': { c: C.warn,   tint: TINT.warn,   icon: AlertCircle },
  'No':      { c: C.danger, tint: TINT.danger, icon: XCircle },
};

// Mapeo TIPOS (eje "qué clase de actividad") → objetivo canónico de taxonomia.js
// para las plantillas. Evaluación/Recuperación son formatos de sesión, no pilares
// (decisión #4 de la unificación) → quedan sin objetivo canónico.
const TIPO_A_OBJETIVO = {
  'Técnico':      { pilar: 'tecnico', sub_pilar: null },
  'Físico':       { pilar: 'fisico',  sub_pilar: null },
  'Táctico':      { pilar: 'mental',  sub_pilar: 'tactica' },
  'Evaluación':   { pilar: null,      sub_pilar: null },
  'Recuperación': { pilar: null,      sub_pilar: null },
};

// Caja de control (fecha/buscador): superficie cut(7).
const boxStyle = { clipPath: cut(7), background: C.cardAlt1, border: `1px solid ${BORDER.neutralSoft}` };
// Input arcade sobre superficie cortada (select/number/textarea del formulario).
const fieldStyle = { clipPath: cut(6), background: C.cardAlt1, border: `1px solid ${BORDER.neutralSoft}`, color: C.text };

function getTodayStr() { return new Date().toISOString().split('T')[0]; }

export default function AdminSesiones({ user, atletas = [] }) {
  const club = user?.club;
  const [modo, setModo] = useState('Grupal'); // 'Grupal' | 'Individual'
  const [grupos, setGrupos] = useState([]);
  const [ejerciciosCatalogo, setEjerciciosCatalogo] = useState([]);
  const [pruebasCatalogo, setPruebasCatalogo] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [evaluandoId, setEvaluandoId] = useState(null);
  const [evalData, setEvalData] = useState({ se_logro: 'Sí', notas: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busquedaAtleta, setBusquedaAtleta] = useState('');
  const [atletaSeleccionado, setAtletaSeleccionado] = useState(null);
  const [errorCarga, setErrorCarga] = useState(false);
  // Diálogo HUD activo (reemplaza window.prompt/alert): null | { variant, tone, ... }.
  const [modal, setModal] = useState(null);
  // Ids de ejercicios con la descripción expandida (toggle "Ver más"/"Ver menos").
  const [expandidos, setExpandidos] = useState(() => new Set());

  // Form state
  const [form, setForm] = useState({
    grupoId: '',
    fecha: getTodayStr(),
    objetivoTipo: 'Técnico',
    objetivoDesc: '',
    ejerciciosIds: [],
    pruebasIds: [],
    ejerciciosNotas: '',
    esPagoExtra: false,
    montoExtra: 0,
    tipoPagoExtra: 'Mensual'
  });

  const load = useCallback(async () => {
    try {
      const [g, e, p, h] = await Promise.all([
        fetchGrupos(club),
        fetchEjercicios(),
        fetchPruebasEvaluacion(),
        fetchSesionesControl({ limit: 15 }),
      ]);
      setGrupos(g);
      setEjerciciosCatalogo(e);
      setPruebasCatalogo(p);
      setHistorial(h);
      if (g.length > 0) setForm(f => ({ ...f, grupoId: g[0].id }));
      setErrorCarga(false);
    } catch (e) {
      console.error('Error cargando sesiones:', e);
      setErrorCarga(true);
    }
  }, [club]);

  useEffect(() => { load(); }, [load]);

  // Ejercicios filtrados por tipo y nivel del grupo actual (ver semántica en
  // filtrarEjerciciosPorTipoYNivel, src/lib/ejerciciosCatalogo.js).
  const grupoActual = grupos.find(g => g.id === form.grupoId);
  const ejerciciosFiltrados = filtrarEjerciciosPorTipoYNivel(ejerciciosCatalogo, form.objetivoTipo, grupoActual);

  const toggleEjercicio = (id) => {
    setForm(f => ({
      ...f,
      ejerciciosIds: f.ejerciciosIds.includes(id)
        ? f.ejerciciosIds.filter(x => x !== id)
        : [...f.ejerciciosIds, id]
    }));
  };

  const togglePrueba = (id) => {
    setForm(f => ({
      ...f,
      pruebasIds: f.pruebasIds.includes(id)
        ? f.pruebasIds.filter(x => x !== id)
        : [...f.pruebasIds, id]
    }));
  };

  const toggleExpandido = (id) => {
    setExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const esEvaluacion = form.objetivoTipo === 'Evaluación';

  const atletasFiltrados = atletas.filter(a =>
    busquedaAtleta && a.nombre?.toLowerCase().includes(busquedaAtleta.toLowerCase())
  );

  const handleGuardar = async () => {
    if (!form.objetivoDesc.trim()) return;
    if (esEvaluacion && form.pruebasIds.length === 0) {
      setModal({
        variant: 'alert', tone: 'warn', icon: AlertTriangle,
        eyebrow: 'Falta un dato',
        title: 'Sin pruebas seleccionadas',
        message: 'Una sesión de Evaluación necesita al menos una prueba seleccionada.',
      });
      return;
    }
    setSaving(true);
    try {
      await crearSesionControl({
        tipo: modo,
        grupo_id: modo.startsWith('Grupal') ? form.grupoId : null,
        atleta_id: modo === 'Privada 1v1' ? atletaSeleccionado?.atleta_id : null,
        coach_id: user.id,
        fecha: form.fecha,
        objetivo_tipo: form.objetivoTipo,
        objetivo_descripcion: form.objetivoDesc,
        ejercicios_ids: form.ejerciciosIds,
        ejercicios_notas: form.ejerciciosNotas,
        es_pago_extra: (modo === 'Privada 1v1' || modo === 'Grupal Individualizada') ? form.esPagoExtra : false,
        monto_extra: form.esPagoExtra ? form.montoExtra : 0,
      });

      // Evaluación (P3b): además del registro, se crea la sesión EJECUTABLE con sus
      // pruebas — el Modo Cancha la mostrará el día de la fecha para pasar lista y
      // capturar los resultados del grupo por estaciones.
      if (esEvaluacion) {
        await programarEvaluacionGrupal({
          coach_id: user.id,
          fecha: form.fecha,
          grupo_id: modo.startsWith('Grupal') ? form.grupoId : null,
          atleta_id: modo === 'Privada 1v1' ? atletaSeleccionado?.atleta_id : null,
          pruebas_ids: form.pruebasIds,
        });
      }

      setSaved(true);
      setForm(f => ({ ...f, objetivoDesc: '', ejerciciosIds: [], pruebasIds: [], ejerciciosNotas: '' }));
      const h = await fetchSesionesControl({ limit: 15 });
      setHistorial(h);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleEvaluar = async (sesionId) => {
    await evaluarSesion(sesionId, { se_logro: evalData.se_logro, notas_evaluacion: evalData.notas });
    setEvaluandoId(null);
    try {
      const h = await fetchSesionesControl({ limit: 15 });
      setHistorial(h);
    } catch (e) {
      // La evaluación ya se guardó; si el refresh del historial falla, no
      // hace falta bloquear el flujo — el próximo load() lo recupera.
      console.error('Error refrescando historial tras evaluar:', e);
    }
  };

  // Guarda el formulario actual como plantilla reutilizable (catalogo_sesiones):
  // aparece en el paso "Objetivo de la Sesión" del Modo Cancha. El nombre se pide
  // con un prompt HUD (antes window.prompt) y el resultado se informa con un alert HUD.
  const guardarPlantilla = async (titulo) => {
    const nombre = (titulo || '').trim();
    if (!nombre) return;
    setModal(null);
    setSaving(true);
    try {
      const objetivo = TIPO_A_OBJETIVO[form.objetivoTipo] || { pilar: null, sub_pilar: null };
      await crearPlantilla({
        titulo: nombre,
        enfoque_principal: form.objetivoTipo,
        descripcion: form.objetivoDesc.trim() || null,
        pilar: objetivo.pilar,
        sub_pilar: objetivo.sub_pilar,
        tipo_clase: modo,
        ejercicios_ids: form.ejerciciosIds,
        creado_por: user.id,
        // La RLS de catalogo_sesiones exige club_id = club del usuario para owner/coach.
        club: user.club,
      });
      setModal({
        variant: 'alert', tone: 'ok', icon: CheckCircle2,
        eyebrow: 'Listo',
        title: 'Plantilla guardada',
        message: `"${nombre}" ya está disponible en el Modo Cancha.`,
      });
    } catch (e) {
      console.error(e);
      setModal({
        variant: 'alert', tone: 'danger', icon: AlertTriangle,
        eyebrow: 'Error',
        title: 'No se pudo guardar la plantilla',
        message: e.message || 'Error desconocido.',
      });
    }
    setSaving(false);
  };

  const pedirNombrePlantilla = () => {
    if (!form.objetivoDesc.trim()) return;
    setModal({
      variant: 'prompt', tone: 'gold', icon: ClipboardList,
      eyebrow: 'Modo Cancha',
      title: 'Guardar como plantilla',
      message: 'La plantilla aparecerá en el paso "Objetivo de la Sesión" del Modo Cancha.',
      defaultValue: form.objetivoDesc.trim().slice(0, 60),
      placeholder: 'Nombre de la plantilla',
      confirmLabel: 'Guardar plantilla',
      onConfirm: guardarPlantilla,
    });
  };

  const abrirWA = (sesion) => {
    const grupoNombre = sesion.grupos_entrenamiento?.nombre || 'Individual';
    // Huérfanos (ejercicio eliminado del catálogo) quedan fuera del mensaje al padre.
    const drillNombres = resolverNombresEjercicios(sesion.ejercicios_ids, ejerciciosCatalogo)
      .map(d => d.nombre)
      .filter(Boolean);
    const msg = generarMensajeSesion(grupoNombre, sesion.objetivo_descripcion, sesion.se_logro || 'Pendiente', sesion.notas_evaluacion, drillNombres);
    window.open(generarLinkWhatsApp('', msg), '_blank');
  };

  return (
    <div className="p-6 md:p-10" style={{ color: C.text }}>
      {/* Header */}
      <header className="mb-6 md:mb-8 pb-4 md:pb-8" style={{ borderBottom: `1px solid ${BORDER.neutral}` }}>
        <div className="flex items-center gap-3">
          <BotonVolver />
          <HexAvatar size={44} background={GRAD.goldHex} color={C.ink}>
            <ClipboardList size={22} strokeWidth={2.5} />
          </HexAvatar>
          <div>
            <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight" style={{ color: C.text }}>
              Control de <span style={{ color: C.gold }}>Sesiones</span>
            </h2>
            <MicroLabel style={{ marginTop: 4 }}>Registro · Evaluación · Seguimiento</MicroLabel>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* PANEL IZQUIERDO: Formulario */}
        <div className="space-y-5">
          {/* Toggle Tipos de Sesión */}
          <div className="flex flex-wrap items-center gap-1 p-1 w-fit" style={{ clipPath: cut(8), background: C.cardAlt1, border: `1px solid ${BORDER.neutralSoft}` }}>
            {['Grupal (Niveles)', 'Grupal Individualizada', 'Privada 1v1'].map(m => {
              const activo = modo === m;
              return (
                <button
                  key={m}
                  onClick={() => setModo(m)}
                  aria-pressed={activo}
                  className="cut-focus flex items-center gap-2 px-4 min-h-11 text-xs font-black uppercase tracking-widest transition-colors"
                  style={{
                    clipPath: cut(6),
                    background: activo ? GRAD.goldCTA : 'transparent',
                    color: activo ? C.ink : C.text3,
                  }}
                >
                  {m === 'Privada 1v1' ? <User size={14} /> : <Users size={14} />}
                  <span>{m}</span>
                </button>
              );
            })}
          </div>

          {/* Selector de Grupo o Atleta */}
          {modo.startsWith('Grupal') ? (
            <CutCard cut={12} padding="20px">
              <MicroLabel style={{ marginBottom: 12 }}>
                {modo === 'Grupal Individualizada' ? 'Grupo de Entrenamiento (Máx 10)' : 'Grupo de Entrenamiento'}
              </MicroLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {grupos.map(g => {
                  const activo = form.grupoId === g.id;
                  return (
                    <button key={g.id} onClick={() => setForm({ ...form, grupoId: g.id })}
                      aria-pressed={activo}
                      className="cut-focus p-3 min-h-11 text-xs font-bold uppercase tracking-widest truncate transition-colors"
                      style={{
                        clipPath: cut(6),
                        background: activo ? TINT.gold : 'transparent',
                        border: `1px solid ${activo ? BORDER.goldStrong : BORDER.neutralSoft}`,
                        color: activo ? C.gold : C.text3,
                      }}>
                      {g.nombre}
                    </button>
                  );
                })}
              </div>

              {modo === 'Grupal Individualizada' && (
                <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${BORDER.neutralFaint}` }}>
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input type="checkbox" checked={form.esPagoExtra} onChange={e => setForm(f => ({ ...f, esPagoExtra: e.target.checked }))}
                      className="cut-focus accent-brand" />
                    <span className="text-2xs font-bold uppercase tracking-widest" style={{ color: C.text2 }}>Suscripción / Costo Adicional</span>
                  </label>
                  {form.esPagoExtra && (
                    <div className="flex gap-2">
                      <select value={form.tipoPagoExtra} onChange={e => setForm(f => ({ ...f, tipoPagoExtra: e.target.value }))}
                        className="cut-focus arcade-input min-h-11 md:min-h-9 px-3 text-base md:text-sm font-bold focus:outline-none" style={fieldStyle}>
                        <option value="Mensual">Mensual</option>
                        <option value="Por Sesión">Por Sesión</option>
                      </select>
                      <input type="number" inputMode="decimal" placeholder="Monto $" value={form.montoExtra}
                        onChange={e => setForm(f => ({ ...f, montoExtra: parseFloat(e.target.value) || 0 }))}
                        className="cut-focus arcade-input flex-1 min-h-11 md:min-h-9 px-3 text-base md:text-sm font-bold focus:outline-none" style={fieldStyle} />
                    </div>
                  )}
                </div>
              )}
            </CutCard>
          ) : (
            <CutCard cut={12} padding="20px">
              <MicroLabel style={{ marginBottom: 12 }}>Jugador</MicroLabel>
              <div className="flex items-center gap-2 px-3 mb-3" style={boxStyle}>
                <Search size={13} style={{ color: C.text3 }} />
                <input
                  type="text"
                  placeholder="Buscar jugador..."
                  value={busquedaAtleta}
                  onChange={e => setBusquedaAtleta(e.target.value)}
                  className="cut-focus arcade-input bg-transparent min-h-11 md:min-h-9 text-base md:text-sm font-bold focus:outline-none w-full"
                  style={{ color: C.text }}
                />
              </div>
              {atletaSeleccionado && (
                <div className="flex items-center gap-3 px-4 py-2.5 mb-2" style={{ clipPath: cut(7), background: TINT.gold, border: `1px solid ${BORDER.goldMid}` }}>
                  <HexAvatar size={32} background={GRAD.goldHex} color={C.ink}>{atletaSeleccionado.nombre?.charAt(0)}</HexAvatar>
                  <div>
                    <p className="text-sm font-black" style={{ color: C.gold }}>{atletaSeleccionado.nombre}</p>
                    <MicroLabel style={{ margin: 0 }}>{atletaSeleccionado.categoria}</MicroLabel>
                  </div>
                  <button onClick={() => setAtletaSeleccionado(null)} aria-label="Quitar jugador"
                    className="cut-focus ml-auto p-2 -m-1 transition-colors" style={{ color: C.text3 }}><XCircle size={14} /></button>
                </div>
              )}
              {busquedaAtleta && !atletaSeleccionado && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {atletasFiltrados.map(a => (
                    <button key={a.id} onClick={() => { setAtletaSeleccionado(a); setBusquedaAtleta(''); }}
                      className="cut-focus w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[0.03]" style={{ clipPath: cut(5) }}>
                      <HexAvatar size={28}>{a.nombre?.charAt(0)}</HexAvatar>
                      <div>
                        <p className="text-xs font-bold" style={{ color: C.text }}>{a.nombre}</p>
                        <MicroLabel style={{ margin: 0 }}>{a.categoria}</MicroLabel>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {/* Sesión individual: pago extra */}
              <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${BORDER.neutralFaint}` }}>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.esPagoExtra} onChange={e => setForm(f => ({ ...f, esPagoExtra: e.target.checked }))}
                    className="cut-focus accent-brand" />
                  <span className="text-2xs font-bold uppercase tracking-widest" style={{ color: C.text2 }}>Sesión con costo adicional</span>
                </label>
                {form.esPagoExtra && (
                  <input type="number" inputMode="decimal" placeholder="Monto $" value={form.montoExtra}
                    onChange={e => setForm(f => ({ ...f, montoExtra: parseFloat(e.target.value) || 0 }))}
                    className="cut-focus arcade-input mt-2 w-full min-h-11 md:min-h-9 px-3 text-base md:text-sm font-bold focus:outline-none" style={fieldStyle} />
                )}
              </div>
            </CutCard>
          )}

          {/* Fecha */}
          <div className="flex items-center gap-2 px-4" style={boxStyle}>
            <Calendar size={14} style={{ color: C.gold }} />
            <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
              className="cut-focus arcade-input bg-transparent min-h-11 md:min-h-9 text-base md:text-sm font-bold focus:outline-none cursor-pointer" style={{ color: C.text }} />
          </div>

          {/* Tipo de Objetivo */}
          <CutCard cut={12} padding="20px">
            <MicroLabel style={{ marginBottom: 12 }}>Tipo de Objetivo</MicroLabel>
            <div className="flex flex-wrap gap-2">
              {TIPOS.map(t => {
                const { icon: Icon, c } = TIPO_META[t];
                const activo = form.objetivoTipo === t;
                return (
                  <button key={t} onClick={() => setForm(f => ({ ...f, objetivoTipo: t, ejerciciosIds: [] }))}
                    aria-pressed={activo}
                    className="cut-focus flex items-center gap-1.5 min-h-11 md:min-h-9 px-3.5 text-2xs font-black uppercase tracking-widest transition-colors"
                    style={{
                      clipPath: cut(5),
                      background: activo ? C.cardAlt1 : 'transparent',
                      border: `1px solid ${activo ? c : BORDER.neutralSoft}`,
                      color: activo ? c : C.text3,
                    }}>
                    <Icon size={12} />
                    <span>{t}</span>
                  </button>
                );
              })}
            </div>
          </CutCard>

          {/* Selector de Pruebas (tipo Evaluación, P3b): programa la sesión ejecutable */}
          {esEvaluacion && (
            <CutCard cut={12} padding="20px" border={BORDER.goldMid}>
              <MicroLabel color={C.gold} style={{ marginBottom: 12 }}>
                Pruebas de evaluación ({form.pruebasIds.length} seleccionadas)
              </MicroLabel>
              <p className="text-2xs mb-3" style={{ color: C.text3 }}>
                El día {form.fecha} esta evaluación aparecerá en el Modo Cancha para pasar lista y capturar los resultados del grupo.
              </p>
              <div className="space-y-1.5 max-h-64 md:max-h-48 overflow-y-auto overscroll-contain pr-1">
                {pruebasCatalogo.length === 0 && (
                  <p className="text-xs italic" style={{ color: C.text4 }}>No hay pruebas en el catálogo de evaluación.</p>
                )}
                {pruebasCatalogo.map(p => {
                  const sel = form.pruebasIds.includes(p.id);
                  return (
                    <button key={p.id} onClick={() => togglePrueba(p.id)}
                      aria-pressed={sel}
                      className="cut-focus w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
                      style={{
                        clipPath: cut(5),
                        background: sel ? TINT.gold : 'transparent',
                        border: `1px solid ${sel ? BORDER.goldStrong : BORDER.neutralFaint}`,
                        opacity: sel ? 1 : 0.8,
                      }}>
                      <span className="flex items-center justify-center flex-shrink-0"
                        style={{ width: 16, height: 16, borderRadius: 9999, border: `1px solid ${sel ? C.gold : BORDER.neutralSoft}`, background: sel ? C.gold : 'transparent' }}>
                        {sel && <span style={{ width: 8, height: 8, borderRadius: 9999, background: C.ink }} />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold" style={{ color: C.text }}>{p.nombre}</p>
                        <MicroLabel style={{ margin: 0 }}>{labelSubPilar(p.sub_pilar)} · {p.unidad}</MicroLabel>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CutCard>
          )}

          {/* Selector de Ejercicios (tipos de entrenamiento) */}
          {!esEvaluacion && (
          <CutCard cut={12} padding="20px">
            <MicroLabel style={{ marginBottom: 12 }}>
              Ejercicios ({ejerciciosFiltrados.length} disponibles)
            </MicroLabel>
            <div className="space-y-1.5 max-h-64 md:max-h-48 overflow-y-auto overscroll-contain pr-1">
              {ejerciciosFiltrados.length === 0 && (
                <p className="text-xs italic" style={{ color: C.text4 }}>No hay ejercicios para este tipo en este grupo.</p>
              )}
              {ejerciciosFiltrados.map(ej => {
                const sel = form.ejerciciosIds.includes(ej.id);
                const c = TIPO_META[form.objetivoTipo].c;
                const expandido = expandidos.has(ej.id);
                const descripcion = ej.descripcion?.trim();
                const nivelesBadge = (ej.grupos_recomendados || []).filter(n => NIVELES_GRUPO.includes(n));
                return (
                  <button key={ej.id} onClick={() => toggleEjercicio(ej.id)}
                    aria-pressed={sel}
                    className="cut-focus w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
                    style={{
                      clipPath: cut(5),
                      background: sel ? C.cardAlt1 : 'transparent',
                      border: `1px solid ${sel ? c : BORDER.neutralFaint}`,
                      opacity: sel ? 1 : 0.8,
                    }}>
                    <span className="flex items-center justify-center flex-shrink-0"
                      style={{ width: 16, height: 16, borderRadius: 9999, border: `1px solid ${sel ? c : BORDER.neutralSoft}`, background: sel ? c : 'transparent' }}>
                      {sel && <span style={{ width: 8, height: 8, borderRadius: 9999, background: C.ink }} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold" style={{ color: C.text }}>{ej.nombre}</p>
                      {nivelesBadge.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {nivelesBadge.map(n => {
                            const badge = NIVEL_BADGE[n];
                            return (
                              <span key={n} className="text-3xs font-bold uppercase tracking-widest px-2 py-0.5"
                                style={{ clipPath: cut(4), border: `1px solid ${badge.c}`, background: badge.tint, color: badge.c }}>
                                {badge.icon} {n}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <p className={`text-3xs mt-1 ${expandido ? '' : 'line-clamp-2'}`} style={{ color: C.text3 }}>
                        {descripcion || 'Sin descripción.'}
                      </p>
                      {descripcion && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); toggleExpandido(ej.id); }}
                          className="cut-focus mt-0.5 text-3xs font-bold transition-colors" style={{ color: C.gold }}>
                          {expandido ? 'Ver menos' : 'Ver más'}
                        </button>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {form.ejerciciosIds.length > 0 && (
              <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${BORDER.neutralFaint}` }}>
                <p className="text-3xs font-bold" style={{ color: C.gold }}>{form.ejerciciosIds.length} ejercicio(s) seleccionado(s)</p>
                <textarea placeholder="Notas adicionales sobre los ejercicios..."
                  value={form.ejerciciosNotas} onChange={e => setForm(f => ({ ...f, ejerciciosNotas: e.target.value }))}
                  rows={2} className="cut-focus arcade-input mt-2 w-full px-3 py-2 text-base md:text-sm focus:outline-none resize-none" style={fieldStyle} />
              </div>
            )}
          </CutCard>
          )}

          {/* Objetivo (texto libre) */}
          <div>
            <MicroLabel style={{ marginBottom: 8 }}>Objetivo de la Sesión</MicroLabel>
            <textarea
              placeholder="Describe el objetivo principal de hoy..."
              value={form.objetivoDesc}
              onChange={e => setForm(f => ({ ...f, objetivoDesc: e.target.value }))}
              rows={3}
              className="cut-focus arcade-input w-full px-4 py-3 text-base md:text-sm focus:outline-none resize-none"
              style={{ clipPath: cut(8), background: C.cardAlt1, border: `1px solid ${BORDER.neutralSoft}`, color: C.text }}
            />
          </div>

          {/* Botón Registrar */}
          <button onClick={handleGuardar} disabled={saving || !form.objetivoDesc.trim() || (modo === 'Privada 1v1' && !atletaSeleccionado)}
            className={`cut-focus w-full flex items-center justify-center gap-2 min-h-11 py-4 font-black uppercase tracking-widest text-sm transition ${saved ? '' : 'disabled:opacity-40 disabled:cursor-not-allowed'}`}
            style={saved
              ? { clipPath: cut(8), background: TINT.ok, border: `1px solid ${BORDER.okStrong}`, color: C.ok }
              : { clipPath: cut(8), background: GRAD.goldCTA, border: 'none', color: C.ink }}>
            {saving ? <span className="animate-pulse">Registrando...</span>
              : saved ? <><CheckCircle2 size={16} /><span>¡Sesión Registrada!</span></>
              : <><Plus size={16} /><span>Registrar Sesión</span></>}
          </button>

          {/* Guardar como plantilla (biblioteca del Modo Cancha) */}
          <button onClick={pedirNombrePlantilla} disabled={saving || !form.objetivoDesc.trim()}
            className="cut-focus w-full flex items-center justify-center gap-2 min-h-11 py-3 font-bold uppercase tracking-widest text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ clipPath: cut(7), background: 'transparent', border: `1px solid ${BORDER.neutralSoft}`, color: C.text2 }}>
            <ClipboardList size={14} />
            <span>Guardar como plantilla del Modo Cancha</span>
          </button>
        </div>

        {/* PANEL DERECHO: Historial */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <MicroLabel as="h3" size={11} color={C.text} tracking=".08em" style={{ margin: 0 }}>Historial Reciente</MicroLabel>
            <span className="text-3xs font-bold" style={{ color: C.text3 }}>{historial.length} sesiones</span>
          </div>
          {errorCarga && (
            <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 p-4" style={{ clipPath: cut(10), background: TINT.danger, border: `1px solid ${BORDER.danger}` }}>
              <AlertTriangle size={18} className="shrink-0" style={{ color: C.danger }} />
              <p className="flex-1 min-w-[180px] text-xs font-bold" style={{ color: C.danger }}>
                No se pudo cargar el historial. Esto no significa que esté vacío — puede ser un problema de conexión.
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
          <div className="space-y-3">
            {!errorCarga && historial.length === 0 && (
              <div className="text-center py-16" style={{ color: C.text4 }}>
                <ClipboardList size={32} className="mx-auto mb-3" style={{ opacity: 0.3 }} />
                <p className="text-sm font-bold">No hay sesiones registradas</p>
              </div>
            )}
            {historial.map(s => {
              const logroCfg = s.se_logro ? LOGRO_META[s.se_logro] : null;
              const LogroIcon = logroCfg?.icon;
              const tipoC = TIPO_META[s.objetivo_tipo]?.c || C.text2;
              return (
                <motion.div key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <CutCard cut={12} padding="16px">
                    <div className="flex items-start justify-between mb-2 gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-3xs font-black px-2 py-0.5 uppercase tracking-widest"
                          style={{ clipPath: cut(4), border: `1px solid ${tipoC}`, color: tipoC }}>
                          {s.tipo} • {s.objetivo_tipo}
                        </span>
                        {s.tipo?.startsWith('Grupal') && s.grupos_entrenamiento && (
                          <span className="text-3xs" style={{ color: C.text3 }}>{s.grupos_entrenamiento.nombre}</span>
                        )}
                        {s.tipo === 'Privada 1v1' && s.atletas && (
                          <span className="text-3xs" style={{ color: C.text3 }}>{s.atletas?.usuarios?.nombre}</span>
                        )}
                      </div>
                      <span className="text-3xs font-bold shrink-0" style={{ color: C.text4 }}>{s.fecha}</span>
                    </div>
                    <p className="text-xs mb-3 leading-relaxed" style={{ color: C.text2 }}>{s.objetivo_descripcion}</p>

                    {/* Ejercicios de la sesión, resueltos contra el catálogo actual */}
                    {s.ejercicios_ids?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {resolverNombresEjercicios(s.ejercicios_ids, ejerciciosCatalogo).map((d, i) => (
                          <span key={`${d.id}-${i}`} className="text-3xs font-bold px-2 py-0.5"
                            style={{
                              clipPath: cut(4),
                              border: `1px solid ${d.nombre ? BORDER.neutralSoft : BORDER.neutralFaint}`,
                              color: d.nombre ? C.text2 : C.text4,
                            }}>
                            {d.nombre || 'Ejercicio eliminado'}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Estado de evaluación */}
                    {s.se_logro ? (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-2xs font-bold px-2 py-1"
                          style={{ clipPath: cut(4), background: logroCfg?.tint, border: `1px solid ${logroCfg?.c}`, color: logroCfg?.c }}>
                          {LogroIcon && <LogroIcon size={12} />}
                          <span>Se logró: {s.se_logro}</span>
                        </div>
                        <button onClick={() => abrirWA(s)}
                          className="cut-focus flex items-center gap-1.5 px-3 min-h-11 py-2.5 text-xs font-bold transition-colors"
                          style={{ clipPath: cut(6), border: `1px solid ${BORDER.ok}`, color: C.whatsapp }}>
                          <MessageSquare size={13} />
                          <span>WhatsApp</span>
                        </button>
                      </div>
                    ) : (
                      evaluandoId === s.id ? (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            {['Sí', 'Parcial', 'No'].map(v => {
                              const activo = evalData.se_logro === v;
                              const vc = LOGRO_META[v].c;
                              return (
                                <button key={v} onClick={() => setEvalData(e => ({ ...e, se_logro: v }))}
                                  aria-pressed={activo}
                                  className="cut-focus flex-1 py-3 min-h-11 text-xs font-black uppercase transition-colors"
                                  style={{
                                    clipPath: cut(5),
                                    background: activo ? C.cardAlt1 : 'transparent',
                                    border: `1px solid ${activo ? vc : BORDER.neutralSoft}`,
                                    color: activo ? vc : C.text3,
                                  }}>{v}</button>
                              );
                            })}
                          </div>
                          <textarea rows={2} placeholder="Notas de evaluación..."
                            value={evalData.notas} onChange={e => setEvalData(d => ({ ...d, notas: e.target.value }))}
                            className="cut-focus arcade-input w-full px-3 py-2 text-base md:text-sm focus:outline-none resize-none" style={fieldStyle} />
                          <div className="flex gap-2">
                            <button onClick={() => handleEvaluar(s.id)}
                              className="cut-focus flex-1 py-2 min-h-11 text-2xs font-black uppercase tracking-widest transition"
                              style={{ clipPath: cut(6), background: GRAD.goldCTA, border: 'none', color: C.ink }}>
                              Guardar
                            </button>
                            <button onClick={() => setEvaluandoId(null)}
                              className="cut-focus px-3 py-2 min-h-11 text-2xs font-black uppercase transition-colors"
                              style={{ clipPath: cut(6), background: 'transparent', border: `1px solid ${BORDER.neutralSoft}`, color: C.text3 }}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setEvaluandoId(s.id); setEvalData({ se_logro: 'Sí', notas: '' }); }}
                          className="cut-focus flex items-center gap-1.5 px-3 min-h-11 py-2.5 text-xs font-bold transition-colors"
                          style={{ clipPath: cut(6), background: C.cardAlt1, border: `1px solid ${BORDER.warn}`, color: C.warn }}>
                          <Clock size={12} />
                          <span>Pendiente de evaluación → Evaluar</span>
                          <ChevronRight size={10} />
                        </button>
                      )
                    )}
                  </CutCard>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Diálogo HUD (reemplaza window.prompt/alert): nombre de plantilla, avisos y errores */}
      <ModalHUD open={!!modal} {...(modal || {})} onClose={() => setModal(null)} />
    </div>
  );
}
