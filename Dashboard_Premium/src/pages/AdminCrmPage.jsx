import { useCallback, useEffect, useRef, useState } from 'react';
import AdminShell from '../components/AdminShell';
import AdminCrm from '../components/crm/AdminCrm';
import {
  actualizarEtapaCrm,
  actualizarPreferenciasCrm,
  cargarDetalleContactoCrm,
  cargarResumenCrm,
  configurarContactoInternoCrm,
  marcarNoContactarCrm,
  programarActividadCrm,
  registrarNotaCrm,
} from '../api/crmService';

export default function AdminCrmPage() {
  const [resumen, setResumen] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [seleccionadoId, setSeleccionadoId] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const detalleRequestId = useRef(0);
  const seleccionadoIdRef = useRef(null);

  const cargarResumen = useCallback(async ({ offset = 0, append = false } = {}) => {
    if (append) setCargandoMas(true);
    else setCargando(true);
    try {
      const siguienteResumen = await cargarResumenCrm(offset);
      setResumen((actual) => {
        if (!append || !actual) return siguienteResumen;
        const existingIds = new Set((actual.contactos ?? []).map((contact) => contact.id));
        return {
          ...siguienteResumen,
          contactos: [
            ...(actual.contactos ?? []),
            ...(siguienteResumen.contactos ?? []).filter((contact) => !existingIds.has(contact.id)),
          ],
        };
      });
      setError('');
    } catch (caught) {
      setError(caught.message);
    } finally {
      if (append) setCargandoMas(false);
      else setCargando(false);
    }
  }, []);

  const cargarMas = useCallback(async () => {
    if (!resumen?.tiene_mas || cargandoMas) return;
    const offset = Number(resumen.offset ?? 0) + Number(resumen.limite ?? 50);
    await cargarResumen({ offset, append: true });
  }, [cargandoMas, cargarResumen, resumen]);

  const seleccionarContacto = useCallback(async (contactId) => {
    const requestId = detalleRequestId.current + 1;
    detalleRequestId.current = requestId;
    seleccionadoIdRef.current = contactId;
    setSeleccionadoId(contactId);
    setDetalle(null);
    setCargandoDetalle(true);
    try {
      const siguienteDetalle = await cargarDetalleContactoCrm(contactId);
      if (detalleRequestId.current !== requestId) return;
      setDetalle(siguienteDetalle);
      setError('');
    } catch (caught) {
      if (detalleRequestId.current !== requestId) return;
      setDetalle(null);
      setError(caught.message);
    } finally {
      if (detalleRequestId.current === requestId) setCargandoDetalle(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void cargarResumen(); }, 0);
    return () => window.clearTimeout(timer);
  }, [cargarResumen]);

  useEffect(() => () => {
    detalleRequestId.current += 1;
  }, []);

  const ejecutarAccion = useCallback(async (accion, payload) => {
    const servicios = {
      actualizar_etapa: actualizarEtapaCrm,
      actualizar_preferencias: actualizarPreferenciasCrm,
      programar_actividad: programarActividadCrm,
      registrar_nota: registrarNotaCrm,
      marcar_no_contactar: marcarNoContactarCrm,
      configurar_contacto_interno: configurarContactoInternoCrm,
    };
    const service = servicios[accion];
    if (!service) return;

    const contactId = payload?.contact_id;
    if (!contactId || contactId !== seleccionadoIdRef.current || detalle?.contact?.id !== contactId) {
      const inconsistencia = new Error('Espera a que cargue el contacto seleccionado antes de guardar cambios.');
      setError(inconsistencia.message);
      throw inconsistencia;
    }

    setGuardando(true);
    try {
      await service(payload);
      await cargarResumen();
      if (seleccionadoIdRef.current === contactId) await seleccionarContacto(contactId);
      setError('');
      return true;
    } catch (caught) {
      setError(caught.message);
      throw caught;
    } finally {
      setGuardando(false);
    }
  }, [cargarResumen, detalle, seleccionarContacto]);

  return (
    <AdminShell padding="">
      <AdminCrm
        resumen={resumen}
        detalle={detalle}
        seleccionadoId={seleccionadoId}
        cargando={cargando}
        cargandoDetalle={cargandoDetalle}
        cargandoMas={cargandoMas}
        guardando={guardando}
        error={error}
        onReintentar={cargarResumen}
        onCargarMas={cargarMas}
        onSeleccionar={seleccionarContacto}
        onAccion={ejecutarAccion}
      />
    </AdminShell>
  );
}
