#!/usr/bin/env bash
# Emits deployment evidence only. It never prints environment values, logs, prompts,
# phone numbers, tokens, contact data, session IDs, or Docker command arguments.
set -euo pipefail

container="${1:-blackgold-openwa}"

if ! command -v docker >/dev/null 2>&1; then
  printf '%s\n' '{"schema_version":"openwa-deployment-evidence.v1","probe_state":"docker-unavailable"}'
  exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
  printf '%s\n' '{"schema_version":"openwa-deployment-evidence.v1","probe_state":"jq-unavailable"}'
  exit 2
fi

docker inspect "$container" 2>/dev/null | jq -ce '
  def env_names: [.Config.Env[]? | split("=")[0]];
  def whitelisted_number_class:
    ([.Config.Env[]? | select(startswith("WA_NUMBER_CLASSIFICATION=")) | split("=")[1]] | first // "unknown")
    | if . == "official" or . == "secondary" then . else "unknown" end;
  def host_bindings:
    (.NetworkSettings.Ports // {}) | to_entries
    | map({container_port: .key, host_bindings: ((.value // []) | map({host_ip: .HostIp, host_port: .HostPort}))});
  .[0] | {
    schema_version: "openwa-deployment-evidence.v1",
    container: (.Name | ltrimstr("/")),
    image: .Config.Image,
    image_channel: (if (.Config.Image | test("(alpha|v5)"; "i")) then "alpha-or-v5" else "non-alpha-or-v5" end),
    number_classification: whitelisted_number_class,
    api_key_present: (env_names | any(test("(api.*key|token|authorization|auth)"; "i"))),
    number_config_present: (env_names | any(test("(phone|number|wa_.*number)"; "i"))),
    crm_config_present: (env_names | any(test("(supabase|crm)"; "i"))),
    auto_outbound_config_signal: (env_names | any(test("(auto|outbound|send)"; "i"))),
    configured_user: (.Config.User // "image-default"),
    privileged: .HostConfig.Privileged,
    readonly_rootfs: .HostConfig.ReadonlyRootfs,
    network_mode: .HostConfig.NetworkMode,
    cap_add: (.HostConfig.CapAdd // []),
    cap_drop: (.HostConfig.CapDrop // []),
    memory_bytes: .HostConfig.Memory,
    pids_limit: .HostConfig.PidsLimit,
    port_bindings: host_bindings,
    mounts: [.Mounts[]? | {type: .Type, source: .Source, destination: .Destination, read_write: .RW}]
  }
'
