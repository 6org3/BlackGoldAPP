import { useState, useCallback, useEffect } from 'react';
import { crearCoach, actualizarCoach, fetchCoachesDelClub } from '../api/coachesService';
import { crearAccesoUsuario } from '../api/accesosService';

// ─── Estado y lógica del alta/edición de coaches (v35) ───
// Molde: useAdminAtletasForm. Diferencias: el club nunca se elige (lo pone el
// del owner, y es inmutable después por el trigger v34) y el acceso se crea
// siempre — un coach sin cuenta de Auth no puede entrar, que fue el bug que
// v33 arregló para los atletas.
export default function useAdminEquipoForm({ user }) {
  const [coaches, setCoaches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const emptyForm = { cedula: '', nombre: '', correo: '', telefono: '', categoria: 'Todas' };
  const [form, setForm] = useState(emptyForm);

  const handleChange = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const load = useCallback(async () => {
    try {
      const data = await fetchCoachesDelClub();
      setCoaches(data);
    } catch (e) {
      setError(e.message);
      setCoaches([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleEdit = useCallback((coach) => {
    setForm({
      cedula: coach.cedula || '',
      nombre: coach.nombre || '',
      correo: coach.correo || '',
      telefono: coach.telefono || '',
      categoria: coach.categoria || 'Todas',
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
      if (!form.nombre?.trim()) throw new Error('El nombre del coach es obligatorio.');

      if (editingId) {
        await actualizarCoach(editingId, form);
        setSuccess(`✅ ${form.nombre} actualizado.`);
      } else {
        // La cédula es opcional en el esquema para no-atletas, pero
        // resolver_email_login la necesita para traducir el login a un email:
        // sin cédula ni correo, el coach no podría iniciar sesión nunca.
        if (!form.cedula?.trim() && !form.correo?.trim()) {
          throw new Error('Indica al menos la cédula o el correo: son sus credenciales de acceso.');
        }
        const nuevo = await crearCoach(form, user);
        try {
          await crearAccesoUsuario({ usuarioId: nuevo.id });
          setSuccess(form.cedula?.trim()
            ? `✅ ${form.nombre} ya es coach del club. Puede entrar con su cédula (contraseña inicial: su cédula).`
            : `✅ ${form.nombre} ya es coach del club. Puede entrar con su correo.`);
        } catch (accesoError) {
          // El coach existe y sale en el panel del dueño, pero no puede entrar:
          // se dice explícitamente en vez de fingir que el alta fue completa.
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
    showForm, setShowForm,
    editingId, setEditingId,
    saving,
    error, setError,
    success, setSuccess,
    emptyForm,
    form, setForm,
    handleChange,
    handleEdit,
    handleSubmit,
  };
}
