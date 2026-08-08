# Black Gold knowledge controller

Controlador interno para que n8n sea el único orquestador de sincronización,
validación, vistas por rol y backup. Expone únicamente cuatro operaciones fijas;
no acepta comandos, rutas ni argumentos del request y no monta el socket Docker.

El contenedor solo pertenece a la red privada `blackgold-orchestration`. n8n usa
una credencial HTTP Bearer guardada en su almacén cifrado. La clave de despliegue
de GitHub es de solo lectura.

El controlador básico arranca sin secretos de backup. Cuando Jorge configure
Google Drive, se añade `docker-compose.backup.yml` y los archivos root-only
`/etc/blackgold/restic-password` y `/etc/blackgold/rclone.conf`; hasta entonces
el workflow BG 09 permanece inactivo.
