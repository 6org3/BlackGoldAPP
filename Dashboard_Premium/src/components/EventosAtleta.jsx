import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, MapPin, Clock, Users, CheckCircle2, XCircle, HelpCircle, Loader2 } from 'lucide-react';
import { supabase } from '../api/supabaseClient';

const TIPO_LABELS = {
  partido:                'Partido',
  torneo:                 'Torneo',
  entrenamiento_especial: 'Entrenamiento Especial',
  clinica:                'Clínica',
  reunion:                'Reunión',
  evaluacion:             'Evaluación',
  social:                 'Social',
};

const TIPO_COLORS = {
  partido:                'text-brand border-brand/30 bg-brand/5',
  torneo:                 'text-mental-soft border-mental/30 bg-mental/5',
  entrenamiento_especial: 'text-success-soft border-success/30 bg-success/5',
  clinica:                'text-info-soft border-info/30 bg-info/5',
  reunion:                'text-fg-secondary border-gray-500/30 bg-gray-500/5',
  evaluacion:             'text-caution-soft border-caution/30 bg-caution/5',
  social:                 'text-pink-400 border-pink-500/30 bg-pink-500/5',
};

const RSVP_CONFIG = {
  asiste:    { label: 'Confirmaré',   icon: CheckCircle2, color: 'text-success-soft', bg: 'bg-success/10 border-success/30' },
  no_asiste: { label: 'No asistiré',  icon: XCircle,      color: 'text-danger-soft',     bg: 'bg-danger/10 border-danger/30' },
  duda:      { label: 'Tengo dudas',  icon: HelpCircle,   color: 'text-warning-soft',   bg: 'bg-warning/10 border-warning/30' },
  pendiente: { label: 'Sin respuesta',icon: Clock,         color: 'text-fg-muted',    bg: 'bg-white/5 border-white/10' },
};

export default function EventosAtleta({ atletaId }) {
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    if (!atletaId) { setLoading(false); return; }
    fetchEventos();
  }, [atletaId]);

  async function fetchEventos() {
    setLoading(true);
    try {
      // Get all events where this athlete is called up
      const { data, error } = await supabase
        .from('evento_convocados')
        .select(`
          id,
          estado_rsvp,
          asistencia_real,
          eventos (
            id, titulo, tipo, estado, fecha_evento,
            hora_llegada, hora_inicio, sede, direccion,
            rival, descripcion, uniforme,
            marcador_propio, marcador_rival, resultado
          )
        `)
        .eq('atleta_id', atletaId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Flatten and sort: upcoming first, then past
      const ahora = new Date();
      const flat = (data || [])
        .filter(c => c.eventos)
        .map(c => ({
          convocadoId: c.id,
          rsvp: c.estado_rsvp || 'pendiente',
          asistencia: c.asistencia_real,
          ...c.eventos,
        }))
        .sort((a, b) => new Date(a.fecha_evento) - new Date(b.fecha_evento));

      setEventos(flat);
    } catch (err) {
      console.error('Error fetching eventos atleta:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRsvp(convocadoId, nuevoEstado) {
    setUpdatingId(convocadoId);
    try {
      const { error } = await supabase
        .from('evento_convocados')
        .update({ estado_rsvp: nuevoEstado, rsvp_at: new Date().toISOString() })
        .eq('id', convocadoId);
      if (error) throw error;
      setEventos(prev =>
        prev.map(e => e.convocadoId === convocadoId ? { ...e, rsvp: nuevoEstado } : e)
      );
    } catch (err) {
      console.error('Error actualizando RSVP:', err);
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-brand">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const ahora = new Date();
  const proximos = eventos.filter(e => new Date(e.fecha_evento) >= ahora && e.estado !== 'cancelado');
  const pasados  = eventos.filter(e => new Date(e.fecha_evento) < ahora || e.estado === 'cerrado');

  if (eventos.length === 0) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center h-48 text-center">
        <Calendar size={40} className="text-gray-700 mb-3" />
        <p className="text-fg-muted font-bold uppercase tracking-widest text-xs">Sin convocatorias aún</p>
        <p className="text-gray-700 text-xs mt-1">Cuando el coach te convoque a un evento aparecerá aquí.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Próximos */}
      {proximos.length > 0 && (
        <section>
          <h3 className="text-2xs font-black uppercase tracking-widest text-fg-muted mb-4 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Próximos Eventos
          </h3>
          <div className="space-y-4">
            {proximos.map((evento, i) => (
              <EventoCard
                key={evento.convocadoId}
                evento={evento}
                index={i}
                onRsvp={handleRsvp}
                updating={updatingId === evento.convocadoId}
              />
            ))}
          </div>
        </section>
      )}

      {/* Pasados */}
      {pasados.length > 0 && (
        <section>
          <h3 className="text-2xs font-black uppercase tracking-widest text-fg-muted mb-4 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-600" />
            Eventos Pasados
          </h3>
          <div className="space-y-3">
            {pasados.slice(0, 5).map((evento, i) => (
              <EventoCard
                key={evento.convocadoId}
                evento={evento}
                index={i}
                past
                onRsvp={handleRsvp}
                updating={updatingId === evento.convocadoId}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function EventoCard({ evento, index, past, onRsvp, updating }) {
  const fecha = new Date(evento.fecha_evento);
  const fechaStr = fecha.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  const tipoColor = TIPO_COLORS[evento.tipo] || TIPO_COLORS.partido;
  const rsvpCfg = RSVP_CONFIG[evento.rsvp] || RSVP_CONFIG.pendiente;
  const RsvpIcon = rsvpCfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.3 }}
      className={`bg-surface-sunken border rounded-panel p-5 ${past ? 'border-white/5 opacity-70' : 'border-white/10'}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${tipoColor}`}>
              {TIPO_LABELS[evento.tipo] || evento.tipo}
            </span>
            {evento.estado === 'cancelado' && (
              <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border text-danger-soft border-danger/30 bg-danger/5">
                Cancelado
              </span>
            )}
          </div>
          <h4 className="text-sm font-black text-white leading-tight">{evento.titulo}</h4>
          {evento.rival && (
            <p className="text-2xs text-fg-muted font-bold mt-0.5">vs. {evento.rival}</p>
          )}
        </div>

        {/* Fecha */}
        <div className="text-right shrink-0">
          <p className="text-brand font-black text-xs uppercase tracking-wide">{fechaStr}</p>
          {evento.hora_inicio && (
            <p className="text-2xs text-fg-muted font-bold mt-0.5">{evento.hora_inicio.slice(0,5)}</p>
          )}
        </div>
      </div>

      {/* Info row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-fg-secondary font-bold mb-4">
        {evento.hora_llegada && (
          <span className="flex items-center gap-1">
            <Clock size={13} />
            Llegada: {evento.hora_llegada.slice(0,5)}
          </span>
        )}
        {evento.sede && (
          <span className="flex items-center gap-1">
            <MapPin size={13} />
            {evento.sede}
          </span>
        )}
        {evento.uniforme && (
          <span className="flex items-center gap-1">
            <Users size={13} />
            {evento.uniforme}
          </span>
        )}
      </div>

      {/* Resultado (eventos pasados) */}
      {past && evento.resultado && (
        <div className={`mb-4 px-3 py-2 rounded-control text-center font-black uppercase tracking-widest text-xs border ${
          evento.resultado === 'ganado'  ? 'text-success-soft border-success/30 bg-success/10' :
          evento.resultado === 'perdido' ? 'text-danger-soft border-danger/30 bg-danger/10' :
                                          'text-warning-soft border-warning/30 bg-warning/10'
        }`}>
          {evento.resultado === 'ganado' ? '🏆 ' : evento.resultado === 'perdido' ? '❌ ' : '🤝 '}
          {evento.resultado.charAt(0).toUpperCase() + evento.resultado.slice(1)}
          {evento.marcador_propio != null && evento.marcador_rival != null && (
            <span className="ml-2 font-bold opacity-80">
              {evento.marcador_propio} – {evento.marcador_rival}
            </span>
          )}
        </div>
      )}

      {/* RSVP buttons (solo próximos no cancelados) */}
      {!past && evento.estado !== 'cancelado' && (
        <div className="flex flex-wrap gap-2">
          {(['asiste', 'no_asiste', 'duda']).map(estado => {
            const cfg = RSVP_CONFIG[estado];
            const Icon = cfg.icon;
            const isActive = evento.rsvp === estado;
            return (
              <button
                key={estado}
                onClick={() => onRsvp(evento.convocadoId, estado)}
                disabled={updating}
                className={`flex flex-1 items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-lg border text-[11px] font-black uppercase tracking-widest transition ${
                  isActive ? cfg.bg + ' ' + cfg.color : 'bg-white/5 border-white/10 text-fg-faint hover:text-fg-secondary hover:border-white/20'
                }`}
              >
                <Icon size={14} />
                {cfg.label}
              </button>
            );
          })}
          {updating && <Loader2 size={14} className="text-brand animate-spin self-center" />}
        </div>
      )}

      {/* RSVP actual (si ya respondió, mostrar estado) */}
      {!past && evento.rsvp !== 'pendiente' && (
        <div className={`mt-2 flex items-center gap-1.5 ${rsvpCfg.color}`}>
          <RsvpIcon size={11} />
          <span className="text-3xs font-bold">Tu respuesta: {rsvpCfg.label}</span>
        </div>
      )}
    </motion.div>
  );
}
