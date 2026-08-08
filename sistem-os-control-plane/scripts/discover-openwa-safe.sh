#!/usr/bin/env bash
# Prints only process names, unit names, image metadata, and environment key names.
set -euo pipefail

printf '%s\n' '--- openwa-env-key-names ---'
docker inspect blackgold-openwa 2>/dev/null | jq -r '.[0].Config.Env[]? | split("=")[0]' | sort

printf '%s\n' '--- openwa-compose-labels ---'
docker inspect blackgold-openwa 2>/dev/null | jq -c '.[0].Config.Labels | with_entries(select(.key | startswith("com.docker.compose")))'

printf '%s\n' '--- channel-processes ---'
ps -eo user=,pid=,comm= 2>/dev/null | grep -Ei 'openclaw|openwa|whatsapp|blackgold.*bridge' || true

printf '%s\n' '--- user-units ---'
systemctl --user list-unit-files --type=service --no-legend --no-pager 2>/dev/null | grep -Ei 'openclaw|openwa|whatsapp|blackgold|bridge' || true
