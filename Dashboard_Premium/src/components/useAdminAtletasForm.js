import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../api/supabaseClient';
import { calcularEdad } from '../api/utilsAtletas';
import { crearAccesoUsuario, actualizarCorreoDeUsuario } from '../api/accesosService';
import { fetchClubesTodos } from '../api/clubesService';

// ─── Hook de estado y lógica del formulario de alta/edición ───
export default function useAdminAtletasForm({ onRefresh, user }) {
  // ─── Form State ───────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  // Contraseñas recién emitidas en el alta. Llegan una vez del servidor y no
  // se guardan: el panel las muestra hasta que el staff las descarta.
  const [credenciales, setCredenciales] = useState(null);

  // Catálogo de clubes para el select del superadmin (v34): el resto del staff
  // no elige club — el atleta hereda el suyo y el campo ni se renderiza.
  const [clubes, setClubes] = useState([]);
  const [clubesError, setClubesError] = useState('');
  const [clubesIntento, setClubesIntento] = useState(0);
  const esSuperadmin = user?.rol === 'superadmin';
  // El fallo se muestra y se puede reintentar: si se tragara, el select se
  // quedaría en "Cargando clubes…" para siempre y el superadmin no podría dar
  // de alta a nadie (sin club elegible no hay alta posible).
  const recargarClubes = useCallback(() => setClubesIntento((n) => n + 1), []);
  useEffect(() => {
    if (!esSuperadmin) return;
    fetchClubesTodos()
      .then((lista) => { setClubes(lista); setClubesError(''); })
      .catch((e) => { setClubes([]); setClubesError(e.message || 'No se pudo cargar la lista de clubes.'); });
  }, [esSuperadmin, clubesIntento]);

  // ─── Parent sub-form ──────────────────────────────────────
  const [showParentForm, setShowParentForm] = useState(false);

  const emptyForm = {
    usuario_id: null, tiene_acceso: false, correo_original: '',
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

  // Referencia estable: las cards memoizadas la reciben como prop directa.
  const handleEdit = useCallback(async (atleta) => {
    const { data: dataUsuario } = await supabase
      .from('usuarios')
      .select('id, correo, fecha_nacimiento, genero, club, auth_user_id')
      .eq('cedula', atleta.cedula)
      .single();
    const generoValue = dataUsuario?.genero || 'Masculino';

    setForm({
      // El id y el correo de partida hacen falta para detectar si el correo
      // cambió: cambiarlo no es un UPDATE más, va por Edge Function.
      usuario_id: dataUsuario?.id || atleta.id || null,
      tiene_acceso: !!dataUsuario?.auth_user_id,
      correo_original: dataUsuario?.correo || '',
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
    setCredenciales(null);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    // El banner NO puede sobrevivir al alta que lo generó: si la siguiente no
    // emite contraseñas (la cédula ya existe, la Edge Function falla), quedaría
    // la clave de la familia anterior en pantalla junto al error de esta otra,
    // y el staff se la dictaría a quien no es.
    setCredenciales(null);

    const safeCorreo = form.correo?.trim() || null;
    const safeFecha = form.fecha_nacimiento?.trim() || null;
    const safeNivel = form.nivel_desarrollo || null;

    try {
      if (editingId) {
        // EDITAR existente.
        // El correo va aparte y PRIMERO. Escribirlo en `usuarios` a secas dejaba
        // a esa persona sin poder entrar: el login resuelve el correo desde la
        // tabla (`resolver_email_login`) pero Auth guarda el suyo, y al
        // separarse su contraseña correcta empezaba a dar "credenciales
        // inválidas". La Edge Function mueve las dos a la vez.
        const correoCambio = safeCorreo !== (form.correo_original?.trim() || null);
        if (correoCambio && form.tiene_acceso && form.usuario_id) {
          await actualizarCorreoDeUsuario(form.usuario_id, safeCorreo);
        }
        const updateData = { nombre: form.nombre, categoria: form.categoria, fecha_nacimiento: safeFecha, genero: form.genero };
        // Sin cuenta de Auth todavía no hay nada que sincronizar: el correo se
        // escribe normal y entrará en Auth cuando se le cree el acceso.
        if (!form.tiene_acceso) updateData.correo = safeCorreo;
        // Cambiar de club es cross-club: solo el superadmin (el trigger
        // proteger_columnas_usuarios lo vuelve a exigir server-side, v34).
        if (esSuperadmin && form.club) {
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
        // CREAR nuevo. El club se elige de la lista real (superadmin) o se
        // hereda del staff que registra; sin fallback silencioso a 'Black Gold'
        // — el mismo pecado que v33 quitó del registro público (mandaba atletas
        // a un club que nadie había elegido).
        const resolvedClub = esSuperadmin ? (form.club?.trim() || '') : (user?.club || '');
        if (!resolvedClub) {
          throw new Error(esSuperadmin
            ? 'Selecciona el club del atleta.'
            : 'Tu usuario no tiene un club asignado. Contacta al superadmin.');
        }

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
        let padreId = null;
        let padreEsNuevo = false;
        if (showParentForm && form.padre_telefono?.trim()) {
          try {
            const padreCedula = `PADRE_${form.padre_telefono.trim()}`;

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
              padreEsNuevo = true;
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
            padreId = null; // sin vínculo no hay acceso del representante que crear
          }
        }

        // Credenciales de acceso (v33, Edge Function crear-acceso-usuario):
        // sin esto el atleta creado por el panel no podía iniciar sesión.
        // Best-effort: si falla, el alta queda hecha y se avisa en el mensaje.
        const avisos = [];
        // La contraseña inicial ya no es la cédula: la genera el servidor y
        // llega UNA sola vez en esta respuesta. Si no se la mostramos al staff
        // aquí, la familia se queda sin poder entrar y hay que regenerar.
        const emitidas = [];
        try {
          const { password_temporal } = await crearAccesoUsuario({ usuarioId: newUser.id });
          if (password_temporal) emitidas.push({ nombre: form.nombre, rol: 'Deportista', usuario: form.cedula, password: password_temporal });
        } catch (accesoError) {
          avisos.push(`el atleta quedó sin acceso (${accesoError.message})`);
        }
        if (padreId && padreEsNuevo) {
          try {
            const { password_temporal } = await crearAccesoUsuario({ usuarioId: padreId, hijoUsuarioId: newUser.id });
            if (password_temporal) emitidas.push({ nombre: form.padre_nombre || 'Representante', rol: 'Representante', usuario: form.padre_telefono || null, password: password_temporal });
          } catch (accesoError) {
            avisos.push(`el representante quedó sin acceso (${accesoError.message})`);
          }
        }
        if (emitidas.length) setCredenciales(emitidas);

        setSuccess(avisos.length
          ? `✅ ${form.nombre} registrado. ⚠️ ${avisos.join(' · ')}`
          : `✅ ${form.nombre} registrado. Anota las contraseñas: no se vuelven a mostrar.`);
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
    credenciales, setCredenciales,
    showParentForm, setShowParentForm,
    emptyForm,
    form, setForm,
    handleChange,
    handleEdit,
    handleSubmit,
    esMenor,
    clubes,
    clubesError,
    recargarClubes,
  };
}
