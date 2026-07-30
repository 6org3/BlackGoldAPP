// Edge Function: registro-publico — registro público completo server-side.
//
// Motivo (descubierto por scripts/validar_rls_por_rol.js, 2026-07-07):
// GoTrue RECHAZA los emails sintéticos (cedula@sinacceso...internal) en el
// signUp PÚBLICO — valida el dominio — pero sí los acepta vía
// auth.admin.createUser. Como la mayoría de atletas no tiene correo real,
// el registro desde el navegador no puede crear la cuenta de Auth: se hace
// aquí con service_role, igual que hizo la migración de los 819 usuarios.
//
// Flujo: control de abuso (v52/v54) → valida el payload → rpc
// registrar_publico() (transacción de filas con roles forzados a atleta/padre;
// v24) → admin.createUser del atleta (y del padre si es nuevo) — el trigger
// trg_vincular_auth_usuario (v24) vincula usuarios.auth_user_id automáticamente
// al crearse cada cuenta. Si esa creación falla, se COMPENSA borrando lo que la
// RPC acabó de escribir (ver §4). Bonus sobre el flujo viejo: el navegador del
// registrante ya no queda logueado como el último signUp.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reintentarAuth } from "../_shared/brainAuth.ts";
import { generarPasswordTemporal, MARCA_PASSWORD_TEMPORAL } from "../_shared/credenciales.ts";
import {
  ipDeRequest,
  leerLimite,
  verificarCaptcha,
  LIMITE_IP_HORA_DEFAULT,
  LIMITE_CLUB_DIA_DEFAULT,
} from "../_shared/controlAbuso.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

// Misma regla que resolver_email_login() (v19) y el trigger de v24.
const emailParaAuth = (correo: string | null | undefined, cedula: string) =>
  (correo || `${cedula}@sinacceso.blackgoldapp.internal`).toLowerCase();

const haceUnaHora = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();
const haceUnDia = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

// Cuánto se considera "en vuelo" una petición que aún no terminó, para que
// reserve cupo del club mientras corre (ver paso 3). Holgado respecto a lo que
// tarda el peor caso real —RPC + una o dos llamadas a la Admin API de Auth—
// pero corto para que un intento fallido no penalice al club más que unos
// minutos.
const RESERVA_MS = 2 * 60 * 1000;
const haceLaReserva = () => new Date(Date.now() - RESERVA_MS).toISOString();

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido' }, 405);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: {
    atleta?: Record<string, string | null>;
    padre?: Record<string, string | null> | null;
    captcha_token?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Cuerpo JSON inválido.' }, 400);
  }

  const atleta = body?.atleta;
  const padre = body?.padre ?? null;
  if (!atleta?.cedula || !atleta?.nombre || !atleta?.fecha_nacimiento) {
    return jsonResponse({ error: 'Cédula, nombre y fecha de nacimiento del atleta son obligatorios.' }, 400);
  }

  const ip = ipDeRequest(req.headers);
  // El club se NORMALIZA aquí con la misma regla que aplica registrar_publico()
  // (`NULLIF(btrim(...), '')`, v33) y se manda ya normalizado a la RPC. Si cada
  // lado viera un string distinto, el alta caería en el club real mientras el
  // contador la cargaría a otro cubo: bastaría un espacio final ("NLB ") para
  // estrenar una cuota diaria intacta cuantas veces se quiera, y el tope por
  // club dejaría de acotar nada.
  const club = (atleta.club ?? '').trim() || null;
  const atletaNormalizado = { ...atleta, club };

  // 1. Captcha (si está configurado) ANTES de tocar la base: un bot no debe
  //    llegar siquiera a consumir una fila de registro_intentos.
  const captcha = await verificarCaptcha(body?.captcha_token, ip, Deno.env.get('TURNSTILE_SECRET_KEY'));
  if (!captcha.ok) return jsonResponse({ error: captcha.motivo }, 403);

  // 2. Control de abuso por IP (v52 §5). El intento se ANOTA ANTES de contarlo,
  //    y el conteo se incluye a sí mismo: si se anotara al final, un atacante
  //    que dispara N peticiones en paralelo pasaría todas (todas leerían el
  //    contador a cero antes de que ninguna hubiera escrito). Cada petición en
  //    vuelo deja su marca primero, así que para ESTE límite la carrera queda
  //    cerrada — el tope por club cuenta `exito`, que no se marca hasta el
  //    final, y por eso necesita además la reserva del paso 3.
  //    Se anota con exito=false y se corrige al final: un intento que muere a
  //    medias cuenta como intento, que es justo lo que interesa medir.
  const { data: intento, error: eIntento } = await supabase
    .from('registro_intentos')
    .insert({ ip, club, exito: false })
    .select('id')
    .single();
  // Si el contador no se puede escribir, no se abre la puerta: sin registro no
  // hay límite que valga y este es el endpoint que se está protegiendo.
  if (eIntento) {
    console.error('[registro-publico] no se pudo anotar el intento:', eIntento.message);
    return jsonResponse({ error: 'No se pudo procesar el registro en este momento. Inténtalo en unos minutos.' }, 503);
  }

  const limiteIp = leerLimite('REGISTRO_LIMITE_IP_HORA', LIMITE_IP_HORA_DEFAULT);
  const { count: intentosIp, error: eConteoIp } = await supabase
    .from('registro_intentos')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', haceUnaHora());

  // Mismo criterio que el INSERT: un contador que no se puede leer no autoriza
  // nada. Sin esto el límite falla ABIERTO — un timeout de la consulta (o un
  // 5xx del pooler) devuelve count nulo, `0 > 5` es falso y la petición pasa,
  // justo cuando la tabla está bajo la ráfaga que se quiere frenar.
  if (eConteoIp || intentosIp === null) {
    console.error('[registro-publico] no se pudo contar por IP:', eConteoIp?.message ?? 'count nulo');
    return jsonResponse({ error: 'No se pudo procesar el registro en este momento. Inténtalo en unos minutos.' }, 503);
  }

  if (intentosIp > limiteIp) {
    console.warn(`[registro-publico] IP ${ip} bloqueada: ${intentosIp} intentos en la última hora.`);
    return jsonResponse({
      error: 'Recibimos demasiadas inscripciones desde esta conexión en la última hora. '
        + 'Espera un momento y vuelve a intentarlo; si necesitas inscribir a varios atletas, contacta directamente al club.',
    }, 429);
  }

  // 3. Tope por club. Cuenta las altas EFECTIVAS del día (ver nota en
  //    controlAbuso.ts sobre por qué aquí no cuentan los fallos) MÁS las
  //    peticiones todavía en vuelo.
  //
  //    Lo segundo cierra una carrera que el límite por IP no cubre: `exito` no
  //    se marca hasta el final (después de la RPC y de createUser), así que
  //    durante esa ventana ninguna petición es visible para las demás y N
  //    simultáneas leerían todas el mismo contador viejo. Contar como ocupado
  //    lo insertado hace muy poco reserva el cupo desde el primer instante.
  //    La reserva dura RESERVA_MS y no 24 h a propósito: un intento fallido
  //    penaliza al club unos minutos, no el día entero — si los fallos gastaran
  //    cuota diaria, agotar la de un club con puros errores sería un DoS más
  //    barato que el abuso que se quiere frenar.
  if (club) {
    const limiteClub = leerLimite('REGISTRO_LIMITE_CLUB_DIA', LIMITE_CLUB_DIA_DEFAULT);

    const [altas, enVuelo] = await Promise.all([
      supabase.from('registro_intentos')
        .select('id', { count: 'exact', head: true })
        .eq('club', club).eq('exito', true).gte('created_at', haceUnDia()),
      supabase.from('registro_intentos')
        .select('id', { count: 'exact', head: true })
        .eq('club', club).eq('exito', false).gte('created_at', haceLaReserva()),
    ]);

    if (altas.error || enVuelo.error || altas.count === null || enVuelo.count === null) {
      console.error('[registro-publico] no se pudo contar por club:',
        altas.error?.message ?? enVuelo.error?.message ?? 'count nulo');
      return jsonResponse({ error: 'No se pudo procesar el registro en este momento. Inténtalo en unos minutos.' }, 503);
    }

    // `>` y no `>=`: la fila de ESTA petición ya está insertada y entra en
    // `enVuelo`, así que el total se incluye a sí mismo igual que en el de IP.
    const ocupado = altas.count + enVuelo.count;
    if (ocupado > limiteClub) {
      console.warn(`[registro-publico] club "${club}" al tope: ${altas.count} altas + ${enVuelo.count} en vuelo.`);
      return jsonResponse({
        error: 'Este club alcanzó el máximo de inscripciones en línea por hoy. '
          + 'Vuelve a intentarlo mañana o contacta directamente al club.',
      }, 429);
    }
  }

  // 4. Filas de usuarios/atletas/padres_atletas en una sola transacción.
  //    La RPC fuerza rol atleta/padre server-side y trae los mensajes
  //    amigables de duplicados (cédula ya registrada, teléfono repetido).
  const { data: reg, error: eReg } = await supabase.rpc('registrar_publico', {
    p_atleta: atletaNormalizado,
    p_padre: padre,
  });
  if (eReg) return jsonResponse({ error: eReg.message }, 400);

  // 5. Cuenta de acceso del atleta. La contraseña es ALEATORIA y se devuelve
  //    una sola vez al final para que el registrante la anote: hasta aquí era
  //    su propia cédula, que no es un secreto (está en su documento, en la
  //    matrícula escolar y en las inscripciones federativas), así que el par
  //    completo lo tenía cualquiera que la hubiera visto. Ver la nota de
  //    _shared/credenciales.ts. El trigger de v24 vincula auth_user_id.
  const passwordAtleta = generarPasswordTemporal();
  const { error: eAuthAtleta } = await reintentarAuth(() => supabase.auth.admin.createUser({
    email: emailParaAuth(atleta.correo, atleta.cedula),
    password: passwordAtleta,
    email_confirm: true,
    app_metadata: MARCA_PASSWORD_TEMPORAL,
  }));
  if (eAuthAtleta) {
    // COMPENSACIÓN. Sin esto la RPC ya confirmó su transacción y queda una fila
    // sin `auth_user_id` con la cédula consumida: nadie puede entrar con ella y
    // nadie puede volver a registrarla (UNIQUE), así que el registrante queda
    // fuera para siempre por un fallo que no es suyo.
    //
    // Por qué se compensa en vez de invertir el orden (Auth primero, RPC
    // después), que era la otra salida:
    //   · el trigger trg_vincular_auth_usuario (v24) resuelve la fila de
    //     `usuarios` por correo/cédula EN EL MOMENTO de crearse la cuenta; si
    //     todavía no existe, el UPDATE no encuentra nada y el auth_user_id
    //     queda NULL para siempre — el mismo huérfano, pero sin arreglo;
    //   · el motivo más común de fallo de la RPC es la cédula duplicada, así
    //     que con el orden invertido cada intento repetido dejaría una cuenta
    //     de Auth viva (MAU) ocupando `cedula@sinacceso…` — se cambiaría un
    //     huérfano por otro peor;
    //   · quién crea la cuenta del representante depende de `padre_existente`,
    //     que solo se sabe DESPUÉS de ejecutar la RPC.
    //
    // El borrado va con service_role (RLS no aplica) y CASCADE se lleva
    // `atletas` y `padres_atletas` (FK ON DELETE CASCADE, baseline:1041 y
    // 1176/1181). Los filtros por estado y auth_user_id son defensivos: esto
    // solo puede tocar la fila recién nacida, nunca una cuenta ya operativa.
    // Devuelve si la fila quedó efectivamente borrada: el mensaje al
    // registrante depende de eso y no debe afirmar que no se guardó nada sin
    // haberlo comprobado.
    const revertir = async (usuarioId: string): Promise<boolean> => {
      const { data, error } = await supabase
        .from('usuarios')
        .delete()
        .eq('id', usuarioId)
        .eq('estado', 'pendiente')
        .is('auth_user_id', null)
        .select('id');
      if (error) {
        console.error('[registro-publico] rollback fallido de', usuarioId, error.message);
        return false;
      }
      return (data?.length ?? 0) > 0;
    };

    // La causa nunca se le devuelve al registrante —diría si esa cédula o ese
    // correo ya tienen cuenta, que es el oráculo de existencia que v52 §4
    // cerró en resolver_email_login— pero sí queda en el log: sin esto no
    // habría rastro de por qué falló.
    const causa = eAuthAtleta.message || '';
    console.error('[registro-publico] createUser falló:', causa);

    const revertidoAtleta = reg?.atleta_usuario_id ? await revertir(reg.atleta_usuario_id) : false;
    // El representante se borra solo si (a) nació en ESTA llamada — si ya
    // existía tiene otros hijos y su cuenta no es nuestra para deshacer — y
    // (b) la fila del atleta SÍ desapareció. Sin (b) se dejaría al menor
    // registrado y sin representante, peor que no haber revertido nada.
    if (revertidoAtleta && reg?.padre_id && !reg?.padre_existente) {
      const revertidoPadre = await revertir(reg.padre_id);
      if (!revertidoPadre) console.error('[registro-publico] representante sin revertir:', reg.padre_id);
    }

    if (!revertidoAtleta) {
      // La cédula quedó ocupada por una fila sin acceso. Se dice tal cual: es
      // un caso que solo el club puede desatascar (rechazar + purgar, v45), y
      // callarlo mandaría al registrante a reintentar contra un UNIQUE que ya
      // no va a ceder.
      console.error('[registro-publico] fila huérfana sin revertir:', reg?.atleta_usuario_id, '— cédula:', atleta.cedula);
      return jsonResponse({
        error: 'Tu inscripción se registró pero no se pudo crear la cuenta de acceso. '
          + 'No vuelvas a enviar el formulario: contacta al club para que la activen.',
        atleta_id: reg?.atleta_id ?? null,
      }, 500);
    }

    // Se revirtió todo, pero "inténtalo de nuevo" solo vale si el fallo puede
    // pasarse solo. Si el email sintético (o el correo dado) ya pertenece a
    // otra cuenta de Auth, reintentar fallará idéntico las veces que sea: eso
    // lo desatasca el club, no la insistencia. Caso real y documentado: una
    // purga a medias (v45) deja viva la cuenta de Auth sin su fila en
    // `usuarios`.
    const permanente = /already been registered|already exists|already registered/i.test(causa);
    return jsonResponse({
      error: permanente
        ? 'No se pudo crear la cuenta de acceso porque ese correo o esa cédula ya tienen una. '
          + 'No se guardó nada; contacta al club para que lo revisen.'
        : 'No se pudo generar la cuenta de acceso. No se guardó nada: vuelve a intentarlo en unos minutos.',
    }, 500);
  }

  // 6. Cuenta del representante solo si la RPC lo creó en esta llamada
  //    (si ya existía conserva su cuenta y su contraseña: al inscribir un
  //    segundo hijo no se le cambia el acceso que ya usa). Contraseña
  //    aleatoria propia — antes era la cédula del hijo, que además dejaba al
  //    padre con la MISMA contraseña que su hijo. Best-effort: no bloquea el
  //    registro — el atleta ya tiene acceso y el club puede darle cuenta al
  //    padre desde /admin/equipo (crear-acceso-usuario), así que revertir aquí
  //    costaría más de lo que arregla.
  let passwordPadre: string | null = null;
  if (reg?.padre_id && !reg?.padre_existente && reg?.padre_cedula) {
    const generada = generarPasswordTemporal();
    const { error: eAuthPadre } = await reintentarAuth(() => supabase.auth.admin.createUser({
      email: emailParaAuth(padre?.correo, reg.padre_cedula),
      password: generada,
      email_confirm: true,
      app_metadata: MARCA_PASSWORD_TEMPORAL,
    }));
    if (eAuthPadre) console.error('Cuenta del representante no creada:', eAuthPadre.message);
    else passwordPadre = generada;
  }

  // 7. El intento pasa a exitoso: es lo que cuenta el tope diario del club.
  const { error: eMarca } = await supabase
    .from('registro_intentos')
    .update({ exito: true })
    .eq('id', intento.id);
  if (eMarca) console.error('[registro-publico] intento no marcado como exitoso:', eMarca.message);

  // Las contraseñas viajan SOLO en esta respuesta y no se guardan en ningún
  // lado: la pantalla de fin de registro las muestra para que la familia las
  // anote. Quien las pierda necesita que el club le regenere el acceso.
  return jsonResponse({
    success: true,
    atleta_id: reg?.atleta_id ?? null,
    credenciales: {
      atleta: { usuario: atleta.cedula, password: passwordAtleta },
      // null cuando no se creó representante en esta llamada (atleta mayor de
      // edad) o cuando el padre ya existía y conserva su contraseña.
      padre: passwordPadre ? { usuario: padre?.telefono ?? null, password: passwordPadre } : null,
    },
  }, 200);
});
