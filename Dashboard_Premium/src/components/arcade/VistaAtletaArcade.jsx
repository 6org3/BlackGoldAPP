import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../../AuthContext';
import { C, BORDER, GRAD, cut, PIXEL, gridBackground } from './arcadeTokens';
import useAtleta from './useAtleta';
import { buildAtletaCtx } from './atletaSelectors';
import MicroLabel from './MicroLabel';
import PantallaAtletaInicio from './PantallaAtletaInicio';
import PantallaAtletaMisiones from './PantallaAtletaMisiones';
import PantallaAtletaDetalle from './PantallaAtletaDetalle';
import PantallaAtletaProgreso from './PantallaAtletaProgreso';
import PantallaAtletaEventos from './PantallaAtletaEventos';
import ReadinessModal from '../ReadinessModal';
import { PortalStoryMarker, PortalTeamCard } from './PortalStory';

function footerStyle(footer) {
  if (footer.tone === 'ai') return { background: 'rgba(168,85,247,.12)', color: C.ai, border: '1px solid rgba(168,85,247,.4)' };
  if (!footer.enabled) return { background: 'rgba(255,255,255,.04)', color: C.text4, border: `1px solid ${BORDER.neutral}` };
  return { background: GRAD.goldCTA, color: C.ink, border: '1px solid transparent' };
}

/**
 * Portal del ATLETA en estilo Arcade HUD (rediseño del handoff). Página completa
 * móvil-first: 5 pantallas (Base · Misiones · Progreso · Eventos + detalle de
 * misión con quiz). Con `user` atleta usa datos reales de Supabase; sin login
 * (o rol ≠ atleta) corre en modo demo con ATLETA_MOCK. Molde de shell tomado de
 * VistaPadreArcade; header de flujo/footer del detalle tomado de ModoCanchaArcade.
 */
export default function VistaAtletaArcade() {
  const { user } = useAuth();
  const { state, data, actions, loading, error, reintentar } = useAtleta(user);
  const scrollToChapter = (chapter) => {
    const el = document.getElementById(`atleta-${chapter}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const storyActions = {
    ...actions,
    goTab: scrollToChapter,
    back: () => {
      actions.back();
      requestAnimationFrame(() => scrollToChapter('misiones'));
    },
  };
  const ctx = data ? buildAtletaCtx(state, data, storyActions) : null;
  const chapterCtx = data
    ? {
        inicio: buildAtletaCtx({ ...state, aDetalle: false, aTab: 'inicio' }, data, storyActions),
        misiones: buildAtletaCtx({ ...state, aDetalle: false, aTab: 'misiones' }, data, storyActions),
        progreso: buildAtletaCtx({ ...state, aDetalle: false, aTab: 'progreso' }, data, storyActions),
        eventos: buildAtletaCtx({ ...state, aDetalle: false, aTab: 'eventos' }, data, storyActions),
      }
    : null;

  const showHeader = ctx ? ctx.showFlowHeader : false;
  const scrollPad = ctx?.isDetalle ? '16px 16px 24px' : '18px 16px 44px';

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', justifyContent: 'center', background: C.bgApp }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: 720, height: '100dvh', display: 'flex', flexDirection: 'column', color: C.text, ...gridBackground }}>
        {/* Header de flujo (detalle de misión) */}
        {showHeader && (
          <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px 12px', borderBottom: '1px solid rgba(255,215,0,.1)', background: 'rgba(5,5,7,.6)' }}>
            <button
              type="button"
              onClick={ctx.onBack}
              aria-label="Atrás"
              // 44x44: objetivo táctil por defecto del DS (ROW_H). Estaba en 34.
              style={{ width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', background: 'transparent', border: '1px solid rgba(255,255,255,.12)', clipPath: cut(7), color: C.text2, cursor: 'pointer' }}
            >
              <ChevronLeft size={16} strokeWidth={2.4} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <MicroLabel color={C.goldDeep} size={11} tracking=".12em">{ctx.flowStepLabel}</MicroLabel>
              <p style={{ margin: '3px 0 0', fontSize: 17, fontWeight: 900, letterSpacing: '-.03em', lineHeight: 1.05 }}>{ctx.flowTitle}</p>
            </div>
            <div style={{ flex: 'none', fontFamily: PIXEL, fontSize: 12, color: C.gold }}>{ctx.headerRight}</div>
          </div>
        )}

        {/* Área de scroll con la pantalla activa. <main>: es el landmark de
            contenido del portal — sin él, un lector de pantalla no ofrece el
            salto al contenido y recorre el header en cada cambio de pantalla. */}
        <main style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: scrollPad, WebkitOverflowScrolling: 'touch' }}>
          {error ? (
            <div style={{ padding: '36px 8px', textAlign: 'center' }}>
              <p style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 900, color: C.danger }}>Sin conexión</p>
              <p style={{ margin: '0 0 18px', fontSize: 13, color: C.text2, lineHeight: 1.5 }}>
                No pudimos cargar tu perfil. Revisa tu conexión y vuelve a intentarlo.
              </p>
              <button
                type="button"
                onClick={reintentar}
                style={{
                  minHeight: 44, padding: '0 22px', cursor: 'pointer', color: C.ink,
                  background: C.gold, border: 'none', clipPath: cut(10),
                  fontSize: 12, fontWeight: 900, letterSpacing: '.1em',
                }}
              >
                REINTENTAR
              </button>
            </div>
          ) : !ctx || loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <MicroLabel color={C.text3} size={11} tracking=".1em" style={{ animation: 'bg-blink 1.3s infinite' }}>CARGANDO…</MicroLabel>
            </div>
          ) : ctx.isDetalle ? (
            <PantallaAtletaDetalle ctx={ctx} />
          ) : chapterCtx ? (
            <>
              <section id="atleta-inicio">
                <PantallaAtletaInicio ctx={chapterCtx.inicio} />
              </section>

              <PortalTeamCard
                club={data.profile.club}
                group={data.profile.grupoNombre || data.profile.categoria}
                coach={data.profile.coachNombre || (data.profile.tieneCoach ? 'Coach del club' : 'Staff del club')}
                activity={data.hoyEntrenas
                  ? `Próximo registro compartido: ${[data.hoyEntrenas.titulo, data.hoyEntrenas.sub].filter(Boolean).join(' · ')}.`
                  : 'Tu coach actualiza aquí sesiones, misiones, evaluaciones y recomendaciones.'}
                title="Tu equipo te acompaña"
              />

              <div id="atleta-misiones" style={{ scrollMarginTop: 16 }}>
                <PortalStoryMarker
                  eyebrow="PLAN"
                  title="Lo que estás construyendo"
                  description="Misiones propuestas por el staff y tareas que convierten el entrenamiento en progreso visible."
                  accent={C.ai}
                />
                <PantallaAtletaMisiones ctx={chapterCtx.misiones} embedded />
              </div>

              <div id="atleta-progreso" style={{ scrollMarginTop: 16 }}>
                <PortalStoryMarker
                  eyebrow="EVOLUCIÓN"
                  title="Tu temporada en movimiento"
                  description="Mediciones del coach, pilares, rangos e insignias reunidos en una sola lectura."
                  accent={C.gold}
                />
                <PantallaAtletaProgreso ctx={chapterCtx.progreso} embedded />
              </div>

              <div id="atleta-eventos" style={{ scrollMarginTop: 16 }}>
                <PortalStoryMarker
                  eyebrow="EQUIPO"
                  title="Dónde te necesita el club"
                  description="Convocatorias, confirmaciones y resultados que conectan tu trabajo individual con el equipo."
                  accent={C.ok}
                />
                <PantallaAtletaEventos ctx={chapterCtx.eventos} embedded />
              </div>
            </>
          ) : null}
        </main>

        {/* Footer CTA (detalle) */}
        {ctx?.showFooter && ctx.footer && (
          <div style={{ flex: 'none', padding: '12px 16px', borderTop: `1px solid ${BORDER.neutral}`, background: 'rgba(5,5,7,.8)' }}>
            <button
              type="button"
              onClick={ctx.footer.enabled ? ctx.footer.onClick : undefined}
              disabled={!ctx.footer.enabled}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, clipPath: cut(12), fontFamily: PIXEL, fontSize: 11, letterSpacing: '.04em', cursor: ctx.footer.enabled ? 'pointer' : 'default', ...footerStyle(ctx.footer) }}
            >
              {ctx.footer.label}
            </button>
          </div>
        )}

        {/* Check-in diario: se auto-abre al entrar mientras no haya registro de
            hoy, y la tarjeta de la Base lo vuelve a abrir. Solo con atleta real
            (el modo demo no tiene atleta_id contra el que escribir). */}
        {ctx?.readiness?.open && user?.atleta_id && (
          <ReadinessModal
            atletaId={user.atleta_id}
            onClose={ctx.readiness.onClose}
            onComplete={ctx.readiness.onComplete}
          />
        )}
      </div>
    </div>
  );
}
