# Black Gold CRM Bridge para OpenClaw

Plugin local de OpenClaw para la cuenta comercial de WhatsApp. Antes de que Lily procese un mensaje, el plugin crea o recupera el contacto CRM mediante una RPC `service_role` y le añade sólo el `contact_id`, la oportunidad y la ruta operativa.

## Garantías

- No escribe el texto de WhatsApp, teléfonos, correos, datos de menores ni identificadores del proveedor en el segundo cerebro.
- El identificador del canal queda exclusivamente en `crm_contacto_canales`; Lily recibe UUIDs CRM, nunca números.
- `CRM_INTERNAL_WHATSAPP_ALLOWLIST` exige exactamente tres números E.164 con los roles `ceo`, `direccion` y `marketing`. Si falta o es inválida, el plugin no registra nada.
- El plugin inicia inactivo. Se activa sólo al instalar un archivo de credenciales local con modo `0600` y una allowlist real.
- La baja explícita de contacto se ejecuta en el adaptador antes de Lily.

## Configuración del servidor

El archivo de credenciales no debe vivir en este repositorio. Debe contener `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `CRM_INTERNAL_WHATSAPP_ALLOWLIST`, con permisos `0600`. Después de instalar el plugin, configurar en `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "blackgold-crm-bridge": {
        "enabled": true,
        "config": {
          "enabled": true,
          "club": "Black Gold",
          "lilyAgentId": "lilith",
          "directionAgentId": "main",
          "whatsappAccountId": "direccion",
          "credentialsFile": "/ruta/privada/blackgold-crm-bridge.env"
        }
      }
    }
  }
}
```

Con `config.enabled: false` el plugin puede permanecer instalado sin capturar ni modificar eventos.
