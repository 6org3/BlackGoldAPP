import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, BarChart3, BrainCircuit, CalendarDays, ChevronRight, ClipboardList,
  DollarSign, FlaskConical, MessageSquare, Plus, TrendingUp,
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import HomeShell, { ContextChip, SectionEyebrow, StatCard } from '../components/HomeShell';
import Plantel from '../components/Plantel';
import { fetchTodosLosAtletas } from '../api/atletasService';
import { contarUsuarios } from '../api/authService';

// Todos los módulos admin, para que el superadmin entre a cualquiera desde
// su home sin depender del orden del Sidebar.
const MODULOS = [
  { ruta: '/admin/atletas', label: 'Gestionar atletas', Icono: Plus },
  { ruta: '/admin/misiones', label: 'Gestionar misiones', Icono: Activity },
  { ruta: '/admin/pagos', label: 'Control de pagos', Icono: DollarSign },
  { ruta: '/admin/comunicaciones', label: 'Comunicaciones', Icono: MessageSquare },
  { ruta: '/admin/eventos', label: 'Eventos', Icono: CalendarDays },
  { ruta: '/admin/asistencia', label: 'Asistencia', Icono: ClipboardList },
  { ruta: '/admin/sesiones', label: 'Sesiones', Icono: FlaskConical },
  { ruta: '/admin/comparar', label: 'Comparar', Icono: TrendingUp },
  { ruta: '/admin/kpis', label: 'KPIs del club', Icono: BarChart3 },
];

/**
 * SistemaHomePage (/sistema) — home nativo del superadmin: "que el sistema
 * esté sano". Fase 1 del rediseño (blueprint §3.6): contadores de la
 * plataforma, accesos a todos los módulos admin y una card informativa del
 * cerebro (blackgold-mcp) en modo solo lectura/estado. La salud del cerebro
 * en vivo (cobertura del rack, auditorías) llega en la Fase 2 vía gateway.
 */
export default function SistemaHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [atletas, setAtletas] = useState([]);
  const [totalUsuarios, setTotalUsuarios] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let activo = true;
    fetchTodosLosAtletas(user)
      .then((data) => { if (activo) setAtletas(data || []); })
      .catch((err) => console.error('Error cargando atletas del sistema:', err))
      .finally(() => { if (activo) setLoading(false); });
    contarUsuarios()
      .then((n) => { if (activo) setTotalUsuarios(n); })
      .catch((err) => console.error('Error contando usuarios:', err));
    return () => { activo = false; };
  }, [user]);

  const clubs = useMemo(() => {
    const set = new Set(atletas.map((a) => a.club).filter(Boolean));
    return set.size;
  }, [atletas]);

  return (
    <HomeShell
      eyebrow="Operador de plataforma"
      titulo={<>El <span className="text-gradient-gold">sistema</span></>}
      contexto={<ContextChip tono="info">🛠️ Ves todos los clubs · gestión y mantenimiento</ContextChip>}
    >
      {/* Contadores de plataforma */}
      <SectionEyebrow pill="plataforma">Estado</SectionEyebrow>
      {loading ? (
        <div className="skeleton h-24" aria-hidden="true"></div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <StatCard valor={atletas.length} label="Atletas" tonoTexto="text-brand" />
          <StatCard valor={totalUsuarios ?? '—'} label="Usuarios" />
          <StatCard valor={clubs} label="Clubs" />
        </div>
      )}

      {/* Card informativa del cerebro — solo lectura/estado, sin acciones */}
      <SectionEyebrow pill="✦ estado" pillTono="mental">Cerebro del club</SectionEyebrow>
      <div className="rounded-card border border-mental/25 bg-mental/5 shadow-card p-4">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-control bg-mental/10 text-mental-soft flex items-center justify-center shrink-0">
            <BrainCircuit size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold">blackgold-mcp · 18 tools</p>
            <p className="text-xs text-fg-secondary leading-relaxed mt-1">
              Servidor MCP del proyecto: analítica de atleta (diagnóstico por pilares,
              readiness, misiones sugeridas, siguiente prueba), rack documental deportivo
              (búsqueda BM25 sobre la metodología del club) y curación de catálogos de
              pruebas y misiones. Hoy lo opera el staff vía Claude; el rediseño lo trae a
              la app por el brain gateway (Fase 2).
            </p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {['analyze_athlete_pillars', 'analyze_athlete_readiness', 'consultar_rack'].map((t) => (
                <span key={t} className="inline-flex items-center gap-1 text-3xs font-mono font-bold px-2 py-0.5 rounded-full border text-mental-soft bg-mental/10 border-mental/25">
                  ✦ {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Accesos a todos los módulos admin */}
      <SectionEyebrow>Módulos</SectionEyebrow>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {MODULOS.map(({ ruta, label, Icono }) => (
          <button
            key={ruta}
            onClick={() => navigate(ruta)}
            className="flex items-center gap-2.5 p-3 rounded-panel bg-surface-sunken border border-white/5 hover:border-brand/30 transition text-left"
          >
            <span className="w-8 h-8 rounded-control bg-brand/10 text-brand flex items-center justify-center shrink-0">
              <Icono size={15} />
            </span>
            <span className="flex-1 text-xs font-bold truncate">{label}</span>
            <ChevronRight size={14} className="text-fg-muted shrink-0" />
          </button>
        ))}
      </div>

      {/* Plantel embebido (módulo reutilizable extraído de /dashboard) */}
      <SectionEyebrow>Plantel</SectionEyebrow>
      <Plantel user={user} />
    </HomeShell>
  );
}
