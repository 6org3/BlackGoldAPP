// src/components/CardDiagnosticoIA.jsx
// Card IA de diagnóstico 360° (estilo card IA del mockup v6: borde morado
// sutil + chip de procedencia "✦ tool"). Autocontenida: pide sus datos vía
// useBrainDiagnostico y maneja loading/error/vacío por sí sola.
//
// Dos tonos:
//   - 'tecnico' (staff): 3 sub-pilares más débiles con score /100, barra por
//     baremo, debilidades como chips caution y notas del coach si vienen.
//   - 'simple' (atleta/padre): prosa llana sin jerga ni números.
import { motion } from 'framer-motion';
import { VARIANTS, getBaremoUI, getFuenteIALabel } from '../lib/designTokens';
import { getSubPilar } from '../../../packages/analytics-core/taxonomia.js';
import { useBrainDiagnostico } from '../hooks/useBrainDiagnostico';

/** Etiqueta legible de un sub-pilar (fallback: la propia key del gateway). */
const labelSub = (key) => getSubPilar(key)?.label || key;

/* Chip de procedencia: qué tool del cerebro generó este contenido. */
function ChipFuente({ tool }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-2xs font-bold px-2 py-0.5 rounded-full text-mental-soft bg-mental/10 border border-mental/25">
      <span aria-hidden="true">✦</span>
      {getFuenteIALabel(tool)}
    </span>
  );
}

/* Skeleton de carga: tres líneas pulsantes, misma altura que el contenido corto. */
function EsqueletoCard() {
  return (
    <div className="space-y-3 animate-pulse" aria-hidden="true">
      <div className="h-3 w-3/4 rounded-full bg-white/5" />
      <div className="h-3 w-1/2 rounded-full bg-white/5" />
      <div className="h-3 w-2/3 rounded-full bg-white/5" />
    </div>
  );
}

/* Tono técnico: sub-pilares débiles medidos + debilidades + notas de staff. */
function ContenidoTecnico({ diagnostico }) {
  const debiles = (diagnostico.subPilares || []).slice(0, 3);
  const debilidades = diagnostico.debilidades || [];
  const notas = Array.isArray(diagnostico.notas) ? diagnostico.notas.slice(0, 3) : [];

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {debiles.map((sp) => {
          const ui = getBaremoUI(sp.promedio);
          const pct = Math.max(0, Math.min(100, Number(sp.promedio) || 0));
          return (
            <div key={sp.sub_pilar}>
              <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
                <span className="font-semibold text-fg-secondary">{labelSub(sp.sub_pilar)}</span>
                <span className={`font-black ${ui.color}`}>
                  {Math.round(pct)}
                  <span className="text-2xs font-bold text-fg-muted">/100</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div className={`h-full rounded-full ${ui.bg}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {debilidades.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {debilidades.map((d) => (
            <span
              key={d}
              className="text-3xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-full text-caution-soft bg-caution/10 border border-caution/30"
            >
              {labelSub(d)}
            </span>
          ))}
        </div>
      )}

      {notas.length > 0 && (
        <ul className="space-y-1">
          {notas.map((nota, i) => (
            <li key={i} className="text-xs text-fg-muted leading-relaxed">
              {typeof nota === 'string' ? nota : nota?.contenido || ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* Tono simple: prosa sin jerga — lo mejor (último) y el foco (primero). */
function ContenidoSimple({ subPilares }) {
  const foco = subPilares[0];
  const mejor = subPilares[subPilares.length - 1];
  const hayMejor = subPilares.length > 1;

  return (
    <p className="text-sm text-fg-secondary leading-relaxed">
      {hayMejor && (
        <>
          Lo que mejor va: <span className="font-bold text-white">{labelSub(mejor.sub_pilar)}</span>{' '}
          <span aria-hidden="true">💪</span>.{' '}
        </>
      )}
      Ahora el foco es <span className="font-bold text-mental-soft">{labelSub(foco.sub_pilar)}</span> —
      pequeños pasos cada semana.
    </p>
  );
}

export default function CardDiagnosticoIA({ atletaId, tono = 'tecnico' }) {
  const { diagnostico, fuente, loading, error, refrescar } = useBrainDiagnostico(atletaId);
  const tecnico = tono === 'tecnico';
  const subPilares = diagnostico?.subPilares || [];

  return (
    <motion.div
      {...VARIANTS.fadeInUp}
      className="bg-surface-sunken border border-mental/20 rounded-panel p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-xs font-black uppercase tracking-widest text-mental-soft">
          {tecnico ? 'Diagnóstico 360°' : 'Tu próximo paso'}
        </h3>
        <ChipFuente tool={fuente?.tool || 'analyze_athlete_pillars'} />
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
      ) : subPilares.length === 0 ? (
        <p className="text-xs text-fg-muted">Aún no hay evaluaciones registradas.</p>
      ) : tecnico ? (
        <ContenidoTecnico diagnostico={diagnostico} />
      ) : (
        <ContenidoSimple subPilares={subPilares} />
      )}
    </motion.div>
  );
}
