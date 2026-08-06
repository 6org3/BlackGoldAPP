# `crm-lily-send`

Pasarela privada de salida de Lily hacia WhatsApp Cloud API. Lily entrega un
`contact_id`, nunca un número telefónico; la Edge Function delega en el outbox
CRM la reserva, verificación de consentimiento y resolución privada del canal.
Ninguna respuesta ni log incluye el identificador de canal.

## Contrato de ingreso

`POST` con cuerpo JSON de hasta 16 KiB:

```json
{
  "contact_id": "uuid-del-contacto-crm",
  "mensaje": "Texto breve para WhatsApp",
  "idempotency_key": "lily.2026-08-04.evento-001",
  "intent": "horarios",
  "modo": "respuesta",
  "reply_to_message_ref": "wamid.HBgM..."
}
```

`intent` puede ser `informacion_general`, `clases`, `horarios`,
`inscripcion`, `prueba`, `soporte`, `seguimiento` u `otro`.

`modo` es `respuesta` o `seguimiento`:

- `respuesta` exige `reply_to_message_ref`, el ID del mensaje entrante que
  Lily recibió. El outbox lo verifica para el mismo contacto y canal antes de
  permitir texto libre.
- `seguimiento` no puede hacerse pasar por una respuesta y requiere el
  consentimiento correspondiente. La versión actual sólo cubre texto libre;
  los seguimientos fuera de la ventana de atención requieren un flujo futuro
  de plantillas aprobadas por Meta.

La identidad de auditoría no la acepta el cuerpo: la Edge Function usa siempre
el actor fijo `lily`.

## Firma de ingreso

El cuerpo exacto se firma con:

```text
payload = "<X-BlackGold-Timestamp>." + bytes-del-cuerpo
X-BlackGold-Signature-256 = "sha256=" + HMAC_SHA256(LILY_OUTBOUND_INGRESS_SECRET, payload)
```

`X-BlackGold-Timestamp` debe ser Unix en segundos; se aceptan hasta cinco
minutos de antigüedad y sólo 30 segundos de adelanto. La firma evita que un
llamador sin el secreto use la función aunque conozca un UUID de CRM.

Una `idempotency_key` sólo puede reutilizarse con el mismo contacto, modo,
referencia de respuesta, intención y mensaje. El outbox almacena únicamente su
hash de payload, no el mensaje ni el identificador del canal.

## Reglas de salida

- La reserva y el despacho bloquean `tipo_relacion=no_contactar`, contactos
  archivados y canales de WhatsApp inexistentes o inválidos.
- Una `respuesta` sólo se autoriza si referencia un inbound real, ya entregado
  a Lily, del mismo contacto y canal dentro de las últimas 24 horas. Un
  `marcado_no_contactar` posterior invalida para siempre ese inbound, incluso
  tras una reactivación humana del contacto.
- La reserva es durable y su unicidad evita duplicados entre isolates,
  reinicios o reintentos de red.
- Después del despacho, una autorización separada vuelve a validar el estado
  justo antes de resolver el número privado para Meta; una baja cancela la
  salida sin entregar un destinatario a la Edge Function.
- Envía sólo a `https://graph.facebook.com`, con `redirect: "error"` y timeout
  de 10 segundos.
- Sólo considera la salida aceptada cuando Meta devuelve un `messages[0].id`.
  Eso significa **aceptada por Meta**, no entregada al destinatario.
- Para `modo=respuesta`, además se manda `context.message_id` a Meta para que
  el mensaje aparezca como respuesta al evento entrante validado.
- Las respuestas HTTP no exitosas de Meta se registran sólo como
  `meta_terminal_http_<código>` o `meta_reintentable_http_<código>`; nunca se
  persiste ni se registra el cuerpo de error de Meta. 408, 425, 429 y 5xx se
  clasifican como potencialmente reintentables por protocolo, pero sin una
  garantía de idempotencia de Meta configurada quedan en revisión manual y no
  generan otro `fetch` automático.

## Estados de recuperación

- `error_terminal`: Meta rechazó de forma no reintentable. No hay reenvío
  automático.
- `revision_manual`: el resultado de Meta fue no confirmable, potencialmente
  ambiguo (incluye 408/425/429/5xx) o venció un lease `enviando`. El siguiente
  intento **no** hace un nuevo `fetch` a Meta: deja la salida en cuarentena para
  evitar duplicados.

No se usa scheduler externo para recuperar leases. Una nueva solicitud que
encuentra un lease vencido lo cambia a `revision_manual`; un operador debe
conciliarlo con Meta. Si se confirma aceptación, un proceso de servidor puede
cerrar la salida original con el ID de Meta. Si se confirma que no fue aceptada,
se documenta la decisión y se crea una **nueva** `idempotency_key`; nunca se
reabre automáticamente la salida ambigua.

## Secretos requeridos

Configurar únicamente en el gestor de secretos local/remoto, nunca en Git:

- `LILY_OUTBOUND_INGRESS_SECRET`
- `META_WHATSAPP_PHONE_NUMBER_ID`
- `META_WHATSAPP_GRAPH_VERSION` (una versión vigente con forma `vNN.N`)
- `META_WHATSAPP_ACCESS_TOKEN`
- `SUPABASE_URL` y una clave de servidor (`SUPABASE_SECRET_KEYS` o
  `SUPABASE_SERVICE_ROLE_KEY`), provistas por Supabase.

## Integración pendiente antes de desplegar

1. Agregar la función al `supabase/config.toml` con `verify_jwt = false`, pues
   el control de acceso es su HMAC de servidor a servidor. Esta tarea no edita
   ese archivo para no mezclar cambios de configuración concurrentes.
2. Configurar Lily para tratar `200` como aceptación final. Un `202`, `409`,
   `422` o `503` no se reintenta automáticamente con la misma clave: el
   resultado debe conciliase antes de crear una salida nueva, para no provocar
   un envío ciego.
3. Implementar un adaptador de plantillas aprobadas antes de permitir
   comunicaciones proactivas fuera de la ventana de atención de WhatsApp.
4. Correlacionar los estados de entrega/fallo de Meta contra el ID externo que
   queda en el outbox; aceptación de Meta no equivale a entrega.
5. Antes de producción, definir el runbook y quién tiene acceso de servidor
   para conciliar `revision_manual`: comprobar Meta, cerrar la original si hay
   ID de aceptación o documentar el no envío antes de iniciar una salida nueva.

## Prueba pura

Desde `Dashboard_Premium`:

```powershell
node --test supabase/functions/crm-lily-send/protocol.test.mjs
```
