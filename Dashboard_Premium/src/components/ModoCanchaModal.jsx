import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchTodosLosAtletas } from '../api/atletasService';
import { insertarObservacion } from '../api/observacionesService';
import { crearSesionEntrenamiento } from '../api/sesionesEntrenamientoService';
import { supabase } from '../api/supabaseClient';
import { useAuth } from '../AuthContext';
import { INSIGNIAS } from './ModoCanchaModalConstants';
import ModoCanchaModalHeader from './ModoCanchaModalHeader';
import ModoCanchaModalSesionesActivas from './ModoCanchaModalSesionesActivas';
import ModoCanchaModalTipoClase from './ModoCanchaModalTipoClase';
import ModoCanchaModalConfigPilar from './ModoCanchaModalConfigPilar';
import ModoCanchaModalAsistencia from './ModoCanchaModalAsistencia';
import ModoCanchaModalGridAtletas from './ModoCanchaModalGridAtletas';
import ModoCanchaModalEvaluarAtleta from './ModoCanchaModalEvaluarAtleta';

export default function ModoCanchaModal({ isOpen, onClose, onRefresh }) {
  const { user } = useAuth();

  // Pasos: 0=Menu/SesionActiva, 1=TipoClase, 2=Config, 3=Asistencia, 4=GridAtletas, 5=EvaluarAtleta
  const [step, setStep] = useState(0);
  const [tipoClase, setTipoClase] = useState(null); // 'grupal' o 'individual'
  const [nivelSeleccionado, setNivelSeleccionado] = useState(''); // 'Micro', 'Desarrollo', 'Elite'

  const [atletas, setAtletas] = useState([]);


  const [busquedaAtleta, setBusquedaAtleta] = useState('');
  const [atletaIndividual, setAtletaIndividual] = useState(null);

  const [pilarObjetivo, setPilarObjetivo] = useState('Eficiencia Táctica');

  const [asistencia, setAsistencia] = useState({}); // { id: true/false }
  const [atletaEvaluando, setAtletaEvaluando] = useState(null);

  const [ratings, setRatings] = useState({ esfuerzo: 0, actitud: 0, foco: 0, trabajo_equipo: 0 });

  const [insigniasSeleccionadas, setInsigniasSeleccionadas] = useState([]);

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Sesiones Activas (puede haber más de una)
  const [activeSessions, setActiveSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null); // La que está siendo evaluada
  const [evaluadosIds, setEvaluadosIds] = useState([]);

  useEffect(() => {
    if (isOpen) {
      loadData();
      checkActiveSession();
    }
  }, [isOpen]);

  // Bloquea el scroll del fondo mientras el modal está abierto (iOS scrollea el body detrás)
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  const loadData = async () => {
    const atls = await fetchTodosLosAtletas(user);
    setAtletas(atls);
  };

  const checkActiveSession = async () => {
    const { data } = await supabase
      .from('sesiones_programadas')
      .select('*')
      .eq('coach_id', user.id)
      .eq('estado', 'Programada')
      .ilike('notas', '[EN_CURSO]%');

    if (data && data.length > 0) {
      // Enriquecer cada sesión con el pilar extraído de las notas
      const sesionesEnriquecidas = data.map(s => {
        const match = s.notas?.match(/Pilar:([^|]+)/);
        const grupoMatch = s.notas?.match(/\| (.+)$/);
        return {
          ...s,
          pilar_objetivo: match ? match[1].trim() : '',
          grupo_label: grupoMatch ? grupoMatch[1].trim() : s.tipo
        };
      });
      setActiveSessions(sesionesEnriquecidas);
      setStep(0);
    } else {
      setActiveSessions([]);
      resetAll();
    }
  };

  const resetAll = () => {
    setStep(1);
    setTipoClase(null);
    setNivelSeleccionado('');
    setAtletaIndividual(null);
    setBusquedaAtleta('');
    setAsistencia({});
    setEvaluadosIds([]);
    setAtletaEvaluando(null);
    setPilarObjetivo('Eficiencia Táctica');
    resetEvalForm();
  };

  const resetEvalForm = () => {
    setRatings({ esfuerzo: 0, actitud: 0, foco: 0, trabajo_equipo: 0 });
    setInsigniasSeleccionadas([]);
    setSuccessMsg('');
  };

  const atletasFiltradosIndividual = useMemo(() => atletas.filter(a =>
    a.nombre.toLowerCase().includes(busquedaAtleta.toLowerCase()) ||
    (a.categoria || '').toLowerCase().includes(busquedaAtleta.toLowerCase()) ||
    (a.cedula || '').toLowerCase().includes(busquedaAtleta.toLowerCase())
  ).slice(0, 5), [atletas, busquedaAtleta]);

  const uniqueCategorias = useMemo(() => {
    const cats = new Set();
    atletas.forEach(a => {
      if (a.categoria) cats.add(a.categoria);
    });
    return Array.from(cats).sort();
  }, [atletas]);

  const uniqueEdades = useMemo(() => {
    const edades = new Set();
    atletas.forEach(a => {
      if (a.edad) edades.add(String(a.edad));
    });
    return Array.from(edades).sort((a, b) => parseInt(a) - parseInt(b));
  }, [atletas]);

  const atletasParaSesion = useMemo(() => {
    if (tipoClase === 'privada_1v1') return atletaIndividual ? [atletaIndividual] : [];
    if (tipoClase === 'grupal_ind') {
      return atletas.filter(a => {
        const matchText = busquedaAtleta === '' ||
                          a.nombre.toLowerCase().includes(busquedaAtleta.toLowerCase()) ||
                          (a.cedula || '').toLowerCase().includes(busquedaAtleta.toLowerCase());
        const matchCat = nivelSeleccionado === '' ||
                         (a.categoria || '').toLowerCase().includes(nivelSeleccionado.toLowerCase()) ||
                         String(a.edad || '').includes(nivelSeleccionado);
        return matchText && matchCat;
      });
    }
    return atletas.filter(a => a.nivel_desarrollo === nivelSeleccionado);
  }, [atletas, tipoClase, atletaIndividual, busquedaAtleta, nivelSeleccionado]);

  const handleMarcarAsistencia = (id, presente) => {
    setAsistencia(prev => ({ ...prev, [id]: presente }));
  };

  const checkAllAsistencia = (presente) => {
    const newAsistencia = { ...asistencia };
    atletasParaSesion.forEach(a => newAsistencia[a.atleta_id] = presente);
    setAsistencia(newAsistencia);
  };

  // =============== FLUJO DE INICIO ===============
  const handleStartSession = async () => {
    setSaving(true);
    try {
      const presentes = atletas.filter(a => asistencia[a.atleta_id] === true);

      if (presentes.length === 0) {
        alert("Debes marcar al menos un atleta como presente.");
        setSaving(false);
        return;
      }

      // 1. Crear la Sesion Programada (Global de la clase)
      const ahora = new Date();
      const horaStr = ahora.toTimeString().split(' ')[0]; // HH:MM:SS

      let tipoStr = 'Grupal (Niveles)';
      let tipoDB = 'Grupal';
      if (tipoClase === 'privada_1v1') {
        tipoStr = 'Privada 1v1';
        tipoDB = 'Individual';
      }
      else if (tipoClase === 'grupal_ind') {
        tipoStr = 'Grupal Individualizada';
        tipoDB = 'Grupal';
      } else if (tipoClase === 'grupal_nivel') {
        tipoStr = `Grupal (Niveles) - ${nivelSeleccionado}`;
      }

      const notasStr = `[EN_CURSO] Pilar:${pilarObjetivo} | ${tipoStr}`;

      const { data: programadaData, error: errProg } = await supabase.from('sesiones_programadas').insert({
        coach_id: user.id,
        fecha: ahora.toISOString().split('T')[0],
        hora_inicio: horaStr,
        hora_fin: horaStr,
        estado: 'Programada',
        tipo: tipoDB,
        notas: notasStr
      }).select().single();

      if (errProg) throw errProg;

      // 2. Crear las Sesiones de Entrenamiento (Historial por atleta) en paralelo:
      // secuencial tardaba N roundtrips con la red del celular en la cancha.
      await Promise.all(presentes.map(a => crearSesionEntrenamiento({
        atleta_id: a.atleta_id,
        pilar_objetivo: pilarObjetivo,
        volumen_series_reps: '',
        notas: `[MODO_CANCHA: ${programadaData.id}] ${tipoStr}`,
        eva_registro: 0 // Placeholder
      })));

      // Cerramos el modal para que el coach dé la clase
      alert("Clase iniciada. Cuando termine, vuelve a abrir el Modo Cancha (se detectará la sesión activa).");
      onRefresh && onRefresh();
      onClose();
    } catch (err) {
      alert("Error al iniciar clase: " + err.message);
    }
    setSaving(false);
  };

  // =============== FLUJO FINAL (EVALUACIÓN Y XP) ===============
  const handleResumeSession = async (session) => {
    setActiveSession(session);
    setSaving(true);

    // Buscar los atletas que fueron registrados exactamente en esta clase usando el ID de la sesión
    const { data: sesAtletas } = await supabase
      .from('sesiones_entrenamiento')
      .select('atleta_id')
      .ilike('notas', `%[MODO_CANCHA: ${session.id}]%`);

    if (sesAtletas && sesAtletas.length > 0) {
      const idsPresentes = sesAtletas.map(s => s.atleta_id);
      const newAsist = {};
      idsPresentes.forEach(id => newAsist[id] = true);
      setTipoClase('resumed');
      setAsistencia(newAsist);
    } else {
      // Fallback por si hay sesiones antiguas sin el ID (carga todos los de hoy)
      const hoy = new Date().toISOString().split('T')[0];
      const { data: fallbackAtletas } = await supabase
        .from('sesiones_entrenamiento')
        .select('atleta_id')
        .gte('created_at', hoy + 'T00:00:00Z');

      if (fallbackAtletas) {
        const newAsist = {};
        fallbackAtletas.forEach(s => newAsist[s.atleta_id] = true);
        setTipoClase('resumed');
        setAsistencia(newAsist);
      }
    }

    setStep(4);
    setSaving(false);
  };

  const atletasResumed = useMemo(
    () => atletas.filter(a => asistencia[a.atleta_id]),
    [atletas, asistencia]
  );

  const handleSubmitEvaluation = async () => {
    if (!atletaEvaluando) return;
    setSaving(true);
    try {
      const xpBase = (ratings.esfuerzo + ratings.actitud + ratings.foco + ratings.trabajo_equipo) * 5;
      const xpInsignias = insigniasSeleccionadas.reduce((sum, ins) => sum + ins.xp, 0);
      const xpGanada = xpBase + xpInsignias;
      const insigniasStr = insigniasSeleccionadas.length > 0 ? insigniasSeleccionadas.map(i => i.label).join(', ') : null;

      const obsData = {
        atleta_id: atletaEvaluando.atleta_id,
        coach_id: user.id,
        esfuerzo: ratings.esfuerzo * 2,
        actitud: ratings.actitud * 2,
        foco: ratings.foco * 2,
        trabajo_equipo: ratings.trabajo_equipo * 2,
        insignia: insigniasStr,
        xp_ganada: xpGanada,
        notas: "Evaluación Modo Cancha"
      };

      await insertarObservacion(obsData);

      // Subir pilar táctico o resiliencia extra por las estrellitas
      const boostResiliencia = (ratings.esfuerzo + ratings.actitud) / 2;
      const boostTactica = (ratings.foco + ratings.trabajo_equipo) / 2;

      const { data: currentAtleta } = await supabase.from('atletas').select('xp_total, resiliencia_psicologica, eficiencia_tactica').eq('id', atletaEvaluando.atleta_id).single();

      if (currentAtleta) {
        await supabase.from('atletas').update({
          xp_total: (currentAtleta.xp_total || 0) + xpGanada,
          resiliencia_psicologica: Math.min(100, (currentAtleta.resiliencia_psicologica || 0) + boostResiliencia),
          eficiencia_tactica: Math.min(100, (currentAtleta.eficiencia_tactica || 0) + boostTactica)
        }).eq('id', atletaEvaluando.atleta_id);
      }



      setSuccessMsg('Evaluación guardada exitosamente.');
      setEvaluadosIds(prev => [...prev, atletaEvaluando.atleta_id]);

      setTimeout(() => {
        setStep(4);
        setAtletaEvaluando(null);
        resetEvalForm();
      }, 1000);

    } catch (err) {
      alert('Error al guardar: ' + err.message);
    }
    setSaving(false);
  };

  const handleCerrarClase = async () => {
    setSaving(true);
    try {
      let baseXP = 20; // Default Micro
      if (activeSession.notas?.includes('Privada 1v1')) {
        baseXP = 50;
      } else if (activeSession.notas?.includes('Grupal Individualizada')) {
        baseXP = 35;
      } else if (activeSession.notas?.includes('Grupal (Niveles)')) {
        if (activeSession.notas.includes('Micro')) baseXP = 20;
        else if (activeSession.notas.includes('Desarrollo')) baseXP = 30;
        else if (activeSession.notas.includes('Elite')) baseXP = 40;
      }

      // Determine stat to boost
      let statToBoost = null;
      if (activeSession.pilar_objetivo.includes('Físico')) statToBoost = 'fisico_atletico';
      else if (activeSession.pilar_objetivo.includes('Táctica')) statToBoost = 'eficiencia_tactica';
      else if (activeSession.pilar_objetivo.includes('Resiliencia') || activeSession.pilar_objetivo.includes('Liderazgo')) statToBoost = 'resiliencia_psicologica';

      // Un atleta a la vez tardaba 2 roundtrips secuenciales por cabeza (10-30s
      // con 15-20 presentes en la red de la cancha); en paralelo cierra en ~1-2s.
      const presentes = atletasResumed;
      await Promise.all(presentes.map(async (a) => {
        const { data: atData } = await supabase.from('atletas').select('xp_total, fisico_atletico, eficiencia_tactica, resiliencia_psicologica').eq('id', a.atleta_id).single();
        if (atData) {
          const updates = { xp_total: (atData.xp_total || 0) + baseXP };
          if (statToBoost) {
            updates[statToBoost] = Math.min(100, (atData[statToBoost] || 0) + 1.5); // Micro boost
          }
          await supabase.from('atletas').update(updates).eq('id', a.atleta_id);
        }
      }));

      // 2. Cerrar la sesión (cambiar notas para que no aparezca como 'En Curso')
      const notasLimpias = (activeSession.notas || '').replace('[EN_CURSO] ', '');
      await supabase.from('sesiones_programadas').update({ estado: 'Completada', notas: notasLimpias }).eq('id', activeSession.id);

      alert(`Clase finalizada. ${presentes.length} atletas recibieron +${baseXP} XP y un bonus en ${activeSession.pilar_objetivo}.`);
      onClose();
    } catch (err) {
      alert("Error al finalizar clase: " + err.message);
    }
    setSaving(false);
  };

  const handleRatingChange = (metric, star) => {
    setRatings(prev => ({...prev, [metric]: star}));

    const getInsigniaId = (m) => {
      if (m === 'esfuerzo') return 'hustle';
      if (m === 'actitud') return 'mamba';
      if (m === 'foco') return 'ice';
      if (m === 'trabajo_equipo') return 'lider';
      return null;
    };
    const targetId = getInsigniaId(metric);

    if (star === 5) {
      if (targetId) {
        setInsigniasSeleccionadas(prev => {
          if (!prev.find(i => i.id === targetId)) {
            const ins = INSIGNIAS.find(i => i.id === targetId);
            return [...prev, ins];
          }
          return prev;
        });
      }
    } else {
      if (targetId) {
        setInsigniasSeleccionadas(prev => prev.filter(i => i.id !== targetId));
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-4 bg-black/90 md:bg-black/80 md:backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
            className="w-full max-w-2xl bg-[#09090b] rounded-none md:rounded-3xl border border-[#FFD700]/30 shadow-[0_0_50px_rgba(255,215,0,0.15)] overflow-hidden flex flex-col h-dvh md:h-auto md:max-h-[90vh] pt-[env(safe-area-inset-top)] md:pt-0"
          >
            <ModoCanchaModalHeader step={step} setStep={setStep} onClose={onClose} />

            {/* En el paso 3 (asistencia) solo scrollea la lista interna: así el CTA
                "Empezar Clase" queda siempre visible sin doble scroll anidado. */}
            <div className={`p-4 md:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-6 flex-1 ${step === 3 ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>

              {/* STEP 0: Sesiones Activas */}
              {step === 0 && (
                <ModoCanchaModalSesionesActivas
                  activeSessions={activeSessions}
                  setStep={setStep}
                  handleResumeSession={handleResumeSession}
                />
              )}

              {/* STEP 1: Tipo de Sesión */}
              {step === 1 && (
                <ModoCanchaModalTipoClase
                  tipoClase={tipoClase}
                  setTipoClase={setTipoClase}
                  nivelSeleccionado={nivelSeleccionado}
                  setNivelSeleccionado={setNivelSeleccionado}
                  setStep={setStep}
                  busquedaAtleta={busquedaAtleta}
                  setBusquedaAtleta={setBusquedaAtleta}
                  setAtletaIndividual={setAtletaIndividual}
                  atletasFiltradosIndividual={atletasFiltradosIndividual}
                />
              )}

              {/* STEP 2: Session Setup (Pilares) */}
              {step === 2 && (
                <ModoCanchaModalConfigPilar
                  pilarObjetivo={pilarObjetivo}
                  setPilarObjetivo={setPilarObjetivo}
                  setStep={setStep}
                />
              )}

              {/* STEP 3: Asistencia */}
              {step === 3 && (
                <ModoCanchaModalAsistencia
                  tipoClase={tipoClase}
                  busquedaAtleta={busquedaAtleta}
                  setBusquedaAtleta={setBusquedaAtleta}
                  nivelSeleccionado={nivelSeleccionado}
                  setNivelSeleccionado={setNivelSeleccionado}
                  uniqueCategorias={uniqueCategorias}
                  uniqueEdades={uniqueEdades}
                  atletasParaSesion={atletasParaSesion}
                  asistencia={asistencia}
                  handleMarcarAsistencia={handleMarcarAsistencia}
                  checkAllAsistencia={checkAllAsistencia}
                  handleStartSession={handleStartSession}
                  saving={saving}
                />
              )}

              {/* STEP 4: Grid de Evaluación (Cierre de sesión) */}
              {step === 4 && (
                <ModoCanchaModalGridAtletas
                  atletasResumed={atletasResumed}
                  evaluadosIds={evaluadosIds}
                  setAtletaEvaluando={setAtletaEvaluando}
                  setStep={setStep}
                  handleCerrarClase={handleCerrarClase}
                  saving={saving}
                />
              )}

              {/* STEP 5: Evaluar Atleta Individual (Subjetivo) */}
              {step === 5 && atletaEvaluando && (
                <ModoCanchaModalEvaluarAtleta
                  atletaEvaluando={atletaEvaluando}
                  setStep={setStep}
                  successMsg={successMsg}
                  ratings={ratings}
                  handleRatingChange={handleRatingChange}
                  insigniasSeleccionadas={insigniasSeleccionadas}
                  handleSubmitEvaluation={handleSubmitEvaluation}
                  saving={saving}
                />
              )}

            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
