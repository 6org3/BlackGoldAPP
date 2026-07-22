import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Wallet, RefreshCw, Coins, Layers, AlertTriangle, Download } from 'lucide-react';
import { fetchPagosMes, fetchArqueoEfectivo, fetchTransaccionesRango, exportarTransaccionesCSV } from '../api/pagosService';
import ModalHUD from './arcade/ModalHUD';
import { C, BORDER, TINT, cut } from './arcade/arcadeTokens';

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/**
 * Cierre de caja / cierre mensual (owner). Tres vistas:
 * 1. Arqueo de efectivo por registrador (concilia coach→owner).
 * 2. Recaudado vs esperado por grupo (mensualidades del mes).
 * 3. Morosidad: pagos vencidos/abonados con saldo pendiente.
 */
export default function CajaResumen({ mes, anio }) {
  const [pagos, setPagos] = useState([]);
  const [arqueo, setArqueo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [modal, setModal] = useState(null);

  // Rango del mes para transacciones (fecha de cobro, no fecha del pago
  // generado) — el mismo criterio para arqueo de efectivo y export contable.
  // `hasta` termina en el último ms del mes: el servicio filtra con lte, y
  // cerrar en la medianoche del día 1 contaría ese instante en dos meses.
  const rangoMes = useCallback(() => ({
    desde: new Date(anio, mes - 1, 1).toISOString(),
    hasta: new Date(anio, mes, 0, 23, 59, 59, 999).toISOString(),
  }), [anio, mes]);

  const load = useCallback(async () => {
    setLoading(true);
    const { desde, hasta } = rangoMes();
    const [pgs, arq] = await Promise.all([
      fetchPagosMes(mes, anio, 'Todos'),
      fetchArqueoEfectivo(desde, hasta),
    ]);
    setPagos(pgs);
    setArqueo(arq);
    setLoading(false);
  }, [mes, anio, rangoMes]);

  useEffect(() => { load(); }, [load]);

  const handleExportarContador = async () => {
    setExportando(true);
    try {
      const { desde, hasta } = rangoMes();
      const transacciones = await fetchTransaccionesRango(desde, hasta);
      if (transacciones.length === 0) {
        setModal({ variant: 'alert', tone: 'info', icon: Download, eyebrow: 'Exportar', title: 'Sin transacciones', message: 'No hay transacciones registradas en este mes.' });
        return;
      }
      exportarTransaccionesCSV(transacciones, { mes, anio });
    } finally {
      setExportando(false);
    }
  };

  const totalEfectivo = useMemo(() => arqueo.reduce((a, r) => a + r.total, 0), [arqueo]);

  // Recaudado vs esperado por grupo.
  //
  // Se agrupa por el grupo QUE SE FACTURÓ (v39: pagos.grupo_id), no por el grupo
  // actual del atleta: mover a alguien de grupo reescribía el recaudado de meses
  // ya cerrados. Los pagos anteriores a v39 no tienen grupo_id y caen al nombre
  // denormalizado, que es lo mejor que hay para el histórico.
  //
  // `atletas` cuenta atletas DISTINTOS, no filas: desde v39 un mismo atleta
  // puede tener varias líneas en el mes (su cuota + un add-on por grupo extra),
  // y contarlas por fila inflaría el plantel del grupo.
  const porGrupo = useMemo(() => {
    const m = new Map();
    pagos.forEach(p => {
      if (p.estado === 'Anulado' || p.estado === 'Becado') return;
      const g = p.grupos_entrenamiento?.nombre || p.atletas?.grupo_nombre || 'Sin grupo';
      const row = m.get(g) || { grupo: g, esperado: 0, recaudado: 0, ids: new Set() };
      row.esperado += p.monto_final || 0;
      row.recaudado += p.monto_pagado || 0;
      if (p.atleta_id) row.ids.add(p.atleta_id);
      m.set(g, row);
    });
    return [...m.values()]
      .map(({ ids, ...r }) => ({ ...r, atletas: ids.size }))
      .sort((a, b) => b.esperado - a.esperado);
  }, [pagos]);

  const totales = useMemo(() => porGrupo.reduce(
    (a, g) => ({ esperado: a.esperado + g.esperado, recaudado: a.recaudado + g.recaudado }),
    { esperado: 0, recaudado: 0 }
  ), [porGrupo]);

  const morosos = useMemo(
    () => pagos
      .filter(p => p.estado === 'Vencido' || p.estado === 'Abonado')
      .map(p => ({
        nombre: p.atletas?.usuarios?.nombre || '—',
        grupo: p.atletas?.grupo_nombre || '—',
        estado: p.estado,
        saldo: Math.max((p.monto_final || 0) - (p.monto_pagado || 0), 0),
      }))
      .sort((a, b) => b.saldo - a.saldo),
    [pagos]
  );

  const pct = totales.esperado > 0 ? Math.round((totales.recaudado / totales.esperado) * 100) : 0;

  const rowStyle = { background: C.cardAlt1, border: `1px solid ${BORDER.neutralFaint}`, clipPath: cut(6) };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ background: C.card, border: `1px solid ${BORDER.okSoft}`, clipPath: cut(12), overflow: 'hidden' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ background: C.cardAlt1, borderBottom: `1px solid ${BORDER.neutral}` }}>
        <div className="flex items-center space-x-2">
          <Wallet size={16} style={{ color: C.ok }} />
          <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: C.ok }}>
            Cierre de caja · {MESES[mes]} {anio}
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleExportarContador} disabled={exportando}
            className="cut-focus flex items-center gap-1.5 px-3 min-h-11 md:min-h-9 text-2xs font-black uppercase tracking-widest transition-colors disabled:opacity-40"
            style={{ clipPath: cut(7), border: `1px solid ${BORDER.neutralSoft}`, color: C.text3 }}>
            <Download size={13} />
            <span>{exportando ? 'Exportando…' : 'Exportar para el contador'}</span>
          </button>
          <button onClick={load} aria-label="Recargar"
            className="cut-focus p-2 min-w-11 min-h-11 md:min-w-9 md:min-h-9 flex items-center justify-center transition-colors"
            style={{ color: C.text3 }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-center py-8 text-sm font-bold" style={{ color: C.text3 }}>Cargando…</p>
      ) : (
        <div className="p-4 space-y-6">
          {/* Arqueo de efectivo por registrador */}
          <section>
            <h4 className="text-2xs font-black uppercase tracking-widest mb-2 flex items-center gap-2" style={{ color: C.text2 }}>
              <Coins size={13} /> Efectivo recaudado por registrador · total <span style={{ color: C.text }}>${totalEfectivo.toFixed(2)}</span>
            </h4>
            {arqueo.length === 0 ? (
              <p className="text-2xs" style={{ color: C.text3 }}>Sin transacciones en efectivo este mes.</p>
            ) : (
              <div className="space-y-1.5">
                {arqueo.map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2" style={rowStyle}>
                    <span className="text-2xs font-bold" style={{ color: C.text }}>{r.nombre}</span>
                    <span className="text-2xs" style={{ color: C.text2 }}>{r.transacciones} mov. · <span className="font-black" style={{ color: C.text }}>${r.total.toFixed(2)}</span></span>
                  </div>
                ))}
                <p className="text-3xs mt-1" style={{ color: C.text3 }}>Concilia este total contra el efectivo entregado físicamente por cada coach. Cuenta lo cobrado (registrado) en {MESES[mes]}, incluidos abonos a cuotas de otros meses — por eso puede diferir del "Recaudado" del mes.</p>
              </div>
            )}
          </section>

          {/* Recaudado vs esperado por grupo */}
          <section>
            <h4 className="text-2xs font-black uppercase tracking-widest mb-2 flex items-center gap-2" style={{ color: C.text2 }}>
              <Layers size={13} /> Recaudado vs esperado · <span style={{ color: C.text }}>${totales.recaudado.toFixed(0)}</span> / ${totales.esperado.toFixed(0)} ({pct}%)
            </h4>
            <div className="space-y-1.5">
              {porGrupo.map(g => {
                const p = g.esperado > 0 ? Math.round((g.recaudado / g.esperado) * 100) : 0;
                return (
                  <div key={g.grupo} className="px-3 py-2" style={rowStyle}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-2xs font-bold" style={{ color: C.text }}>{g.grupo} <span style={{ color: C.text3 }}>· {g.atletas}</span></span>
                      <span className="text-2xs" style={{ color: C.text2 }}>${g.recaudado.toFixed(0)} / ${g.esperado.toFixed(0)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden" style={{ background: TINT.neutral }}>
                      <div className="h-full" style={{ width: `${Math.min(p, 100)}%`, background: C.okDeep }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Morosidad */}
          <section>
            <h4 className="text-2xs font-black uppercase tracking-widest mb-2 flex items-center gap-2" style={{ color: C.text2 }}>
              <AlertTriangle size={13} /> Morosidad ({morosos.length})
            </h4>
            {morosos.length === 0 ? (
              <p className="text-2xs" style={{ color: C.text3 }}>Sin saldos pendientes 🎉</p>
            ) : (
              <div className="space-y-1.5">
                {morosos.map((m, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2" style={rowStyle}>
                    <span className="text-2xs font-bold" style={{ color: C.text }}>{m.nombre} <span style={{ color: C.text3 }}>· {m.grupo}</span></span>
                    <span className="text-2xs font-black" style={{ color: m.estado === 'Vencido' ? C.danger : C.info }}>
                      {m.estado} · ${m.saldo.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <ModalHUD open={!!modal} {...(modal || {})} onClose={() => setModal(null)} />
    </motion.div>
  );
}
