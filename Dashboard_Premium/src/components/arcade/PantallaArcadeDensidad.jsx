import { useState } from 'react';
import { C, BORDER, PIXEL, cut as cutPath, gridBackgroundDesktop, hueBg } from './arcadeTokens';
import MicroLabel from './MicroLabel';
import KpiTile from './KpiTile';
import KpiGrid from './KpiGrid';
import FilterBar from './FilterBar';
import TablaHUD from './TablaHUD';
import HexAvatar from './HexAvatar';
import Pill from './Pill';

/**
 * BANCO DE PRUEBAS — Ola 0 (design_system_arcade.md §6). Ruta dev-only
 * (`/dev/arcade-densidad`, no se monta en producción). Demuestra las primitivas
 * densas nuevas — `KpiGrid`, `FilterBar`, `TablaHUD` — a ancho completo, con la
 * retícula `gridBackgroundDesktop`, para validar el lenguaje Arcade en desktop
 * data-denso ANTES de migrar staff/admin (Olas 1-3). Datos de ejemplo, sin fetch.
 */

const ATLETAS = [
  { id: 1, rank: 1, nombre: 'Amelia Erazo', cat: 'Sub-16', hue: 'gold', asist: 94, xp: '3.120', pago: 'ok' },
  { id: 2, rank: 2, nombre: 'Joaquín Yépez', cat: 'Sub-14', hue: 'green', asist: 88, xp: '2.780', pago: 'ok' },
  { id: 3, rank: 3, nombre: 'Mateo Cevallos', cat: 'Sub-11', hue: 'green', asist: 81, xp: '2.450', pago: 'deuda' },
  { id: 4, rank: 4, nombre: 'Doménica Salazar', cat: 'Sub-14', hue: 'blue', asist: 76, xp: '2.010', pago: 'ok' },
  { id: 5, rank: 5, nombre: 'Sebastián Once', cat: 'Sub-18', hue: 'orange', asist: 62, xp: '1.640', pago: 'deuda' },
  { id: 6, rank: 6, nombre: 'Valentina Cando', cat: 'Sub-11', hue: 'red', asist: 48, xp: '1.190', pago: 'deuda' },
];

const RANK_COLOR = { 1: C.gold, 2: C.text2, 3: C.goldDeep };

export default function PantallaArcadeDensidad() {
  const [q, setQ] = useState('');
  const [soloDeuda, setSoloDeuda] = useState(false);
  const [dense, setDense] = useState(true);

  const chips = [];
  if (q) chips.push({ key: 'q', label: `“${q}”`, onRemove: () => setQ('') });
  if (soloDeuda) chips.push({ key: 'deuda', label: 'Con deuda', onRemove: () => setSoloDeuda(false) });

  const filas = ATLETAS.filter(
    (a) => (!q || a.nombre.toLowerCase().includes(q.toLowerCase())) && (!soloDeuda || a.pago === 'deuda'),
  );

  const columnas = [
    { key: 'rank', label: '#', numeric: true, width: 40, color: (r) => RANK_COLOR[r.rank] || C.text2 },
    {
      key: 'nombre',
      label: 'Atleta',
      render: (r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <HexAvatar initial={r.nombre[0]} size={30} hue={r.hue} />
          <span style={{ color: C.text, fontWeight: 700 }}>{r.nombre}</span>
        </span>
      ),
    },
    { key: 'cat', label: 'Categoría' },
    { key: 'asist', label: 'Asist.', numeric: true, color: (r) => (r.asist >= 80 ? C.ok : r.asist >= 65 ? C.warn : C.danger), render: (r) => `${r.asist}%` },
    {
      key: 'pago',
      label: 'Pago',
      render: (r) => (
        <span
          style={{
            fontFamily: PIXEL,
            fontSize: 8.5,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: r.pago === 'deuda' ? C.danger : C.ok,
            background: r.pago === 'deuda' ? hueBg('red') : hueBg('green'),
            border: `1px solid ${r.pago === 'deuda' ? BORDER.danger : BORDER.ok}`,
            padding: '3px 7px',
            clipPath: cutPath(5),
          }}
        >
          {r.pago === 'deuda' ? 'Deuda' : 'Al día'}
        </span>
      ),
    },
    { key: 'xp', label: 'XP', numeric: true, color: () => C.gold },
  ];

  return (
    <div style={{ minHeight: '100dvh', ...gridBackgroundDesktop, color: C.text, padding: '28px 20px 60px' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Header de panel (§6.4) */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <HexAvatar initial="D" size={44} hue="gold" glow />
          <div style={{ flex: 1, minWidth: 0 }}>
            <MicroLabel color={C.goldDeep} tracking=".12em">OLA 0 · DENSIDAD DESKTOP</MicroLabel>
            <h1 style={{ margin: '4px 0 0', fontSize: 26, fontWeight: 900, letterSpacing: '-.03em' }}>
              Primitivas densas — banco de pruebas
            </h1>
          </div>
          <Pill label={dense ? 'DENSO 36PX' : 'TÁCTIL 44PX'} active={dense} onClick={() => setDense((d) => !d)} />
        </header>

        {/* Panel denso: grid auto-fit de KPIs (§6.4) */}
        <section>
          <MicroLabel color={C.text3} style={{ marginBottom: 8 }}>Resumen del club</MicroLabel>
          <KpiGrid>
            <KpiTile label="Recaudado · Jul" val="$560" color={C.gold} sub="62% de la meta" />
            <KpiTile label="Asistencia" val="83%" color={C.ok} sub="últimos 30 días" />
            <KpiTile label="Atletas activos" val="28" color={C.text} sub="+3 este mes" />
            <KpiTile label="En riesgo" val="2" color={C.danger} sub="3 de baja · 1 pago" />
            <KpiTile label="Misiones activas" val="56" color={C.ai} sub="curadas por coach" />
            <KpiTile label="Retención" val="91%" color={C.cyan} sub="trimestre" />
          </KpiGrid>
        </section>

        {/* Tabla-HUD + barra de filtros colapsable (§6.2 / §6.4) */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <MicroLabel color={C.text3}>Roster · {filas.length} atletas</MicroLabel>
          <FilterBar
            search={q}
            onSearch={setQ}
            placeholder="Buscar atleta…"
            chips={chips}
            dense={dense}
          >
            <Pill label="Con deuda" active={soloDeuda} onClick={() => setSoloDeuda((v) => !v)} />
            <Pill label="Sub-11" onClick={() => setQ('')} />
            <Pill label="Sub-14" onClick={() => setQ('')} />
          </FilterBar>
          <TablaHUD
            columns={columnas}
            rows={filas}
            rowKey={(r) => r.id}
            dense={dense}
            ariaLabel="Roster del club"
            rowStatus={(r) => (r.pago === 'deuda' ? C.danger : C.ok)}
            onRowClick={(r) => window.alert(`Fila: ${r.nombre}`)}
            rowAriaLabel={(r) => `Abrir ficha de ${r.nombre}`}
            emptyLabel="Ningún atleta coincide con el filtro"
          />
          <p style={{ margin: 0, fontSize: 11, color: C.text3 }}>
            Ruta dev-only. Estado de fila por borde-izquierdo semántico; celdas numéricas en pixel; sin corte por celda.
          </p>
        </section>
      </div>
    </div>
  );
}
