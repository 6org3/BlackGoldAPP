#!/bin/sh
set -eu

ROOT=${1:-"$HOME/servicios/vaultwarden"}
SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

umask 077
install -d -m 0700 "$ROOT" "$ROOT/data"
if [ "$SOURCE_DIR" != "$ROOT" ]; then
  install -m 0644 "$SOURCE_DIR/compose.yml" "$ROOT/compose.yml"
fi
if [ ! -f "$ROOT/.env" ]; then
  install -m 0600 "$SOURCE_DIR/.env.example" "$ROOT/.env"
fi
chmod 0600 "$ROOT/.env"

cd "$ROOT"
docker compose pull
docker compose up -d
printf '%s\n' "Vaultwarden disponible solo por loopback en http://127.0.0.1:8222"
printf '%s\n' "Cuando Jorge haya creado su única cuenta, ejecute lock-signups.sh."
