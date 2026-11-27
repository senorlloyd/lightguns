#!/bin/bash
# TRIGGER HAPPY ARCADE - start script for the Pi 5
# Scans games/ for new folders, then opens the arcade full screen.
# First time only:  chmod +x start-arcade.sh
cd "$(dirname "$0")" || exit 1
python3 tools/scan-games.py
BROWSER=$(command -v chromium || command -v chromium-browser)
exec "$BROWSER" --kiosk --autoplay-policy=no-user-gesture-required --noerrdialogs --disable-infobars \
  "file://$PWD/index.html"
