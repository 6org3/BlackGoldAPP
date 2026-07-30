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
    usuario_id: null, correo_original: '',
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
      .select('id, correo, fecha_nacimiento, genero, club')
      .eq('cedula', atleta.cedula)
      .single();
    const generoValue = dataUsuario?.genero || 'Masculino';

    setForm({
      // El id y el correo de partida hacen falta para detectar si el correo
      // cambió: cambiarlo no es un UPDATE más, va por Edge Function.
      usuario_id: dataUsuario?.id || atleta.id || null,
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
        if (correoCambio && form.usuario_id) {
          await actualizarCorreoDeUsuario(form.usuario_id, safeCorreo);
        }
        const updateData = { nombre: form.nombre, categoria: form.categoria, fecha_nacimiento: safeFecha, genero: form.genero };
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

        // El correo de la familia no se duplica en la fila del deportista. Si es
        // el mismo que el del representante, ahí no sirve para nada —el login del
        // menor va por su cédula y el club contacta al representante— y en cambio
        // ocupa un valor UNIQUE: el representante no podría quedárselo, y el
        // hermano siguiente chocaría contra él. Un correo DISTINTO sí se respeta:
        // el staff puede estar dando de alta a un atleta que es su propio titular.
        const correoDelRepresentante = showParentForm ? (form.padre_correo?.trim().toLowerCase() || null) : null;
        // Siempre en minúsculas, igual que el registro público (v57): el UNIQUE de
        // la tabla distingue mayúsculas pero GoTrue normaliza el email de la
        // cuenta, así que `Juan@X.com` metido por el panel y `juan@x.com` metido
        // por el formulario serían dos filas legales apuntando al MISMO usuario de
        // Auth — y desde v59 el login compara en minúsculas, así que dejarlo sin
        // normalizar aquí es la única forma de reintroducir el desajuste.
        const correoNormalizado = safeCorreo?.toLowerCase() || null;
        const correoDelAtleta = (correoNormalizado === correoDelRepresentante)
          ? null
          : correoNormalizado;

        const { data: newUser, error: userErr } = await supabase
          .from('usuarios')
          .insert({
            cedula: form.cedula,
            nombre: form.nombre,
            rol: 'atleta',
            club: resolvedClub,
            categoria: form.categoria || null,
            correo: correoDelAtleta,
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

        const avisos = [];

        // Vincular padre si se proporcionó
        let padreId = null;
        let padreEsNuevo = false;
        if (showParentForm && form.padre_telefono?.trim()) {
          try {
            const padreTelefono = form.padre_telefono.trim();
            const padreCedula = `PADRE_${padreTelefono}`;
            // En minúsculas, como lo guarda registrar_publico (v57): el UNIQUE de
            // la tabla distingue mayúsculas pero GoTrue normaliza el email de la
            // cuenta, así que dos variantes serían dos filas legales apuntando al
            // mismo usuario de Auth.
            const padreCorreo = form.padre_correo?.trim().toLowerCase() || null;

            // Mismo criterio que registrar_publico (v57): el representante se
            // reconoce por teléfono O por correo, y solo dentro de su club. Antes
            // se buscaba únicamente por `PADRE_<telefono>`, así que al dar de
            // alta al segundo hermano con el número del otro progenitor el panel
            // intentaba crear un representante nuevo con un correo que ya era del
            // primero → UNIQUE, y el catch de abajo lo convertía en un atleta sin
            // representante y un "✅ registrado" en pantalla.
            // Dos consultas en vez de un `.or()` con el correo interpolado: ese
            // valor lo teclea el staff y una coma o un paréntesis dentro
            // reescribiría el filtro de PostgREST.
            // Un fallo de lectura NO se confunde con "no existe": si se tragara,
            // el siguiente paso intentaría crear un representante que ya está y
            // el alta acabaría avisando de un duplicado inventado en vez de
            // reintentarse.
            // `rechazado` se excluye igual que en la RPC (v59): esa cuenta ya no
            // puede iniciar sesión —`resolver_email_login` la descarta— así que
            // reutilizarla vincularía al atleta nuevo a un representante muerto.
            // A diferencia de la RPC, aquí NO se exige `activo`: quien usa esta
            // pantalla es staff autenticado del club, que ya ve a esa familia, y
            // exigirlo le impediría dar de alta a un hermano cuyo representante
            // llegó por el registro público y está esperando aprobación.
            const buscar = async (columna, valor) => {
              const { data, error } = await supabase
                .from('usuarios')
                .select('id, telefono')
                .eq('rol', 'padre')
                .eq('club', resolvedClub)
                .neq('estado', 'rechazado')
                .eq(columna, valor)
                .maybeSingle();
              if (error) throw error;
              return data;
            };

            let padreExistente = await buscar('cedula', padreCedula);
            if (!padreExistente && padreCorreo) {
              padreExistente = await buscar('correo', padreCorreo);
              // Se le reconoció por el correo: su cuenta sigue existiendo con el
              // teléfono de la primera vez, que es su usuario de login. Decírselo
              // al staff evita que dicte a la familia un número con el que nadie
              // puede entrar.
              if (padreExistente && padreExistente.telefono !== padreTelefono) {
                avisos.push(`el representante ya tenía cuenta y entra con ${padreExistente.telefono}, no con ${padreTelefono}`);
              }
            }

            if (padreExistente) {
              padreId = padreExistente.id;
            } else {
              const { data: newPadre, error: padreErr } = await supabase
                .from('usuarios')
                .insert({
                  cedula: padreCedula,
                  nombre: form.padre_nombre || `Padre de ${form.nombre}`,
                  correo: padreCorreo,
                  telefono: padreTelefono,
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
              const { error: vinculoErr } = await supabase
                .from('padres_atletas')
                .insert({ padre_id: padreId, atleta_id: nuevoAtleta.id });
              if (vinculoErr) throw vinculoErr;
            }
          } catch (padreError) {
            console.warn('Error vinculando padre:', padreError);
            padreId = null; // sin vínculo no hay acceso del representante que crear
            // Y se dice. Este catch solo escribía en la consola, así que el atleta
            // quedaba sin representante mientras la pantalla mostraba
            // "✅ registrado" a secas: el staff se enteraba semanas después, al
            // no poder cobrarle a nadie ni avisar a la familia.
            //
            // El motivo se traduce en vez de reenviar el de Postgres: el crudo dice
            // `duplicate key value violates unique constraint "usuarios_correo_key"`,
            // que no le sirve a nadie, y devolver mensajes internos al cliente es
            // justo lo que se cerró en el PR #146.
            const crudo = padreError.message || '';
            const motivo = /usuarios_correo_key/.test(crudo)
              ? 'ese correo ya es de otra cuenta'
              : /usuarios_telefono_key|usuarios_cedula_key/.test(crudo)
                ? 'ese teléfono ya es de otra cuenta'
                : 'error al guardarlo';
            // El remedio tiene que ser uno que exista: /admin/equipo solo da de
            // alta coaches y dueños, no representantes. Hoy la única vía de crear
            // uno es el sub-formulario de esta misma pantalla, y solo durante el
            // alta — a un atleta ya creado no se le puede añadir representante
            // desde ninguna parte (anotado como deuda en CLAUDE.md).
            avisos.push(`el representante no se pudo vincular (${motivo}): corrige sus datos y vuelve a dar de alta al deportista`);
          }
        }

        // Credenciales de acceso (v33, Edge Function crear-acceso-usuario):
        // sin esto el atleta creado por el panel no podía iniciar sesión.
        // Best-effort: si falla, el alta queda hecha y se avisa en el mensaje.
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
