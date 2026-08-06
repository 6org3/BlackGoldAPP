# `crm-whatsapp-webhook`

Entrada de WhatsApp Cloud API para Black Gold. No envía mensajes por sí sola: valida la entrega de Meta, resuelve el `contact_id` comercial mediante `crm_recibir_contacto_canal` y entrega el contenido en tránsito a la pasarela privada de Lily.

## Seguridad del endpoint

La función tiene `verify_jwt = false` porque Meta no presenta un JWT de Supabase. Esa excepción está compensada dentro del código:

- `GET`: solo confirma la suscripción cuando `hub.verify_token` coincide en tiempo constante.
- `POST`: exige `X-Hub-Signature-256` válida sobre los bytes crudos del cuerpo, con `META_WHATSAPP_APP_SECRET`.
- No usa CORS, no recibe llamadas de navegador y limita cuerpos a 256 KiB.
- Nunca registra ni devuelve el número de WhatsApp. El identificador normalizado va únicamente a la RPC privada del CRM.
- Antes de enrutar, exige una allowlist secreta y completa de CEO, Dirección y
  Marketing. Si falta o es inválida, falla cerrado; un interno no se entrega a
  Lily como lead.
- No persiste transcript, adjuntos, ubicación ni tarjetas de contacto. Texto e interacciones van a Lily en tránsito; contenido no textual se marca para atención humana.
- Si Lily no está disponible, devuelve `503`. Meta reintenta y el CRM no duplica la interacción porque usa el ID del mensaje como clave idempotente. La pasarela de Lily debe deduplicar por `event_id`.

## Secretos de despliegue

Configurar estos valores solo en Supabase Secrets; nunca en `.env` versionado ni en OpenClaw público:

| Secreto | Uso |
| --- | --- |
| `META_WHATSAPP_VERIFY_TOKEN` | Token aleatorio para el handshake `GET` de Meta. |
| `META_WHATSAPP_APP_SECRET` | App Secret de Meta para verificar `X-Hub-Signature-256`. |
| `LILY_INGRESS_URL` | URL HTTPS de la pasarela privada que entrega eventos a Lily. |
| `LILY_INGRESS_ALLOWED_HOST` | Host exacto permitido para esa URL, para evitar SSRF. |
| `LILY_INGRESS_SECRET` | Secreto HMAC usado para firmar la entrega a Lily. |
| `CRM_INTERNAL_WHATSAPP_ALLOWLIST` | JSON secreto con exactamente `ceo`, `direccion` y `marketing`: `[{"e164":"+...","rol":"ceo"}, ...]`. |
| `BLACK_GOLD_CLUB` | Opcional; por defecto `Black Gold`. |

Supabase proporciona `SUPABASE_URL` y una clave de servidor (`SUPABASE_SECRET_KEYS` actual o `SUPABASE_SERVICE_ROLE_KEY` legado) al runtime. Esa clave no debe aparecer en el navegador ni en la configuración de Lily.

## Configuración de Meta

Después de aplicar la migración CRM y desplegar esta función, registrar como Callback URL:

```text
https://<project-ref>.supabase.co/functions/v1/crm-whatsapp-webhook
```

Usar el valor de `META_WHATSAPP_VERIFY_TOKEN` como Verify Token y suscribirse al campo de mensajes. La suscripción no activa respuestas automáticas: para eso la pasarela de Lily debe validar la firma `X-BlackGold-Signature-256`, deduplicar `X-BlackGold-Event-Id` y decidir el mensaje de salida de acuerdo con la ruta CRM (`interno`, `lead`, `cliente`, `no_contactar`).

## Pruebas locales

El protocolo puro se prueba sin secretos ni Docker:

```powershell
node --test supabase/functions/_shared/crmWhatsappProtocol.test.mjs
```

Para probar la función completa hace falta Deno/Docker y secretos de prueba. No desplegar ni configurar el Callback URL de Meta antes de tener lista la pasarela privada de Lily.
