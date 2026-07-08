import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Wallet, RefreshCw, Coins, Layers, AlertTriangle } from 'lucide-react';
import { fetchPagosMes, fetchArqueoEfectivo } from '../api/pagosService';

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

  const load = useCallback(async () => {
    setLoading(true);
    // Rango del mes para el arqueo de efectivo (transacciones, no fecha del pago).
    const desde = new Date(anio, mes - 1, 1).toISOString();
    const hasta = new Date(anio, mes, 1).toISOString();
    const [pgs, arq] = await Promise.all([
      fetchPagosMes(mes, anio, 'Todos'),
      fetchArqueoEfectivo(desde, hasta),
    ]);
    setPagos(pgs);
    setArqueo(arq);
    setLoading(false);
  }, [mes, anio]);

  useEffect(() => { load(); }, [load]);

  const totalEfectivo = useMemo(() => arqueo.reduce((a, r) => a + r.total, 0), [arqueo]);

  // Recaudado vs esperado por grupo
  const porGrupo = useMemo(() => {
    const m = new Map();
    pagos.forEach(p => {
      if (p.estado === 'Anulado' || p.estado === 'Becado') return;
      const g = p.atletas?.grupo_nombre || 'Sin grupo';
      const row = m.get(g) || { grupo: g, esperado: 0, recaudado: 0, atletas: 0 };
      row.esperado += p.monto_final || 0;
      row.recaudado += p.monto_pagado || 0;
      row.atletas += 1;
      m.set(g, row);
    });
    return [...m.values()].sort((a, b) => b.esperado - a.esperado);
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

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-panel border border-success/20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-black/40 border-b border-white/10">
        <div className="flex items-center space-x-2">
          <Wallet size={16} className="text-success-soft" />
          <h3 className="text-xs font-black uppercase tracking-widest text-success-soft">
            Cierre de caja · {MESES[mes]} {anio}
          </h3>
        </div>
        <button onClick={load} aria-label="Recargar" className="p-2 min-w-10 min-h-10 flex items-center justify-center text-fg-muted hover:text-white transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <p className="text-center py-8 text-sm text-fg-faint font-bold">Cargando…</p>
      ) : (
        <div className="p-4 space-y-6">
          {/* Arqueo de efectivo por registrador */}
          <section>
            <h4 className="text-2xs font-black uppercase tracking-widest text-fg-secondary mb-2 flex items-center gap-2">
              <Coins size={13} /> Efectivo recaudado por registrador · total <span className="text-white">${totalEfectivo.toFixed(2)}</span>
            </h4>
            {arqueo.length === 0 ? (
              <p className="text-2xs text-fg-faint">Sin transacciones en efectivo este mes.</p>
            ) : (
              <div className="space-y-1.5">
                {arqueo.map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 bg-black/20 border border-white/5 rounded-lg">
                    <span className="text-2xs font-bold text-white">{r.nombre}</span>
                    <span className="text-2xs text-fg-secondary">{r.transacciones} mov. · <span className="font-black text-white">${r.total.toFixed(2)}</span></span>
                  </div>
                ))}
                <p className="text-3xs text-fg-muted mt-1">Concilia este total contra el efectivo entregado físicamente por cada coach.</p>
              </div>
            )}
          </section>

          {/* Recaudado vs esperado por grupo */}
          <section>
            <h4 className="text-2xs font-black uppercase tracking-widest text-fg-secondary mb-2 flex items-center gap-2">
              <Layers size={13} /> Recaudado vs esperado · <span className="text-white">${totales.recaudado.toFixed(0)}</span> / ${totales.esperado.toFixed(0)} ({pct}%)
            </h4>
            <div className="space-y-1.5">
              {porGrupo.map(g => {
                const p = g.esperado > 0 ? Math.round((g.recaudado / g.esperado) * 100) : 0;
                return (
                  <div key={g.grupo} className="px-3 py-2 bg-black/20 border border-white/5 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-2xs font-bold text-white">{g.grupo} <span className="text-fg-muted">· {g.atletas}</span></span>
                      <span className="text-2xs text-fg-secondary">${g.recaudado.toFixed(0)} / ${g.esperado.toFixed(0)}</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-success/60 rounded-full" style={{ width: `${Math.min(p, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Morosidad */}
          <section>
            <h4 className="text-2xs font-black uppercase tracking-widest text-fg-secondary mb-2 flex items-center gap-2">
              <AlertTriangle size={13} /> Morosidad ({morosos.length})
            </h4>
            {morosos.length === 0 ? (
              <p className="text-2xs text-fg-faint">Sin saldos pendientes 🎉</p>
            ) : (
              <div className="space-y-1.5">
                {morosos.map((m, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 bg-black/20 border border-white/5 rounded-lg">
                    <span className="text-2xs font-bold text-white">{m.nombre} <span className="text-fg-muted">· {m.grupo}</span></span>
                    <span className={`text-2xs font-black ${m.estado === 'Vencido' ? 'text-danger-soft' : 'text-info-soft'}`}>
                      {m.estado} · ${m.saldo.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </motion.div>
  );
}
