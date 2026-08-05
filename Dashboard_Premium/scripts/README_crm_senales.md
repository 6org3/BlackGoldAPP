# Exportación CRM → Segundo Cerebro

`exportar_senales_crm_segundo_cerebro.sh` consulta el CRM privado desde el servidor y publica únicamente una nota agregada de embudo, intereses y orígenes para Content-OS.

No exporta conversaciones, teléfonos, correos, nombres, UUIDs CRM, datos de menores ni estados de pago. La tarea debe ejecutarse sólo contra un clon limpio del repositorio `segundo-cerebro` con credenciales Git del servidor.

Uso:

```bash
./exportar_senales_crm_segundo_cerebro.sh \
  /ruta/privada/blackgold-crm-bridge.env \
  /ruta/clon-limpio/segundo-cerebro-crm-insights
```

El archivo de credenciales debe tener permisos `0600` y contener `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. La programación vive en el servidor, no en la aplicación web ni en el repositorio público.

El servidor usa las unidades versionadas en `scripts/systemd/` como timer de usuario cada cuatro horas, con un desfase aleatorio máximo de cinco minutos. La unidad llama al script ya instalado en la ruta privada del servidor; no incorpora secretos.
