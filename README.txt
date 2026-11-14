TRIGGER HAPPY ARCADE
====================
Open index.html (the launcher). Every game lives in games/<name>/index.html.

Back to the menu from any game:
  light gun: hold A + B, then pull the trigger pointing OFF the screen
  keyboard:  hold Esc for 1 second, or press Home
  gamepad:   hold Select + Start
  (all of this lives in arcade-back.js, shared by every game)

Pi 5 kiosk:
  chromium --kiosk --autoplay-policy=no-user-gesture-required file:///home/pi/TriggerHappyArcade/index.html
