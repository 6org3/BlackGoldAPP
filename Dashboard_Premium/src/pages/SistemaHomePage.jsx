import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, BarChart3, BrainCircuit, CalendarDays, ChevronRight, ClipboardList,
  DollarSign, FlaskConical, MessageSquare, Plus, TrendingUp,
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import HomeShell, { ContextChip, SectionEyebrow, StatCard } from '../components/HomeShell';
import Plantel from '../components/Plantel';
import CutCard from '../components/arcade/CutCard';
import KpiGrid from '../components/arcade/KpiGrid';
import TablaHUD from '../components/arcade/TablaHUD';
import Donut from '../components/arcade/Donut';
import HexAvatar from '../components/arcade/HexAvatar';
import MicroLabel from '../components/arcade/MicroLabel';
import { C, BORDER, TINT, cut, PIXEL } from '../components/arcade/arcadeTokens';
import { fetchTodosLosAtletas } from '../api/atletasService';
import { fetchAsistenciaPct } from '../api/asistenciaService';
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

const MCP_TOOLS = ['analyze_athlete_pillars', 'analyze_athlete_readiness', 'consultar_rack'];

const TREINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

/** Color de salud de una métrica 0–100 (meter de clubs y borde de fila).
 *  El rojo se reserva a cobertura crítica (<50%); 50–79% es naranja de
 *  precaución (C.warn = mismo hue que el caution del DS v1), no fallo. */
const saludColor = (pct) => (pct >= 80 ? C.ok : pct >= 50 ? C.warn : C.danger);

/** % de un grupo de atletas con al menos una evaluación en los últimos 30 días. */
function coberturaEvaluacion30d(atletas) {
  if (atletas.length === 0) return 0;
  const corte = Date.now() - TREINTA_DIAS_MS;
  const conEvaluacionReciente = atletas.filter((a) =>
    (a._evaluaciones || []).some((e) => new Date(e.created_at).getTime() >= corte),
  ).length;
  return Math.round((conEvaluacionReciente / atletas.length) * 100);
}

// Columnas de la Tabla-HUD de clubs (§6.2): nombre con hex de identidad,
// conteo numérico en pixel, y meter de cobertura con % semántico.
const CLUB_COLUMNS = [
  {
    key: 'club',
    label: 'Club',
    render: (row) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <HexAvatar size={30} initial={row.club.charAt(0).toUpperCase()} style={{ fontSize: 12 }} />
        <span style={{ fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
          {row.club}
        </span>
      </div>
    ),
  },
  { key: 'total', label: 'Atletas', numeric: true, width: 84 },
  {
    key: 'cobertura',
    label: 'Cob. eval 30d',
    align: 'right',
    width: 156,
    render: (row) => {
      const col = saludColor(row.cobertura);
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          <div style={{ width: 60, height: 5, borderRadius: 3, background: C.cardAlt1, overflow: 'hidden' }} aria-hidden="true">
            <div style={{ height: '100%', width: `${row.cobertura}%`, background: col }} />
          </div>
          <span style={{ fontFamily: PIXEL, fontSize: 11, color: col, minWidth: 30, textAlign: 'right' }}>{row.cobertura}%</span>
        </div>
      );
    },
  },
];

/**
 * SistemaHomePage (/sistema) — home nativo del superadmin: "que el sistema
 * esté sano". Ola 2 · PR 2.2 (convergencia Arcade): las superficies data-densas
 * pasan a las primitivas del HUD (design_system_arcade.md §6.2/§6.4) — donuts de
 * cobertura eval. 30d y asistencia global 7d en CutCard, contadores en KpiGrid,
 * clubs como Tabla-HUD (meter de salud por club + borde-estado de fila), card
 * del cerebro y grid de módulos con esquina cortada. Datos y rutas intactos.
 */
export default function SistemaHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [atletas, setAtletas] = useState([]);
  const [totalUsuarios, setTotalUsuarios] = useState(null);
  const [loading, setLoading] = useState(true);
  const [asistenciaPct, setAsistenciaPct] = useState(null);

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

  useEffect(() => {
    if (atletas.length === 0) return undefined;
    let activo = true;
    fetchAsistenciaPct(atletas.map((a) => a.atleta_id), 7).then((pct) => {
      if (activo) setAsistenciaPct(pct);
    });
    return () => { activo = false; };
  }, [atletas]);

  const coberturaGlobal = useMemo(() => coberturaEvaluacion30d(atletas), [atletas]);

  const clubsList = useMemo(() => {
    const porClub = {};
    atletas.forEach((a) => {
      const club = a.club || 'Sin club';
      if (!porClub[club]) porClub[club] = [];
      porClub[club].push(a);
    });
    return Object.entries(porClub)
      .map(([club, atletasDelClub]) => ({
        club,
        total: atletasDelClub.length,
        cobertura: coberturaEvaluacion30d(atletasDelClub),
      }))
      .sort((a, b) => b.total - a.total);
  }, [atletas]);

  return (
    <HomeShell
      eyebrow="Operador de plataforma"
      titulo={<>El <span className="text-gradient-gold">sistema</span></>}
      contexto={<ContextChip tono="info">🛠️ Ves todos los clubs · gestión y mantenimiento</ContextChip>}
    >
      {/* Estado de plataforma: salud (donuts) + contadores */}
      <SectionEyebrow pill="plataforma">Estado</SectionEyebrow>
      {loading ? (
        <div className="skeleton h-24" aria-hidden="true"></div>
      ) : (
        <>
          <CutCard cut={10} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: 12, padding: '16px 14px' }}>
            <div style={{ textAlign: 'center' }}>
              <Donut pct={coberturaGlobal} color={C.gold} centerTop={`${coberturaGlobal}%`} size={104} ariaLabel={`Cobertura eval 30d: ${coberturaGlobal}%`} />
              <MicroLabel color={C.text3} size={9} tracking=".08em" style={{ marginTop: 8 }}>Cobertura eval 30d</MicroLabel>
            </div>
            <div style={{ textAlign: 'center' }}>
              <Donut pct={asistenciaPct ?? 0} color={C.ok} centerTop={`${asistenciaPct ?? 0}%`} size={104} ariaLabel={`Asistencia global 7d: ${asistenciaPct ?? 0}%`} />
              <MicroLabel color={C.text3} size={9} tracking=".08em" style={{ marginTop: 8 }}>Asistencia global 7d</MicroLabel>
            </div>
          </CutCard>
          <KpiGrid min={110} style={{ marginTop: 10 }}>
            <StatCard valor={atletas.length} label="Atletas" tonoTexto="text-brand" />
            <StatCard valor={totalUsuarios ?? '—'} label="Usuarios" />
            <StatCard valor={clubsList.length} label="Clubs" />
          </KpiGrid>
        </>
      )}

      {/* Clubs en la plataforma — Tabla-HUD con meter de salud por club */}
      <SectionEyebrow>Clubs en la plataforma</SectionEyebrow>
      <TablaHUD
        ariaLabel="Clubs en la plataforma"
        columns={CLUB_COLUMNS}
        rows={clubsList}
        rowKey={(r) => r.club}
        rowStatus={(r) => saludColor(r.cobertura)}
        emptyLabel="Aún no hay atletas registrados."
      />

      {/* Card informativa del cerebro — solo lectura/estado, sin acciones.
          Acento por borde ai + accesorios teñidos (§6.2: estado por borde, no
          por teñir toda la superficie). */}
      <SectionEyebrow pill="✦ estado" pillTono="mental">Cerebro del club</SectionEyebrow>
      <CutCard cut={10} border={BORDER.ai} padding="16px">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span style={{ width: 38, height: 38, flex: 'none', clipPath: cut(6), background: TINT.ai, color: C.ai, display: 'grid', placeItems: 'center' }}>
            <BrainCircuit size={18} />
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 700, color: C.text, fontSize: 14 }}>blackgold-mcp · 18 tools</p>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.5, color: C.text2 }}>
              Servidor MCP del proyecto: analítica de atleta (diagnóstico por pilares,
              readiness, misiones sugeridas, siguiente prueba), rack documental deportivo
              (búsqueda BM25 sobre la metodología del club) y curación de catálogos de
              pruebas y misiones. Hoy lo opera el staff vía Claude; el rediseño lo trae a
              la app por el brain gateway (Fase 2).
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {MCP_TOOLS.map((t) => (
                <span
                  key={t}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontFamily: 'ui-monospace, monospace', fontSize: 9.5, fontWeight: 700,
                    padding: '3px 8px', clipPath: cut(5),
                    color: C.ai, background: TINT.ai, border: `1px solid ${BORDER.ai}`,
                  }}
                >
                  ✦ {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </CutCard>

      {/* Accesos a todos los módulos admin */}
      <SectionEyebrow>Módulos</SectionEyebrow>
      <KpiGrid min={158}>
        {MODULOS.map(({ ruta, label, Icono }) => (
          <CutCard
            key={ruta}
            cut={8}
            className="cut-focus"
            onClick={() => navigate(ruta)}
            ariaLabel={label}
            padding="12px 13px"
            style={{ display: 'flex', alignItems: 'center', gap: 10 }}
          >
            <span style={{ width: 30, height: 30, flex: 'none', clipPath: cut(5), background: TINT.gold, color: C.gold, display: 'grid', placeItems: 'center' }}>
              <Icono size={15} />
            </span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {label}
            </span>
            <ChevronRight size={14} style={{ color: C.text3, flex: 'none' }} />
          </CutCard>
        ))}
      </KpiGrid>

      {/* Plantel embebido (módulo reutilizable extraído de /dashboard) */}
      <SectionEyebrow>Plantel</SectionEyebrow>
      <Plantel user={user} />
    </HomeShell>
  );
}
