#!/usr/bin/env bash
set -euo pipefail

failures=0

check_file() {
  local label="$1"
  local path="$2"
  if [ -e "$path" ]; then
    echo "ok: $label"
  else
    echo "missing: $label ($path)"
    failures=$((failures + 1))
  fi
}

check_command() {
  local label="$1"
  local command_name="$2"
  if command -v "$command_name" >/dev/null 2>&1; then
    echo "ok: $label"
  else
    echo "missing: $label ($command_name)"
    failures=$((failures + 1))
  fi
}

check_env_value() {
  local file="$1"
  local key="$2"
  local placeholder="$3"
  local value
  value="$(sudo grep -E "^${key}=" "$file" | tail -1 | cut -d= -f2- || true)"
  value="${value%\"}"
  value="${value#\"}"
  if [ -z "$value" ] || [ "$value" = "$placeholder" ]; then
    echo "missing: $key in $file"
    failures=$((failures + 1))
  else
    echo "ok: $key in $file"
  fi
}

check_command "node" node
check_command "docker" docker
check_command "gcloud" gcloud

check_file "CS2 binary" /opt/cs2/game/bin/linuxsteamrt64/cs2
check_file "SteamCMD" /opt/steamcmd/steamcmd.sh
check_file "steamclient 64-bit" /home/steam/.steam/sdk64/steamclient.so
check_file "steamclient 32-bit" /home/steam/.steam/sdk32/steamclient.so
check_file "CS2 start script" /usr/local/bin/hustle-cs2-start
check_file "worker script" /opt/hustle-arena-worker/worker.js
check_file "CS2 env" /etc/hustle-arena/cs2.env
check_file "worker env" /etc/hustle-arena/worker.env

node --check /opt/hustle-arena-worker/worker.js >/dev/null
echo "ok: worker JavaScript syntax"

check_env_value /etc/hustle-arena/cs2.env CS2_GSLT replace_with_steam_game_server_login_token
check_env_value /etc/hustle-arena/worker.env SUPABASE_SERVICE_ROLE_KEY replace_with_service_role_key

if systemctl list-unit-files hustle-cs2.service >/dev/null 2>&1; then
  echo "ok: hustle-cs2.service installed"
else
  echo "missing: hustle-cs2.service"
  failures=$((failures + 1))
fi

if systemctl list-unit-files hustle-worker.service >/dev/null 2>&1; then
  echo "ok: hustle-worker.service installed"
else
  echo "missing: hustle-worker.service"
  failures=$((failures + 1))
fi

if [ "$failures" -gt 0 ]; then
  echo "not ready: $failures blocker(s)"
  exit 1
fi

echo "ready: VM prerequisites are complete"
