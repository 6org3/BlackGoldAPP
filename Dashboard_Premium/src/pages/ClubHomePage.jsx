import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, ChevronRight, DollarSign, Droplets, TrendingUp } from 'lucide-react';
import { useAuth } from '../AuthContext';
import HomeShell, { ContextChip, SectionEyebrow, StatCard } from '../components/HomeShell';
import Gauge from '../components/Gauge';
import Plantel from '../components/Plantel';
import { tieneSenal } from '../lib/senalesAtleta';
import { recoveryPill } from '../lib/recoveryPill';
import { COLORS, getBaremoUI } from '../lib/designTokens';
import { mediasPorPilarGrupo } from '../lib/radarCalc';
import { PILARES } from '../../../packages/analytics-core/taxonomia.js';
import { fetchTodosLosAtletas } from '../api/atletasService';
import { fetchAsistenciaPct } from '../api/asistenciaService';
import { fetchPagosMes } from '../api/pagosService';

const ACCESOS = [
  { ruta: '/admin/kpis', label: 'KPIs del club', desc: 'Asistencia, pilares y tendencia', Icono: BarChart3 },
  { ruta: '/admin/pagos', label: 'Control de pagos', desc: 'Cobros, abonos y mora', Icono: DollarSign },
];

/** "$2.9k" para montos grandes, "$480" para el resto — centro compacto de los gauges de finanzas. */
const formatoCortoUSD = (v) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`);

/**
 * ClubHomePage (/club) — home nativo del owner: "estado del club".
 * Retrofit visual al mockup v6 (docs/mockup_v6_comparar_graficos.html,
 * ownerHome): gauges de asistencia/overall, rendimiento por pilar, pulso de
 * riesgo/retención (client-side, sin llamada al gateway) y finanzas del mes.
 * La card de privacidad de datos y el Plantel embebido se mantienen.
 */
export default function ClubHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [atletas, setAtletas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [asistenciaPct, setAsistenciaPct] = useState(null);
  const [pagos, setPagos] = useState([]);
  const [pagosCargando, setPagosCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    fetchTodosLosAtletas(user)
      .then((data) => { if (activo) setAtletas(data || []); })
      .catch((err) => console.error('Error cargando atletas del club:', err))
      .finally(() => { if (activo) setLoading(false); });
    return () => { activo = false; };
  }, [user]);

  useEffect(() => {
    if (atletas.length === 0) return undefined;
    let activo = true;
    fetchAsistenciaPct(atletas.map((a) => a.atleta_id), 7).then((pct) => {
      if (activo) setAsistenciaPct(pct);
    });
    return () => { activo = false; };
  }, [atletas]);

  useEffect(() => {
    let activo = true;
    const hoy = new Date();
    fetchPagosMes(hoy.getMonth() + 1, hoy.getFullYear())
      .then((data) => { if (activo) setPagos(data || []); })
      .catch((err) => console.error('Error cargando pagos del mes:', err))
      .finally(() => { if (activo) setPagosCargando(false); });
    return () => { activo = false; };
  }, []);

  const { total, overallMedio, porCategoria } = useMemo(() => {
    const conScore = atletas.filter((a) => (a.overall_score || 0) > 0);
    const media = conScore.length > 0
      ? Math.round(conScore.reduce((sum, a) => sum + a.overall_score, 0) / conScore.length)
      : null;
    const porCat = {};
    atletas.forEach((a) => {
      const cat = a.categoria || 'Sin categoría';
      porCat[cat] = (porCat[cat] || 0) + 1;
    });
    return {
      total: atletas.length,
      overallMedio: media,
      porCategoria: Object.entries(porCat).sort((x, y) => y[1] - x[1]),
    };
  }, [atletas]);

  // Mismo criterio que "Atletas a mirar hoy" del coach (lib/senalesAtleta):
  // señal client-side de recuperación/hidratación, sin llamada al gateway.
  const conSenal = useMemo(() => atletas.filter(tieneSenal), [atletas]);

  const mediasPilar = useMemo(
    () => mediasPorPilarGrupo(atletas.map((a) => a._evaluaciones)),
    [atletas],
  );

  // Misma derivación que AdminPagos.jsx (métricas del mes): recaudado =
  // Pagado + parte ya cobrada de Abonado/Vencido; porCobrar = el resto.
  const { recaudado, porCobrar } = useMemo(() => {
    const m = { recaudado: 0, porCobrar: 0 };
    pagos.forEach((p) => {
      const monto = p.monto_final || 0;
      const pagado = p.monto_pagado || 0;
      if (p.estado === 'Pagado') m.recaudado += monto;
      else if (p.estado === 'Pendiente' || p.estado === 'Por Verificar') m.porCobrar += monto - pagado;
      else if (p.estado === 'Abonado' || p.estado === 'Vencido') { m.recaudado += pagado; m.porCobrar += monto - pagado; }
    });
    return m;
  }, [pagos]);
  const totalFinanzas = recaudado + porCobrar;
  const pctCobrado = totalFinanzas > 0 ? Math.round((recaudado / totalFinanzas) * 100) : 0;

  return (
    <HomeShell
      eyebrow="Dueño del club"
      titulo={<>Club <span className="text-gradient-gold">{user.club || 'Black Gold'}</span></>}
      contexto={<ContextChip>📊 {user.club || 'Black Gold'} · solo tu club</ContextChip>}
    >
      {/* Datos privados y aislados (RLS por club, tono seguridad) */}
      <div className="rounded-card border border-success/25 bg-success/5 shadow-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-lg" aria-hidden="true">🔒</span>
            <div className="min-w-0">
              <p className="text-sm font-bold">Datos privados y aislados</p>
              <p className="text-2xs text-fg-muted mt-0.5">Solo tu staff accede. Ningún otro club ve a tus atletas.</p>
            </div>
          </div>
          <span className="inline-flex items-center text-2xs font-extrabold px-2.5 py-1 rounded-full border text-success-soft bg-success/10 border-success/25 shrink-0">
            Seguro
          </span>
        </div>
      </div>

      {/* Pulso del club: gauges + stats derivadas de los datos ya disponibles */}
      <SectionEyebrow pill="tu club">Pulso del club</SectionEyebrow>
      {loading ? (
        <div className="skeleton h-24" aria-hidden="true"></div>
      ) : (
        <>
          <div className="glass-card rounded-card p-4 flex items-center justify-around gap-3">
            <Gauge pct={asistenciaPct ?? 0} label="asistencia 7d" color={COLORS.feedback.success} />
            <Gauge pct={overallMedio ?? 0} valor={overallMedio ?? '—'} label="overall" color={COLORS.gold[500]} />
            <div className="flex flex-col gap-2">
              <StatCard valor={total} label="Atletas" />
              <StatCard valor={conSenal.length} label="En riesgo" tonoTexto="text-caution-soft" />
            </div>
          </div>

          <div className="glass-card rounded-card p-4 mt-3">
            <p className="text-2xs uppercase tracking-eyebrow text-fg-muted font-extrabold mb-3">Por categoría FEB</p>
            {porCategoria.length === 0 ? (
              <p className="text-xs text-fg-muted">Aún no hay atletas registrados.</p>
            ) : (
              porCategoria.map(([cat, n]) => (
                <div key={cat} className="mt-2 first:mt-0">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-fg-secondary">{cat}</span>
                    <span className="font-black text-brand">{n}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-sunken overflow-hidden mt-1">
                    <div className="h-full rounded-full progress-bar-glow" style={{ width: `${Math.round((n / total) * 100)}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Rendimiento por pilar: promedio del club (no por sub-pilar) */}
      <SectionEyebrow pill="tu club">Rendimiento por pilar</SectionEyebrow>
      <div className="glass-card rounded-card p-4">
        {PILARES.map(({ key, label }) => {
          const valor = mediasPilar[key] || 0;
          const ui = getBaremoUI(valor);
          return (
            <div key={key} className="mt-3 first:mt-0">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-fg-secondary">{label}</span>
                <span className="font-black" style={{ color: ui.hex }}>{valor}</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-sunken overflow-hidden mt-1.5">
                <div className="h-full rounded-full" style={{ width: `${valor}%`, background: ui.hex }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Riesgo / retención: señal client-side (readiness diario), no gateway */}
      <SectionEyebrow pill="✦ IA" pillTono="mental">Riesgo / retención</SectionEyebrow>
      <div className="rounded-card border border-mental/20 bg-surface-sunken p-4">
        {conSenal.length === 0 ? (
          <span className="inline-flex items-center gap-1.5 text-2xs font-extrabold px-2.5 py-1 rounded-full border text-success-soft bg-success/10 border-success/25">
            ● Sin señales hoy
          </span>
        ) : (
          <ul className="divide-y divide-white/5">
            {conSenal.slice(0, 3).map((a) => {
              const pill = recoveryPill(a.estado_recuperacion);
              const deshidratado = a.readiness_hoy && a.readiness_hoy.color_orina >= 5;
              return (
                <li key={a.atleta_id || a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-sm font-bold truncate">{a.nombre}</span>
                  <div className="flex flex-wrap justify-end gap-1.5 shrink-0">
                    {pill && (
                      <span className={`flex items-center gap-1 text-3xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${pill}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {a.estado_recuperacion}
                      </span>
                    )}
                    {deshidratado && (
                      <span className="flex items-center gap-1 text-3xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-brand/40 text-brand bg-brand/10">
                        <Droplets size={11} fill="currentColor" /> Hidratación
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3 flex items-center gap-1 text-3xs font-mono font-bold text-mental-soft">
          <span aria-hidden="true">✦</span> readiness diario
        </div>
      </div>

      {/* Compara tu club (teaser fiel al mockup v6) */}
      <button
        type="button"
        onClick={() => navigate('/admin/comparar')}
        className="w-full flex items-center justify-between gap-3 rounded-card bg-surface-sunken border border-white/5 hover:border-brand/30 transition active:scale-[0.98] p-4 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold">
          <TrendingUp size={16} className="text-brand" /> Comparar pruebas por categoría
        </span>
        <ChevronRight size={16} className="text-brand shrink-0" />
      </button>

      {/* Finanzas del mes */}
      <SectionEyebrow pill="mes">Finanzas</SectionEyebrow>
      {pagosCargando ? (
        <div className="skeleton h-24" aria-hidden="true"></div>
      ) : pagos.length === 0 ? (
        <div className="glass-card rounded-card p-4">
          <p className="text-xs text-fg-muted">Sin mensualidades generadas este mes.</p>
        </div>
      ) : (
        <div className="glass-card rounded-card p-4 flex items-center justify-around">
          <Gauge pct={pctCobrado} valor={formatoCortoUSD(recaudado)} label="cobrado" color={COLORS.feedback.success} />
          <Gauge pct={100 - pctCobrado} valor={formatoCortoUSD(porCobrar)} label="en mora" color={COLORS.feedback.caution} />
        </div>
      )}

      {/* Accesos rápidos ejecutivos */}
      <SectionEyebrow>Accesos rápidos</SectionEyebrow>
      <div className="grid gap-2">
        {ACCESOS.map(({ ruta, label, desc, Icono }) => (
          <button
            key={ruta}
            onClick={() => navigate(ruta)}
            className="flex items-center gap-3 p-3.5 rounded-panel bg-surface-sunken border border-white/5 hover:border-brand/30 transition text-left"
          >
            <span className="w-9 h-9 rounded-control bg-brand/10 text-brand flex items-center justify-center shrink-0">
              <Icono size={16} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold">{label}</span>
              <span className="block text-2xs text-fg-muted mt-0.5">{desc}</span>
            </span>
            <ChevronRight size={16} className="text-fg-muted shrink-0" />
          </button>
        ))}
      </div>

      {/* Plantel embebido (módulo reutilizable extraído de /dashboard) */}
      <SectionEyebrow>Plantel</SectionEyebrow>
      <Plantel user={user} />
    </HomeShell>
  );
}
