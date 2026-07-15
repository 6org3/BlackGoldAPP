import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../AuthContext';
import { C, BORDER, GRAD, RADAR_FILL_INFO, cut, HEX, PIXEL, gridBackground } from './arcadeTokens';
import ArcadePerfilMenu from './ArcadePerfilMenu';
import HexAvatar from './HexAvatar';
import MicroLabel from './MicroLabel';
import RadarChart from './RadarChart';
import XPCells from './XPCells';
import ArcadeBottomNav from './ArcadeBottomNav';
import {
  fetchPadrePanel,
  fetchHijoDetalle,
  xpInfo,
  radar7,
  palabrasSimples,
  nombrePilar,
  proximoEvento,
  pagoActual,
  misionActual,
  estadoMision,
  responderRSVP,
  subirComprobante,
  linkWhatsApp,
} from './padreData';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS_SEM = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// ---- Demo (preview sin login) ----
const MOCK = {
  demo: true,
  parentLine: 'Papá de Mateo · Club Black Gold',
  hijoNombre: 'Mateo Chávez',
  inicial: 'M',
  pwr: 64,
  rangoLine: 'DESARROLLO 🔵',
  xp: { current: 1340, required: 1500, percentage: 89, filled: 9, faltan: 160, nextLevelName: 'Élite', esMax: false },
  radar: [
    { key: 'fuerza', label: 'FUERZA', value: 60 },
    { key: 'explosividad', label: 'EXPLO', value: 82 },
    { key: 'movilidad', label: 'MOVIL', value: 66 },
    { key: 'tiro', label: 'TIRO', value: 40 },
    { key: 'agilidad', label: 'AGIL', value: 70 },
    { key: 'tactica', label: 'TACT', value: 52 },
    { key: 'resiliencia', label: 'RESIL', value: 74 },
  ],
  simples: { mejor: { key: 'explosividad' }, peor: { key: 'tiro' } },
  evento: { titulo: 'Amistoso vs Aurora', fechaLine: 'Sáb 18 jul · 10:00 · Cancha Central' },
  pago: { titulo: 'Julio 2026', monto: 35, estadoLabel: '⚠ PENDIENTE · VENCE 5 JUL', vencido: true },
  historial: [{ m: 'Junio' }, { m: 'Mayo' }, { m: 'Abril' }],
  mision: { titulo: 'Pliometría N1', desc: '3×6 saltos al cajón', estadoLabel: 'EN REVISIÓN', xp: 50 },
  comunicados: [
    { icon: '📣', titulo: 'Uniformes nuevos disponibles', sub: 'Retirar en secretaría · esta semana' },
    { icon: '💧', titulo: 'Traer botella de agua', sub: 'Recomendación del staff físico' },
  ],
};

function fechaEventoLine(ev) {
  if (!ev) return '';
  let fecha = '';
  if (ev.fecha_evento) {
    // fecha_evento es TIMESTAMPTZ: tomar solo la parte YYYY-MM-DD para evitar
    // corrimientos de zona horaria al construir el Date.
    const [y, m, d] = String(ev.fecha_evento).slice(0, 10).split('-').map(Number);
    if (y && m && d) {
      const dt = new Date(y, m - 1, d);
      fecha = `${DIAS_SEM[dt.getDay()]} ${d} ${MESES[m - 1].slice(0, 3).toLowerCase()}`;
    }
  }
  return [fecha, (ev.hora_inicio || '').slice(0, 5), ev.sede].filter(Boolean).join(' · ');
}

function buildVM(hijo, detalle, user) {
  const xp = xpInfo(hijo);
  const radar = radar7(hijo);
  const simples = palabrasSimples(radar);
  const conv = proximoEvento(detalle?.convocatorias);
  const ev = conv?.eventos || null;
  const pago = pagoActual(detalle?.estadoCuenta);
  const mision = misionActual(detalle?.misiones);
  const em = estadoMision(mision);
  const historial = (detalle?.estadoCuenta?.historial || []).slice(0, 3).map((p) => ({ m: MESES[(p.mes || 1) - 1] || p.concepto || 'Pago' }));
  const comun = (detalle?.comunicaciones || []).slice(0, 2).map((c) => ({ icon: '📣', titulo: c.titulo, sub: c.mensaje }));
  const anuncios = comun.length ? comun : (detalle?.anuncios || []).slice(0, 2).map((c) => ({ icon: '📣', titulo: c.titulo, sub: c.mensaje }));

  return {
    demo: false,
    parentLine: `${user.nombre || 'Representante'} · ${hijo.categoria || user.club || 'Club Black Gold'}`,
    hijoNombre: hijo.nombre || 'Atleta',
    inicial: (hijo.nombre || '?').charAt(0),
    pwr: hijo.overall_score || 0,
    rangoLine: `${(xp.rangoNombre || '').toUpperCase()} ${xp.emoji}`,
    xp,
    radar,
    simples,
    evento: ev ? { titulo: ev.titulo || (ev.rival ? `vs ${ev.rival}` : 'Evento'), fechaLine: fechaEventoLine(ev), convId: conv.id, estadoRsvp: conv.estado_rsvp } : null,
    pago: pago
      ? {
          id: pago.id,
          titulo: pago.concepto || `${MESES[(pago.mes || 1) - 1] || ''} ${pago.anio || ''}`.trim(),
          monto: Math.max(0, (pago.monto_final || 0) - (pago.monto_pagado || 0)),
          estadoLabel: pago.estado === 'Vencido' ? `⚠ VENCIDO` : pago.estado === 'Por Verificar' ? 'ENVIADO · POR VERIFICAR' : `⚠ ${(pago.estado || 'PENDIENTE').toUpperCase()}`,
          vencido: pago.estado === 'Vencido' || pago.estado === 'Pendiente',
          yaEnviado: pago.estado === 'Por Verificar' || !!pago.ultimo_comprobante,
        }
      : null,
    historial,
    mision: mision ? { titulo: mision.titulo, desc: mision.descripcion, estadoLabel: em.label, xp: mision.xpRecompensa || 0 } : null,
    comunicados: anuncios,
  };
}

export default function VistaPadreArcade() {
  const { user } = useAuth();
  const esPadre = user && user.rol === 'padre';
  const [hijos, setHijos] = useState([]);
  const [idx, setIdx] = useState(0);
  const [detalle, setDetalle] = useState(null); // { atletaId, data }
  const [acciones, setAcciones] = useState({}); // { [key]: { confirmado, pagado } }
  const [nav, setNav] = useState('base');
  const fileRef = useRef(null);

  useEffect(() => {
    if (!esPadre) return undefined;
    let alive = true;
    fetchPadrePanel(user).then(({ hijos: hs }) => {
      if (alive) setHijos(hs);
    });
    return () => {
      alive = false;
    };
  }, [esPadre, user]);

  const hijo = hijos[idx];

  useEffect(() => {
    if (!esPadre || !hijo) return undefined;
    let alive = true;
    fetchHijoDetalle(user, hijo).then((d) => {
      if (alive) setDetalle({ atletaId: hijo.atleta_id, data: d });
    });
    return () => {
      alive = false;
    };
  }, [esPadre, user, hijo]);

  // `detalle` keyed por atletaId: si no coincide con el hijo actual, sigue cargando.
  const dt = detalle && hijo && detalle.atletaId === hijo.atleta_id ? detalle.data : null;
  const cargando = esPadre && (!hijo || !dt);
  const vm = !esPadre ? MOCK : hijo && dt ? buildVM(hijo, dt, user) : null;

  const accKey = hijo?.atleta_id || 'demo';
  const acc = acciones[accKey] || {};
  const setAccion = (patch) => setAcciones((a) => ({ ...a, [accKey]: { ...a[accKey], ...patch } }));
  const confirmado = !!acc.confirmado || (!!vm && !vm.demo && vm.evento?.estadoRsvp === 'asiste');
  const pagado = !!acc.pagado || (!!vm && !vm.demo && !!vm.pago?.yaEnviado);

  const goSection = (key) => {
    setNav(key);
    const el = document.getElementById(`padre-${key}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const onConfirmar = async () => {
    setAccion({ confirmado: true });
    if (vm && !vm.demo && vm.evento?.convId && user) {
      try {
        await responderRSVP(vm.evento.convId, 'asiste', user.id);
      } catch {
        setAccion({ confirmado: false });
      }
    }
  };

  const onPagar = () => {
    if (!vm || vm.demo || !vm.pago) {
      setAccion({ pagado: true });
      return;
    }
    fileRef.current?.click();
  };

  const onFileComprobante = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !hijo || !vm?.pago) return;
    try {
      await subirComprobante({ pagoId: vm.pago.id, atletaId: hijo.atleta_id, file }, user.id);
      setAccion({ pagado: true });
    } catch {
      /* el input se limpia; el padre puede reintentar */
    }
  };

  const onWhatsApp = () => {
    const numero = dt?.clubConfig?.whatsapp_club || null;
    const texto = `Hola, soy representante de ${vm?.hijoNombre || ''}. Consulta sobre el pago ${vm?.pago?.titulo || ''}.`;
    const url = linkWhatsApp(numero, texto);
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', justifyContent: 'center', background: C.bgApp }}>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={onFileComprobante} style={{ display: 'none' }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', color: C.text, ...gridBackground }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 16px 96px', WebkitOverflowScrolling: 'touch' }}>
          {/* Cabecera */}
          <div id="padre-base" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
            <div>
              <MicroLabel color={C.text3} size={8.5} tracking=".08em" style={{ marginBottom: 4 }}>MI REPRESENTADO</MicroLabel>
              <p style={{ margin: 0, fontSize: 12, color: C.text2 }}>{vm?.parentLine || (user?.nombre ?? '…')}</p>
            </div>
            {/* Avatar del representante = menú de perfil (la salida de sesión del
                portal). Ocupa el hueco del hex decorativo de campana, que no
                enrutaba a ninguna bandeja de notificaciones. */}
            <ArcadePerfilMenu size={34} initial={(user?.nombre || '?').charAt(0).toUpperCase()} />
          </div>

          {/* Selector de hijos (si hay varios) */}
          {hijos.length > 1 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {hijos.map((h, i) => (
                <button
                  key={h.atleta_id || i}
                  type="button"
                  onClick={() => setIdx(i)}
                  style={{
                    padding: '7px 12px',
                    clipPath: cut(7),
                    fontFamily: PIXEL,
                    fontSize: 9,
                    cursor: 'pointer',
                    background: i === idx ? 'rgba(96,165,250,.14)' : 'transparent',
                    border: `1px solid ${i === idx ? BORDER.info : BORDER.neutral}`,
                    color: i === idx ? C.info : C.text3,
                  }}
                >
                  {(h.nombre || '?').split(' ')[0]}
                </button>
              ))}
            </div>
          )}

          {cargando ? (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <MicroLabel color={C.text3} size={9} tracking=".1em" style={{ animation: 'bg-blink 1.3s infinite' }}>CARGANDO…</MicroLabel>
            </div>
          ) : (
            <>
              {/* Card del hijo */}
              <div style={{ background: GRAD.heroInfo, border: `1px solid ${BORDER.info}`, clipPath: cut(14), padding: 16, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <HexAvatar size={66} initial={vm.inicial} background={GRAD.infoAvatar} color={C.ink} style={{ filter: 'drop-shadow(0 0 14px rgba(96,165,250,.5))', fontSize: 24 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 20, fontWeight: 900, letterSpacing: '-.02em' }}>{vm.hijoNombre}</p>
                    <MicroLabel color={C.info} size={9} tracking="normal" style={{ marginTop: 4 }}>{vm.rangoLine}</MicroLabel>
                  </div>
                  <div style={{ textAlign: 'center', flex: 'none' }}>
                    <p style={{ margin: 0, fontFamily: PIXEL, fontSize: 26, color: C.gold }}>{vm.pwr}</p>
                    <MicroLabel color={C.text3} size={8} tracking="normal" style={{ marginTop: 2 }}>PWR</MicroLabel>
                  </div>
                </div>
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <MicroLabel color={C.text3} size={8.5} tracking="normal">XP {vm.xp.current.toLocaleString()} / {vm.xp.required.toLocaleString()}</MicroLabel>
                    <MicroLabel color={C.gold} size={8.5} tracking="normal">{vm.xp.percentage}%</MicroLabel>
                  </div>
                  <XPCells filled={vm.xp.filled} label="Progreso de XP" />
                  <MicroLabel color={C.text3} size={8.5} tracking="normal" style={{ margin: '6px 0 0', textAlign: 'right' }}>
                    {vm.xp.esMax ? 'NIVEL MÁXIMO ⭐' : `FALTAN ${vm.xp.faltan.toLocaleString()} XP → ${(vm.xp.nextLevelName || '').toUpperCase()} ⭐`}
                  </MicroLabel>
                </div>
              </div>

              {/* Próximo evento */}
              <MicroLabel color={C.text3} size={9.5} style={{ margin: '0 0 8px' }} as="p">PRÓXIMO EVENTO</MicroLabel>
              {vm.evento ? (
                <div id="padre-eventos" style={{ background: C.card, border: `1px solid ${confirmado ? BORDER.okSoft : BORDER.neutral}`, clipPath: cut(12), padding: 15, marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, clipPath: HEX, background: 'rgba(52,211,153,.16)', display: 'grid', placeItems: 'center', fontSize: 20, flex: 'none' }} aria-hidden="true">🏀</div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{vm.evento.titulo}</p>
                      <p style={{ margin: '3px 0 0', fontSize: 11.5, color: C.text2 }}>{vm.evento.fechaLine}</p>
                    </div>
                  </div>
                  <button type="button" onClick={onConfirmar} disabled={confirmado} style={{ width: '100%', marginTop: 14, padding: 15, clipPath: cut(12), fontFamily: PIXEL, fontSize: 11, letterSpacing: '.04em', cursor: confirmado ? 'default' : 'pointer', background: confirmado ? 'rgba(52,211,153,.14)' : GRAD.goldText, color: confirmado ? C.ok : C.ink, border: confirmado ? `1px solid ${BORDER.okSoft}` : '1px solid transparent' }}>
                    {confirmado ? '✓ ASISTENCIA CONFIRMADA' : 'CONFIRMAR ASISTENCIA'}
                  </button>
                </div>
              ) : (
                <div id="padre-eventos" style={{ background: C.card, border: `1px dashed ${BORDER.neutralSoft}`, clipPath: cut(12), padding: 15, marginBottom: 14 }}>
                  <p style={{ margin: 0, fontSize: 12, color: C.text3 }}>Sin eventos próximos.</p>
                </div>
              )}

              {/* Pagos */}
              <MicroLabel color={C.text3} size={9.5} style={{ margin: '0 0 8px' }} as="p">PAGOS · MENSUALIDAD</MicroLabel>
              {vm.pago ? (
                <div id="padre-pagos" style={{ background: C.card, border: `1px solid ${pagado ? 'rgba(52,211,153,.3)' : BORDER.warn}`, clipPath: cut(12), padding: 15, marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{vm.pago.titulo}</p>
                      <MicroLabel color={pagado ? C.ok : C.warn} size={9} tracking=".04em" style={{ marginTop: 3 }}>
                        {pagado ? 'ENVIADO · POR VERIFICAR' : vm.pago.estadoLabel}
                      </MicroLabel>
                    </div>
                    <p style={{ margin: 0, fontFamily: PIXEL, fontSize: 20, color: pagado ? C.ok : C.warn }}>${vm.pago.monto}</p>
                  </div>
                  {!pagado ? (
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                      <button type="button" onClick={onPagar} style={{ flex: 1, padding: 13, background: GRAD.goldText, color: C.ink, border: 'none', clipPath: cut(10), fontFamily: PIXEL, fontSize: 9.5, cursor: 'pointer' }}>
                        💳 PAGAR ${vm.pago.monto}
                      </button>
                      <button type="button" onClick={onWhatsApp} style={{ flex: 1, padding: 13, background: 'transparent', border: `1px solid rgba(37,211,102,.45)`, color: C.whatsapp, clipPath: cut(10), fontFamily: PIXEL, fontSize: 9.5, cursor: 'pointer' }}>
                        WHATSAPP
                      </button>
                    </div>
                  ) : (
                    <div style={{ marginTop: 14, textAlign: 'center', padding: 13, background: 'rgba(52,211,153,.12)', border: `1px solid ${BORDER.okSoft}`, color: C.ok, clipPath: cut(10), fontFamily: PIXEL, fontSize: 10, animation: 'bg-pop .4s ease-out' }}>
                      ✓ PAGO ENVIADO · POR VERIFICAR
                    </div>
                  )}
                  {vm.historial.length > 0 && (
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${BORDER.neutral06}`, display: 'flex', gap: 16 }}>
                      {vm.historial.map((p, i) => (
                        <div key={i}>
                          <p style={{ margin: 0, fontSize: 11, color: C.ok, fontWeight: 700 }}>✓ {p.m}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 9.5, color: C.text3 }}>Pagado</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div id="padre-pagos" style={{ background: C.card, border: `1px solid rgba(52,211,153,.3)`, clipPath: cut(12), padding: 15, marginBottom: 14 }}>
                  <MicroLabel color={C.ok} size={10} tracking=".04em">✓ AL DÍA · SIN PAGOS PENDIENTES</MicroLabel>
                </div>
              )}

              {/* Misión actual */}
              <MicroLabel color={C.text3} size={9.5} style={{ margin: '0 0 8px' }} as="p">SU MISIÓN ACTUAL</MicroLabel>
              {vm.mision ? (
                <div id="padre-misiones" style={{ background: C.card, border: `1px solid ${BORDER.ai}`, clipPath: cut(12), padding: 15, marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{vm.mision.titulo}</p>
                      {vm.mision.desc && <p style={{ margin: '3px 0 0', fontSize: 11, color: C.text2 }}>{vm.mision.desc}</p>}
                    </div>
                    <span style={{ fontFamily: PIXEL, fontSize: 9, color: C.ai, border: `1px solid rgba(168,85,247,.4)`, padding: '6px 9px', flex: 'none' }}>{vm.mision.estadoLabel}</span>
                  </div>
                  {vm.mision.xp > 0 && (
                    <p style={{ margin: '10px 0 0', fontSize: 11, color: C.text2 }}>
                      <b style={{ color: C.gold }}>+{vm.mision.xp} XP</b> al aprobar
                    </p>
                  )}
                </div>
              ) : (
                <div id="padre-misiones" style={{ background: C.card, border: `1px dashed ${BORDER.neutralSoft}`, clipPath: cut(12), padding: 15, marginBottom: 14 }}>
                  <p style={{ margin: 0, fontSize: 12, color: C.text3 }}>Sin misión asignada.</p>
                </div>
              )}

              {/* 7 pilares */}
              <MicroLabel color={C.text3} size={9.5} style={{ margin: '0 0 8px' }} as="p">SUS 7 PILARES</MicroLabel>
              <div style={{ background: C.card, border: `1px solid ${BORDER.gold}`, clipPath: cut(12), padding: '10px 14px 4px', marginBottom: 14, textAlign: 'center' }}>
                <RadarChart axes={vm.radar} accent={C.info} fill={RADAR_FILL_INFO} rings={[0.4, 0.7]} />
                {vm.simples && (
                  <div style={{ textAlign: 'left', background: 'rgba(96,165,250,.06)', border: `1px solid rgba(96,165,250,.2)`, clipPath: cut(8), padding: '11px 12px', margin: '2px 0 12px' }}>
                    <MicroLabel color={C.ai} size={8} tracking=".06em" style={{ marginBottom: 5 }}>✦ EN PALABRAS SIMPLES</MicroLabel>
                    <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }}>
                      Lo que mejor va: <b style={{ color: C.ok }}>{nombrePilar(vm.simples.mejor.key)}</b>. A mejorar:{' '}
                      <b style={{ color: C.warn }}>{nombrePilar(vm.simples.peor.key)}</b>.
                    </p>
                  </div>
                )}
              </div>

              {/* Comunicados */}
              <MicroLabel color={C.text3} size={9.5} style={{ margin: '0 0 8px' }} as="p">COMUNICADOS DEL CLUB</MicroLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {vm.comunicados.length ? (
                  vm.comunicados.map((c, i) => (
                    <div key={i} style={{ display: 'flex', gap: 11, background: C.card, border: `1px solid ${BORDER.neutral}`, clipPath: cut(10), padding: '12px 13px' }}>
                      <span style={{ fontSize: 16, flex: 'none' }} aria-hidden="true">{c.icon}</span>
                      <div>
                        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700 }}>{c.titulo}</p>
                        {c.sub && <p style={{ margin: '2px 0 0', fontSize: 10.5, color: C.text3 }}>{c.sub}</p>}
                      </div>
                    </div>
                  ))
                ) : (
                  <p style={{ margin: 0, fontSize: 12, color: C.text3 }}>Sin comunicados.</p>
                )}
              </div>
            </>
          )}
        </div>

        <ArcadeBottomNav variant="padre" active={nav} onNavigate={goSection} />
      </div>
    </div>
  );
}
