/**
 * Quién puede cambiar la foto de identificación de un atleta.
 *
 * OJO: esto solo decide si se pinta el control en la UI. El gate real es la
 * RPC establecer_foto_atleta (v53), que revalida lo mismo en el servidor —
 * apagar un botón no protege nada por sí solo.
 *
 * Refleja la autorización de la RPC:
 *   es_superadmin()
 *   OR (es_staff() AND club_de_atleta(...) = current_user_club())
 *   OR atleta_id = ANY(mis_atletas())
 */

/**
 * @param {object} user   usuario en sesión ({ rol, club, atleta_id? })
 * @param {object} atleta atleta objetivo ({ atleta_id | id, club })
 * @param {object} [opciones]
 * @param {string[]} [opciones.hijosIds] atletas vinculados al padre. Si se pasa,
 *   se valida el vínculo; si no, se asume que la vista del padre ya monta solo
 *   a sus hijos (es el caso de VistaPadreArcade).
 */
export function puedeEditarFoto(user, atleta, opciones = {}) {
  if (!user || !atleta) return false;

  const atletaId = atleta.atleta_id ?? atleta.id ?? null;

  switch (user.rol) {
    case 'superadmin':
      return true;

    case 'owner':
    case 'coach':
      return Boolean(user.club) && user.club === atleta.club;

    case 'atleta':
      return Boolean(user.atleta_id) && Boolean(atletaId) && user.atleta_id === atletaId;

    case 'padre':
      if (Array.isArray(opciones.hijosIds)) {
        return Boolean(atletaId) && opciones.hijosIds.includes(atletaId);
      }
      return true;

    default:
      return false;
  }
}
