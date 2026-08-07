#!/usr/bin/env bash
set -euo pipefail

KEY_DIR=${1:-"$HOME/servicios/secure-documents"}
KEY_FILE="$KEY_DIR/recovery-master-key.b64"

if [[ -e "$KEY_FILE" ]]; then
  echo "Ya existe una clave de recuperación; no se reemplaza." >&2
  exit 1
fi

umask 077
install -d -m 0700 "$KEY_DIR"
read -r -s -p "Pega la clave base64 de 32 bytes y presiona Enter: " MASTER_KEY
printf '\n'

node -e '
const key = process.argv[1] ?? "";
if (!/^[A-Za-z0-9+/]{43}=$/.test(key) || Buffer.from(key, "base64").length !== 32) process.exit(1);
' "$MASTER_KEY" || { echo "Clave inválida: no se guardó nada." >&2; exit 1; }

TEMP_FILE=$(mktemp "$KEY_DIR/.recovery-master-key.XXXXXX")
trap 'rm -f "$TEMP_FILE"' EXIT
printf '%s' "$MASTER_KEY" > "$TEMP_FILE"
chmod 0600 "$TEMP_FILE"
mv "$TEMP_FILE" "$KEY_FILE"
trap - EXIT
echo "Clave guardada con permisos 0600."
