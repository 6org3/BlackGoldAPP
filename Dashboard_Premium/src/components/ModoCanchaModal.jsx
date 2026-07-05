import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchTodosLosAtletas } from '../api/atletasService';
import { insertarObservacion } from '../api/observacionesService';
import { crearSesionEntrenamiento } from '../api/sesionesEntrenamientoService';
import { fetchPlantillas } from '../api/sesionesService';
import { upsertAsistencia } from '../api/asistenciaService';
import { otorgarXP } from '../api/xpService';
import { xpBaseSesion } from '../../../packages/analytics-core/xp.js';
import { labelSubPilar } from '../../../packages/analytics-core/taxonomia.js';
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

  // Plantillas de sesión (catalogo_sesiones, fase P3): el paso 2 elige una plantilla
  // con objetivo canónico pilar/sub_pilar en vez de un string de pilar abstracto.
  const [plantillas, setPlantillas] = useState([]);
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState(null);

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
    const [atls, plts] = await Promise.all([fetchTodosLosAtletas(user), fetchPlantillas()]);
    setAtletas(atls);
    setPlantillas(plts);
  };

  const checkActiveSession = async () => {
    const { data } = await supabase
      .from('sesiones_programadas')
      .select('*')
      .eq('coach_id', user.id)
      .eq('estado', 'Programada')
      .ilike('notas', '[EN_CURSO]%');

    if (data && data.length > 0) {
      // Enriquecer cada sesión con una etiqueta legible del objetivo y del grupo.
      // Sesiones nuevas (P3): pilar_objetivo es columna real (key canónica de
      // taxonomia) y las notas son "[EN_CURSO] <tipo>". Sesiones viejas en curso:
      // el pilar venía codificado en notas como "Pilar:X | tipo" — fallback.
      const sesionesEnriquecidas = data.map(s => {
        const notasSinMarker = (s.notas || '').replace('[EN_CURSO]', '').trim();
        const matchLegacy = notasSinMarker.match(/Pilar:([^|]+)/);
        const grupoLegacy = notasSinMarker.match(/\| (.+)$/);
        return {
          ...s,
          pilar_label: s.pilar_objetivo
            ? labelSubPilar(s.pilar_objetivo)
            : (matchLegacy ? matchLegacy[1].trim() : ''),
          grupo_label: matchLegacy
            ? (grupoLegacy ? grupoLegacy[1].trim() : s.tipo)
            : (notasSinMarker || s.tipo),
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
    setPlantillaSeleccionada(null);
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

      // El marker [EN_CURSO] se conserva (checkActiveSession y el badge del Sidebar
      // filtran por él), pero el pilar YA NO se codifica en notas: va en la columna
      // real pilar_objetivo (key canónica de taxonomia, desde la plantilla elegida).
      const notasStr = `[EN_CURSO] ${tipoStr}`;
      const fechaStr = ahora.toISOString().split('T')[0];
      const objetivoCanonico = plantillaSeleccionada?.sub_pilar || plantillaSeleccionada?.pilar || null;

      const { data: programadaData, error: errProg } = await supabase.from('sesiones_programadas').insert({
        coach_id: user.id,
        fecha: fechaStr,
        hora_inicio: horaStr,
        hora_fin: horaStr,
        estado: 'Programada',
        tipo: tipoDB,
        pilar_objetivo: objetivoCanonico,
        notas: notasStr
      }).select().single();

      if (errProg) throw errProg;

      // 2. Asistencia REAL en la tabla `asistencia` (sesion_id = esta clase), que es
      // la misma que alimenta el KPI del owner — reemplaza el hack de inferir
      // presencia por notas de sesiones_entrenamiento. Se registran también los
      // marcados explícitamente como ausentes. 3. Historial por atleta
      // (sesiones_entrenamiento) solo para presentes, como siempre.
      // Todo en paralelo: secuencial tardaba N roundtrips con la red de la cancha.
      const marcados = atletas.filter(a => asistencia[a.atleta_id] !== undefined);
      await Promise.all([
        ...marcados.map(a => upsertAsistencia({
          atleta_id: a.atleta_id,
          coach_id: user.id,
          fecha: fechaStr,
          estado: asistencia[a.atleta_id] ? 'Presente' : 'Ausente',
          notas: tipoStr,
          sesion_id: programadaData.id,
        })),
        ...presentes.map(a => crearSesionEntrenamiento({
          atleta_id: a.atleta_id,
          pilar_objetivo: plantillaSeleccionada?.titulo || '',
          volumen_series_reps: '',
          notas: tipoStr,
          eva_registro: 0 // Placeholder
        })),
      ]);

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

    // Fuente de verdad (P3): la tabla `asistencia` con sesion_id de esta clase.
    const { data: asistRows } = await supabase
      .from('asistencia')
      .select('atleta_id, estado')
      .eq('sesion_id', session.id)
      .eq('estado', 'Presente');

    if (asistRows && asistRows.length > 0) {
      const newAsist = {};
      asistRows.forEach(r => newAsist[r.atleta_id] = true);
      setTipoClase('resumed');
      setAsistencia(newAsist);
    } else {
      // Fallback 1 (sesiones iniciadas ANTES del deploy de P3): la presencia se
      // infería por el marker [MODO_CANCHA: id] en sesiones_entrenamiento.notas.
      const { data: sesAtletas } = await supabase
        .from('sesiones_entrenamiento')
        .select('atleta_id')
        .ilike('notas', `%[MODO_CANCHA: ${session.id}]%`);

      if (sesAtletas && sesAtletas.length > 0) {
        const newAsist = {};
        sesAtletas.forEach(s => newAsist[s.atleta_id] = true);
        setTipoClase('resumed');
        setAsistencia(newAsist);
      } else {
        // Fallback 2 (sesiones aún más antiguas, sin ID): todos los de hoy.
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

      // Solo XP (fuente única otorgarXP). Antes se pasaba también un boost a
      // resiliencia_psicologica/eficiencia_tactica, pero esas columnas de
      // atletas ya no existen (v14 las eliminó) — otorgarXP hace un SELECT
      // que incluye las columnas del statBoosts, así que fallaba entera y
      // ni siquiera el XP se guardaba.
      await otorgarXP(atletaEvaluando.atleta_id, xpGanada);

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
      const baseXP = xpBaseSesion(activeSession.notas);

      // Un atleta a la vez tardaba 2 roundtrips secuenciales por cabeza (10-30s
      // con 15-20 presentes en la red de la cancha); en paralelo cierra en ~1-2s.
      // La mutación de XP pasa por otorgarXP (fuente única). Antes se pasaba
      // también un statBoost (fisico_atletico/eficiencia_tactica/
      // resiliencia_psicologica) derivado de pilar_objetivo, pero esas
      // columnas de atletas ya no existen (v14 las eliminó) — otorgarXP hace
      // un SELECT que incluye las columnas del statBoosts, así que fallaba
      // entera y ni siquiera el XP se guardaba.
      const presentes = atletasResumed;
      await Promise.all(presentes.map(a => otorgarXP(a.atleta_id, baseXP)));

      // 2. Cerrar la sesión (cambiar notas para que no aparezca como 'En Curso')
      const notasLimpias = (activeSession.notas || '').replace('[EN_CURSO] ', '');
      await supabase.from('sesiones_programadas').update({ estado: 'Completada', notas: notasLimpias }).eq('id', activeSession.id);

      alert(`Clase finalizada. ${presentes.length} atletas recibieron +${baseXP} XP.`);
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

              {/* STEP 2: Objetivo de la sesión (plantilla de catalogo_sesiones) */}
              {step === 2 && (
                <ModoCanchaModalConfigPilar
                  plantillas={plantillas}
                  plantillaSeleccionada={plantillaSeleccionada}
                  setPlantillaSeleccionada={setPlantillaSeleccionada}
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
