#!/usr/bin/env bash
# Load the mcp-mgba Lua bridge into a running mGBA via macOS Accessibility.
# Uses mGBA's Scripting window > File > "Load recent script" menu, so no
# keystrokes or file dialogs are involved and mGBA need not be frontmost.
# scripts/start-mgba.sh seeds the recent-scripts list before launching mGBA.
#
# Requires: mGBA running with a ROM loaded, and Accessibility permission for
# the terminal app that runs this script.
# Exits 0 once the bridge is listening on 127.0.0.1:$MGBA_PORT (default 8777).
# (Port 8765, mcp-mgba's default, is used by homelab-kb on this machine.)
set -euo pipefail
BRIDGE="${MGBA_BRIDGE:-/Users/cparent/tools/mcp-mgba/lua/bridge-8777.lua}"
PORT="${MGBA_PORT:-8777}"

listening() { lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | grep -q '^mGBA'; }

if listening; then
  echo "Bridge already listening on 127.0.0.1:$PORT"
  exit 0
fi
if ! pgrep -f "mGBA.app/Contents/MacOS/mGBA" >/dev/null; then
  echo "mGBA is not running. Start it with: scripts/start-mgba.sh" >&2
  exit 1
fi

osascript - "$BRIDGE" >/dev/null <<'EOF'
on run argv
  set bridgePath to item 1 of argv
  tell application "System Events" to tell process "mGBA"
    if not (exists window "Scripting") then
      click menu item "Scripting..." of menu "Tools" of menu bar 1
      delay 1.5
    end if
    -- The menu bar shows the Scripting window's menus only while it is the
    -- app's main window.
    perform action "AXRaise" of window "Scripting"
    delay 0.5
    set recentMenu to menu 1 of menu item "Load recent script" of menu "File" of menu bar 1
    if not (exists menu item bridgePath of recentMenu) then
      error "Bridge script is not in mGBA's recent scripts list. Quit mGBA and relaunch with scripts/start-mgba.sh (it seeds the list), or load " & bridgePath & " once via File > Load script."
    end if
    click menu item bridgePath of recentMenu
  end tell
end run
EOF

for _ in $(seq 1 20); do
  if listening; then
    echo "Bridge listening on 127.0.0.1:$PORT"
    exit 0
  fi
  perl -e 'select(undef,undef,undef,0.5)'
done
echo "Bridge did not come up. Check mGBA's Scripting console (Tools > Scripting...)." >&2
exit 1
