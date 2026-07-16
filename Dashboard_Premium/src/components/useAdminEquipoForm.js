import { useState, useCallback, useEffect } from 'react';
import { crearCoach, actualizarCoach, fetchCoachesDelClub } from '../api/coachesService';
import { fetchClubesTodos } from '../api/clubesService';
import { crearAccesoUsuario } from '../api/accesosService';

// ─── Estado y lógica del alta/edición de coaches (v35) ───
// Molde: useAdminAtletasForm. Diferencias: el acceso se crea siempre (un coach
// sin cuenta de Auth no puede entrar — el bug que v33 arregló para los atletas)
// y el club es el "club de trabajo" de la pantalla: el del owner, o el que el
// superadmin elija (él lee todos los clubes, así que sin elegir uno vería el
// equipo de la plataforma entera mezclado).
export default function useAdminEquipoForm({ user }) {
  const esSuperadmin = user?.rol === 'superadmin';
  const [clubTrabajo, setClubTrabajo] = useState(user?.club || '');
  const [clubes, setClubes] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [loading, setLoading] = useState(true);

  // Catálogo solo para el superadmin (RPC v34, gate es_superadmin server-side).
  useEffect(() => {
    if (!esSuperadmin) return;
    fetchClubesTodos()
      .then((lista) => {
        setClubes(lista);
        // Sin club propio (o con uno que ya no existe), arrancar en el primero
        // evita una pantalla vacía sin explicación.
        setClubTrabajo((actual) => (actual && lista.includes(actual) ? actual : (lista[0] || '')));
      })
      .catch(() => setClubes([]));
  }, [esSuperadmin]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  // v41: la contraseña temporal del coach/dueño recién creado o regenerado.
  // Vive SOLO aquí, en memoria y hasta que se cierre el aviso: el servidor no la
  // guarda y no hay forma de volver a consultarla. Si se pierde, se regenera.
  const [credencial, setCredencial] = useState(null); // { nombre, password }

  const emptyForm = { cedula: '', nombre: '', correo: '', telefono: '', categoria: 'Todas', rol: 'coach' };
  const [form, setForm] = useState(emptyForm);

  // Solo el dueño ORIGINAL invita co-dueños (v36): el que nadie creó desde la
  // app. El superadmin también, porque él instala a los dueños de cada club.
  // El servidor lo repite (es_owner_principal en usuarios_insert); esto solo
  // evita ofrecer una opción que iba a fallar.
  const puedeInvitarCoDuenos = esSuperadmin || (user?.rol === 'owner' && !user?.creado_por);

  const handleChange = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const load = useCallback(async () => {
    try {
      const data = await fetchCoachesDelClub(clubTrabajo);
      setCoaches(data);
    } catch (e) {
      setError(e.message);
      setCoaches([]);
    }
    setLoading(false);
  }, [clubTrabajo]);

  useEffect(() => { load(); }, [load]);

  const handleEdit = useCallback((coach) => {
    setForm({
      cedula: coach.cedula || '',
      nombre: coach.nombre || '',
      correo: coach.correo || '',
      telefono: coach.telefono || '',
      categoria: coach.categoria || 'Todas',
      // El rol no se edita (solo superadmin puede cambiarlo, trigger v34); va
      // en el form para que la ficha muestre los campos que le corresponden.
      rol: coach.rol || 'coach',
    });
    setEditingId(coach.id);
    setShowForm(true);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      if (!form.nombre?.trim()) throw new Error('El nombre es obligatorio.');
      const esCoDueno = form.rol === 'owner';

      if (editingId) {
        await actualizarCoach(editingId, form);
        setSuccess(`✅ ${form.nombre} actualizado.`);
      } else {
        if (esCoDueno && !puedeInvitarCoDuenos) {
          throw new Error('Solo el dueño original del club puede invitar co-dueños.');
        }
        // La cédula sigue siendo obligatoria aunque el esquema no la exija para
        // no-atletas: es su USUARIO (resolver_email_login traduce cédula →
        // email). Desde v41 ya NO es su contraseña — esa es aleatoria y se
        // muestra abajo una sola vez.
        if (!form.cedula?.trim()) {
          throw new Error('La cédula es obligatoria: es el usuario con el que inicia sesión.');
        }
        const nuevo = await crearCoach(form, clubTrabajo);
        const queEs = esCoDueno ? 'co-dueño del club, con tus mismos permisos' : 'coach del club';
        try {
          const { password_temporal } = await crearAccesoUsuario({ usuarioId: nuevo.id });
          setSuccess(`✅ ${form.nombre} ya es ${queEs}.`);
          if (password_temporal) setCredencial({ nombre: form.nombre, password: password_temporal });
        } catch (accesoError) {
          // La fila existe y sale en la lista, pero no puede entrar: se dice
          // explícitamente en vez de fingir que el alta fue completa.
          setSuccess(`✅ ${form.nombre} registrado. ⚠️ Quedó sin acceso (${accesoError.message}) — vuelve a intentarlo desde la lista.`);
        }
      }

      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message || 'Error al guardar.');
    }
    setSaving(false);
  };

  return {
    coaches, loading, load,
    clubTrabajo, setClubTrabajo, clubes, esSuperadmin, puedeInvitarCoDuenos,
    showForm, setShowForm,
    editingId, setEditingId,
    saving,
    error, setError,
    success, setSuccess,
    credencial, setCredencial,
    emptyForm,
    form, setForm,
    handleChange,
    handleEdit,
    handleSubmit,
  };
}
