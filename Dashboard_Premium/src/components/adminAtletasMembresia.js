// Membresía deportiva en el roster (atletas.estado_membresia, v31) — helpers
// puros compartidos por la card grid y la fila lista, para que ambas vistas
// cuenten lo mismo.

// Estado ausente = activo: la columna es NOT NULL DEFAULT 'activo', y así la
// card sigue siendo correcta si un select no trajera la columna. Mismo criterio
// que `esActivo` en arcade/duenoData.js.
export const esBaja = (atleta) => (atleta?.estado_membresia ?? 'activo') !== 'activo';

// Texto del badge. Incluye la fecha solo si existe (una baja anterior a v31
// puede no tenerla).
export const etiquetaBaja = (atleta) => {
  if (!esBaja(atleta)) return '';
  const estado = atleta.estado_membresia === 'inactivo' ? 'Inactivo' : 'De baja';
  if (!atleta.fecha_baja) return estado;
  // fecha_baja es un `date` (YYYY-MM-DD): se formatea desde las partes para no
  // pasar por UTC, que en Ecuador (-5) restaría un día.
  const [a, m, d] = String(atleta.fecha_baja).split('-');
  return `${estado} · ${d}/${m}/${a}`;
};

// Texto de la acción disponible según el estado actual.
export const accionMembresia = (atleta) => (esBaja(atleta) ? 'Reactivar' : 'Dar de baja');
