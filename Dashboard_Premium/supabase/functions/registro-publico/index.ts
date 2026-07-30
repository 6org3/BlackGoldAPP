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

// Reintento acotado para el DELETE de compensación de §4 — NO reutiliza
// reintentarAuth() de _shared/brainAuth.ts: esa función está acotada
// explícitamente al fallo transitorio de JWT kid de la Admin API de Auth
// ("unrecognized JWT kid", "token is unverifiable"), no a llamadas PostgREST
// como esta. Aquí se reintenta ante CUALQUIER error de la query (no solo uno
// con mensaje reconocible) porque es seguro hacerlo sin importar la causa: el
// propio DELETE trae el guard `.eq('estado','pendiente').is('auth_user_id',
// null)` (mismo criterio ya documentado para el UPDATE de crear-acceso-usuario
// en brainAuth.ts), así que repetirlo sobre una fila que un intento anterior ya
// hubiera borrado o vinculado simplemente no matchea nada — no hace nada dos
// veces. Esto ataca directamente la hipótesis del hallazgo original: que el
// segundo DELETE, ejecutado inmediatamente después sobre la misma conexión,
// tropiece con la misma causa transitoria que ya haya afectado a la petición.
async function reintentarDelete<T extends { error: unknown }>(
  op: () => Promise<T>,
  intentos = 3,
): Promise<T> {
  let ultimo = await op();
  for (let i = 1; i < intentos; i++) {
    if (!ultimo.error) break;
    await new Promise((r) => setTimeout(r, 200 * i));
    ultimo = await op();
  }
  return ultimo;
}

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

  // El correo del representante es OBLIGATORIO desde la entrega 3: es la única
  // dirección real de la familia y, por tanto, lo único que hace posible
  // recuperar la cuenta sin pasar por el club. El atleta menor casi nunca tiene
  // correo propio y su cuenta de Auth nace con el sintético
  // `<cédula>@sinacceso...`, al que no llega nada; si el representante tampoco
  // lo tiene, perder la contraseña deja a la familia dependiendo de que el
  // dueño se la regenere a mano.
  //
  // Se valida AQUÍ y no dentro de la RPC porque desde v55 la Edge Function es
  // la única puerta: `anon` perdió el EXECUTE, así que esto no se puede saltar
  // llamando a PostgREST.
  // Sin representante (atleta mayor de edad) el titular es él mismo, así que el
  // correo obligatorio es el SUYO. Sin esta mitad la regla se caía sola: bastaba
  // registrarse como adulto para que la cuenta naciera sin ninguna dirección
  // real —la de Auth sería el sintético `<cédula>@sinacceso…`, que no existe— y
  // sin ninguna vía de recuperación.
  if (!padre) {
    const correoAtleta = (atleta.correo ?? '').trim();
    if (!correoAtleta) {
      return jsonResponse({ error: 'El correo es obligatorio: es la única forma de recuperar tu cuenta si pierdes la contraseña.' }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoAtleta)) {
      return jsonResponse({ error: 'Revisa tu correo: no parece una dirección válida.' }, 400);
    }
    atleta.correo = correoAtleta;
  }

  if (padre) {
    const correoPadre = (padre.correo ?? '').trim();
    if (!correoPadre) {
      return jsonResponse({ error: 'El correo del representante es obligatorio: es la única forma de recuperar la cuenta si se pierde la contraseña.' }, 400);
    }
    // Comprobación deliberadamente laxa (hay un `type="email"` en el formulario
    // y el servidor de correo es el juez final): solo descarta lo que
    // seguro no es una dirección, para no rechazar dominios legítimos raros.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoPadre)) {
      return jsonResponse({ error: 'Revisa el correo del representante: no parece una dirección válida.' }, 400);
    }
    padre.correo = correoPadre;

    // Aquí había una comprobación previa de quién es el dueño de ese correo.
    // Existía porque el manejador de duplicados de la RPC (v33) traducía
    // cualquier choque a "el teléfono del representante ya está registrado" y
    // mandaba a la familia a revisar un teléfono impecable. v57 la deja sin
    // función —ahora la RPC nombra el dato que colisionó de verdad— y, peor, la
    // vuelve nociva: el correo es precisamente lo que ahora permite reconocer a
    // un representante que ya inscribió a un hermano con OTRO número (el papá
    // inscribiendo al segundo, o la misma madre desde otro teléfono), y esta
    // comprobación cortaba justo ese caso con un 409 antes de que la RPC pudiera
    // reutilizar la cuenta. La verificación vive ahora donde se puede hacer
    // bien: dentro de la transacción, sabiendo qué constraint saltó y a qué club
    // pertenece la fila encontrada.
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
  //
  //    El email sale de `reg.atleta_correo` —lo que la RPC GUARDÓ— y no de
  //    `atleta.correo`, que es lo que llegó en el payload. v57 descarta el correo
  //    del deportista cuando viene representante (es el de la familia y vive en
  //    la fila del representante), así que usar el del payload crearía la cuenta
  //    de Auth con una dirección que la fila no tiene: el trigger
  //    trg_vincular_auth_usuario (v24/v40) empareja por correo o por la cédula
  //    sintética, no encontraría nada, y el menor nacería SIN `auth_user_id`, es
  //    decir sin poder entrar nunca. De paso, esa cuenta se quedaría con el
  //    correo de la familia y el representante ya no podría tenerlo.
  const passwordAtleta = generarPasswordTemporal();
  const { error: eAuthAtleta } = await reintentarAuth(() => supabase.auth.admin.createUser({
    email: emailParaAuth(reg?.atleta_correo, atleta.cedula),
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
      const { data, error } = await reintentarDelete(() => supabase
        .from('usuarios')
        .delete()
        .eq('id', usuarioId)
        .eq('estado', 'pendiente')
        .is('auth_user_id', null)
        .select('id'));
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
  //
  // El resultado se comunica con `padre_estado` y no solo con la ausencia de
  // contraseña: "no hay representante", "ya tenía cuenta" y "no se pudo crear"
  // se veían los tres como `padre: null`, así que la familia cuyo representante
  // se quedaba sin acceso salía de la pantalla creyendo que todo fue bien y
  // descubría el problema al intentar entrar, sin saber qué pedirle al club.
  //
  // `reg.padre_auth_activo` (v60) es lo que distingue un representante REAL
  // (encontrado con su cuenta de Auth vinculada) de uno HUÉRFANO: una fila que
  // quedó de una compensación fallida en un intento anterior —el DELETE de este
  // mismo bloque §4, sobre el padre, cuando el createUser del ATLETA falló y ese
  // segundo borrado también falló— y que `registrar_publico()` vuelve a
  // encontrar por la misma cédula `PADRE_<telefono>` (v59 no filtra esa vía por
  // estado, a propósito, para permitir dos hermanos el mismo día). Sin este
  // campo, `padre_existente=true` bastaba para decidir 'ya_existia' y el
  // reintento se atascaba ahí para siempre, sin volver a intentar crear la
  // cuenta de Auth que en realidad falta. Con el campo, ese caso cae al `else
  // if` de abajo igual que un padre nuevo: es la misma reparación, sin ninguna
  // rama adicional.
  let passwordPadre: string | null = null;
  let padreEstado: 'sin_representante' | 'ya_existia' | 'emitida' | 'error' = 'sin_representante';
  if (reg?.padre_id && reg?.padre_existente && reg?.padre_auth_activo) {
    padreEstado = 'ya_existia';
  } else if (reg?.padre_id && reg?.padre_cedula) {
    const generada = generarPasswordTemporal();
    const { error: eAuthPadre } = await reintentarAuth(() => supabase.auth.admin.createUser({
      email: emailParaAuth(padre?.correo, reg.padre_cedula),
      password: generada,
      email_confirm: true,
      app_metadata: MARCA_PASSWORD_TEMPORAL,
    }));
    if (eAuthPadre) {
      console.error('Cuenta del representante no creada:', eAuthPadre.message);
      padreEstado = 'error';
    } else {
      passwordPadre = generada;
      padreEstado = 'emitida';
    }
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
      // Solo se devuelve el identificador cuando la cuenta se ACABA de crear en
      // esta llamada, y entonces es el teléfono que el propio registrante escribió
      // — no hay nada ajeno que filtrar.
      //
      // v57 devolvía aquí el teléfono ALMACENADO del representante reutilizado
      // para poder decirle a la familia con qué número entra. Era una fuga: con
      // mandar el correo de una familia real, un anónimo sin autenticar recibía su
      // teléfono, la confirmación de que esa persona es representante y —probando
      // los nombres públicos de los clubes— en cuál está inscrito su hijo. El
      // README de estas funciones dice que este endpoint "no expone ningún dato
      // ajeno" y tenía que seguir siendo verdad.
      padre: passwordPadre ? { usuario: padre?.telefono ?? null, password: passwordPadre } : null,
      // null cuando no se creó representante en esta llamada (atleta mayor de
      // edad), cuando el padre ya existía y conserva su contraseña, o cuando su
      // cuenta falló: `padre_estado` distingue los tres. La pantalla usa esto para
      // decirle a la familia que entre con el número que registró la primera vez,
      // sin nombrarlo: ella lo sabe y un extraño no lo averigua.
      padre_estado: padreEstado,
    },
  }, 200);
});
