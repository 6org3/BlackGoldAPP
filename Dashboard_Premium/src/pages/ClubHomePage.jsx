import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, ChevronRight, DollarSign, TrendingUp } from 'lucide-react';
import { useAuth } from '../AuthContext';
import HomeShell, { ContextChip, SectionEyebrow, StatCard } from '../components/HomeShell';
import Plantel from '../components/Plantel';
import { fetchTodosLosAtletas } from '../api/atletasService';

const ACCESOS = [
  { ruta: '/admin/kpis', label: 'KPIs del club', desc: 'Asistencia, pilares y tendencia', Icono: BarChart3 },
  { ruta: '/admin/pagos', label: 'Control de pagos', desc: 'Cobros, abonos y mora', Icono: DollarSign },
  { ruta: '/admin/comparar', label: 'Comparar pruebas', desc: 'Distribución e histórico por categoría', Icono: TrendingUp },
];

/**
 * ClubHomePage (/club) — home nativo del owner: "estado del club".
 * Fase 1 del rediseño (blueprint §3.5): stats derivadas de los datos que ya
 * trae fetchTodosLosAtletas, accesos rápidos a los módulos ejecutivos, la
 * card de privacidad de datos y el Plantel embebido. El pulso IA del club
 * (riesgo/retención, salud del cerebro) llega en la Fase 2 vía brain gateway.
 */
export default function ClubHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [atletas, setAtletas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let activo = true;
    fetchTodosLosAtletas(user)
      .then((data) => { if (activo) setAtletas(data || []); })
      .catch((err) => console.error('Error cargando atletas del club:', err))
      .finally(() => { if (activo) setLoading(false); });
    return () => { activo = false; };
  }, [user]);

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

      {/* Pulso del club: stats de los datos ya disponibles */}
      <SectionEyebrow pill="tu club">Pulso del club</SectionEyebrow>
      {loading ? (
        <div className="skeleton h-24" aria-hidden="true"></div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatCard valor={total} label="Atletas" />
            <StatCard valor={overallMedio ?? '—'} label="Overall medio" tonoTexto="text-brand" />
            <StatCard valor={porCategoria.length} label="Categorías" />
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
