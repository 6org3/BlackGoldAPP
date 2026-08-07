# Black Gold secure documents

Servicio loopback para documentos identificables vinculados al CRM. El archivo
se cifra con una DEK aleatoria AES-256-GCM; la DEK se cifra con una clave maestra
externa antes de subir el ciphertext al bucket privado `secure-documents`.

- No existe endpoint de listado.
- Lily solo puede crear para el `contact_id` actual y no puede leer.
- Vegapunk puede leer por ID con propósito auditado.
- Pythagoras solo puede leer documentos `financiero` autorizados.
- Shaka, Edison y Atlas no tienen token ni acceso.
- Una lectura autorizada falla cerrada si no puede registrar su auditoría.
- La clave maestra debe respaldarse en Vaultwarden y nunca guardarse en Git,
  Supabase, n8n, Obsidian o logs.

El servicio debe escuchar solo en `127.0.0.1`. Un proxy o gateway de agente debe
inyectar su token privado; ningún token se entrega al modelo ni a WhatsApp.

## Custodia de la clave maestra

La clave se genera en la PC de Jorge, se guarda primero en Vaultwarden y luego
se entrega de forma interactiva al servidor. Nunca se imprime en una consola,
ni se incluye en un comando, archivo de Git, Obsidian o n8n. El script
`scripts/capture-recovery-master-key.sh` rechaza reemplazar una clave existente
y valida que sea una clave base64 de exactamente 32 bytes.

Antes de una migración, `scripts/backup-core-encrypted.sh` transmite el dump
PostgreSQL y el estado de Vaultwarden directamente a archivos cifrados; no deja
un dump de CRM sin cifrar en disco.

Después del respaldo y de guardar la clave en Vaultwarden, el activador
`scripts/activate-secure-documents.sh` crea la configuración root-only, genera
tokens internos y elimina la copia temporal solo si el servicio y el acceso
interno de Supabase responden correctamente.

Si el arranque inicial requiere una corrección de unidad, ejecutar
`scripts/finalize-secure-documents.sh` después: vuelve a comprobar ambos
endpoints internos y elimina la copia temporal sin imprimir secretos.

## Pruebas

```sh
npm test
```
