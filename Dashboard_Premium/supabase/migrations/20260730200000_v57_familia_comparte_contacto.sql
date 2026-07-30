-- ============================================================================
-- MIGRACIÓN v57 — UNA FAMILIA PUEDE INSCRIBIR A DOS HERMANOS
-- Fecha: 2026-07-30 · Entrega 4 del arranque con datos reales
--
-- `usuarios.correo` y `usuarios.telefono` son UNIQUE (baseline:904 y 914), y con
-- razón: los tres identificadores con los que se puede iniciar sesión son
-- cédula, correo y teléfono — `resolver_email_login()` (v19, endurecida en v52)
-- traduce cualquiera de ellos al email con el que Auth reconoce la cuenta, y esa
-- traducción tiene que ser determinista. Además GoTrue exige que el email sea
-- único por su cuenta, así que relajar el UNIQUE de la tabla no compraría nada:
-- el choque se movería a `admin.createUser`, más tarde y peor explicado.
--
-- El problema no son las constraints: es que el registro público las trataba
-- como si fueran datos de contacto de la familia. Diagnosticado escenario por
-- escenario contra la base real (scripts/tmp_diagnostico_familia.mjs):
--
--   A. La mamá inscribe a su PRIMER hijo y escribe su correo en los dos campos
--      que el formulario le ofrece (el del deportista y el del representante).
--      Respuesta: «El teléfono del representante "09…" ya está registrado con
--      otro padre» — un teléfono que nunca se había registrado. La familia se
--      queda revisando un dato que está perfecto.
--   B. Segundo hermano con el correo de la familia en el campo del deportista:
--      «La cédula "…" ya se encuentra registrada» — sobre una cédula nueva. El
--      padre concluye que alguien ya inscribió a su hijo.
--   C. Igual con el teléfono de casa: mismo mensaje falso sobre la cédula.
--   E. Un hermano lo inscribe la mamá y el otro el papá, con el correo familiar
--      compartido: bloqueado, y culpando otra vez al teléfono.
--   F. La misma mamá inscribe al segundo hijo desde otro número: bloqueado.
--   G. El representante se reutilizaba CRUZANDO clubes (ver §3).
--
-- La causa de A-C-E-F es una sola: los dos manejadores de `unique_violation` de
-- v33 adivinan cuál fue el conflicto. El del atleta culpa siempre a la cédula y
-- el del representante siempre al teléfono, sin mirar qué constraint saltó de
-- verdad. Y encima el formulario invita a poner el correo de la familia en la
-- fila del deportista, que es donde no puede estar.
--
-- Esta migración hace tres cosas y ninguna toca las constraints:
--   §1 los mensajes dicen QUÉ dato colisionó, leyéndolo del diagnóstico;
--   §2 el deportista con representante deja de reclamar correo/teléfono propios
--      —no los usa para nada— y el conflicto desaparece de raíz;
--   §3 el representante se encuentra por teléfono O por correo, y solo dentro
--      de su propio club.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- §1 a §3 van en un solo CREATE OR REPLACE: es una única función.
--
-- §1. MENSAJES QUE NO MIENTEN
--     `GET STACKED DIAGNOSTICS ... CONSTRAINT_NAME` da el nombre real de la
--     constraint que saltó, así que ya no hay que adivinar. Se nombra el dato en
--     el idioma de la familia ("el correo", "el teléfono"), nunca el de la base.
--
-- §2. EL DEPORTISTA MENOR NO TIENE CORREO NI TELÉFONO PROPIOS
--     Cuando viene representante, su correo y su teléfono son los de la familia
--     y se guardan UNA vez, en la fila del representante. La fila del deportista
--     los deja en NULL a propósito:
--       · su cuenta de Auth nace con el sintético `<cédula>@sinacceso…`, así que
--         un correo propio no le sirve para entrar ni para recuperar;
--       · el club contacta a la familia por el representante, que es el titular
--         (decisión del dueño, entrega 3);
--       · y mientras ese correo ocupaba la fila del hijo, el segundo hermano no
--         cabía y el representante tampoco podía tenerlo.
--     Comprobado antes de decidirlo: de 521 atletas en la base, CERO tienen
--     correo o teléfono propio. No se descarta ningún dato que alguien esté
--     usando; se deja de aceptar uno que rompía el alta siguiente.
--     El atleta SIN representante (mayor de edad) sí los conserva: ahí él es el
--     titular y su correo es su única vía de recuperación.
--
-- §3. EL REPRESENTANTE SE ENCUENTRA POR TELÉFONO O POR CORREO
--     v33 lo buscaba solo por la cédula sintética `PADRE_<telefono>`, así que
--     dos altas de la misma familia solo se reconocían si el teléfono venía
--     tecleado idéntico. Un dígito de diferencia, o el papá inscribiendo al
--     segundo hijo desde su propio número, y el sistema intentaba crear un
--     representante nuevo con un correo que ya era de otro → UNIQUE.
--     Ahora cualquiera de los dos datos lo identifica. El teléfono manda si los
--     dos coinciden con filas distintas (es su identificador de login).
--
--     Y se cierra la reutilización CROSS-CLUB, que v33 dejaba abierta porque la
--     búsqueda no filtraba por club: un representante de otro club quedaba
--     vinculado en `padres_atletas` a un atleta de este, y como `mis_atletas()`
--     (v24) resuelve los hijos por ese vínculo SIN mirar el club, empezaba a ver
--     al menor y todo lo que cuelga de él —asistencia, evaluaciones, readiness,
--     pagos—. Al revés también rompía: su fila conserva el `club` del primero,
--     así que `usuarios_select` (v29) la esconde del staff de este club, que se
--     queda con un atleta cuyo representante no puede ni ver ni gestionar.
--     Hoy no hay ni un vínculo cross-club en la base (verificado), así que esto
--     no rompe nada existente: cierra la puerta antes de que entre alguien.
-- ────────────────────────────────────────────────────────────────────────────

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
  v_padre_cedula text;
  v_fecha_nac date;
  v_club text;
  v_constraint text;
  v_con_representante boolean;
  v_atleta_correo text;
  v_atleta_telefono text;
  v_padre_correo text;
  v_padre_telefono text;
  v_padre_club text;
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

  -- El correo se guarda SIEMPRE en minúsculas. GoTrue normaliza así el email de
  -- la cuenta, mientras el UNIQUE de la tabla distingue mayúsculas: sin esto,
  -- "Mama@x.com" y "mama@x.com" son dos filas legales que apuntan al MISMO
  -- email de Auth, y la segunda cuenta muere en createUser con un "already
  -- registered" que nadie sabría de dónde viene. (Hoy no hay ni un correo con
  -- mayúsculas en la base, así que normalizar no colisiona con nada.)
  v_con_representante := p_padre IS NOT NULL AND COALESCE(p_padre->>'telefono', '') <> '';
  v_atleta_correo   := lower(NULLIF(btrim(p_atleta->>'correo'), ''));
  v_atleta_telefono := NULLIF(btrim(p_atleta->>'telefono'), '');

  -- §2. Con representante, el contacto de la familia vive en su fila y solo ahí.
  IF v_con_representante THEN
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
    -- §1. Cuál de los tres datos chocó, en vez de culpar siempre a la cédula.
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'usuarios_correo_key' THEN
      RAISE EXCEPTION 'Ese correo ya está registrado con otra persona del club. Si es el de la familia, escríbelo solo en los datos del representante.';
    ELSIF v_constraint = 'usuarios_telefono_key' THEN
      RAISE EXCEPTION 'Ese teléfono ya está registrado con otra persona del club. Si es el de la familia, escríbelo solo en los datos del representante.';
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

    -- §3. Las dos vías con las que una familia se identifica. `ORDER BY` deja
    -- que el teléfono gane si cada dato apunta a una fila distinta: es el
    -- identificador con el que el representante inicia sesión.
    SELECT id, club INTO v_padre_id, v_padre_club
    FROM usuarios
    WHERE rol = 'padre'
      AND (
        cedula = v_padre_cedula
        OR (v_padre_correo IS NOT NULL AND lower(correo) = v_padre_correo)
      )
    ORDER BY (cedula = v_padre_cedula) DESC
    LIMIT 1;

    IF v_padre_id IS NOT NULL THEN
      -- Vincular a un representante de otro club le daría acceso a este menor
      -- (mis_atletas() no mira el club) y dejaría a este club con un
      -- representante que su staff no puede ver. No se hace ni con el mensaje
      -- más claro: la familia con hijos en dos clubes pasa por el club.
      -- El nombre del otro club NO se menciona: quien prueba correos ajenos no
      -- tiene por qué averiguar dónde están inscritos.
      IF v_padre_club IS DISTINCT FROM v_club THEN
        RAISE EXCEPTION 'Ese representante ya tiene una cuenta en otro club. Contacta al club para inscribir a este deportista.';
      END IF;
      v_padre_existente := true;
      -- Nada de la cuenta encontrada se sobrescribe (ni el nombre, ni el
      -- teléfono con el que entra): quien conoce el correo de una familia
      -- podría cambiárselo desde un formulario público sin ser nadie.
    ELSE
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
        -- Llegar aquí significa que el dato es de alguien que NO es un
        -- representante de este club (un atleta, un coach, el dueño, o un
        -- representante de otro club) — los reutilizables ya se resolvieron
        -- arriba. Se dice qué dato es, sin decir de quién.
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

  -- `padre_telefono` es el identificador REAL con el que ese representante
  -- inicia sesión, y puede no ser el que acaba de teclear: si se le reconoció
  -- por el correo, su cuenta sigue siendo la del número con el que se registró
  -- la primera vez. Decirle "entra con el número que escribiste" lo dejaría
  -- fuera, así que la pantalla de fin de registro usa este valor.
  -- `atleta_correo` es el correo que esta función GUARDÓ (NULL cuando hay
  -- representante, §2), y no el que llegó en el payload. Quien crea la cuenta de
  -- Auth después tiene que usar este, no el suyo: si la Edge Function siguiera
  -- creándola con el correo de la familia mientras la fila quedó en NULL, el
  -- trigger trg_vincular_auth_usuario (v24) —que empareja por correo o por la
  -- cédula sintética— no encontraría la fila y el menor nacería SIN
  -- `auth_user_id`, o sea sin poder entrar nunca; y de paso esa cuenta se
  -- quedaría con el correo de la familia, dejando al representante sin él.
  RETURN jsonb_build_object(
    'atleta_usuario_id', v_usuario_atleta_id,
    'atleta_id', v_atleta_id,
    'atleta_correo', v_atleta_correo,
    'padre_id', v_padre_id,
    'padre_existente', v_padre_existente,
    'padre_cedula', v_padre_cedula,
    'padre_telefono', (SELECT telefono FROM usuarios WHERE id = v_padre_id),
    'estado', 'pendiente'
  );
END;
$$;

-- Los grants se re-afirman aunque CREATE OR REPLACE los preserve: v55 dejó esta
-- función solo para `service_role` porque todo el control de abuso del registro
-- (5 altas por IP/hora, tope por club, captcha) vive en la Edge Function y
-- llamarla por PostgREST lo saltaba entero. Si esta migración se aplicara sobre
-- un baseline anterior a v55, sin esto la puerta quedaría abierta otra vez.
REVOKE ALL ON FUNCTION public.registrar_publico(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_publico(jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.registrar_publico(jsonb, jsonb) IS
  'Alta pública de atleta (+ representante). SOLO service_role: la llama la Edge '
  'Function registro-publico, que es donde vive el control de abuso (v55). '
  'v57: el representante se identifica por teléfono o correo dentro de su club, '
  'el menor no reclama correo/teléfono propios, y los errores de duplicado '
  'nombran el dato que chocó de verdad.';
