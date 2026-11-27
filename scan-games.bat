@echo off
REM TRIGGER HAPPY ARCADE - double-click after adding a game folder on Windows
cd /d "%~dp0"
python tools\scan-games.py || py tools\scan-games.py
pause
