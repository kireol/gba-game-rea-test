#!/usr/bin/env bash
# Launch mGBA with a ROM and load the mcp-mgba Lua bridge automatically.
# Usage: scripts/start-mgba.sh [path/to/rom.gba]
# Set NO_BRIDGE=1 to skip loading the bridge.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BRIDGE="${MGBA_BRIDGE:-$HOME/tools/mcp-mgba/lua/bridge-8777.lua}"
QTINI="$HOME/.config/mgba/qt.ini"

# The reference ROM is supplied locally and is never committed. Its file name is
# deliberately not hard-coded here: point at it with $1 or $REFERENCE_ROM, or drop
# any .gba file into rom/.
ROM="${1:-${REFERENCE_ROM:-}}"
if [[ -z "$ROM" ]]; then
  ROM="$(find "$HERE/../rom" -maxdepth 1 -name '*.gba' 2>/dev/null | head -1 || true)"
fi
if [[ -z "$ROM" || ! -f "$ROM" ]]; then
  echo "ROM not found. Pass the path: $0 /path/to/rom.gba" >&2
  exit 1
fi
ROM="$(cd "$(dirname "$ROM")" && pwd)/$(basename "$ROM")"

# Seed mGBA's "Load recent script" list (only safe while mGBA is not running,
# since mGBA rewrites qt.ini on exit).
seed_recent_scripts() {
  mkdir -p "$(dirname "$QTINI")"
  touch "$QTINI"
  python3 -I - "$QTINI" "$BRIDGE" <<'PY'
import sys, re
path, bridge = sys.argv[1], sys.argv[2]
text = open(path).read()
m = re.search(r'^\[recentScripts\]\n((?:\d+=.*\n?)*)', text, re.M)
entries = [l.split('=', 1)[1] for l in m.group(1).splitlines()] if m else []
entries = [bridge] + [e for e in entries if e != bridge]
block = '[recentScripts]\n' + ''.join(f'{i}={e}\n' for i, e in enumerate(entries[:5]))
if m:
    text = text[:m.start()] + block + text[m.end():]
else:
    text = text.rstrip('\n') + ('\n\n' if text.strip() else '') + block
open(path, 'w').write(text)
PY
}

if pgrep -f "mGBA.app/Contents/MacOS/mGBA" >/dev/null; then
  echo "mGBA is already running; reusing it."
else
  seed_recent_scripts
  open -a /Applications/mGBA.app --args "$ROM"
  # Wait for the main window to appear.
  for _ in $(seq 1 30); do
    if osascript -e 'tell application "System Events" to tell process "mGBA" to get name of every window' 2>/dev/null | grep -q "mGBA - "; then
      break
    fi
    perl -e 'select(undef,undef,undef,0.5)'
  done
  perl -e 'select(undef,undef,undef,1.5)'
fi

[[ "${NO_BRIDGE:-0}" == "1" ]] && exit 0
exec "$HERE/load-bridge.sh"
