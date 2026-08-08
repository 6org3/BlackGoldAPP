#!/usr/bin/env bash
# Emits user-service state and environment key names only; it never prints values.
set -euo pipefail

for unit in blackgold-openwa-bridge.service openclaw-gateway.service openclaw-gateway-lily-public-shadow.service; do
  printf '%s\n' "--- ${unit} ---"
  systemctl --user show "$unit" --no-pager \
    -p Id -p LoadState -p ActiveState -p SubState -p MainPID -p FragmentPath -p EnvironmentFiles 2>/dev/null || true
  pid="$(systemctl --user show "$unit" -p MainPID --value 2>/dev/null || true)"
  if [[ "$pid" =~ ^[1-9][0-9]*$ ]] && [[ -r "/proc/${pid}/environ" ]]; then
    printf '%s\n' 'process_identity:'
    printf 'exe='; readlink "/proc/${pid}/exe" 2>/dev/null || printf 'unavailable'
    printf 'cwd='; readlink "/proc/${pid}/cwd" 2>/dev/null || printf 'unavailable'
    printf '%s\n' 'environment_key_names:'
    tr '\0' '\n' < "/proc/${pid}/environ" | cut -d '=' -f 1 | sort
  fi
done

printf '%s\n' '--- openwa-http-without-credential ---'
printf 'http_status='; curl --max-time 3 --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:2785/ || true
printf '\n'
