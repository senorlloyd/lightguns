TRIGGER HAPPY ARCADE
====================
Open index.html (the launcher). Every game lives in games/<name>/index.html.

Back to the menu from any game:
  hold Esc for 1 second, press Home, or hold Select+Start on a gamepad.

Pi 5 kiosk:
  chromium --kiosk --autoplay-policy=no-user-gesture-required file:///home/pi/TriggerHappyArcade/index.html

STILL NEEDED (files too big for Claude to pull from the artifacts):
  games/galagun/index.html            <- GalaGun artifact (replaces the placeholder)
  games/twin-comet/index.html         <- Twin Comet artifact (replaces the placeholder)
  games/hold-the-gate/audio/calm-irish-arthouse.mp3
  games/hold-the-gate/audio/calm-monastic-drone.mp3
  games/hold-the-gate/audio/danger-polka-madness.mp3
  games/pinata-panic/music/gameplay-1.mp3
  games/bean-blastin-benny/audio/level_4.mp3

NOT FOUND AS ARTIFACTS (hidden in the menu until added):
  SplatterStrike, Bubble Battle, Goose Hunt, Glass Factory, Carnival Games
  Put each game's index.html in its folder, then delete  hidden:true  from its line in GAMES in index.html.
  If you add GalaGun / Twin Comet from a downloaded file, add the back-to-menu script too:
  copy the <script> block that starts "TRIGGER HAPPY ARCADE: hold Esc" from the end of any other game's index.html
  and paste it just before </body>.
