import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Megaphone, Users, User, UserCheck, Search, Send, MessageSquare, CheckCircle2 } from 'lucide-react';
import { crearComunicacion, fetchComunicaciones, generarLinkWhatsApp } from '../api/comunicacionesService';
import { fetchGrupos } from '../api/sesionesService';

const TIPO_CONFIG = {
  Anuncio:       { icon: Megaphone,  color: 'text-[#FFD700] bg-[#FFD700]/10 border-[#FFD700]/30',     label: 'Anuncio General' },
  Grupal:        { icon: Users,      color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',         label: 'Al Grupo' },
  Personalizado: { icon: UserCheck,  color: 'text-purple-400 bg-purple-500/10 border-purple-500/30',   label: 'Grupo Custom' },
  Individual:    { icon: User,       color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', label: 'Individual' },
};

export default function AdminComunicaciones({ user, atletas = [] }) {
  const [comunicaciones, setComunicaciones] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [form, setForm] = useState({ tipo: 'Anuncio', titulo: '', mensaje: '', grupoId: '', atletaId: '' });
  const [destinatariosCustom, setDestinatariosCustom] = useState([]);
  const [busquedaDest, setBusquedaDest] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const [c, g] = await Promise.all([fetchComunicaciones({ limit: 30 }), fetchGrupos()]);
    setComunicaciones(c);
    setGrupos(g);
    if (g.length > 0) setForm(f => ({ ...f, grupoId: g[0].id }));
  }, []);

  useEffect(() => { load(); }, [load]);

  const atletasFiltrados = atletas.filter(a =>
    busquedaDest && a.nombre?.toLowerCase().includes(busquedaDest.toLowerCase()) &&
    !destinatariosCustom.find(d => d.id === a.id)
  );

  const addDestinatario = (atleta) => {
    setDestinatariosCustom(prev => [...prev, atleta]);
    setBusquedaDest('');
  };

  const handleEnviar = async () => {
    if (!form.mensaje.trim()) return;
    setSaving(true);
    try {
      const payload = {
        autor_id: user.id,
        tipo: form.tipo,
        titulo: form.titulo || form.tipo,
        mensaje: form.mensaje,
        grupo_id: form.tipo === 'Grupal' ? form.grupoId : null,
        atleta_id: form.tipo === 'Individual' ? form.atletaId : null,
        destinatarios_ids: form.tipo === 'Personalizado' ? destinatariosCustom.map(d => d.id) : [],
      };
      await crearComunicacion(payload);
      setSaved(true);
      setForm(f => ({ ...f, titulo: '', mensaje: '' }));
      setDestinatariosCustom([]);
      const c = await fetchComunicaciones({ limit: 30 });
      setComunicaciones(c);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const abrirWA = (com) => {
    const texto = `*${com.titulo}*\n\n${com.mensaje}`;
    window.open(generarLinkWhatsApp('', texto), '_blank');
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white p-6 md:p-10">
      <div className="fixed top-[-20%] left-[20%] w-[600px] h-[500px] bg-purple-500/3 blur-[150px] pointer-events-none rounded-full" />

      {/* Header */}
      <header className="mb-8 border-b border-white/5 pb-8 relative z-10">
        <div className="flex items-center space-x-3">
          <MessageSquare className="text-[#FFD700]" size={28} />
          <div>
            <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tighter">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FFD700] to-[#D4AF37]">Comunicaciones</span>
            </h2>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mt-1">
              Club · Coach · Familia
            </p>
          </div>
        </div>
      </header>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* PANEL IZQUIERDO: Redactar */}
        <div className="space-y-5">
          <h3 className="text-sm font-black text-white uppercase tracking-widest">Nuevo Mensaje</h3>

          {/* Selector de Tipo */}
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(TIPO_CONFIG).map(([tipo, cfg]) => {
              const Icon = cfg.icon;
              return (
                <button key={tipo} onClick={() => setForm(f => ({ ...f, tipo }))}
                  className={`flex items-center space-x-2 p-3 rounded-xl border text-xs font-black uppercase tracking-widest transition-all ${
                    form.tipo === tipo ? cfg.color : 'border-white/10 text-gray-500 hover:text-white hover:bg-white/5'
                  }`}>
                  <Icon size={14} />
                  <span>{cfg.label}</span>
                </button>
              );
            })}
          </div>

          {/* Selector de Grupo (si es Grupal) */}
          {form.tipo === 'Grupal' && (
            <div className="glass-card rounded-2xl p-4 border border-white/8">
              <label className="block text-[9px] text-gray-500 font-black uppercase tracking-[0.25em] mb-3">Grupo Destino</label>
              <div className="flex gap-2">
                {grupos.map(g => (
                  <button key={g.id} onClick={() => setForm(f => ({ ...f, grupoId: g.id }))}
                    className={`flex-1 p-2.5 rounded-xl border text-[10px] font-black uppercase transition-all ${
                      form.grupoId === g.id
                        ? 'bg-[#FFD700]/10 border-[#FFD700]/40 text-[#FFD700]'
                        : 'border-white/10 text-gray-400 hover:bg-white/5'
                    }`}>
                    {g.nombre}<br/>
                    <span className="text-[8px] text-gray-500 normal-case font-normal">{g.horario}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selector de Atleta (si es Individual) */}
          {form.tipo === 'Individual' && (
            <div className="glass-card rounded-2xl p-4 border border-white/8">
              <label className="block text-[9px] text-gray-500 font-black uppercase tracking-[0.25em] mb-3">Destinatario</label>
              <select value={form.atletaId} onChange={e => setForm(f => ({ ...f, atletaId: e.target.value }))}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none appearance-none cursor-pointer">
                <option value="" className="bg-[#121214]">Seleccionar jugador...</option>
                {atletas.map(a => <option key={a.atleta_id} value={a.atleta_id} className="bg-[#121214]">{a.nombre} ({a.categoria})</option>)}
              </select>
            </div>
          )}

          {/* Selector Personalizado */}
          {form.tipo === 'Personalizado' && (
            <div className="glass-card rounded-2xl p-4 border border-white/8">
              <label className="block text-[9px] text-gray-500 font-black uppercase tracking-[0.25em] mb-3">
                Destinatarios Personalizados ({destinatariosCustom.length} seleccionados)
              </label>
              {destinatariosCustom.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {destinatariosCustom.map(d => (
                    <span key={d.id} className="flex items-center space-x-1.5 bg-purple-500/10 border border-purple-500/30 rounded-full px-2.5 py-1 text-[10px] text-purple-400 font-bold">
                      <span>{d.nombre}</span>
                      <button onClick={() => setDestinatariosCustom(p => p.filter(x => x.id !== d.id))} className="hover:text-white">✕</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center space-x-2 bg-black/40 border border-white/10 rounded-xl px-3 py-2">
                <Search size={13} className="text-gray-500" />
                <input type="text" placeholder="Agregar por nombre..." value={busquedaDest}
                  onChange={e => setBusquedaDest(e.target.value)}
                  className="bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none w-full" />
              </div>
              {atletasFiltrados.slice(0, 5).map(a => (
                <button key={a.id} onClick={() => addDestinatario(a)}
                  className="w-full flex items-center space-x-2 px-3 py-2 mt-1 rounded-lg hover:bg-white/5 text-left transition-colors">
                  <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-black text-white/50">{a.nombre?.charAt(0)}</span>
                  <span className="text-xs font-bold text-white">{a.nombre}</span>
                  <span className="text-[9px] text-gray-500">{a.categoria}</span>
                </button>
              ))}
            </div>
          )}

          {/* Título y Mensaje */}
          <input type="text" placeholder="Título del mensaje (opcional)"
            value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#FFD700]/50 transition-colors" />
          <textarea rows={4} placeholder="Escribe el mensaje..."
            value={form.mensaje} onChange={e => setForm(f => ({ ...f, mensaje: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#FFD700]/50 resize-none transition-colors" />

          <button onClick={handleEnviar} disabled={saving || !form.mensaje.trim()}
            className={`w-full flex items-center justify-center space-x-2 py-4 rounded-2xl font-black uppercase tracking-widest text-sm transition-all ${
              saved
                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                : 'bg-[#FFD700]/10 border border-[#FFD700]/30 text-[#FFD700] hover:bg-[#FFD700]/20 disabled:opacity-40'
            }`}>
            {saving ? <span className="animate-pulse">Enviando...</span>
              : saved ? <><CheckCircle2 size={16} /><span>¡Mensaje Enviado!</span></>
              : <><Send size={16} /><span>Registrar Mensaje</span></>}
          </button>
        </div>

        {/* PANEL DERECHO: Feed de mensajes */}
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">Feed Reciente</h3>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            {comunicaciones.length === 0 && (
              <div className="text-center py-16 text-gray-600">
                <MessageSquare size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-bold">No hay mensajes aún</p>
              </div>
            )}
            {comunicaciones.map(c => {
              const cfg = TIPO_CONFIG[c.tipo];
              const Icon = cfg?.icon;
              return (
                <motion.div key={c.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                  className="glass-card rounded-2xl p-4 border border-white/8 hover:border-white/15 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className={`flex items-center space-x-1.5 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase ${cfg?.color}`}>
                      {Icon && <Icon size={10} />}
                      <span>{cfg?.label}</span>
                      {c.grupos_entrenamiento && <span>· {c.grupos_entrenamiento.nombre}</span>}
                    </div>
                    <span className="text-[9px] text-gray-600">{new Date(c.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })}</span>
                  </div>
                  {c.titulo && <p className="text-sm font-black text-white mb-1">{c.titulo}</p>}
                  <p className="text-xs text-gray-400 leading-relaxed">{c.mensaje}</p>
                  <div className="mt-3 pt-3 border-t border-white/5 flex justify-end">
                    <button onClick={() => abrirWA(c)}
                      className="flex items-center space-x-1.5 text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors">
                      <MessageSquare size={12} />
                      <span>Abrir en WhatsApp</span>
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
