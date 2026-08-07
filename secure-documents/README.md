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

## Pruebas

```sh
npm test
```
