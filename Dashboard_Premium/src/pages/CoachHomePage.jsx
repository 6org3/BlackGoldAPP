import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Droplets, FlaskConical, Zap } from 'lucide-react';
import { useAuth } from '../AuthContext';
import HomeShell, { ContextChip, SectionEyebrow } from '../components/HomeShell';
import Plantel from '../components/Plantel';
import ModoCanchaModal from '../components/ModoCanchaModal';
import { recoveryPill } from '../lib/recoveryPill';
import { fetchTodosLosAtletas } from '../api/atletasService';
import { fetchEvaluacionesProgramadasHoy } from '../api/sesionesService';

// Señal de atención para la franja "Atletas a mirar hoy": estado de
// recuperación distinto de Óptimo o alerta de hidratación del readiness
// diario (mismos umbrales que ya usa AthleteGridCard). Campos que ya trae
// fetchTodosLosAtletas — sin llamadas nuevas al gateway.
const tieneSenal = (a) =>
  (a.estado_recuperacion && a.estado_recuperacion !== 'Óptimo') ||
  (a.readiness_hoy && a.readiness_hoy.color_orina >= 5);

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

  useEffect(() => {
    let activo = true;
    fetchTodosLosAtletas(user)
      .then((data) => { if (activo) setAtletas(data || []); })
      .catch((err) => console.error('Error cargando atletas del home:', err))
      .finally(() => { if (activo) setLoadingAtletas(false); });
    fetchEvaluacionesProgramadasHoy(user.id)
      .then((data) => { if (activo) setEvaluacionesHoy(data || []); })
      .catch((err) => console.error('Error cargando sesiones de hoy:', err));
    return () => { activo = false; };
  }, [user]);

  const conSenal = atletas.filter(tieneSenal);
  const fechaHoy = new Date().toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long' });
  const primerNombre = (user.nombre || '').split(' ')[0] || 'Coach';

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
                {evaluacionesHoy.length > 0
                  ? `${evaluacionesHoy.length} ${evaluacionesHoy.length === 1 ? 'evaluación programada' : 'evaluaciones programadas'}`
                  : 'Sin evaluaciones programadas'}
              </p>
              <p className="text-sm text-fg-secondary mt-1">
                {evaluacionesHoy.length > 0
                  ? 'Entra a Modo Cancha para tomarlas en campo.'
                  : 'Tu plantel te espera — captura, asistencia y evaluación en campo.'}
              </p>
            </div>
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

        {/* Franja: atletas con señal de recuperación/hidratación */}
        <SectionEyebrow pill={conSenal.length > 0 ? `${conSenal.length}` : null}>
          Atletas a mirar hoy
        </SectionEyebrow>
        <div className="glass-card rounded-card p-4">
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
        </div>

        {/* Plantel embebido (módulo reutilizable extraído de /dashboard) */}
        <SectionEyebrow>Plantel</SectionEyebrow>
        <Plantel user={user} />
      </HomeShell>

      <ModoCanchaModal isOpen={showModoCancha} onClose={() => setShowModoCancha(false)} />
    </>
  );
}
