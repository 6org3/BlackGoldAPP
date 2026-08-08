# Vaultwarden de recuperación de Black Gold

Esta instancia custodia únicamente secretos de recuperación: por ejemplo, la
clave maestra del servicio de documentos CRM cifrados. No almacena contactos,
conversaciones, expedientes ni datos del CRM.

## Límites de seguridad

- Escucha únicamente en `127.0.0.1:8222`; no se publica por dominio, proxy ni Internet.
- Ningún agente, n8n ni contenedor recibe sus credenciales.
- Los registros se habilitan sólo durante el alta inicial de Jorge y luego se bloquean.
- El volumen `data/` es estado sensible local y no debe entrar a Git.

## Alta inicial

En el servidor, desde la copia del repositorio:

```sh
sh vaultwarden/scripts/bootstrap.sh
```

Desde la PC de Jorge, abrir un túnel y mantener esa terminal abierta:

```sh
ssh -N -L 8222:127.0.0.1:8222 gorg3yj1n1@192.168.1.13
```

Abrir `https://localhost:8222`. El certificado es privado y corresponde a este
túnel, por lo que el navegador mostrará una advertencia la primera vez: revisar
que la dirección sea exactamente `localhost:8222` y continuar. Crear la única
cuenta con una contraseña maestra propia y activar 2FA. Después, en el servidor:

```sh
sh ~/servicios/vaultwarden/scripts/lock-signups.sh
```

Antes de encender `secure-documents`, guardar la clave maestra de recuperación
en un elemento de Vaultwarden llamado `Black Gold — recuperación CRM`, y confirmar
que Jorge puede verla desde el túnel. La clave no se copia a Git, Obsidian, n8n ni
al historial de los agentes.
