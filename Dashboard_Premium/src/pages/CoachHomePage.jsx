import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Droplets, FlaskConical, TrendingUp, Zap } from 'lucide-react';
import { useAuth } from '../AuthContext';
import HomeShell, { ContextChip, SectionEyebrow } from '../components/HomeShell';
import Plantel from '../components/Plantel';
import CardFocoAtleta from '../components/CardFocoAtleta';
import ModoCanchaModal from '../components/ModoCanchaModal';
import { recoveryPill } from '../lib/recoveryPill';
import { tieneSenal } from '../lib/senalesAtleta';
import { fetchTodosLosAtletas } from '../api/atletasService';
import { fetchEvaluacionesProgramadasHoy, fetchSesionesPlanificadasHoy, fetchSesionesEnCurso } from '../api/sesionesService';

/**
 * CoachHomePage (/coach) — home nativo del coach: "gestiona mi día".
 * Fase 1 del rediseño (blueprint §3.2): saludo + card hero "Hoy" con CTA a
 * Modo Cancha, franja de atletas con señales de recuperación/readiness y el
 * Plantel embebido. Las cards IA (foco de desarrollo, misión sugerida)
 * llegan en la Fase 2 vía brain gateway.
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

  // Refetch de "en curso" al cerrar Modo Cancha: el contador del hero debe
  // reflejar sesiones iniciadas/finalizadas durante esa visita al modal.
  const cerrarModoCancha = () => {
    setShowModoCancha(false);
    fetchSesionesEnCurso(user.id)
      .then((data) => setActivasCount((data || []).length))
      .catch((err) => console.error('Error refrescando sesiones activas:', err));
  };

  // Hero "Hoy": prioriza la primera sesión PLANIFICADA (sesiones_control,
  // agenda real de AdminSesiones) sobre el conteo de evaluaciones sueltas.
  const heroHoy = useMemo(() => {
    if (sesionesHoy.length === 0) return null;
    const sesion = sesionesHoy[0];
    const grupoNombre = sesion.grupos_entrenamiento?.nombre;
    const esIndividual = sesion.tipo === 'Individual' || !grupoNombre;
    const titulo = `${esIndividual ? 'Individual' : grupoNombre} · ${sesion.objetivo_tipo}`;

    const partes = [];
    if (sesion.grupo_id) {
      const nAtletas = atletas.filter((a) => a.grupo_id === sesion.grupo_id).length;
      if (nAtletas > 0) partes.push(`${nAtletas} atleta${nAtletas === 1 ? '' : 's'} en el grupo`);
    }
    if (evaluacionesHoy.length > 0) {
      partes.push(`${evaluacionesHoy.length} evaluación${evaluacionesHoy.length === 1 ? '' : 'es'} por tomar`);
    }
    if (sesionesHoy.length > 1) {
      partes.push(`y ${sesionesHoy.length - 1} más`);
    }
    // Caso borde sin ninguna parte honesta que mostrar (p.ej. sesión
    // individual sin evaluaciones ni sesiones adicionales hoy).
    const subtitulo = partes.length > 0 ? partes.join(' · ') : 'Entra a Modo Cancha para gestionarla en campo.';
    return { titulo, subtitulo };
  }, [sesionesHoy, atletas, evaluacionesHoy]);

  // Foco de desarrollo (híbrido): los 3 atletas con menor overall (ya
  // evaluados) se eligen client-side; su misión recomendada la trae cada
  // CardFocoAtleta del brain-gateway (readiness del día, máx. 3 llamadas).
  const foco = useMemo(
    () => atletas
      .filter((a) => (a.overall_score || 0) > 0)
      .sort((a, b) => a.overall_score - b.overall_score)
      .slice(0, 3),
    [atletas],
  );

  return (
    <>
      <HomeShell
        eyebrow={<span className="capitalize">{fechaHoy}</span>}
        titulo={<>Hola, <span className="text-gradient-gold">{primerNombre}</span></>}
        contexto={
          <ContextChip>
            🎯 Tu categoría · {user.categoria && user.categoria !== 'Todas' ? user.categoria : 'Todas las categorías'}
          </ContextChip>
        }
      >
        {/* Card hero "Hoy" */}
        <div className="rounded-card border border-brand/20 bg-gradient-to-br from-brand/15 via-brand-strong/5 to-surface-card shadow-card p-5">
          <SectionEyebrow>Hoy</SectionEyebrow>
          <div className="flex items-center justify-between gap-4 -mt-1">
            <div>
              <p className="font-black text-lg leading-snug">
                {heroHoy
                  ? heroHoy.titulo
                  : evaluacionesHoy.length > 0
                    ? `${evaluacionesHoy.length} ${evaluacionesHoy.length === 1 ? 'evaluación programada' : 'evaluaciones programadas'}`
                    : 'Sin evaluaciones programadas'}
              </p>
              <p className="text-sm text-fg-secondary mt-1">
                {heroHoy
                  ? heroHoy.subtitulo
                  : evaluacionesHoy.length > 0
                    ? 'Entra a Modo Cancha para tomarlas en campo.'
                    : 'Tu plantel te espera — captura, asistencia y evaluación en campo.'}
              </p>
            </div>
            {activasCount > 0 && (
              <div className="text-center shrink-0">
                <p className="text-2xl font-black text-brand tabular-nums">{activasCount}</p>
                <p className="text-3xs uppercase tracking-widest text-fg-muted font-bold">
                  {activasCount === 1 ? 'en curso' : 'activas'}
                </p>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowModoCancha(true)}
            className="mt-4 w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-control font-black text-sm uppercase tracking-widest text-on-brand bg-gradient-to-r from-brand to-brand-strong shadow-glow-gold hover:brightness-110 active:scale-[0.98] transition"
          >
            <Zap size={18} fill="currentColor" /> Entrar a Modo Cancha
          </button>
          <button
            onClick={() => navigate('/admin/sesiones')}
            className="mt-2 w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-control text-xs font-bold uppercase tracking-widest text-fg-secondary border border-white/10 hover:border-brand/30 hover:text-brand transition"
          >
            <FlaskConical size={14} /> Planificar sesiones
          </button>
        </div>

        {/* Franja: atletas con señal de recuperación/hidratación (card IA) */}
        <SectionEyebrow pill="✦ IA" pillTono="mental">Atletas a mirar hoy</SectionEyebrow>
        <div className="rounded-card border border-mental/20 bg-surface-sunken p-4">
          <p className="border-l-2 border-mental pl-2.5 text-xs text-fg-secondary leading-relaxed mb-3">
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
                      <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                        <span className="text-sm font-black text-white/50 uppercase">{a.nombre?.charAt(0)}</span>
                      </div>
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
        </div>

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

        {/* Comparar la categoría (teaser fiel al mockup v6) */}
        <SectionEyebrow pill="nuevo">Comparar la categoría</SectionEyebrow>
        <button
          type="button"
          onClick={() => navigate('/admin/comparar')}
          className="w-full flex items-center justify-between gap-3 rounded-card bg-surface-sunken border border-white/5 hover:border-brand/30 transition active:scale-[0.98] p-4 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-bold">
            <TrendingUp size={16} className="text-brand" /> Ver distribución e histórico por prueba
          </span>
          <ChevronRight size={16} className="text-brand shrink-0" />
        </button>

        {/* Plantel embebido (módulo reutilizable extraído de /dashboard) */}
        <SectionEyebrow>Plantel</SectionEyebrow>
        <Plantel user={user} />
      </HomeShell>

      <ModoCanchaModal isOpen={showModoCancha} onClose={cerrarModoCancha} />
    </>
  );
}
