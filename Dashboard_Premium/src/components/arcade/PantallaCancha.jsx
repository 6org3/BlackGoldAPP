import { X } from 'lucide-react';
import { C, BORDER, GRAD, cut, PIXEL, hueFg, fmtClock } from './arcadeTokens';
import CutCard from './CutCard';
import HexAvatar from './HexAvatar';
import MicroLabel from './MicroLabel';
import LiveDot from './LiveDot';

const DIAS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const fechaHoy = () => {
  const d = new Date();
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} · ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
};

const TIPOS = [
  { key: 'grupal', emoji: '🏀', name: 'GRUPAL\nNIVELES', sub: 'Por bloque Micro→Elite', hero: true },
  { key: 'indiv', emoji: '🎯', name: 'GRUPAL\nINDIV.', sub: 'Grupo, plan por atleta' },
  { key: '1v1', emoji: '🤝', name: 'PRIVADA\n1V1', sub: 'Buscar atleta' },
  { key: 'eval', emoji: '🧪', name: 'EVALUACIÓN\nGRUPAL', sub: 'CMJ · Sprint · Tiro' },
];

export default function PantallaCancha({ state, actions, onClose, demo = true, coachInitial = 'PA', planned = [] }) {
  const sessions = state.sessions;
  const hasActive = sessions.length > 0;

  return (
    <div>
      {/* Cabecera */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <MicroLabel color={C.goldDeep} tracking=".1em" size={9} style={{ marginBottom: 6 }}>
            {fechaHoy()}
          </MicroLabel>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.04em', lineHeight: 1.05 }}>
            Modo{' '}
            <span style={{ background: GRAD.goldText, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
              Cancha
            </span>
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Salir de Modo Cancha"
            style={{
              width: 34,
              height: 34,
              flex: 'none',
              display: 'grid',
              placeItems: 'center',
              background: 'transparent',
              border: `1px solid ${BORDER.neutralSoft}`,
              clipPath: cut(7),
              color: C.text2,
              cursor: 'pointer',
            }}
          >
            <X size={16} strokeWidth={2.4} />
          </button>
          <HexAvatar initial={coachInitial} size={48} background={GRAD.goldHex} color={C.ink} glow style={{ fontSize: 15 }} />
        </div>
      </div>

      {/* Sesiones activas / vacío */}
      {hasActive ? (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
            <MicroLabel color={C.ok} size={9} tracking=".08em">
              <span aria-hidden="true" style={{ animation: 'bg-blink 1.3s infinite' }}>●</span> {sessions.length} SESIONES ACTIVAS
            </MicroLabel>
            <MicroLabel color={C.text3} size={8} tracking="normal">TOCA PARA ENTRAR</MicroLabel>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sessions.map((ss) => (
              <CutCard
                key={ss.id}
                onClick={() => actions.openSession(ss.id)}
                ariaLabel={`Entrar a ${ss.label}`}
                background={GRAD.activeGreenSoft}
                border="rgba(16,185,129,.3)"
                padding="11px 13px"
                style={{ display: 'flex', alignItems: 'center', gap: 11 }}
              >
                <LiveDot color={hueFg(ss.hue)} speed="1.6s" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{ss.label}</p>
                  <p style={{ margin: '1px 0 0', fontSize: 10, color: C.text3 }}>
                    {ss.block} · {ss.present} pres.
                  </p>
                </div>
                <span style={{ fontFamily: PIXEL, fontSize: 15, color: C.ok }}>{fmtClock(ss.elapsed)}</span>
              </CutCard>
            ))}
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(13,13,16,.7)',
            border: '1px dashed rgba(255,255,255,.14)',
            clipPath: cut(10),
            padding: '12px 14px',
            marginBottom: 18,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.text4, flex: 'none' }} />
          <MicroLabel color={C.text3} size={9} tracking=".06em">SIN SESIÓN ACTIVA</MicroLabel>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: C.text2 }}>Elige un tipo para empezar</span>
        </div>
      )}

      {/* Tipos de clase */}
      <MicroLabel color={C.text3} size={9.5} style={{ marginBottom: 10 }}>► NUEVA CLASE · TIPO</MicroLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
        {TIPOS.map((t) => (
          <CutCard
            key={t.key}
            cut={12}
            onClick={() => actions.pickType(t.key)}
            ariaLabel={t.name.replace('\n', ' ')}
            background={t.hero ? GRAD.heroGoldTile : C.card}
            border={t.hero ? BORDER.goldStrong : BORDER.neutralSoft}
            padding="16px 14px"
          >
            <p style={{ margin: '0 0 10px', fontSize: 24 }} aria-hidden="true">{t.emoji}</p>
            <p style={{ margin: 0, fontFamily: PIXEL, fontSize: 10, lineHeight: 1.4, whiteSpace: 'pre-line', color: t.hero ? C.gold : C.text }}>
              {t.name}
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 10.5, color: t.hero ? C.text2 : C.text3 }}>{t.sub}</p>
          </CutCard>
        ))}
      </div>

      {/* Programadas hoy — demo (ilustrativas) o agenda real (sesiones_control). */}
      {demo ? (
        <>
          <MicroLabel color={C.text3} size={9.5} style={{ marginBottom: 8 }}>PROGRAMADAS HOY</MicroLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <CutCard
              onClick={() => actions.pickType('grupal')}
              ariaLabel="Iniciar sesión Sub-16 Físico"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>16:00 · Sub-16 · Físico</p>
                <p style={{ margin: '2px 0 0', fontSize: 10, color: C.text3 }}>12 convocados · Prof. Andrade</p>
              </div>
              <span style={{ fontFamily: PIXEL, fontSize: 9.5, color: C.gold }}>INICIAR ►</span>
            </CutCard>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                background: C.card,
                border: `1px solid ${BORDER.neutral}`,
                clipPath: cut(10),
                padding: '12px 14px',
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>18:00 · Sub-14 · Técnico</p>
                <p style={{ margin: '2px 0 0', fontSize: 10, color: C.text3 }}>Manejo de balón N2</p>
              </div>
              <span style={{ fontFamily: PIXEL, fontSize: 9.5, color: C.text4 }}>18:00</span>
            </div>
          </div>
        </>
      ) : planned.length > 0 ? (
        <>
          <MicroLabel color={C.text3} size={9.5} style={{ marginBottom: 8 }}>PROGRAMADAS HOY</MicroLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {planned.map((p) => (
              <CutCard
                key={p.id}
                onClick={() => actions.pickType('grupal')}
                ariaLabel={`Iniciar ${p.label}`}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>{p.label}</p>
                  {p.sub && <p style={{ margin: '2px 0 0', fontSize: 10, color: C.text3 }}>{p.sub}</p>}
                </div>
                <span style={{ fontFamily: PIXEL, fontSize: 9.5, color: C.gold }}>INICIAR ►</span>
              </CutCard>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
