import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, FileText, AlertTriangle, Search, Calendar, Users, Save, ClipboardList, ChevronDown } from 'lucide-react';
import { fetchAsistenciaPorFecha, upsertAsistencia } from '../api/asistenciaService';

const CATEGORIAS = ['Todas', 'Premini (Sub-9)', 'Mini (Sub-11)', 'Menores (Sub-14)', 'Prejuvenil (Sub-16)', 'Juvenil (Sub-18)', 'Mayores'];

const ESTADO_CONFIG = {
  Presente:    { color: 'text-success-soft border-success/40 bg-success/10', icon: CheckCircle2,    label: 'Presente' },
  Ausente:     { color: 'text-danger-soft border-danger/40 bg-danger/10',             icon: XCircle,         label: 'Ausente' },
  Justificada: { color: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',    icon: FileText,        label: 'Justificada' },
  Lesionado:   { color: 'text-caution-soft border-caution/40 bg-caution/10',    icon: AlertTriangle,   label: 'Lesionado' },
};

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

export default function AdminAsistencia({ user, atletas = [] }) {
  const [fecha, setFecha] = useState(getTodayStr());
  const [filtroCategoria, setFiltroCategoria] = useState('Todas');
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
  const [pidiendoConfirmacion, setPidiendoConfirmacion] = useState(false);

  // Cargar asistencias existentes para la fecha/categoría seleccionada.
  // El universo lo define la categoría, no la búsqueda (que es solo un
  // filtro visual): así cambiar fecha/categoría con texto en el buscador
  // no descarta las marcas del resto del grupo.
  const loadAsistencias = useCallback(async () => {
    const registros = await fetchAsistenciaPorFecha(fecha, filtroCategoria === 'Todas' ? null : filtroCategoria);
    const base = {};
    atletas
      .filter(a => filtroCategoria === 'Todas' || a.categoria === filtroCategoria)
      .forEach(a => { base[a.id] = 'Presente'; });
    // registros.atleta_id es atletas.id (FK real de la tabla asistencia), pero
    // `base` está indexado por a.id (usuarios.id, la key que usa el resto del
    // componente) — hay que traducir de uno a otro antes de aplicar el estado guardado.
    const usuarioIdPorAtletaId = new Map(atletas.map(a => [a.atleta_id, a.id]));
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
  }, [fecha, filtroCategoria, atletas]);

  useEffect(() => { loadAsistencias(); }, [loadAsistencias]);

  const marcarEstado = (atletaId, estado) => {
    setAsistencias(prev => ({ ...prev, [atletaId]: estado }));
    setRevisados(prev => new Set(prev).add(atletaId));
    setPidiendoConfirmacion(false);
  };

  // Filtrar atletas por categoría y búsqueda
  const atletasFiltrados = atletas.filter(a => {
    const matchCategoria = filtroCategoria === 'Todas' || a.categoria === filtroCategoria;
    const matchBusqueda = busqueda === '' || a.nombre?.toLowerCase().includes(busqueda.toLowerCase());
    return matchCategoria && matchBusqueda;
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
    <div className="min-h-screen bg-surface-base text-white p-6 md:p-12">
      {/* Ambient bg */}
      <div className="fixed top-[-20%] left-[10%] w-[700px] h-[500px] bg-brand/5 blur-[150px] pointer-events-none rounded-full" />

      {/* Header */}
      <header className="mb-8 relative z-10 border-b border-white/5 pb-8">
        <div className="flex items-center space-x-3 mb-2">
          <ClipboardList className="text-brand" size={28} />
          <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tighter">
            Control de{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand to-brand-strong">
              Asistencia
            </span>
          </h2>
        </div>
        <p className="text-2xs text-fg-muted font-bold uppercase tracking-[0.3em] ml-10">
          Gestión por Grupos · {total} atletas
        </p>
      </header>

      {/* Toolbar */}
      <div className="relative z-10 flex flex-wrap gap-3 mb-6">
        {/* Fecha */}
        <div className="flex items-center space-x-2 bg-white/5 border border-white/10 rounded-control px-4 py-2.5">
          <Calendar size={14} className="text-brand" />
          <input
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            className="bg-transparent text-sm text-white font-bold focus:outline-none cursor-pointer"
          />
        </div>

        {/* Categoría */}
        <div className="flex items-center space-x-2 bg-white/5 border border-white/10 rounded-control px-4 py-2.5">
          <Users size={14} className="text-brand" />
          <select
            value={filtroCategoria}
            onChange={e => setFiltroCategoria(e.target.value)}
            className="bg-transparent text-sm text-white font-bold focus:outline-none cursor-pointer appearance-none"
          >
            {CATEGORIAS.map(c => <option key={c} value={c} className="bg-surface-card">{c}</option>)}
          </select>
          <ChevronDown size={12} className="text-fg-muted pointer-events-none" />
        </div>

        {/* Buscador */}
        <div className="flex items-center space-x-2 bg-white/5 border border-white/10 rounded-control px-4 py-2.5 flex-1 min-w-[200px]">
          <Search size={14} className="text-fg-muted" />
          <input
            type="search"
            enterKeyHint="search"
            placeholder="Buscar jugador..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="bg-transparent text-sm text-white placeholder-gray-600 font-bold focus:outline-none w-full"
          />
        </div>
      </div>

      {/* Stats Bar */}
      <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Grupo', value: total, unit: 'atletas', color: 'text-white', border: 'border-white/10' },
          { label: 'Presentes', value: `${pctPresentes}%`, unit: `${presentes} chicos`, color: 'text-success-soft', border: 'border-success/20' },
          { label: 'Ausentes', value: `${pctAusentes}%`, unit: `${ausentes} chicos`, color: 'text-danger-soft', border: 'border-danger/20' },
          { label: 'Justif. + Lesión', value: `${pctOtros}%`, unit: `${otros} chicos`, color: 'text-yellow-400', border: 'border-yellow-500/20' },
        ].map(stat => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`glass-card rounded-panel p-4 border ${stat.border}`}
          >
            <p className="text-2xs font-black uppercase tracking-eyebrow text-fg-muted mb-1">{stat.label}</p>
            <p className={`text-3xl font-black ${stat.color}`}>{stat.value}</p>
            <p className="text-[11px] text-fg-muted mt-0.5">{stat.unit}</p>
          </motion.div>
        ))}
      </div>

      {/* Lista de Atletas */}
      <div className="relative z-10 bg-white/3 border border-white/8 rounded-panel overflow-hidden mb-6">
        <div className="bg-black/40 border-b border-white/10 px-4 py-3 grid grid-cols-[1fr_auto] gap-4">
          <span className="text-3xs font-black uppercase tracking-widest text-fg-muted">Jugador</span>
          <span className="text-3xs font-black uppercase tracking-widest text-fg-muted text-right">Estado</span>
        </div>

        {atletasFiltrados.length === 0 ? (
          <div className="text-center py-16 text-fg-faint">
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
                className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-4 py-3 border-b border-white/5 hover:bg-white/3 transition-colors"
              >
                {/* Atleta Info */}
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center font-black text-white/50 text-sm">
                    {atleta.nombre?.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{atleta.nombre}</p>
                    <p className="text-3xs text-fg-muted uppercase tracking-widest">
                      {atleta.categoria} · {atleta.posicion}
                      {!confirmado && <span className="text-fg-faint normal-case tracking-normal"> · sin revisar</span>}
                    </p>
                  </div>
                </div>

                {/* Botones de Estado — grandes en móvil para pasar lista con el pulgar */}
                <div className="grid grid-cols-4 gap-2 md:flex md:items-center">
                  {Object.entries(ESTADO_CONFIG).map(([estado, cfg]) => {
                    const Icon = cfg.icon;
                    const isActive = estadoActual === estado;
                    return (
                      <button
                        key={estado}
                        title={cfg.label}
                        aria-label={cfg.label}
                        aria-pressed={isActive}
                        onClick={() => marcarEstado(atleta.id, estado)}
                        className={`min-h-11 md:min-w-11 p-2 md:p-2.5 rounded-lg border transition font-bold flex flex-col md:flex-row items-center justify-center gap-1 ${
                          isActive
                            ? (confirmado ? cfg.color : `${cfg.color} border-dashed opacity-60`)
                            : 'text-fg-faint border-white/5 hover:bg-white/5 hover:text-fg-secondary'
                        }`}
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
      </div>

      {/* Botón Guardar — sticky para que la acción principal quede siempre al alcance del pulgar */}
      <div className="sticky bottom-0 z-20 -mx-6 md:-mx-12 -mb-6 md:-mb-12 px-6 md:px-12 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)] bg-surface-base/90 backdrop-blur border-t border-white/5 flex flex-col items-end gap-2">
        {errorGuardar && (
          <p className="text-xs text-danger-soft font-bold" role="alert">{errorGuardar}</p>
        )}
        {pidiendoConfirmacion && (
          <p className="text-xs text-caution-soft font-bold text-right" role="alert">
            {sinRevisar === total
              ? `No revisaste a ningún atleta — se guardaría a los ${total} como "Presente" por defecto.`
              : `Quedan ${sinRevisar} de ${total} atletas sin revisar — se guardarían como "Presente" por defecto.`}
          </p>
        )}
        <button
          onClick={handleGuardar}
          disabled={saving}
          className={`flex items-center space-x-2 px-6 py-3 rounded-control font-black uppercase tracking-widest text-sm transition ${
            saved
              ? 'bg-success/20 border border-success/40 text-success-soft'
              : pidiendoConfirmacion
              ? 'bg-caution/10 border border-caution/40 text-caution-soft hover:bg-caution/20'
              : 'bg-brand/10 border border-brand/30 text-brand hover:bg-brand/20'
          } disabled:opacity-50`}
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
