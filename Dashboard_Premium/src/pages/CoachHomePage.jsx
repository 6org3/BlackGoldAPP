import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Droplets, FlaskConical, TrendingUp, Zap } from 'lucide-react';
import { useAuth } from '../AuthContext';
import HomeShell, { ContextChip, SectionEyebrow } from '../components/HomeShell';
import Plantel from '../components/Plantel';
import CardFocoAtleta from '../components/CardFocoAtleta';
import ModoCanchaArcade from '../components/arcade/ModoCanchaArcade';
import CutCard from '../components/arcade/CutCard';
import HexAvatar from '../components/arcade/HexAvatar';
import MicroLabel from '../components/arcade/MicroLabel';
import { C, BORDER, GRAD, TINT, cut, PIXEL } from '../components/arcade/arcadeTokens';
import { recoveryPill } from '../lib/recoveryPill';
import { tieneSenal } from '../lib/senalesAtleta';
import { fetchTodosLosAtletas } from '../api/atletasService';
import { fetchEvaluacionesProgramadasHoy, fetchSesionesPlanificadasHoy, fetchSesionesEnCurso } from '../api/sesionesService';

// Tinte del chip de modalidad (nivel de la clase / 1 a 1). Sin rgba crudo.
const CHIP_MODALIDAD = {
  ok:   { color: C.ok,   border: BORDER.okSoft, tint: TINT.ok },
  gold: { color: C.gold, border: BORDER.gold16, tint: TINT.gold },
};

// Las sesiones NO se organizan por categoría FEB (esa es para baremos), sino
// por modalidad: clase grupal (por nivel de desarrollo, edades mixtas), grupo
// del club o individualizada. El nivel de una clase se deriva de sus miembros.
const nivelDeGrupo = (grupoId, atletas) => {
  const miembros = atletas.filter((a) => a.grupo_id === grupoId);
  if (miembros.length === 0) return null;
  const conteo = {};
  miembros.forEach((a) => {
    const n = a.nivel_desarrollo || 'Sin nivel';
    conteo[n] = (conteo[n] || 0) + 1;
  });
  return Object.entries(conteo).sort((a, b) => b[1] - a[1])[0][0];
};

/** Modalidad de una sesión de sesiones_control: individual (1 a 1) o clase
 *  grupal (con nivel derivado). Devuelve lo necesario para hero y agenda. */
const modalidadDeSesion = (s, atletas) => {
  const grupoNombre = s.grupos_entrenamiento?.nombre;
  const esIndividual = s.tipo === 'Individual' || !grupoNombre;
  const objetivo = s.objetivo_tipo || 'Sesión';
  if (esIndividual) {
    const atleta = atletas.find((a) => a.atleta_id === s.atleta_id);
    return {
      modalidad: 'Individualizado',
      marker: '○',
      color: C.gold,
      chip: '1 a 1',
      chipTono: 'gold',
      titulo: `Individualizado · ${objetivo}`,
      sub: atleta ? `1 a 1 · ${atleta.nombre}` : '1 a 1',
    };
  }
  const nivel = nivelDeGrupo(s.grupo_id, atletas);
  return {
    modalidad: 'Clase grupal',
    marker: '●',
    color: C.ok,
    chip: nivel ? `Nivel ${nivel}` : null,
    chipTono: 'ok',
    titulo: `${grupoNombre} · ${objetivo}`,
    sub: 'Clase grupal · por nivel',
  };
};

/**
 * CoachHomePage (/coach) — home nativo del coach: "gestiona mi día".
 * Ola 2 · PR 2.3 (convergencia Arcade + regla de dominio): el hero habla en
 * MODALIDAD DE SESIÓN (clase grupal por nivel de desarrollo / individualizada),
 * no en categoría FEB — las clases mezclan edades/categorías y se agrupan por
 * nivel o por grupo del club. Chrome del HUD (CutCard, MicroLabel, HexAvatar).
 * Las cards IA (foco de desarrollo, readiness) llegan por el brain gateway.
 */
export default function CoachHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showModoCancha, setShowModoCancha] = useState(false);
  const [atletas, setAtletas] = useState([]);
  const [loadingAtletas, setLoadingAtletas] = useState(true);
  const [evaluacionesHoy, setEvaluacionesHoy] = useState([]);
  const [sesionesHoy, setSesionesHoy] = useState([]);
  const [activasCount, setActivasCount] = useState(0);

  useEffect(() => {
    let activo = true;
    fetchTodosLosAtletas(user)
      .then((data) => { if (activo) setAtletas(data || []); })
      .catch((err) => console.error('Error cargando atletas del home:', err))
      .finally(() => { if (activo) setLoadingAtletas(false); });
    fetchEvaluacionesProgramadasHoy(user.id)
      .then((data) => { if (activo) setEvaluacionesHoy(data || []); })
      .catch((err) => console.error('Error cargando sesiones de hoy:', err));
    fetchSesionesPlanificadasHoy(user.id)
      .then((data) => { if (activo) setSesionesHoy(data || []); })
      .catch((err) => console.error('Error cargando la agenda de hoy:', err));
    fetchSesionesEnCurso(user.id)
      .then((data) => { if (activo) setActivasCount((data || []).length); })
      .catch((err) => console.error('Error cargando sesiones activas:', err));
    return () => { activo = false; };
  }, [user]);

  const conSenal = atletas.filter(tieneSenal);
  const fechaHoy = new Date().toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long' });
  const primerNombre = (user.nombre || '').split(' ')[0] || 'Coach';

  const cerrarModoCancha = () => {
    setShowModoCancha(false);
    fetchSesionesEnCurso(user.id)
      .then((data) => setActivasCount((data || []).length))
      .catch((err) => console.error('Error refrescando sesiones activas:', err));
  };

  // Hero "Hoy": la primera sesión planificada, presentada por su modalidad,
  // con subtítulo honesto (atletas del grupo, edades mixtas, evaluaciones).
  const heroHoy = useMemo(() => {
    if (sesionesHoy.length === 0) return null;
    const s = sesionesHoy[0];
    const base = modalidadDeSesion(s, atletas);
    if (base.modalidad === 'Individualizado') {
      const partes = [];
      if (base.sub !== '1 a 1') partes.push(base.sub.replace('1 a 1 · ', ''));
      if (evaluacionesHoy.length > 0) partes.push(`${evaluacionesHoy.length} evaluación${evaluacionesHoy.length === 1 ? '' : 'es'} por tomar`);
      return { ...base, subtitulo: partes.length ? partes.join(' · ') : 'Sesión 1 a 1 · entra a Modo Cancha' };
    }
    const miembros = atletas.filter((a) => a.grupo_id === s.grupo_id);
    const categoriasDistintas = new Set(miembros.map((a) => a.categoria).filter(Boolean)).size;
    const partes = [];
    if (miembros.length > 0) partes.push(`${miembros.length} atleta${miembros.length === 1 ? '' : 's'}`);
    if (categoriasDistintas > 1) partes.push('edades mixtas');
    if (evaluacionesHoy.length > 0) partes.push(`${evaluacionesHoy.length} evaluación${evaluacionesHoy.length === 1 ? '' : 'es'} por tomar`);
    return { ...base, subtitulo: partes.length ? partes.join(' · ') : 'Entra a Modo Cancha para gestionarla en campo.' };
  }, [sesionesHoy, atletas, evaluacionesHoy]);

  // Resto de sesiones del día (la primera ya es el titular del hero).
  const agendaResto = useMemo(
    () => sesionesHoy.slice(1).map((s, i) => ({ key: s.id || i, ...modalidadDeSesion(s, atletas) })),
    [sesionesHoy, atletas],
  );

  const foco = useMemo(
    () => atletas
      .filter((a) => (a.overall_score || 0) > 0)
      .sort((a, b) => a.overall_score - b.overall_score)
      .slice(0, 3),
    [atletas],
  );

  const chipCfg = heroHoy?.chip ? (CHIP_MODALIDAD[heroHoy.chipTono] || CHIP_MODALIDAD.gold) : null;

  return (
    <>
      <HomeShell
        eyebrow={fechaHoy}
        titulo={<>Hola, <span className="text-gradient-gold">{primerNombre}</span></>}
        contexto={<ContextChip>🎯 Tu plantel · {atletas.length} atleta{atletas.length === 1 ? '' : 's'}</ContextChip>}
      >
        {/* Hero "Hoy" — por modalidad de sesión (no categoría FEB) */}
        <CutCard cut={12} background={GRAD.heroGold} border={BORDER.goldMid} padding="0" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '16px 16px 4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <MicroLabel color={C.goldDeep} size={9.5} tracking=".12em">
                  <span aria-hidden="true">▸</span> Hoy{heroHoy ? ` · ${heroHoy.modalidad}` : ''}
                </MicroLabel>
                <h2 style={{ margin: '6px 0 0', fontSize: 19, fontWeight: 900, letterSpacing: '-.01em', color: C.text }}>
                  {heroHoy
                    ? heroHoy.titulo
                    : evaluacionesHoy.length > 0
                      ? `${evaluacionesHoy.length} ${evaluacionesHoy.length === 1 ? 'evaluación programada' : 'evaluaciones programadas'}`
                      : 'Sin sesiones hoy'}
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: C.text2 }}>
                  {heroHoy
                    ? heroHoy.subtitulo
                    : evaluacionesHoy.length > 0
                      ? 'Entra a Modo Cancha para tomarlas en campo.'
                      : 'Tu plantel te espera — captura, asistencia y evaluación en campo.'}
                </p>
                {chipCfg && (
                  <span style={{
                    marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontFamily: PIXEL, fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
                    padding: '3px 8px', clipPath: cut(5),
                    color: chipCfg.color, border: `1px solid ${chipCfg.border}`, background: chipCfg.tint,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', animation: 'bg-blink 1.5s infinite' }} />
                    {heroHoy.chip}
                  </span>
                )}
              </div>
              {activasCount > 0 && (
                <div style={{ textAlign: 'center', flex: 'none' }}>
                  <p style={{ margin: 0, fontFamily: PIXEL, fontSize: 24, color: C.gold }}>{activasCount}</p>
                  <MicroLabel color={C.text3} size={9} tracking=".08em">{activasCount === 1 ? 'en curso' : 'activas'}</MicroLabel>
                </div>
              )}
            </div>

            {/* También hoy: resto de sesiones del día con su modalidad */}
            {agendaResto.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 6, borderTop: `1px solid ${BORDER.gold}` }}>
                <MicroLabel color={C.text3} size={9.5} tracking=".1em" style={{ marginBottom: 2 }}>También hoy</MicroLabel>
                {agendaResto.map((item) => (
                  <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderTop: `1px solid ${BORDER.neutral06}` }}>
                    <span style={{ fontFamily: PIXEL, fontSize: 10, color: item.color, width: 14, textAlign: 'center', flex: 'none' }} aria-hidden="true">{item.marker}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.titulo}</p>
                      <MicroLabel color={C.text3} size={9} tracking=".06em">{item.sub}</MicroLabel>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CTAs del hero */}
          <div style={{ padding: '8px 16px 16px' }}>
            <button
              onClick={() => setShowModoCancha(true)}
              className="cut-focus"
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '14px', clipPath: cut(12), background: GRAD.goldCTA, color: C.ink,
                fontSize: 13, fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer', border: 'none',
              }}
            >
              <Zap size={17} fill="currentColor" /> Entrar a Modo Cancha
            </button>
            <button
              onClick={() => navigate('/admin/sesiones')}
              className="cut-focus"
              style={{
                width: '100%', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px', clipPath: cut(8), background: 'transparent', color: C.text2,
                fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer',
                border: `1px solid ${BORDER.neutralSoft}`,
              }}
            >
              <FlaskConical size={13} /> Planificar sesiones <span aria-hidden="true">▸</span>
            </button>
          </div>
        </CutCard>

        {/* Franja: atletas con señal de recuperación/hidratación (card IA) */}
        <SectionEyebrow pill="✦ IA" pillTono="mental">Atletas a mirar hoy</SectionEyebrow>
        <CutCard cut={10} border={BORDER.ai} padding="16px">
          <p style={{ margin: '0 0 12px', paddingLeft: 10, borderLeft: `2px solid ${C.ai}`, fontSize: 12.5, lineHeight: 1.5, color: C.text2 }}>
            Mira estos atletas antes de entrenar.
          </p>
          {loadingAtletas ? (
            <div className="skeleton h-14" aria-hidden="true"></div>
          ) : conSenal.length === 0 ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-2xs font-extrabold px-2.5 py-1 rounded-full border text-success-soft bg-success/10 border-success/25">
                ● Sin señales hoy
              </span>
              <p className="text-xs text-fg-muted">Nadie con banderas de recuperación o hidratación.</p>
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {conSenal.slice(0, 6).map((a) => {
                const pill = recoveryPill(a.estado_recuperacion);
                const deshidratado = a.readiness_hoy && a.readiness_hoy.color_orina >= 5;
                return (
                  <li key={a.atleta_id || a.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <HexAvatar size={34} initial={a.nombre?.charAt(0)} style={{ fontSize: 13 }} />
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{a.nombre}</p>
                        <p className="text-2xs text-fg-muted truncate">{a.categoria} · {a.posicion || 'Sin posición'}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5 shrink-0">
                      {pill && (
                        <span className={`flex items-center gap-1 text-3xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${pill}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {a.estado_recuperacion}
                        </span>
                      )}
                      {deshidratado && (
                        <span className="flex items-center gap-1 text-3xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-brand/40 text-brand bg-brand/10">
                          <Droplets size={11} fill="currentColor" /> Hidratación
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex items-center gap-1 text-3xs font-mono font-bold text-mental-soft mt-3">
            <span aria-hidden="true">✦</span> readiness diario
          </div>
        </CutCard>

        {/* Foco de desarrollo (híbrido: selección client-side + misión del brain-gateway) */}
        {!loadingAtletas && foco.length > 0 && (
          <>
            <SectionEyebrow pill="✦ IA" pillTono="mental">Foco de desarrollo</SectionEyebrow>
            <div className="space-y-3">
              {foco.map((a) => (
                <CardFocoAtleta key={a.atleta_id || a.id} atleta={a} />
              ))}
            </div>
          </>
        )}

        {/* Comparar por categoría — aquí la categoría FEB SÍ es el eje (baremos) */}
        <SectionEyebrow pill="nuevo">Comparar por categoría</SectionEyebrow>
        <CutCard
          cut={10}
          className="cut-focus"
          onClick={() => navigate('/admin/comparar')}
          ariaLabel="Ver distribución e histórico por prueba"
          padding="16px"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: C.text }}>
            <TrendingUp size={16} style={{ color: C.gold }} /> Ver distribución e histórico por prueba
          </span>
          <ChevronRight size={16} style={{ color: C.gold, flex: 'none' }} />
        </CutCard>

        {/* Plantel embebido (módulo reutilizable extraído de /dashboard) */}
        <SectionEyebrow>Plantel</SectionEyebrow>
        <Plantel user={user} />
      </HomeShell>

      <ModoCanchaArcade isOpen={showModoCancha} onClose={cerrarModoCancha} />
    </>
  );
}
