import { PIXEL, C, cut, HEX, hueBg, hueFg } from './arcadeTokens';

/** Fila de ranking de coach (dueño · equipo): rango oro/plata/bronce + HexAvatar
 *  + nombre/categorías + métrica grande + 3 mini-stats + CellBar proporcional. */
export default function RankRow({ c }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${c.border}`, clipPath: cut(12), padding: '13px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ flex: 'none', fontFamily: PIXEL, fontSize: 13, color: c.rankColor, width: 22 }}>{c.rank}</span>
        <div style={{ width: 38, height: 38, clipPath: HEX, background: hueBg(c.hue), display: 'grid', placeItems: 'center', color: hueFg(c.hue), fontWeight: 900, fontSize: 13, flex: 'none' }}>{c.initial}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800 }}>{c.name}</p>
          <p style={{ margin: '2px 0 0', fontSize: 10, color: C.text3 }}>{c.cats}</p>
        </div>
        <div style={{ textAlign: 'right', flex: 'none' }}>
          <p style={{ margin: 0, fontFamily: PIXEL, fontSize: 16, color: c.rankColor }}>{c.metricVal}</p>
          <p style={{ margin: '2px 0 0', fontFamily: PIXEL, fontSize: 7, color: C.text3 }}>{c.metricLabel}</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 11, paddingTop: 11, borderTop: '1px solid rgba(255,255,255,.06)' }}>
        <div><p style={{ margin: 0, fontFamily: PIXEL, fontSize: 10, color: C.ok }}>{c.asist}</p><p style={{ margin: '2px 0 0', fontFamily: PIXEL, fontSize: 6.5, color: C.text3 }}>ASISTENCIA</p></div>
        <div><p style={{ margin: 0, fontFamily: PIXEL, fontSize: 10, color: C.text }}>{c.ses}</p><p style={{ margin: '2px 0 0', fontFamily: PIXEL, fontSize: 6.5, color: C.text3 }}>SESIONES</p></div>
        <div><p style={{ margin: 0, fontFamily: PIXEL, fontSize: 10, color: C.gold }}>{c.xp}</p><p style={{ margin: '2px 0 0', fontFamily: PIXEL, fontSize: 6.5, color: C.text3 }}>XP REPARTIDO</p></div>
      </div>
      <div style={{ display: 'flex', gap: 2, marginTop: 10 }}>
        {c.cells.map((cc, i) => (
          <span key={i} style={{ flex: 1, height: 6, background: cc }} />
        ))}
      </div>
    </div>
  );
}
