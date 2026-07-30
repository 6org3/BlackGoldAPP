-- ============================================================================
-- MIGRACIÓN v59 — EL CORREO SOLO REUTILIZA UNA CUENTA QUE EL CLUB YA APROBÓ
-- Fecha: 2026-07-30 · cierra un hallazgo de la revisión adversarial de v57
--
-- v57 hizo del correo una llave para reconocer al representante que ya inscribió
-- a un hermano. Eso arregla el caso real, pero abre uno nuevo, porque el correo
-- que llega al registro público NO está verificado: nadie comprueba que sea de
-- quien lo escribe. Camino completo, todo anónimo:
--
--   1. El atacante inscribe un atleta inventado (la cédula no tiene CHECK de
--      formato) poniendo SU teléfono y el correo de UNA FAMILIA REAL.
--   2. Nace un representante con ese correo, y la Edge Function le devuelve la
--      contraseña AL ATACANTE. Ya controla una cuenta cuyo correo es de otro.
--   3. Semanas después la familia real inscribe a su hijo con su propio correo.
--      v57 casa por correo, encuentra la fila del atacante y le vincula al menor
--      en `padres_atletas`.
--   4. El atacante entra y lee al menor: `mis_atletas()` (v24) resuelve los hijos
--      por ese vínculo.
--
-- El paso 4 no necesita que el club apruebe nada. Comprobado, no supuesto
-- (scripts/tmp_verificar_padre_pendiente.mjs): un representante en estado
-- `pendiente` con sesión válida lee por PostgREST la fila del menor —nombre,
-- cédula, fecha de nacimiento—, su ficha de `atletas` y su `atleta_readiness`
-- (calidad de sueño y fatiga física). El gate de `estado` vive en `PrivateRoute`,
-- o sea en la UI: con el JWT en mano, la API responde.
--
-- ARREGLO: la vía del correo solo reutiliza una fila `estado = 'activo'`, es
-- decir una cuenta que el dueño del club ya aprobó mirando quién es. Con eso el
-- squat queda inerte: la fila del atacante nace `pendiente`, nunca se reutiliza,
-- y la familia real choca contra el UNIQUE y recibe "ese correo ya está
-- registrado, contacta al club" — que es una denegación, pero honesta y con
-- salida, y el club encuentra la fila falsa al investigar.
--
-- Lo que esto cuesta: dos hermanos inscritos EL MISMO DÍA con teléfonos
-- distintos (el móvil de mamá para uno, el de papá para el otro) vuelven a
-- chocar, porque el representante del primero todavía está pendiente. El caso
-- normal —el segundo hermano se inscribe cuando el primero ya está dentro— sigue
-- funcionando, y es el que motivó la entrega 4. Se prefiere el bloqueo con
-- mensaje claro antes que dejar que un correo ajeno herede a un menor.
--
-- LO QUE ESTA MIGRACIÓN *NO* CIERRA, y hay que saberlo: el mismo squat por
-- TELÉFONO existe desde v33 y sigue abierto. `PADRE_<telefono>` es la cédula de
-- la fila, así que si el atacante registra un padre con el teléfono de la víctima
-- y luego la víctima se inscribe con ese mismo número, la cédula coincide y
-- hereda igual. No se cierra aquí porque filtrar por `activo` en esa vía rompería
-- el caso más común de todos —dos hermanos el mismo día con el mismo teléfono—,
-- que funciona desde v24. La raíz de ambos es la misma y no es de RLS: ni el
-- correo ni el teléfono se verifican nunca. Cerrarla de verdad pide un paso de
-- confirmación (correo o SMS), y el correo todavía no se puede enviar porque el
-- proyecto no tiene SMTP configurado. Queda anotado en CLAUDE.md.
--
-- De paso, dos cosas más que salieron de la misma revisión:
--
--   · El club entra en el WHERE de la búsqueda. Antes se buscaba sin filtrarlo y
--     se comparaba después, así que un representante de OTRO club que casara por
--     cédula ganaba la fila (por el ORDER BY) y disparaba la excepción cross-club
--     tapando un match legítimo por correo en ESTE club: una denegación que un
--     tercero podía provocar. Ahora el cross-club cae al manejador de duplicados
--     con el mensaje genérico, que además dice menos: aquel mensaje distinguía
--     "es padre en otro club" de "ese dato es de otra persona", y con eso se podía
--     averiguar en qué club está inscrito el hijo de alguien probando los nombres
--     públicos de los clubes.
--   · El atleta MAYOR de edad conserva su correo aunque venga representante. v57
--     decidía por la presencia de `p_padre` y no por la edad, así que un cliente
--     que mandara las dos cosas dejaba a un adulto sin correo y, por tanto, sin
--     ninguna vía de recuperación — su cuenta nacería con el sintético. La UI
--     nunca lo produce (solo manda representante si es menor), pero eso es un
--     contrato del cliente, no una garantía del servidor.
--   · El representante `rechazado` deja de reutilizarse (§B).
--
-- ORDEN DE DESPLIEGUE, que v57 no anotó y hay que respetar si esto se rehace:
-- **la migración primero, `registro-publico` después**, y seguidas. El contrato
-- entre la RPC y la función cambia a la vez: desplegar la función antes de aplicar
-- la migración deja a `reg.atleta_correo` en `undefined`, así que un atleta adulto
-- guardaría su correo en la tabla mientras su cuenta de Auth nace con el
-- sintético — `resolver_email_login` devolvería un correo que Auth no conoce y esa
-- persona no podría entrar nunca, sin que `createUser` fallara ni la compensación
-- del §4 se disparara. Mismo criterio que "v54 antes que registro-publico" en
-- CLAUDE.md. Ojo además con que esto es una PWA: durante unos minutos hay
-- navegadores corriendo el bundle anterior.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- §A. `resolver_email_login` compara el correo SIN distinguir mayúsculas.
--
--     Regresión que introdujo v57: al guardar el correo en minúsculas (necesario,
--     porque GoTrue normaliza el email de la cuenta y el UNIQUE de la tabla no),
--     el login por correo dejó de encontrar a quien lo teclea como lo escribió.
--     `authService.js` hace `.trim()` y no baja a minúsculas, y esta función
--     compara con `=` sobre una columna `text`: alguien que se registra como
--     `Juan.Perez@Gmail.com` queda guardado en minúsculas y, al volver y escribir
--     su correo igual que la primera vez, recibe el señuelo de §4 y "credenciales
--     incorrectas". Antes de v57 ese login funcionaba, porque la fila conservaba
--     su capitalización.
--
--     Se arregla aquí y no en el cliente: es el servidor quien decide, y así
--     quedan cubiertas también las filas viejas que sí tienen mayúsculas (el
--     caso simétrico: guardado con mayúsculas, tecleado en minúsculas).
--
--     Solo el correo. El teléfono son dígitos, y la cédula se compara exacta a
--     propósito — hay cédulas con letras en los datos sembrados y ampliar el
--     criterio ahí cambiaría a quién resuelve un identificador.
--
--     El cuerpo es el TEXTUAL de v52 §4 con esa única diferencia: se conserva el
--     señuelo que mata el oráculo de existencia y la exclusión de `rechazado`.
--     `lower(correo)` no usa el índice del UNIQUE, pero la tabla tiene menos de
--     mil filas y esto corre una vez por intento de login.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION resolver_email_login(p_identificador TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT COALESCE(correo, cedula || '@sinacceso.blackgoldapp.internal')
       FROM usuarios
      WHERE (lower(correo) = lower(p_identificador)
             OR telefono = p_identificador
             OR cedula = p_identificador)
        AND COALESCE(estado, 'activo') <> 'rechazado'
      LIMIT 1),
    -- Sin coincidencia: un correo con la misma forma, que no resuelve a
    -- ninguna cuenta. El atacante no puede distinguir este caso del anterior.
    p_identificador || '@sinacceso.blackgoldapp.internal'
  );
$$;

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
    -- (ver cabecera). Diferencia clave entre ellas:
    --   · la CÉDULA `PADRE_<telefono>` es la clave de la fila, y reutilizarla en
    --     cualquier estado es lo que permite inscribir a dos hermanos el mismo
    --     día, antes de que el club apruebe al primero (v24);
    --   · el CORREO exige `activo`, o sea una cuenta que el dueño ya aprobó
    --     mirando quién es. Sin ese filtro, un correo ajeno sin verificar
    --     bastaba para heredar al menor de otra familia.
    -- `ORDER BY` deja que el teléfono gane si cada dato apunta a una fila
    -- distinta: es el identificador con el que el representante inicia sesión.
    -- §B. `rechazado` nunca se reutiliza, por ninguna de las dos vías: esa cuenta
    -- ya no puede iniciar sesión —`resolver_email_login` la excluye desde v52— así
    -- que reutilizarla vinculaba al hermano nuevo a un representante muerto y la
    -- pantalla le decía "entra con la misma contraseña de siempre" sobre una
    -- cuenta que no abre. Preexistente por la vía del teléfono; se cierra para
    -- las dos. `pendiente` sí se reutiliza por cédula, que es lo que permite
    -- inscribir a dos hermanos el mismo día (ver arriba).
    SELECT id INTO v_padre_id
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
  -- de Auth después tiene que usar este y no el del payload: si no, el menor
  -- nacería sin `auth_user_id` (el trigger trg_vincular_auth_usuario empareja por
  -- correo o por la cédula sintética y no encontraría la fila) y esa cuenta se
  -- quedaría además con el correo de la familia.
  --
  -- `padre_telefono` YA NO SE DEVUELVE. Lo añadió v57 para poder decirle a la
  -- familia con qué número entra su representante, pero es el teléfono
  -- ALMACENADO: bastaba mandar el correo de una familia real para que la
  -- respuesta —a un anónimo, sin autenticar— trajera su número, confirmara que
  -- esa persona es representante y, probando los nombres públicos de los clubes,
  -- revelara en cuál está inscrito su hijo. La pantalla ahora se lo dice sin el
  -- dato: "entra con el teléfono que registró la primera vez", que la familia de
  -- verdad ya sabe y un extraño no averigua.
  RETURN jsonb_build_object(
    'atleta_usuario_id', v_usuario_atleta_id,
    'atleta_id', v_atleta_id,
    'atleta_correo', v_atleta_correo,
    'padre_id', v_padre_id,
    'padre_existente', v_padre_existente,
    'padre_cedula', v_padre_cedula,
    'estado', 'pendiente'
  );
END;
$$;

-- v55: esta función es solo para `service_role` porque todo el control de abuso
-- del registro vive en la Edge Function y llamarla por PostgREST lo saltaba.
REVOKE ALL ON FUNCTION public.registrar_publico(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_publico(jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.registrar_publico(jsonb, jsonb) IS
  'Alta pública de atleta (+ representante). SOLO service_role (v55). v59: el '
  'correo solo reutiliza un representante ya APROBADO por el club —sin eso, un '
  'correo ajeno sin verificar heredaba al menor de otra familia—, la búsqueda va '
  'acotada al club, el adulto conserva su correo aunque manden representante, y '
  'la respuesta ya no devuelve el teléfono de un tercero.';
