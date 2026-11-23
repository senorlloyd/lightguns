HOG RUN - fan-made Warthog turret-gunner light gun game (personal, non-commercial)
==================================================================================
Launch it from the TRIGGER HAPPY menu, or open games/hog-run/index.html directly.

PLAY
  Hold the trigger to spin up the chaingun. Watch the heat ring around the crosshair.
  Trigger held OFF-SCREEN = take cover: shields and gun recover faster, but you can't shoot.
  Shoot plasma bolts out of the air (+50) and glowing PLASMA CELLS (big chain-reaction blasts).
  Shoot a Ghost's pilot for an instant kill. Unload on the Blademaster while he raises his
  sword at your hood to STAGGER him. Title screen: PARTY GRUNTS toggle (or press P).
  Back to the menu: the shared arcade controls (A + B + trigger off-screen, hold Esc, Home).

URL OPTIONS (e.g. index.html?scale=0.6)
  ?scale=0.75   render resolution (default 0.75 for the Pi 5; 0.6 if slow, 1 on a PC)
  ?fps=0        hide the FPS counter
  ?music=0.3    music volume 0-1 (default 0.5; 0 = off)

FILES
  index.html, game.js, assets.js (models/textures/sfx/banner packed in), music/ (streamed)
  music: title, level1, boss, victory, gameover in use; level2_upbeat_action,
         level3_cinematic, level4_ethereal_cinematic saved for future levels
  src/   source (main.js) + the optimized models, textures, sound clips and logo.
         To rebuild after editing:  cd src && npm install && ./build.sh

CREDITS (also on the in-game CREDITS screen)
  "Halo Warthog" by pinto36 (CC BY 4.0)
  HALO MEGA Grunt, Ghost, Banshee, Shade, Watchtower, Vulcan Turret by TimoPatton (CC BY-SA 4.0)
  "halo wars banished elite with energy sword" by YeeHawRussell (CC BY 4.0)   - all from sketchfab.com
  Sky, ground & battle-wear (green_metal_rust) textures: Poly Haven (CC0)
  Music (Pixabay): divineawakeningfrequency, AtlasAudio, luis_humanoide, sergepavkinmusic,
                   kulakovka, nastelbom, leberch
Halo is a Microsoft trademark; this is an unaffiliated fan project.
