import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, FileText, AlertTriangle, Search, Calendar, Users, Save, ClipboardList, ChevronDown } from 'lucide-react';
import { fetchAsistenciaPorFecha, upsertAsistencia } from '../api/asistenciaService';
import { fetchGrupos } from '../api/sesionesService';
import CutCard from './arcade/CutCard';
import HexAvatar from './arcade/HexAvatar';
import MicroLabel from './arcade/MicroLabel';
import KpiTile from './arcade/KpiTile';
import KpiGrid from './arcade/KpiGrid';
import { C, BORDER, GRAD, TINT, cut } from './arcade/arcadeTokens';

// El pase de lista se acota por GRUPO de entrenamiento, no por categoría FEB:
// quien está en la cancha a una hora dada es el grupo (que tiene horario), y un
// grupo mezcla categorías y niveles a propósito. Los grupos son filas del club,
// así que la lista se lee de la BD en vez de estar hardcodeada.
const TODOS = 'Todos';

// Estados de asistencia con su color semántico Arcade (C.ok/danger/warn) — antes
// Justificada usaba yellow crudo. El icono distingue Justificada de Lesionado.
const ESTADO_META = {
  Presente:    { c: C.ok,     icon: CheckCircle2,  label: 'Presente' },
  Ausente:     { c: C.danger, icon: XCircle,       label: 'Ausente' },
  Justificada: { c: C.warn,   icon: FileText,      label: 'Justificada' },
  Lesionado:   { c: C.warn,   icon: AlertTriangle, label: 'Lesionado' },
};

// Caja de control de la toolbar (fecha/categoría/buscador): superficie cut(7).
const boxStyle = { clipPath: cut(7), background: C.cardAlt1, border: `1px solid ${BORDER.neutralSoft}` };

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

export default function AdminAsistencia({ user, atletas = [] }) {
  const [fecha, setFecha] = useState(getTodayStr());
  const [filtroGrupo, setFiltroGrupo] = useState(TODOS); // TODOS | grupo.id
  const [grupos, setGrupos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [asistencias, setAsistencias] = useState({});
  // Atletas cuyo estado ya es de fiar: o el coach tocó el botón con la mano,
  // o ya había un registro real guardado para esta fecha. Todo lo demás
  // arranca en "Presente" solo como valor por defecto para no obligar a
  // tocar cada fila — pero sin esto sería indistinguible de una asistencia
  // que el coach de verdad revisó, y "Guardar" grabaría 100% presente sin
  // que nadie lo haya confirmado.
  const [revisados, setRevisados] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');
  const [errorCarga, setErrorCarga] = useState(false);
  const [pidiendoConfirmacion, setPidiendoConfirmacion] = useState(false);

  // Grupos del club para el selector. Si falla, se queda en "Todos" — un
  // desplegable vacío no debe impedir pasar lista.
  useEffect(() => {
    let vivo = true;
    fetchGrupos(user?.club)
      .then(gs => { if (vivo) setGrupos(gs || []); })
      .catch(() => { if (vivo) setGrupos([]); });
    return () => { vivo = false; };
  }, [user?.club]);

  // Cargar asistencias existentes para la fecha/grupo seleccionados.
  // El universo lo define el grupo, no la búsqueda (que es solo un
  // filtro visual): así cambiar fecha/grupo con texto en el buscador
  // no descarta las marcas del resto del grupo.
  const loadAsistencias = useCallback(async () => {
    let registros;
    try {
      registros = await fetchAsistenciaPorFecha(fecha);
      setErrorCarga(false);
    } catch {
      registros = [];
      setErrorCarga(true);
    }
    // El grupo se acota AQUÍ, contra `atletas`, y no en la query: este array trae
    // el grupo_id ya resuelto — `fetchTodosLosAtletas` lo deriva de `atleta_grupo`
    // cuando la columna `atletas.grupo_id` está vacía. Pedirle a la query que
    // filtrara por la columna cruda dejaba fuera los registros reales de esos
    // atletas: salían en la lista del grupo con "Presente" por defecto y al
    // guardar les pisaba el estado guardado. Una sola fuente de verdad, no dos.
    const delGrupo = atletas.filter(a => filtroGrupo === TODOS || a.grupo_id === filtroGrupo);
    const base = {};
    delGrupo.forEach(a => { base[a.id] = 'Presente'; });
    // registros.atleta_id es atletas.id (FK real de la tabla asistencia), pero
    // `base` está indexado por a.id (usuarios.id, la key que usa el resto del
    // componente) — hay que traducir de uno a otro antes de aplicar el estado
    // guardado. El Map solo lleva a los del grupo, así que de paso descarta los
    // registros de atletas que no se están mostrando.
    const usuarioIdPorAtletaId = new Map(delGrupo.map(a => [a.atleta_id, a.id]));
    const yaRevisados = new Set();
    registros.forEach(r => {
      const usuarioId = usuarioIdPorAtletaId.get(r.atleta_id);
      if (usuarioId) {
        base[usuarioId] = r.estado;
        yaRevisados.add(usuarioId); // ya existía un registro real para esta fecha
      }
    });
    setAsistencias(base);
    setRevisados(yaRevisados);
    setPidiendoConfirmacion(false);
  }, [fecha, filtroGrupo, atletas]);

  useEffect(() => { loadAsistencias(); }, [loadAsistencias]);

  const marcarEstado = (atletaId, estado) => {
    setAsistencias(prev => ({ ...prev, [atletaId]: estado }));
    setRevisados(prev => new Set(prev).add(atletaId));
    setPidiendoConfirmacion(false);
  };

  // Filtrar atletas por grupo y búsqueda
  const atletasFiltrados = atletas.filter(a => {
    const matchGrupo = filtroGrupo === TODOS || a.grupo_id === filtroGrupo;
    const matchBusqueda = busqueda === '' || a.nombre?.toLowerCase().includes(busqueda.toLowerCase());
    return matchGrupo && matchBusqueda;
  });

  // Métricas en tiempo real
  const total = atletasFiltrados.length;
  const presentes = atletasFiltrados.filter(a => asistencias[a.id] === 'Presente').length;
  const ausentes = atletasFiltrados.filter(a => asistencias[a.id] === 'Ausente').length;
  const otros = total - presentes - ausentes;
  const pctPresentes = total > 0 ? Math.round((presentes / total) * 100) : 0;
  const pctAusentes = total > 0 ? Math.round((ausentes / total) * 100) : 0;
  const pctOtros = total > 0 ? Math.round((otros / total) * 100) : 0;
  const sinRevisar = atletasFiltrados.filter(a => !revisados.has(a.id)).length;

  // Qué se está pasando ahora mismo: sin esto, el coach que guarda no tiene en
  // el encabezado ninguna señal de a qué grupo pertenece la lista de abajo.
  const nombreGrupoActivo = filtroGrupo === TODOS
    ? 'Gestión por grupos'
    : (grupos.find(g => g.id === filtroGrupo)?.nombre ?? 'Grupo');

  const handleGuardar = async () => {
    // Cualquier fila sin revisar (no solo cuando son TODAS) se grabaría en
    // silencio como "Presente" por defecto — pedir confirmación explícita
    // también cuando el coach revisó solo una parte del grupo y dejó el
    // resto sin tocar, que es el caso más probable con un grupo grande.
    if (sinRevisar > 0 && !pidiendoConfirmacion) {
      setPidiendoConfirmacion(true);
      return;
    }
    setPidiendoConfirmacion(false);
    setSaving(true);
    setErrorGuardar('');
    const resultados = await Promise.all(
      atletasFiltrados.map(a =>
        upsertAsistencia({
          atleta_id: a.atleta_id,
          coach_id: user.id,
          fecha,
          estado: asistencias[a.id] || 'Presente',
        })
      )
    );
    setSaving(false);
    // upsertAsistencia devuelve null cuando falla (no lanza)
    const fallidos = resultados.filter(r => r === null).length;
    if (fallidos > 0) {
      setErrorGuardar(`No se pudo guardar la asistencia de ${fallidos} atleta(s). Revisa tu conexión e intenta de nuevo.`);
      return;
    }
    setRevisados(prev => {
      const next = new Set(prev);
      atletasFiltrados.forEach(a => next.add(a.id));
      return next;
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="p-6 md:p-12" style={{ color: C.text }}>
      {/* Header */}
      <header className="mb-8 pb-8" style={{ borderBottom: `1px solid ${BORDER.neutral}` }}>
        <div className="flex items-center gap-3">
          <HexAvatar size={44} background={GRAD.goldHex} color={C.ink}>
            <ClipboardList size={22} strokeWidth={2.5} />
          </HexAvatar>
          <div>
            <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight" style={{ color: C.text }}>
              Control de <span style={{ color: C.gold }}>Asistencia</span>
            </h2>
            <MicroLabel style={{ marginTop: 4 }}>{nombreGrupoActivo} · {total} atletas</MicroLabel>
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Fecha */}
        <div className="flex items-center gap-2 px-4" style={boxStyle}>
          <Calendar size={14} style={{ color: C.gold }} />
          <input
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            className="cut-focus arcade-input bg-transparent min-h-11 md:min-h-9 text-sm font-bold focus:outline-none cursor-pointer"
            style={{ color: C.text }}
          />
        </div>

        {/* Grupo de entrenamiento */}
        <div className="flex items-center gap-2 px-4" style={boxStyle}>
          <Users size={14} style={{ color: C.gold }} />
          <select
            value={filtroGrupo}
            onChange={e => setFiltroGrupo(e.target.value)}
            aria-label="Filtrar por grupo de entrenamiento"
            className="cut-focus arcade-input bg-transparent min-h-11 md:min-h-9 text-sm font-bold focus:outline-none cursor-pointer appearance-none"
            style={{ color: C.text }}
          >
            <option value={TODOS}>Todos los grupos</option>
            {grupos.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
          <ChevronDown size={12} className="pointer-events-none" style={{ color: C.text3 }} />
        </div>

        {/* Buscador */}
        <div className="flex items-center gap-2 px-4 flex-1 min-w-[200px]" style={boxStyle}>
          <Search size={14} style={{ color: C.text3 }} />
          <input
            type="search"
            enterKeyHint="search"
            placeholder="Buscar jugador..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="cut-focus arcade-input bg-transparent min-h-11 md:min-h-9 text-sm font-bold focus:outline-none w-full"
            style={{ color: C.text }}
          />
        </div>
      </div>

      {/* Aviso de carga fallida: sin el estado guardado, la lista de abajo
          parte de "Presente" por defecto y guardar podría pisar un pase de
          lista real — el coach tiene que saberlo antes de tocar Guardar. */}
      {errorCarga && (
        <div role="alert" className="mb-6 flex flex-wrap items-center gap-3 p-4" style={{ clipPath: cut(10), background: TINT.danger, border: `1px solid ${BORDER.danger}` }}>
          <AlertTriangle size={18} className="shrink-0" style={{ color: C.danger }} />
          <p className="flex-1 min-w-[200px] text-xs font-bold" style={{ color: C.danger }}>
            No se pudo cargar la asistencia guardada de esta fecha. La lista parte de
            "Presente" por defecto — si guardas ahora podrías sobrescribir un pase de lista anterior.
          </p>
          <button
            type="button"
            onClick={loadAsistencias}
            className="cut-focus inline-flex items-center min-h-11 md:min-h-9 px-3.5 text-2xs font-black uppercase tracking-widest transition-colors"
            style={{ clipPath: cut(7), background: TINT.danger, border: `1px solid ${BORDER.danger}`, color: C.danger }}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Stats Bar */}
      <KpiGrid min={160} gap={12} style={{ marginBottom: 32 }}>
        <KpiTile label="Total Grupo" val={total} color={C.text} sub="atletas" labelSize={9} />
        <KpiTile label="Presentes" val={`${pctPresentes}%`} color={C.ok} sub={`${presentes} chicos`} labelSize={9} border={BORDER.ok} />
        <KpiTile label="Ausentes" val={`${pctAusentes}%`} color={C.danger} sub={`${ausentes} chicos`} labelSize={9} border={BORDER.danger} />
        <KpiTile label="Justif. + Lesión" val={`${pctOtros}%`} color={C.warn} sub={`${otros} chicos`} labelSize={9} border={BORDER.warn} />
      </KpiGrid>

      {/* Lista de Atletas (Tabla-HUD) */}
      <CutCard cut={12} padding="0" style={{ overflow: 'hidden', marginBottom: 24 }}>
        <div className="px-4 py-3 grid grid-cols-[1fr_auto] gap-4" style={{ background: C.cardAlt1, borderBottom: `1px solid ${BORDER.neutral}` }}>
          <MicroLabel style={{ margin: 0 }}>Jugador</MicroLabel>
          <MicroLabel style={{ margin: 0, textAlign: 'right' }}>Estado</MicroLabel>
        </div>

        {atletasFiltrados.length === 0 ? (
          <div className="text-center py-16" style={{ color: C.text3 }}>
            <p className="text-sm font-bold">No hay atletas en este grupo</p>
          </div>
        ) : (
          atletasFiltrados.map((atleta, idx) => {
            const estadoActual = asistencias[atleta.id] || 'Presente';
            const confirmado = revisados.has(atleta.id);
            return (
              <motion.div
                key={atleta.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(idx, 10) * 0.02 }}
                className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-4 py-3 transition-colors hover:bg-white/[0.03]"
                style={{ borderBottom: `1px solid ${BORDER.neutral}` }}
              >
                {/* Atleta Info */}
                <div className="flex items-center gap-3">
                  <HexAvatar size={36}>{atleta.nombre?.charAt(0)}</HexAvatar>
                  <div>
                    <p className="text-sm font-bold" style={{ color: C.text }}>{atleta.nombre}</p>
                    <MicroLabel style={{ margin: 0 }}>
                      {atleta.categoria} · {atleta.posicion}
                      {!confirmado && <span style={{ color: C.text4, textTransform: 'none' }}> · sin revisar</span>}
                    </MicroLabel>
                  </div>
                </div>

                {/* Botones de Estado — grandes en móvil para pasar lista con el pulgar */}
                <div className="grid grid-cols-4 gap-2 md:flex md:items-center">
                  {Object.entries(ESTADO_META).map(([estado, cfg]) => {
                    const Icon = cfg.icon;
                    const isActive = estadoActual === estado;
                    return (
                      <button
                        key={estado}
                        title={cfg.label}
                        aria-label={cfg.label}
                        aria-pressed={isActive}
                        onClick={() => marcarEstado(atleta.id, estado)}
                        className="cut-focus min-h-11 md:min-w-11 p-2 md:p-2.5 font-bold flex flex-col md:flex-row items-center justify-center gap-1 transition-colors"
                        style={{
                          clipPath: cut(5),
                          background: isActive ? C.cardAlt1 : 'transparent',
                          border: `1px ${isActive && !confirmado ? 'dashed' : 'solid'} ${isActive ? cfg.c : BORDER.neutralFaint}`,
                          color: isActive ? cfg.c : C.text4,
                          opacity: isActive && !confirmado ? 0.7 : 1,
                        }}
                      >
                        <Icon size={18} />
                        <span className="text-3xs md:text-2xs leading-none">{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            );
          })
        )}
      </CutCard>

      {/* Botón Guardar — sticky para que la acción principal quede siempre al
          alcance del pulgar. En móvil se apoya sobre la BottomNav (bottom-[74px])
          y suelta la safe-area, que ya la absorbe la barra; en desktop pega al borde. */}
      <div
        className="sticky bottom-[74px] md:bottom-0 z-20 -mx-6 md:-mx-12 -mb-6 md:-mb-12 px-6 md:px-12 py-3 md:pb-[calc(env(safe-area-inset-bottom)+12px)] backdrop-blur flex flex-col items-end gap-2"
        style={{ background: C.card, borderTop: `1px solid ${BORDER.neutral}` }}
      >
        {errorGuardar && (
          <p className="text-xs font-bold" role="alert" style={{ color: C.danger }}>{errorGuardar}</p>
        )}
        {pidiendoConfirmacion && (
          <p className="text-xs font-bold text-right" role="alert" style={{ color: C.warn }}>
            {sinRevisar === total
              ? `No revisaste a ningún atleta — se guardaría a los ${total} como "Presente" por defecto.`
              : `Quedan ${sinRevisar} de ${total} atletas sin revisar — se guardarían como "Presente" por defecto.`}
          </p>
        )}
        <button
          onClick={handleGuardar}
          disabled={saving}
          className={`cut-focus flex items-center gap-2 px-6 min-h-11 py-3 font-black uppercase tracking-widest text-sm transition ${saved || pidiendoConfirmacion ? '' : 'disabled:opacity-50'}`}
          style={saved
            ? { clipPath: cut(8), background: TINT.ok, border: `1px solid ${BORDER.okStrong}`, color: C.ok }
            : pidiendoConfirmacion
            ? { clipPath: cut(8), background: C.cardAlt1, border: `1px solid ${BORDER.warn}`, color: C.warn }
            : { clipPath: cut(8), background: GRAD.goldCTA, border: 'none', color: C.ink }}
        >
          {saving ? (
            <span className="animate-pulse">Guardando...</span>
          ) : saved ? (
            <>
              <CheckCircle2 size={16} />
              <span>¡Guardado!</span>
            </>
          ) : pidiendoConfirmacion ? (
            <>
              <AlertTriangle size={16} />
              <span>Confirmar y guardar de todas formas</span>
            </>
          ) : (
            <>
              <Save size={16} />
              <span>Guardar Asistencia</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
