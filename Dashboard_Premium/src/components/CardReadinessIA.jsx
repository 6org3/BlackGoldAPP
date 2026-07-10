// src/components/CardReadinessIA.jsx
// Card IA de readiness diario (estilo card IA del mockup v6: borde morado
// sutil + chip de procedencia "✦ tool"). Autocontenida: pide sus datos vía
// useBrainReadiness y maneja loading/error/sinDatos por sí sola.
//
// Dos tonos:
//   - 'tecnico' (staff): "Readiness / Recuperación", score /100 explícito y
//     estado de recuperación.
//   - 'simple' (atleta/padre): "¿Cómo estás hoy?" y los mensajes tal cual
//     (el gateway ya los devuelve legibles).
import { motion } from 'framer-motion';
import { VARIANTS, getFuenteIALabel } from '../lib/designTokens';
import { useBrainReadiness } from '../hooks/useBrainReadiness';

/* Chip de procedencia: qué tool del cerebro generó este contenido. */
function ChipFuente({ tool }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-2xs font-bold px-2 py-0.5 rounded-full text-mental-soft bg-mental/10 border border-mental/25">
      <span aria-hidden="true">✦</span>
      {getFuenteIALabel(tool)}
    </span>
  );
}

/* Skeleton de carga: número grande + barra, pulsantes. */
function EsqueletoCard() {
  return (
    <div className="space-y-3 animate-pulse" aria-hidden="true">
      <div className="h-9 w-16 rounded-lg bg-white/5" />
      <div className="h-1.5 w-full rounded-full bg-white/5" />
      <div className="h-3 w-2/3 rounded-full bg-white/5" />
    </div>
  );
}

/** Colores del score por umbral: >=70 success, >=40 warning, <40 danger. */
function getScoreUI(score) {
  if (score >= 70) return { text: 'text-success-soft', bg: 'bg-success' };
  if (score >= 40) return { text: 'text-warning-soft', bg: 'bg-warning' };
  return { text: 'text-danger-soft', bg: 'bg-danger' };
}

/** Clases de chip por prioridad de alerta del gateway. */
function getChipAlerta(prioridad) {
  if (prioridad === 'critica' || prioridad === 'alta') {
    return 'text-danger-soft bg-danger/10 border-danger/30';
  }
  if (prioridad === 'media') return 'text-caution-soft bg-caution/10 border-caution/30';
  return 'text-info-soft bg-info/10 border-info/30';
}

function ContenidoReadiness({ readiness, tecnico }) {
  const tieneScore = typeof readiness.score === 'number';
  const pct = tieneScore ? Math.max(0, Math.min(100, readiness.score)) : 0;
  const scoreUI = getScoreUI(pct);
  const alertas = readiness.alertas || [];
  const misiones = (readiness.misionesRecomendadas || []).slice(0, 2);

  return (
    <div className="space-y-4">
      {tieneScore && (
        <div>
          <div className="flex items-end gap-1.5">
            <span className={`text-4xl font-black leading-none ${scoreUI.text}`}>
              {Math.round(pct)}
            </span>
            {tecnico && <span className="text-xs font-bold text-fg-muted">/100</span>}
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div className={`h-full rounded-full ${scoreUI.bg}`} style={{ width: `${pct}%` }} />
          </div>
          {tecnico && readiness.estadoRecuperacion && (
            <p className="mt-2 text-2xs font-bold uppercase tracking-widest text-fg-muted">
              {readiness.estadoRecuperacion}
            </p>
          )}
        </div>
      )}

      {alertas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {alertas.map((a) => (
            <span
              key={a.condicion || a.mensaje}
              className={`text-2xs font-bold px-2.5 py-1 rounded-full border ${getChipAlerta(a.prioridad)}`}
            >
              {a.mensaje}
            </span>
          ))}
        </div>
      )}

      {misiones.length > 0 && (
        <div className="space-y-2">
          <p className="text-2xs font-black uppercase tracking-widest text-fg-muted">
            Misiones recomendadas
          </p>
          {misiones.map((m) => (
            <div
              key={m.titulo}
              className="flex items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-panel px-3 py-2"
            >
              <span className="text-xs font-semibold text-white">{m.titulo}</span>
              <span className="text-2xs font-black text-brand whitespace-nowrap">
                +{m.xp_recompensa} XP
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CardReadinessIA({ atletaId, tono = 'tecnico' }) {
  const { readiness, fuente, loading, error, refrescar } = useBrainReadiness(atletaId);
  const tecnico = tono === 'tecnico';

  return (
    <motion.div
      {...VARIANTS.fadeInUp}
      className="bg-surface-sunken border border-mental/20 rounded-panel p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-xs font-black uppercase tracking-widest text-mental-soft">
          {tecnico ? 'Readiness / Recuperación' : '¿Cómo estás hoy?'}
        </h3>
        <ChipFuente tool={fuente?.tool || 'analyze_athlete_readiness'} />
      </div>

      {loading ? (
        <EsqueletoCard />
      ) : error ? (
        <p className="text-xs text-fg-muted">
          El cerebro no respondió,{' '}
          <button
            type="button"
            onClick={refrescar}
            className="text-mental-soft underline underline-offset-2"
          >
            reintenta
          </button>
        </p>
      ) : !readiness || readiness.sinDatos ? (
        <p className="text-xs text-fg-muted">
          Completa tu Check-in Diario para ver tu readiness
        </p>
      ) : (
        <ContenidoReadiness readiness={readiness} tecnico={tecnico} />
      )}
    </motion.div>
  );
}
