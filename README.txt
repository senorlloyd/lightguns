TRIGGER HAPPY ARCADE
====================
Open index.html (the launcher). Every game lives in games/<name>/index.html.

Back to the menu from any game:
  light gun: hold A + B, then pull the trigger pointing OFF the screen
  keyboard:  hold Esc for 1 second, or press Home
  gamepad:   hold Select + Start
  (all of this lives in arcade-back.js, shared by every game)

Adding a new game (no code changes needed):
  1. Make a folder in games/ with the game's index.html in it, e.g. games/zombie-ranch/index.html
  2. Optional extras in that folder:
       thumb.png     card art, 16:9 looks best (thumb.jpg / .jpeg / .webp work too)
       preview.mp4   short gameplay clip used as the demo (preview.webm works too)
       game.json     details for the card, for example:
         {"title": "Zombie Ranch", "genre": "Farm Defense", "blurb": "Keep them out of the barn.",
          "players": [1, 2], "colors": ["#7dff4a", "#ff3b6b"]}
       Without game.json the title comes from the folder name (zombie-ranch -> Zombie Ranch).
       game.json also works for the built-in games, and "hidden": true takes a game off the menu.
  3. Run the scan so the menu picks it up:
       Pi:       ./start-arcade.sh does it every time the arcade starts
       Windows:  double-click scan-games.bat
  4. Add  <script src="../../arcade-back.js"></script>  just before </body> in the game's index.html
     so the A+B off-screen shot returns to the menu.

Pi 5 kiosk:
  ./start-arcade.sh        (first time only: chmod +x start-arcade.sh)
  It scans games/ and opens the arcade full screen.
