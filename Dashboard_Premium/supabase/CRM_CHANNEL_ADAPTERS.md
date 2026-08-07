# Contratos de canales CRM

Este documento fija los límites entre los adaptadores de canal, Lily y el CRM.
No contiene secretos, teléfonos, textos de conversaciones ni una URL pública.

## Roles

- **Lily** atiende y vende: recibe eventos de entrada ya validados, propone una
  respuesta breve y puede solicitar salidas permitidas por la outbox.
- **Vegapunk** consume resúmenes, métricas y alertas para Dirección. No recibe
  números de teléfono ni se convierte en un canal de atención.
- **Adaptador de canal** autentica el origen, aplica antiabuso, correlaciona la
  identidad cuando haya prueba suficiente y llama las RPC privadas del CRM.

## Contrato de ingreso v1

Un adaptador confiable llama `crm_recibir_contacto_canal` con datos validados.
El navegador nunca invoca esa RPC ni recibe el identificador de canal.

| Campo | Regla |
| --- | --- |
| `canal` | `whatsapp`, `web_chat`, `app` o `manual`. |
| `identificador_normalizado` | Opaco y estable por canal: E.164 para WhatsApp; sesión emitida por servidor para web. |
| `mensaje_externo_ref` | Idempotency key opaca y única por canal. |
| `app_usuario_id` | Sólo tras prueba de posesión; nunca aceptado desde un navegador anónimo. |
| `contenido` | Se transmite a Lily sólo por el adaptador. El CRM persiste un resumen operativo, no el transcript por defecto. |

La respuesta CRM contiene únicamente `contact_id`, `ruta`, etapa y contexto
operativo. Una ruta desconocida crea `lead` + oportunidad `nuevo`; una ruta
interna no se entrega a Lily.

## Web Chat público v1 (pendiente de implementar)

```text
Widget Clip -> crm-web-chat -> CRM -> Lily
     ^                              |
     +---- cola de respuesta web ---+
```

Antes de invocar a Lily, `crm-web-chat` debe exigir:

1. Sesión opaca emitida por servidor (`wcs_<uuid>`), en cookie `HttpOnly`,
   `Secure` y `SameSite` apropiado para el dominio final.
2. Turnstile verificado en servidor, límite por IP y sesión, cuerpo limitado e
   idempotencia por evento.
3. Origen permitido explícito y salida CORS limitada al dominio Clip final.

Para una primera conversación sin nombre, Lily inicia con una presentación
breve y pregunta nombre + necesidad. Las respuestas web deben ir a una cola
privada por sesión; no reutilizan el envío de WhatsApp/Meta.

## Vínculo App <-> WhatsApp v1 (implementado; pendiente de despliegue)

No se une por coincidencia de nombre, correo o teléfono. El flujo es:

1. Usuario autenticado solicita un código de un solo uso mediante `crm-whatsapp-link`, ligado a
   `usuarios.id`, club, propósito y expiración corta.
2. La app abre WhatsApp con ese código prellenado.
3. El webhook valida y consume el código una única vez, y vincula el canal al
   mismo `crm_contacto` dentro de una transacción auditada.

Reintentos del mismo evento deben devolver un resultado idempotente. Un código
vencido, de otro club o ya consumido no revela si existe un usuario. El webhook
entrega a Lily solo una instrucción de confirmación o reinicio; nunca el código.

## Contactos internos y clientes

- La lista E.164 del CEO, Dirección y Marketing debe vivir como secreto de
  configuración del adaptador de WhatsApp bajo
  `CRM_INTERNAL_WHATSAPP_ALLOWLIST`. Su formato es un JSON con exactamente los
  tres roles `ceo`, `direccion` y `marketing`, por ejemplo
  `[{"e164":"+...","rol":"ceo"}, ...]`. El adaptador falla cerrado si el
  secreto falta o es inválido, clasifica el evento antes de entregarlo a Lily y
  sólo guarda el rol mínimo, nunca el número en el panel.
- La transición comercial `ganado` no es, por sí sola, una prueba de alta en la
  app. El paso a `cliente` exige una correlación confirmada con `usuarios.id` o
  una confirmación de alta equivalente y auditada.

## Consentimiento y errores

La activación de `seguimiento` o `marketing` requiere registrar versión de
política y evidencia opaca de la aceptación. Un `no_contactar` cancela las
salidas pendientes y prevalece sobre cualquier automatización.

Las APIs nuevas deben usar una respuesta consistente:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

Los detalles internos, identificadores de canal y respuestas de proveedores no
se devuelven al navegador. Los resultados de Meta/Lily se validan antes de
actualizar el estado de la outbox.

## Decisiones requeridas antes de abrir el canal web

1. Repositorio y dominio de Clip, incluido si el widget comparte dominio.
2. Proveedor y versión de la política de consentimiento.
3. Retención permitida de transcripts y adjuntos, si llegaran a almacenarse.
4. Secretos: lista interna E.164, HMAC de Lily y credenciales Meta, cargados en
   el gestor de secretos, nunca en código ni chat.
