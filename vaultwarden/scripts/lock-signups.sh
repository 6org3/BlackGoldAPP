#!/bin/sh
set -eu

ROOT=${1:-"$HOME/servicios/vaultwarden"}
ENV_FILE="$ROOT/.env"

test -f "$ENV_FILE"
sed -i 's/^SIGNUPS_ALLOWED=.*/SIGNUPS_ALLOWED=false/' "$ENV_FILE"
chmod 0600 "$ENV_FILE"
cd "$ROOT"
docker compose up -d
printf '%s\n' "Registros de Vaultwarden desactivados."
