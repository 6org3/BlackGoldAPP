#!/bin/sh
set -eu

ROOT=${1:-"$HOME/servicios/vaultwarden"}
SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

umask 077
install -d -m 0700 "$ROOT" "$ROOT/data" "$ROOT/certs"
if [ "$SOURCE_DIR" != "$ROOT" ]; then
  install -m 0644 "$SOURCE_DIR/compose.yml" "$ROOT/compose.yml"
fi
if [ ! -f "$ROOT/.env" ]; then
  install -m 0600 "$SOURCE_DIR/.env.example" "$ROOT/.env"
fi
chmod 0600 "$ROOT/.env"
if [ ! -f "$ROOT/certs/localhost.crt" ] || [ ! -f "$ROOT/certs/localhost.key" ]; then
  openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 3650 \
    -keyout "$ROOT/certs/localhost.key" \
    -out "$ROOT/certs/localhost.crt" \
    -subj '/CN=localhost' \
    -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'
  chmod 0600 "$ROOT/certs/localhost.key"
  chmod 0644 "$ROOT/certs/localhost.crt"
fi

cd "$ROOT"
docker compose pull
docker compose up -d
printf '%s\n' "Vaultwarden disponible solo por loopback en http://127.0.0.1:8222"
printf '%s\n' "Cuando Jorge haya creado su única cuenta, ejecute lock-signups.sh."
