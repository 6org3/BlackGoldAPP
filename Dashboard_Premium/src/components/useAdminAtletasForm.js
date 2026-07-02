import { useState } from 'react';
import { supabase } from '../api/supabaseClient';
import { calcularEdad } from '../api/utilsAtletas';

// ─── Hook de estado y lógica del formulario de alta/edición ───
export default function useAdminAtletasForm({ onRefresh, user }) {
  // ─── Form State ───────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // ─── Parent sub-form ──────────────────────────────────────
  const [showParentForm, setShowParentForm] = useState(false);

  const emptyForm = {
    cedula: '', nombre: '', correo: '', fecha_nacimiento: '', posicion: 'N/A',
    categoria: '', nivel_desarrollo: '', genero: 'Masculino', club: '',
    // Parent fields (optional)
    padre_nombre: '', padre_telefono: '', padre_correo: ''
  };
  const [form, setForm] = useState(emptyForm);

  // ─── Handlers ─────────────────────────────────────────────
  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleEdit = async (atleta) => {
    const { data: dataUsuario } = await supabase
      .from('usuarios')
      .select('correo, fecha_nacimiento, genero, club')
      .eq('cedula', atleta.cedula)
      .single();
    const generoValue = dataUsuario?.genero || 'Masculino';

    setForm({
      cedula: atleta.cedula || '',
      nombre: atleta.nombre || '',
      correo: dataUsuario?.correo || '',
      fecha_nacimiento: dataUsuario?.fecha_nacimiento?.split('T')[0] || '',
      posicion: atleta.posicion || 'N/A',
      categoria: atleta.categoria || '',
      nivel_desarrollo: atleta.nivel_desarrollo || '',
      genero: generoValue,
      club: dataUsuario?.club || '',
      padre_nombre: '', padre_telefono: '', padre_correo: ''
    });
    setEditingId(atleta.atleta_id);
    setShowForm(true);
    setShowParentForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    const safeCorreo = form.correo?.trim() || null;
    const safeFecha = form.fecha_nacimiento?.trim() || null;
    const safeNivel = form.nivel_desarrollo || null;

    try {
      if (editingId) {
        // EDITAR existente
        const updateData = { nombre: form.nombre, categoria: form.categoria, correo: safeCorreo, fecha_nacimiento: safeFecha, genero: form.genero };
        if (user?.rol === 'superadmin' && form.club) {
          updateData.club = form.club;
        }
        const { error: userErr } = await supabase
          .from('usuarios')
          .update(updateData)
          .eq('cedula', form.cedula);
        if (userErr) throw userErr;

        let xp_to_update = undefined;
        if (safeNivel === 'Desarrollo' || safeNivel === 'Elite') {
          const targetXP = safeNivel === 'Desarrollo' ? 1000 : 5000;
          const { data: curAtleta } = await supabase
            .from('atletas')
            .select('xp_total')
            .eq('id', editingId)
            .single();
          if (curAtleta && (curAtleta.xp_total || 0) < targetXP) {
            xp_to_update = targetXP;
          }
        }

        const atlUpdates = {
          edad: safeFecha ? calcularEdad(safeFecha) : 0,
          posicion: form.posicion,
          nivel_desarrollo: safeNivel
        };
        if (xp_to_update !== undefined) {
          atlUpdates.xp_total = xp_to_update;
        }

        const { error: atlErr } = await supabase
          .from('atletas')
          .update(atlUpdates)
          .eq('id', editingId);
        if (atlErr) throw atlErr;
        setSuccess(`✅ ${form.nombre} actualizado correctamente.`);
      } else {
        // CREAR nuevo
        const resolvedClub = user?.rol === 'superadmin' ? (form.club || 'Black Gold') : (user?.club || 'Black Gold');

        const { data: newUser, error: userErr } = await supabase
          .from('usuarios')
          .insert({
            cedula: form.cedula,
            nombre: form.nombre,
            rol: 'atleta',
            club: resolvedClub,
            categoria: form.categoria || null,
            correo: safeCorreo,
            fecha_nacimiento: safeFecha,
            genero: form.genero
          })
          .select()
          .single();
        if (userErr) throw userErr;

        let initialXP = 0;
        if (safeNivel === 'Desarrollo') initialXP = 1000;
        else if (safeNivel === 'Elite') initialXP = 5000;

        const { error: atlErr } = await supabase
          .from('atletas')
          .insert({
            usuario_id: newUser.id,
            edad: safeFecha ? calcularEdad(safeFecha) : 0,
            posicion: form.posicion,
            nivel_desarrollo: safeNivel,
            xp_total: initialXP
          });
        if (atlErr) throw atlErr;

        // Vincular padre si se proporcionó
        if (showParentForm && form.padre_telefono?.trim()) {
          try {
            const padreCedula = `PADRE_${form.padre_telefono.trim()}`;
            let padreId = null;

            const { data: padreExistente } = await supabase
              .from('usuarios')
              .select('id')
              .eq('cedula', padreCedula)
              .single();

            if (padreExistente) {
              padreId = padreExistente.id;
            } else {
              const { data: newPadre, error: padreErr } = await supabase
                .from('usuarios')
                .insert({
                  cedula: padreCedula,
                  nombre: form.padre_nombre || `Padre de ${form.nombre}`,
                  correo: form.padre_correo || null,
                  telefono: form.padre_telefono.trim(),
                  rol: 'padre',
                  club: resolvedClub
                })
                .select()
                .single();
              if (padreErr) throw padreErr;
              padreId = newPadre.id;
            }

            // Obtener atleta_id del nuevo atleta
            const { data: nuevoAtleta } = await supabase
              .from('atletas')
              .select('id')
              .eq('usuario_id', newUser.id)
              .single();

            if (padreId && nuevoAtleta) {
              await supabase
                .from('padres_atletas')
                .insert({ padre_id: padreId, atleta_id: nuevoAtleta.id });
            }
          } catch (padreError) {
            console.warn('Error vinculando padre (no crítico):', padreError);
          }
        }

        setSuccess(`✅ ${form.nombre} registrado exitosamente.`);
      }

      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      setShowParentForm(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.message || 'Error al guardar.');
    }
    setSaving(false);
  };

  // Determinar si el atleta es menor según la fecha de nacimiento del form
  const esMenor = form.fecha_nacimiento ? calcularEdad(form.fecha_nacimiento) < 18 : false;

  return {
    showForm, setShowForm,
    editingId, setEditingId,
    saving,
    error, setError,
    success, setSuccess,
    showParentForm, setShowParentForm,
    emptyForm,
    form, setForm,
    handleChange,
    handleEdit,
    handleSubmit,
    esMenor,
  };
}
