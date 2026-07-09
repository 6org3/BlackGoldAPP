// CardFocoAtleta — card IA de "Foco de desarrollo" para CoachHomePage
// (mockup v6, coachHome). Selección HÍBRIDA: el atleta y su sub-pilar más
// débil se eligen client-side (sin gasto de tokens, CoachHomePage.jsx ya
// tiene los datos); la misión recomendada viene del brain-gateway
// (readiness del día del atleta, useBrainReadiness) para que el coach
// siempre vea la misión más actualizada, no una copia congelada.
//
// "Siguiente prueba" del mockup se omite a propósito: ese dato no viene en
// el payload del gateway y agregarlo requeriría tocar brain-gateway.
import { useState } from 'react';
import { getBaremoUI } from '../lib/designTokens';
import { getSubPilarScores } from '../lib/radarCalc';
import { getSubPilar } from '../../../packages/analytics-core/taxonomia.js';
import { useBrainReadiness } from '../hooks/useBrainReadiness';
import { useCopiloto } from '../hooks/useCopiloto';
import { asignarMisionAAtleta } from '../api/misionesService';

export default function CardFocoAtleta({ atleta }) {
  const { readiness, fuente, loading } = useBrainReadiness(atleta.atleta_id);
  const { abrir } = useCopiloto();
  const [asignando, setAsignando] = useState(false);
  const [asignada, setAsignada] = useState(false);

  // Sub-pilar más débil: el de menor puntuación ENTRE los que tienen datos
  // (un sub-pilar en 0 es "sin evaluar", no "débil" — mismo criterio que
  // mediasPorPilarGrupo en analytics-core/radar.js).
  const scores = getSubPilarScores(atleta._evaluaciones || []);
  const conDatos = Object.entries(scores).filter(([, v]) => v > 0);
  const debil = conDatos.length > 0 ? conDatos.reduce((min, e) => (e[1] < min[1] ? e : min)) : null;
  const uiDebil = debil ? getBaremoUI(debil[1]) : null;

  const mision = readiness?.misionesRecomendadas?.[0] || null;

  const handleAsignar = async () => {
    if (!mision?.id || asignando || asignada) return;
    setAsignando(true);
    try {
      await asignarMisionAAtleta(atleta.atleta_id, mision.id);
      setAsignada(true);
    } catch (err) {
      console.error('Error asignando misión:', err);
      alert('No se pudo asignar la misión.');
    } finally {
      setAsignando(false);
    }
  };

  return (
    <div className="rounded-card border border-mental/20 bg-surface-sunken p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shrink-0">
            <span className="text-sm font-black text-white/50 uppercase">{atleta.nombre?.charAt(0)}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">{atleta.nombre}</p>
            <p className="text-2xs text-fg-muted truncate">{atleta.categoria} · {atleta.posicion || 'Sin posición'}</p>
          </div>
        </div>
        {debil && (
          <div className="text-right shrink-0">
            <p className="text-3xs text-fg-muted uppercase tracking-widest">{getSubPilar(debil[0])?.label || debil[0]}</p>
            <p className="font-black" style={{ color: uiDebil.hex }}>{debil[1]}/100</p>
          </div>
        )}
      </div>

      <div className="rounded-panel bg-surface-base/60 border border-white/5 p-3 mt-3">
        {loading ? (
          <div className="h-4 w-2/3 rounded-full bg-white/5 animate-pulse" aria-hidden="true" />
        ) : mision ? (
          <p className="text-xs">
            <span className="inline-flex items-center text-3xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full text-mental-soft bg-mental/10 border border-mental/25 mr-2">
              Misión
            </span>
            {mision.titulo}
          </p>
        ) : (
          <p className="text-xs text-fg-muted">Sin misión recomendada hoy — pregúntale al Copiloto.</p>
        )}
      </div>

      <div className="flex items-center gap-1 text-3xs font-mono font-bold text-mental-soft mt-3">
        <span aria-hidden="true">✦</span> {fuente?.tool || 'analyze_athlete_readiness'}
      </div>

      <div className="flex items-center gap-2 mt-3">
        {mision?.id && (
          <button
            type="button"
            onClick={handleAsignar}
            disabled={asignando || asignada}
            className="flex-1 h-10 rounded-control text-xs font-bold uppercase tracking-widest border border-white/10 text-fg-secondary hover:border-brand/30 hover:text-brand transition disabled:opacity-60"
          >
            {asignada ? 'Asignada ✓' : asignando ? 'Asignando…' : '+ Asignar'}
          </button>
        )}
        <button
          type="button"
          onClick={() => abrir(atleta.atleta_id)}
          className="flex-1 h-10 rounded-control text-xs font-bold uppercase tracking-widest border border-mental/40 text-mental-soft hover:bg-mental/10 transition"
        >
          ✦ Pregúntale
        </button>
      </div>
    </div>
  );
}
