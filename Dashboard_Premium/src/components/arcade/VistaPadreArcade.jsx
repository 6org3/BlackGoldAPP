import { useState } from 'react';
import { C, BORDER, GRAD, cut, HEX, PIXEL, gridBackground } from './arcadeTokens';
import HexAvatar from './HexAvatar';
import MicroLabel from './MicroLabel';
import XPCells from './XPCells';
import ArcadeBottomNav from './ArcadeBottomNav';

/* Radar simple de 7 pilares (mock del prototipo). ▲ Fase 5: reemplazar el
   polígono de datos por los pilares reales del atleta (Recharts o SVG). */
function RadarPilares() {
  return (
    <svg viewBox="0 0 260 215" width="82%" style={{ margin: '0 auto' }} role="img" aria-label="Radar de 7 pilares">
      <polygon points="130,84.9 151.2,95.1 156.4,118 141.7,136.4 118.3,136.4 103.6,118 108.8,95.1" fill="none" stroke="rgba(255,255,255,.07)" />
      <polygon points="130,57.9 172.3,78.2 182.8,124 153.5,160.8 106.5,160.8 77.2,124 87.7,78.2" fill="none" stroke="rgba(255,255,255,.07)" />
      <polygon points="130,30 194.1,60.9 209.9,130.2 165.6,185.9 94.4,185.9 50.1,130.2 65.9,60.9" fill="none" stroke="rgba(255,215,0,.12)" />
      <polygon points="130,64.4 176.2,75.2 182.8,124 145.7,144.5 105.1,163.7 79.6,123.5 86.4,77.2" fill="rgba(96,165,250,.18)" stroke="#60A5FA" strokeWidth="2" />
      <text x="130" y="18" fill="#9CA3AF" textAnchor="middle" fontFamily="Silkscreen" style={{ fontSize: 7 }}>FUERZA</text>
      <text x="212" y="52" fill="#9CA3AF" textAnchor="middle" fontFamily="Silkscreen" style={{ fontSize: 7 }}>EXPLO</text>
      <text x="234" y="138" fill="#9CA3AF" textAnchor="middle" fontFamily="Silkscreen" style={{ fontSize: 7 }}>MOVIL</text>
      <text x="173" y="206" fill="#9CA3AF" textAnchor="middle" fontFamily="Silkscreen" style={{ fontSize: 7 }}>TIRO</text>
      <text x="87" y="206" fill="#9CA3AF" textAnchor="middle" fontFamily="Silkscreen" style={{ fontSize: 7 }}>AGIL</text>
      <text x="28" y="138" fill="#9CA3AF" textAnchor="middle" fontFamily="Silkscreen" style={{ fontSize: 7 }}>TACT</text>
      <text x="52" y="52" fill="#9CA3AF" textAnchor="middle" fontFamily="Silkscreen" style={{ fontSize: 7 }}>RESIL</text>
    </svg>
  );
}

const SECTION_LABEL = { margin: '0 0 8px' };

export default function VistaPadreArcade() {
  const [confirmado, setConfirmado] = useState(false);
  const [pagado, setPagado] = useState(false);
  const [nav, setNav] = useState('base');

  const goSection = (key) => {
    setNav(key);
    const el = document.getElementById(`padre-${key}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', justifyContent: 'center', background: C.bgApp }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', color: C.text, ...gridBackground }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 16px 24px', WebkitOverflowScrolling: 'touch' }}>
          {/* Cabecera */}
          <div id="padre-base" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
            <div>
              <MicroLabel color={C.text3} size={8.5} tracking=".08em" style={{ marginBottom: 4 }}>MI REPRESENTADO</MicroLabel>
              <p style={{ margin: 0, fontSize: 12, color: C.text2 }}>Papá de Mateo · Club Black Gold</p>
            </div>
            <div style={{ width: 34, height: 34, clipPath: HEX, background: 'rgba(255,255,255,.06)', display: 'grid', placeItems: 'center', fontSize: 15, flex: 'none' }} aria-hidden="true">
              🔔
            </div>
          </div>

          {/* Card del hijo */}
          <div style={{ background: GRAD.heroInfo, border: `1px solid ${BORDER.info}`, clipPath: cut(14), padding: 16, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <HexAvatar size={66} initial="M" background={GRAD.infoAvatar} color={C.ink} style={{ filter: 'drop-shadow(0 0 14px rgba(96,165,250,.5))', fontSize: 24 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 900, letterSpacing: '-.02em' }}>Mateo Chávez</p>
                <MicroLabel color={C.info} size={9} tracking="normal" style={{ marginTop: 4 }}>LVL 12 · DESARROLLO 🔵</MicroLabel>
              </div>
              <div style={{ textAlign: 'center', flex: 'none' }}>
                <p style={{ margin: 0, fontFamily: PIXEL, fontSize: 26, color: C.gold }}>64</p>
                <MicroLabel color={C.text3} size={8} tracking="normal" style={{ marginTop: 2 }}>PWR</MicroLabel>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <MicroLabel color={C.text3} size={8.5} tracking="normal">XP 1,340 / 1,500</MicroLabel>
                <MicroLabel color={C.gold} size={8.5} tracking="normal">89%</MicroLabel>
              </div>
              <XPCells filled={9} label="Progreso de XP hacia Elite" />
              <MicroLabel color={C.text3} size={8.5} tracking="normal" style={{ margin: '6px 0 0', textAlign: 'right' }}>FALTAN 160 XP → ELITE ⭐</MicroLabel>
            </div>
          </div>

          {/* Próximo evento */}
          <MicroLabel color={C.text3} size={9.5} style={SECTION_LABEL} as="p">PRÓXIMO EVENTO</MicroLabel>
          <div id="padre-eventos" style={{ background: C.card, border: `1px solid ${confirmado ? BORDER.okSoft : BORDER.neutral}`, clipPath: cut(12), padding: 15, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, clipPath: HEX, background: 'rgba(52,211,153,.16)', display: 'grid', placeItems: 'center', fontSize: 20, flex: 'none' }} aria-hidden="true">🏀</div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Amistoso vs Aurora</p>
                <p style={{ margin: '3px 0 0', fontSize: 11.5, color: C.text2 }}>Sáb 18 jul · 10:00 · Cancha Central</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConfirmado(true)}
              disabled={confirmado}
              style={{
                width: '100%',
                marginTop: 14,
                padding: 15,
                clipPath: cut(12),
                fontFamily: PIXEL,
                fontSize: 11,
                letterSpacing: '.04em',
                cursor: confirmado ? 'default' : 'pointer',
                background: confirmado ? 'rgba(52,211,153,.14)' : GRAD.goldText,
                color: confirmado ? C.ok : C.ink,
                border: confirmado ? `1px solid ${BORDER.okSoft}` : '1px solid transparent',
              }}
            >
              {confirmado ? '✓ ASISTENCIA CONFIRMADA' : 'CONFIRMAR ASISTENCIA'}
            </button>
          </div>

          {/* Pagos */}
          <MicroLabel color={C.text3} size={9.5} style={SECTION_LABEL} as="p">PAGOS · MENSUALIDAD</MicroLabel>
          <div id="padre-pagos" style={{ background: C.card, border: `1px solid ${pagado ? 'rgba(52,211,153,.3)' : BORDER.warn}`, clipPath: cut(12), padding: 15, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Julio 2026</p>
                <MicroLabel color={pagado ? C.ok : C.warn} size={9} tracking=".04em" style={{ marginTop: 3 }}>
                  {pagado ? 'ENVIADO · POR VERIFICAR' : '⚠ PENDIENTE · VENCE 5 JUL'}
                </MicroLabel>
              </div>
              <p style={{ margin: 0, fontFamily: PIXEL, fontSize: 20, color: pagado ? C.ok : C.warn }}>$35</p>
            </div>
            {!pagado ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button type="button" onClick={() => setPagado(true)} style={{ flex: 1, padding: 13, background: GRAD.goldText, color: C.ink, border: 'none', clipPath: cut(10), fontFamily: PIXEL, fontSize: 9.5, cursor: 'pointer' }}>
                  💳 PAGAR $35
                </button>
                <button type="button" style={{ flex: 1, padding: 13, background: 'transparent', border: `1px solid rgba(37,211,102,.45)`, color: C.whatsapp, clipPath: cut(10), fontFamily: PIXEL, fontSize: 9.5, cursor: 'pointer' }}>
                  WHATSAPP
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 14, textAlign: 'center', padding: 13, background: 'rgba(52,211,153,.12)', border: `1px solid ${BORDER.okSoft}`, color: C.ok, clipPath: cut(10), fontFamily: PIXEL, fontSize: 10, animation: 'bg-pop .4s ease-out' }}>
                ✓ PAGO ENVIADO · POR VERIFICAR
              </div>
            )}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${BORDER.neutral06}`, display: 'flex', gap: 16 }}>
              {['Junio', 'Mayo', 'Abril'].map((m) => (
                <div key={m}>
                  <p style={{ margin: 0, fontSize: 11, color: C.ok, fontWeight: 700 }}>✓ {m}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 9.5, color: C.text3 }}>Pagado</p>
                </div>
              ))}
            </div>
          </div>

          {/* Misión actual */}
          <MicroLabel color={C.text3} size={9.5} style={SECTION_LABEL} as="p">SU MISIÓN ACTUAL</MicroLabel>
          <div id="padre-misiones" style={{ background: C.card, border: `1px solid ${BORDER.ai}`, clipPath: cut(12), padding: 15, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Pliometría N1</p>
                <p style={{ margin: '3px 0 0', fontSize: 11, color: C.text2 }}>3×6 saltos al cajón</p>
              </div>
              <span style={{ fontFamily: PIXEL, fontSize: 9, color: C.ai, border: `1px solid rgba(168,85,247,.4)`, padding: '6px 9px', flex: 'none' }}>EN REVISIÓN</span>
            </div>
            <div style={{ marginTop: 12 }}>
              <XPCells filled={8} height={7} fill={C.ai} fillGlow="none" empty="rgba(255,255,255,.08)" cut={false} label="Progreso de la misión" />
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 11, color: C.text2 }}>
              Enviado ayer · el coach lo revisa · <b style={{ color: C.gold }}>+50 XP</b> al aprobar
            </p>
          </div>

          {/* 7 pilares */}
          <MicroLabel color={C.text3} size={9.5} style={SECTION_LABEL} as="p">SUS 7 PILARES</MicroLabel>
          <div style={{ background: C.card, border: `1px solid ${BORDER.gold}`, clipPath: cut(12), padding: '10px 14px 4px', marginBottom: 14, textAlign: 'center' }}>
            <RadarPilares />
            <div style={{ textAlign: 'left', background: 'rgba(96,165,250,.06)', border: `1px solid rgba(96,165,250,.2)`, clipPath: cut(8), padding: '11px 12px', margin: '2px 0 12px' }}>
              <MicroLabel color={C.ai} size={8} tracking=".06em" style={{ marginBottom: 5 }}>✦ EN PALABRAS SIMPLES</MicroLabel>
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }}>
                Lo que mejor va: <b style={{ color: C.ok }}>su explosividad</b> (salta muy bien). A mejorar:{' '}
                <b style={{ color: C.warn }}>el tiro</b> y tomar más agua en los entrenos.
              </p>
            </div>
          </div>

          {/* Comunicados */}
          <MicroLabel color={C.text3} size={9.5} style={SECTION_LABEL} as="p">COMUNICADOS DEL CLUB</MicroLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 11, background: C.card, border: `1px solid ${BORDER.neutral}`, clipPath: cut(10), padding: '12px 13px' }}>
              <span style={{ fontSize: 16, flex: 'none' }} aria-hidden="true">📣</span>
              <div>
                <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700 }}>Uniformes nuevos disponibles</p>
                <p style={{ margin: '2px 0 0', fontSize: 10.5, color: C.text3 }}>Retirar en secretaría · esta semana</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 11, background: C.card, border: `1px solid ${BORDER.neutral}`, clipPath: cut(10), padding: '12px 13px' }}>
              <span style={{ fontSize: 16, flex: 'none' }} aria-hidden="true">💧</span>
              <div>
                <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700 }}>Traer botella de agua</p>
                <p style={{ margin: '2px 0 0', fontSize: 10.5, color: C.text3 }}>Recomendación del staff físico</p>
              </div>
            </div>
          </div>
        </div>

        <ArcadeBottomNav variant="padre" active={nav} onNavigate={goSection} />
      </div>
    </div>
  );
}
