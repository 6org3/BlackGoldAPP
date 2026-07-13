import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../../AuthContext';
import { C, BORDER, GRAD, cut, PIXEL, gridBackground } from './arcadeTokens';
import useAtleta from './useAtleta';
import { buildAtletaCtx } from './atletaSelectors';
import MicroLabel from './MicroLabel';
import ArcadeBottomNav from './ArcadeBottomNav';
import PantallaAtletaInicio from './PantallaAtletaInicio';
import PantallaAtletaMisiones from './PantallaAtletaMisiones';
import PantallaAtletaDetalle from './PantallaAtletaDetalle';
import PantallaAtletaProgreso from './PantallaAtletaProgreso';
import PantallaAtletaEventos from './PantallaAtletaEventos';

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
  const { state, data, actions, loading } = useAtleta(user);
  const ctx = data ? buildAtletaCtx(state, data, actions) : null;

  const showNav = ctx ? ctx.showNav : true;
  const showHeader = ctx ? ctx.showFlowHeader : false;
  const scrollPad = ctx?.isDetalle ? '16px 16px 24px' : '18px 16px 26px';

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', justifyContent: 'center', background: C.bgApp }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: 480, height: '100dvh', display: 'flex', flexDirection: 'column', color: C.text, ...gridBackground }}>
        {/* Header de flujo (detalle de misión) */}
        {showHeader && (
          <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px 12px', borderBottom: '1px solid rgba(255,215,0,.1)', background: 'rgba(5,5,7,.6)' }}>
            <button
              type="button"
              onClick={ctx.onBack}
              aria-label="Atrás"
              style={{ width: 34, height: 34, flex: 'none', display: 'grid', placeItems: 'center', background: 'transparent', border: '1px solid rgba(255,255,255,.12)', clipPath: cut(7), color: C.text2, cursor: 'pointer' }}
            >
              <ChevronLeft size={16} strokeWidth={2.4} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <MicroLabel color={C.goldDeep} size={8.5} tracking=".12em">{ctx.flowStepLabel}</MicroLabel>
              <p style={{ margin: '3px 0 0', fontSize: 17, fontWeight: 900, letterSpacing: '-.03em', lineHeight: 1.05 }}>{ctx.flowTitle}</p>
            </div>
            <div style={{ flex: 'none', fontFamily: PIXEL, fontSize: 12, color: C.gold }}>{ctx.headerRight}</div>
          </div>
        )}

        {/* Área de scroll con la pantalla activa */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: scrollPad, WebkitOverflowScrolling: 'touch' }}>
          {!ctx || loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <MicroLabel color={C.text3} size={9} tracking=".1em" style={{ animation: 'bg-blink 1.3s infinite' }}>CARGANDO…</MicroLabel>
            </div>
          ) : ctx.isInicio ? (
            <PantallaAtletaInicio ctx={ctx} />
          ) : ctx.isMisiones ? (
            <PantallaAtletaMisiones ctx={ctx} />
          ) : ctx.isDetalle ? (
            <PantallaAtletaDetalle ctx={ctx} />
          ) : ctx.isProgreso ? (
            <PantallaAtletaProgreso ctx={ctx} />
          ) : ctx.isEventos ? (
            <PantallaAtletaEventos ctx={ctx} />
          ) : null}
        </div>

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

        {/* Nav inferior del atleta */}
        {showNav && <ArcadeBottomNav variant="atleta" active={ctx ? ctx.navActive : 'inicio'} onNavigate={actions.goTab} />}
      </div>
    </div>
  );
}
