import { useState, useCallback, useEffect } from 'react';
import { fetchGruposConOcupacion, crearGrupo, actualizarGrupo, archivarGrupo, eliminarGrupo } from '../api/gruposService';
import { fetchClubesTodos } from '../api/clubesService';

// ─── Estado y lógica de la gestión de grupos (v37) ───
// Molde: useAdminEquipoForm. Mismo criterio de "club de trabajo": el superadmin
// lee todos los clubes, así que sin elegir uno vería los grupos de la plataforma
// entera mezclados — y crearía grupos en el club de su propia ficha sin saberlo.
//
// Se cargan TAMBIÉN los archivados: esta es la única pantalla desde la que se
// reactivan, así que es la única que debe verlos.
export default function useAdminGruposForm({ user }) {
  const esSuperadmin = user?.rol === 'superadmin';
  const [clubTrabajo, setClubTrabajo] = useState(user?.club || '');
  const [clubes, setClubes] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [procesandoId, setProcesandoId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Catálogo solo para el superadmin (RPC v34, gate es_superadmin server-side).
  useEffect(() => {
    if (!esSuperadmin) return;
    fetchClubesTodos()
      .then((lista) => {
        setClubes(lista);
        setClubTrabajo((actual) => (actual && lista.includes(actual) ? actual : (lista[0] || '')));
      })
      .catch(() => setClubes([]));
  }, [esSuperadmin]);

  // `precio_mensual` arranca vacío, no en 30: v37 quitó el DEFAULT justo para
  // que nadie herede un precio que no escribió (el generador cobra por cron).
  const emptyForm = {
    nombre: '', nivel: '', es_principal: false, horario: '',
    precio_mensual: '', cupo_max: '', descripcion: '',
  };
  const [form, setForm] = useState(emptyForm);

  const handleChange = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const load = useCallback(async () => {
    if (!clubTrabajo) { setGrupos([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await fetchGruposConOcupacion(clubTrabajo, { incluirArchivados: true });
      setGrupos(data);
      setError('');
    } catch (e) {
      setError(e.message);
      setGrupos([]);
    }
    setLoading(false);
  }, [clubTrabajo]);

  useEffect(() => { load(); }, [load]);

  const abrirNuevo = useCallback((preset = {}) => {
    setForm({ ...emptyForm, ...preset });
    setEditingId(null);
    setShowForm(true);
    setError('');
    setSuccess('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEdit = useCallback((g) => {
    setForm({
      nombre: g.nombre || '',
      nivel: g.nivel || '',
      es_principal: !!g.es_principal,
      horario: g.horario || '',
      precio_mensual: g.precio_mensual ?? '',
      cupo_max: g.cupo_max ?? '',
      descripcion: g.descripcion || '',
    });
    setEditingId(g.id);
    setShowForm(true);
    setError('');
    setSuccess('');
  }, []);

  const cerrarForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        ...form,
        club: clubTrabajo,
        nivel: form.nivel || null,
        cupo_max: form.cupo_max === '' ? null : form.cupo_max,
      };
      if (editingId) {
        await actualizarGrupo(editingId, payload);
        setSuccess(`✅ "${form.nombre}" actualizado.`);
      } else {
        await crearGrupo(payload);
        setSuccess(
          form.es_principal
            ? `✅ "${form.nombre}" creado como grupo principal de nivel ${form.nivel}. La membresía básica lo cubre.`
            : `✅ "${form.nombre}" creado como grupo extra: se cobra aparte de la membresía básica.`
        );
      }
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el grupo.');
    }
    setSaving(false);
  };

  // Archivar / reactivar. Es la vía normal de retirar un grupo: borrar uno con
  // atletas dentro los dejaría facturando la tarifa genérica (ver v37 §4).
  const toggleArchivado = useCallback(async (grupo) => {
    setProcesandoId(grupo.id);
    setError('');
    try {
      await archivarGrupo(grupo.id, !grupo.activo);
      setSuccess(grupo.activo
        ? `"${grupo.nombre}" archivado: deja de ofrecerse para sesiones, asistencia y comunicaciones. Su historial se conserva.`
        : `"${grupo.nombre}" reactivado.`);
      await load();
    } catch (e) {
      setError(e.message);
    }
    setProcesandoId(null);
  }, [load]);

  const borrar = useCallback(async (grupo) => {
    setProcesandoId(grupo.id);
    setError('');
    try {
      await eliminarGrupo(grupo.id);
      setSuccess(`"${grupo.nombre}" eliminado.`);
      await load();
    } catch (e) {
      setError(e.message);
    }
    setProcesandoId(null);
  }, [load]);

  return {
    esSuperadmin, clubTrabajo, setClubTrabajo, clubes,
    grupos, loading,
    showForm, setShowForm, editingId, saving, procesandoId,
    error, setError, success, setSuccess,
    emptyForm, form, setForm, handleChange,
    abrirNuevo, handleEdit, cerrarForm, handleSubmit,
    toggleArchivado, borrar, load,
  };
}
