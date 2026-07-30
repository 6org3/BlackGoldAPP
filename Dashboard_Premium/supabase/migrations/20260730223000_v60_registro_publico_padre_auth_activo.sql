-- ============================================================================
-- MIGRACIÓN v60 — DISTINGUIR REPRESENTANTE CON AUTH VIVO DE REPRESENTANTE HUÉRFANO
-- Fecha: 2026-07-30 · cierra el hallazgo fn-03 (compensación limpia del registro
-- público) de la revisión adversarial del lote 3
--
-- ORIGEN DEL HALLAZGO: la compensación de `registro-publico/index.ts` (§4, tras
-- un fallo de `admin.createUser` para el ATLETA) revierte también al padre
-- recién creado, pero SOLO si `!reg.padre_existente` (nació en esta misma
-- llamada). Si ese segundo DELETE fallara (error transitorio de PostgREST), la
-- función solo hace `console.error('representante sin revertir')` y sigue con
-- un 500 genérico: no queda ninguna marca persistente. El padre queda con fila
-- en `usuarios` (estado='pendiente') pero SIN `auth_user_id` — huérfano.
--
-- Ese huérfano es el que esta migración ataca, no el DELETE en sí (la Edge
-- Function le agrega su propio reintento acotado por separado). El problema es
-- lo que pasa DESPUÉS: en un reintento posterior con el MISMO teléfono,
-- `registrar_publico()` busca al padre por `cedula = 'PADRE_<telefono>'` SIN
-- filtrar por estado (es lo que permite inscribir a dos hermanos el mismo día,
-- ver v59) — así que encuentra la fila huérfana, fija `v_padre_existente :=
-- true` y la Edge Function decide `padreEstado := 'ya_existia'` sin intentar
-- crear la cuenta de Auth que le falta. El representante queda para siempre
-- sin poder entrar, y cada reintento repite el mismo diagnóstico equivocado:
-- "ya existe" cuando en realidad "existe la fila, pero no la cuenta".
--
-- v57/v59 (búsqueda por correo activo, `rechazado` no se reutiliza) resolvieron
-- un problema real y distinto (squat de un correo ajeno sin verificar) pero no
-- tocaron esta ambigüedad: ninguna de las dos versiones comprueba
-- `auth_user_id IS NOT NULL` antes de fijar `v_padre_existente`.
--
-- ARREGLO (mínimo, sin tocar la lógica de búsqueda de v59): la función ahora
-- también devuelve si la fila encontrada tiene o no una cuenta de Auth vinculada
-- (`padre_auth_activo`). La Edge Function (mismo PR) usa ese dato para decidir:
-- solo trata al representante como "ya existía" cuando además tiene Auth vivo;
-- si la fila existe pero está huérfana, cae a la rama que crea la cuenta de
-- Auth que falta — que es la reparación real: un reintento ya no se traba en
-- "ya existía" para siempre, sino que completa lo que quedó a medias.
--
-- SECURITY DEFINER: leer `auth_user_id` desde dentro de la función no tiene
-- problema de RLS (ya lo hacía indirectamente el trigger trg_vincular_auth_usuario
-- de v24 sobre la misma columna).
--
-- LO QUE ESTA MIGRACIÓN *NO* CIERRA: el squat por TELÉFONO que v59 ya deja
-- anotado como abierto (la cédula sintética `PADRE_<telefono>` se reutiliza sin
-- filtrar por estado, a propósito, para permitir dos hermanos el mismo día
-- antes de que el club apruebe al primero). Esta migración no cambia ESA
-- búsqueda ni sus condiciones — sigue idéntica a v59 —, solo agrega el dato de
-- si la fila que encontró tiene Auth o no. Tampoco toca `resolver_email_login`
-- (eso fue v59 §A, ya aplicado) ni ninguna otra parte de v59.
--
-- ORDEN DE DESPLIEGUE, mismo criterio que v54/v57/v59: la migración primero,
-- `registro-publico` después, y seguidas. Desplegar la función antes de aplicar
-- esta migración deja `reg.padre_auth_activo` en `undefined` (columna nueva del
-- jsonb que la función vieja no devuelve) — la Edge Function lo trataría como
-- "falsy" y CADA reintento con un padre ya existente y con Auth vivo (el caso
-- común: segundo hermano) intentaría crear de nuevo su cuenta de Auth, que
-- fallaría con "already registered" y el registro completo del segundo hijo se
-- reportaría como error en vez de éxito. No es destructivo, pero rompe el caso
-- feliz más frecuente durante la ventana entre migración y función si se
-- despliega en el orden contrario.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.registrar_publico(p_atleta jsonb, p_padre jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_atleta_id uuid;
  v_atleta_id uuid;
  v_padre_id uuid;
  v_padre_existente boolean := false;
  v_padre_auth_activo boolean := false;
  v_padre_cedula text;
  v_fecha_nac date;
  v_club text;
  v_constraint text;
  v_con_representante boolean;
  v_es_menor boolean;
  v_atleta_correo text;
  v_atleta_telefono text;
  v_padre_correo text;
  v_padre_telefono text;
BEGIN
  IF COALESCE(p_atleta->>'cedula', '') = '' OR COALESCE(p_atleta->>'nombre', '') = ''
     OR COALESCE(p_atleta->>'fecha_nacimiento', '') = '' THEN
    RAISE EXCEPTION 'Cédula, nombre y fecha de nacimiento del atleta son obligatorios.';
  END IF;

  v_fecha_nac := (p_atleta->>'fecha_nacimiento')::date;

  v_club := NULLIF(btrim(p_atleta->>'club'), '');
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'Selecciona el club al que deseas inscribirte.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM usuarios
    WHERE rol = 'owner' AND estado = 'activo' AND club = v_club
  ) THEN
    RAISE EXCEPTION 'El club "%" no existe o no acepta inscripciones en línea.', v_club;
  END IF;

  -- El correo se guarda SIEMPRE en minúsculas: el UNIQUE de la tabla distingue
  -- mayúsculas pero GoTrue normaliza el email de la cuenta, así que dos variantes
  -- serían dos filas legales apuntando al MISMO usuario de Auth.
  v_con_representante := p_padre IS NOT NULL AND COALESCE(p_padre->>'telefono', '') <> '';
  v_es_menor := date_part('year', age(v_fecha_nac)) < 18;
  v_atleta_correo   := lower(NULLIF(btrim(p_atleta->>'correo'), ''));
  v_atleta_telefono := NULLIF(btrim(p_atleta->>'telefono'), '');

  -- El contacto de la familia vive en la fila del representante y solo ahí, para
  -- que el hermano siguiente quepa. Pero solo cuando el deportista es MENOR: si
  -- es mayor de edad él es el titular y su correo es su única vía de recuperación,
  -- venga o no representante en el payload.
  IF v_con_representante AND v_es_menor THEN
    v_atleta_correo := NULL;
    v_atleta_telefono := NULL;
  END IF;

  BEGIN
    INSERT INTO usuarios (cedula, nombre, correo, telefono, fecha_nacimiento, rol, club, categoria, genero, estado)
    VALUES (
      p_atleta->>'cedula',
      p_atleta->>'nombre',
      v_atleta_correo,
      v_atleta_telefono,
      v_fecha_nac,
      'atleta',
      v_club,
      calcular_categoria_feb(v_fecha_nac),
      COALESCE(NULLIF(p_atleta->>'genero', ''), 'Masculino'),
      'pendiente'
    )
    RETURNING id INTO v_usuario_atleta_id;
  EXCEPTION WHEN unique_violation THEN
    -- Cuál de los tres datos chocó, en vez de culpar siempre a la cédula (v57).
    -- El texto ya no habla de "escríbelo en los datos del representante", que era
    -- un consejo imposible: con representante, el correo y el teléfono del
    -- deportista van a NULL unas líneas antes, así que este INSERT solo puede
    -- chocar por la cédula. Estas dos ramas son alcanzables ÚNICAMENTE para el
    -- atleta sin representante —el adulto que se inscribe solo— y a él el
    -- formulario no le muestra ninguna sección de representante donde escribir
    -- nada. Su problema real es que ese correo o ese teléfono ya son de otra
    -- cuenta, y lo único que puede hacer es usar otro o hablar con el club.
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'usuarios_correo_key' THEN
      RAISE EXCEPTION 'Ese correo ya está registrado con otra cuenta. Usa otro, o contacta al club si crees que es un error.';
    ELSIF v_constraint = 'usuarios_telefono_key' THEN
      RAISE EXCEPTION 'Ese teléfono ya está registrado con otra cuenta. Usa otro, o contacta al club si crees que es un error.';
    ELSE
      RAISE EXCEPTION 'La cédula "%" ya se encuentra registrada en el sistema. Por favor, verifica los datos.',
        p_atleta->>'cedula';
    END IF;
  END;

  INSERT INTO atletas (usuario_id, edad, posicion)
  VALUES (
    v_usuario_atleta_id,
    GREATEST(0, date_part('year', age(v_fecha_nac)))::int,
    COALESCE(NULLIF(p_atleta->>'posicion', ''), 'N/A')
  )
  RETURNING id INTO v_atleta_id;

  IF v_con_representante THEN
    v_padre_telefono := btrim(p_padre->>'telefono');
    v_padre_cedula := 'PADRE_' || v_padre_telefono;
    v_padre_correo := lower(NULLIF(btrim(p_padre->>'correo'), ''));

    -- Las dos vías con las que una familia se identifica, ya acotadas al club
    -- (ver cabecera de v59). Diferencia clave entre ellas:
    --   · la CÉDULA `PADRE_<telefono>` es la clave de la fila, y reutilizarla en
    --     cualquier estado es lo que permite inscribir a dos hermanos el mismo
    --     día, antes de que el club apruebe al primero (v24);
    --   · el CORREO exige `activo`, o sea una cuenta que el dueño ya aprobó
    --     mirando quién es. Sin ese filtro, un correo ajeno sin verificar
    --     bastaba para heredar al menor de otra familia.
    -- `ORDER BY` deja que el teléfono gane si cada dato apunta a una fila
    -- distinta: es el identificador con el que el representante inicia sesión.
    -- §B (v59). `rechazado` nunca se reutiliza, por ninguna de las dos vías.
    --
    -- v60: se agrega `(auth_user_id IS NOT NULL)` a lo que se lee, SIN cambiar
    -- ninguna condición del WHERE ni del ORDER BY de v59 — sigue siendo la misma
    -- fila la que gana. Lo único nuevo es que ahora se sabe, además de que la
    -- fila existe, si tiene una cuenta de Auth vinculada. Una fila `pendiente`
    -- sin `auth_user_id` es exactamente el huérfano que deja una compensación
    -- fallida (ver cabecera): antes de v60 esto era indistinguible de un
    -- representante real que simplemente todavía no ha sido aprobado por el
    -- club (que SÍ tiene Auth, porque su cuenta se crea al registrarse, no al
    -- aprobarlo).
    SELECT id, (auth_user_id IS NOT NULL) INTO v_padre_id, v_padre_auth_activo
    FROM usuarios
    WHERE rol = 'padre'
      AND club = v_club
      AND COALESCE(estado, 'activo') <> 'rechazado'
      AND (
        cedula = v_padre_cedula
        OR (v_padre_correo IS NOT NULL AND lower(correo) = v_padre_correo AND estado = 'activo')
      )
    ORDER BY (cedula = v_padre_cedula) DESC
    LIMIT 1;

    IF v_padre_id IS NOT NULL THEN
      v_padre_existente := true;
      -- Nada de la cuenta encontrada se sobrescribe (ni el nombre, ni el
      -- teléfono con el que entra): quien conoce el correo de una familia
      -- podría cambiárselo desde un formulario público sin ser nadie.
    ELSE
      v_padre_auth_activo := false;
      BEGIN
        INSERT INTO usuarios (cedula, nombre, correo, telefono, rol, club, estado)
        VALUES (
          v_padre_cedula,
          p_padre->>'nombre',
          v_padre_correo,
          v_padre_telefono,
          'padre',
          v_club,
          'pendiente'
        )
        RETURNING id INTO v_padre_id;
      EXCEPTION WHEN unique_violation THEN
        -- Llegar aquí significa que el dato es de alguien que no es un
        -- representante reutilizable de este club: un atleta, un coach, el dueño,
        -- un representante de otro club, o uno de este que aún no está aprobado.
        -- Se dice qué dato es, sin decir de quién ni dónde está.
        GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
        IF v_constraint = 'usuarios_correo_key' THEN
          RAISE EXCEPTION 'El correo del representante ya está registrado con otra persona. Usa otro, o contacta al club si crees que es un error.';
        ELSE
          RAISE EXCEPTION 'El teléfono del representante ya está registrado con otra persona. Usa otro, o contacta al club si crees que es un error.';
        END IF;
      END;
    END IF;

    INSERT INTO padres_atletas (padre_id, atleta_id)
    VALUES (v_padre_id, v_atleta_id)
    ON CONFLICT DO NOTHING;
  END IF;

  -- `atleta_correo` es el correo que esta función GUARDÓ, y quien cree la cuenta
  -- de Auth después tiene que usar este y no el del payload (v59). `padre_telefono`
  -- ya no se devuelve (v59 §fuga de teléfono de un tercero).
  --
  -- `padre_auth_activo` (v60) se devuelve para que la Edge Function decida si el
  -- representante encontrado necesita o no que se le cree la cuenta de Auth. No
  -- se pensó para exponerse al navegador —es estado interno de la cuenta— y la
  -- función que lo consume no lo agrega al objeto de credenciales de la
  -- respuesta.
  RETURN jsonb_build_object(
    'atleta_usuario_id', v_usuario_atleta_id,
    'atleta_id', v_atleta_id,
    'atleta_correo', v_atleta_correo,
    'padre_id', v_padre_id,
    'padre_existente', v_padre_existente,
    'padre_auth_activo', v_padre_auth_activo,
    'padre_cedula', v_padre_cedula,
    'estado', 'pendiente'
  );
END;
$$;

-- v55: esta función es solo para `service_role` porque todo el control de abuso
-- del registro vive en la Edge Function y llamarla por PostgREST lo saltaba.
-- Se repite el GRANT/REVOKE aquí porque CREATE OR REPLACE no altera privilegios
-- existentes, pero lo hace explícito y a prueba de que algún día esta función
-- se recree desde cero sin ese REVOKE (mismo patrón que v57/v59).
REVOKE ALL ON FUNCTION public.registrar_publico(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_publico(jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.registrar_publico(jsonb, jsonb) IS
  'Alta pública de atleta (+ representante). SOLO service_role (v55). v60: '
  'agrega padre_auth_activo (auth_user_id IS NOT NULL de la fila encontrada) '
  'para que la Edge Function distinga un representante real de uno huérfano '
  '(fila sin cuenta de Auth, dejada por una compensación fallida anterior) y '
  'le cree la cuenta que falta en vez de asumir que ya existe. No cambia '
  'ninguna condición de búsqueda de v59 (correo activo, cédula sin filtro de '
  'estado, cross-club, rechazado excluido) ni cierra el squat por teléfono que '
  'v59 ya deja anotado como abierto.';
