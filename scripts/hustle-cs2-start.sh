#!/usr/bin/env bash
set -euo pipefail

CS2_BIN="/opt/cs2/game/bin/linuxsteamrt64/cs2"
STEAMCLIENT_SRC="/opt/steamcmd/linux64/steamclient.so"
STEAMCLIENT_DST="/home/steam/.steam/sdk64/steamclient.so"
RUNTIME_CFG="/opt/cs2/game/csgo/cfg/hustle_runtime_secrets.cfg"

if [ ! -x "$CS2_BIN" ]; then
  echo "CS2 binary not found at $CS2_BIN. Finish SteamCMD install first." >&2
  exit 1
fi

if [ -f "$STEAMCLIENT_SRC" ] && [ ! -f "$STEAMCLIENT_DST" ]; then
  mkdir -p "$(dirname "$STEAMCLIENT_DST")"
  cp "$STEAMCLIENT_SRC" "$STEAMCLIENT_DST"
fi

if [ -z "${CS2_GSLT:-}" ] || [ "$CS2_GSLT" = "replace_with_steam_game_server_login_token" ]; then
  echo "CS2_GSLT is not configured in /etc/hustle-arena/cs2.env" >&2
  exit 1
fi

export LD_LIBRARY_PATH="/opt/cs2/game/bin/linuxsteamrt64:/opt/cs2/game/csgo/bin/linuxsteamrt64:${LD_LIBRARY_PATH:-}"

umask 077
cat >"$RUNTIME_CFG" <<EOF
hostname "${CS2_HOSTNAME:-Hustle Arena}"
sv_setsteamaccount "${CS2_GSLT}"
sv_password "${CS2_SERVER_PASSWORD:-}"
rcon_password "${CS2_RCON_PASSWORD:-}"
EOF

exec "$CS2_BIN" \
  -dedicated \
  -console \
  -usercon \
  -port "${CS2_PORT:-27015}" \
  +map "${CS2_DEFAULT_MAP:-de_dust2}" \
  +exec hustle_runtime_secrets.cfg \
  +exec server_hustle_arena.cfg
