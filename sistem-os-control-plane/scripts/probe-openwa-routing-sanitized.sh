#!/usr/bin/env bash
# Reads the bridge route map in memory and emits only the approved route classes.
set -euo pipefail

pid="$(systemctl --user show blackgold-openwa-bridge.service -p MainPID --value 2>/dev/null || true)"
if [[ ! "$pid" =~ ^[1-9][0-9]*$ ]] || [[ ! -r "/proc/${pid}/environ" ]]; then
  printf '%s\n' '{"schema_version":"openwa-routing-evidence.v1","probe_state":"bridge-unavailable"}'
  exit 2
fi

tr '\0' '\n' < "/proc/${pid}/environ" | sed -n 's/^OPENWA_SESSION_MAP=//p' | node -e '
  const chunks = [];
  process.stdin.on("data", (chunk) => chunks.push(chunk));
  process.stdin.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8").trim();
    let map = {};
    let mapFormat = raw ? "unrecognized" : "absent";
    try {
      map = JSON.parse(raw);
      if (map && typeof map === "object" && !Array.isArray(map)) mapFormat = "json-object";
      else map = {};
    } catch {}
    const classify = (value) => {
      const candidate = JSON.stringify(value).toLowerCase();
      if (/(blackgold-lily|lilith|lily|127\.0\.0\.1:19789)/.test(candidate)) return "lily-isolated";
      if (/(^|[^a-z])main([^a-z]|$)/.test(candidate)) return "main";
      return "unknown";
    };
    if (mapFormat !== "json-object" && /(?:^|[,;])\s*(club|personal)\s*[=:]/i.test(raw)) {
      mapFormat = "delimited-key-value";
      for (const match of raw.matchAll(/(?:^|[,;])\s*(club|personal)\s*[=:]\s*([^,;]+)/gi)) {
        map[match[1].toLowerCase()] = match[2];
      }
    }
    const discoveredRoutes = {};
    const visit = (value) => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        const normalizedKey = key.toLowerCase();
        if ((normalizedKey === "club" || normalizedKey === "personal") && !Object.hasOwn(discoveredRoutes, normalizedKey)) {
          discoveredRoutes[normalizedKey] = classify(child);
        }
        visit(child);
      }
    };
    visit(map);
    const routeKeyPresent = Object.fromEntries(["club", "personal"].map((key) => [key, Object.hasOwn(discoveredRoutes, key)]));
    const routes = Object.fromEntries(["club", "personal"].map((key) => [key, discoveredRoutes[key] ?? "unknown"]));
    const coexistence = routes.club !== "unknown" && routes.personal !== "unknown" && routes.club === routes.personal ? "yes" : "unknown";
    const normalized = JSON.stringify(map).toLowerCase();
    const knownMarkers = Object.fromEntries(["club", "personal", "direccion", "main", "lily", "lilith", "19789"].map((marker) => [marker, normalized.includes(marker)]));
    process.stdout.write(`${JSON.stringify({schema_version: "openwa-routing-evidence.v1", map_format: mapFormat, route_key_present: routeKeyPresent, known_markers_present: knownMarkers, routes, same_gateway_target: coexistence})}\n`);
  });
'
