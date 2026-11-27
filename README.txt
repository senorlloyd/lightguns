HOG RUN - fan-made Warthog turret-gunner light gun game (personal, non-commercial)
==================================================================================
Launch it from the TRIGGER HAPPY menu, or open games/hog-run/index.html directly.

LEVELS (pick on the title screen; winning Level 1 offers NEXT LEVEL)
  1 RINGWORLD HILLS - Grunts, Ghosts, Banshees, Shades, Watchtowers; boss: Blademaster
  2 DESERT CANYON   - adds shielded Jackals (shoot them when they swing the shield aside to
                      fire, or break the shield); boss: Wraith - shoot its mortar shells out of
                      the air, and hit the glowing mortar vent right after it fires (x3 damage)
  The Jackal model lives in local/models.js (kept out of git). Without it, Level 2 uses
  shield-carrying Grunts instead.
  3 FROZEN PASS     - a snowy mountain pass with its own original enemies: six-legged
                      crawlers, hover drones, armored sleds and frost turrets.
                      Shoot the ICICLES hanging from rock ledges to crush whatever is
                      underneath. BLIZZARDS roll in and cut visibility for a few seconds.
                      On the FROZEN LAKE, shoot the spreading cracks under the sleds to
                      drop them through the ice. Boss: the AVALANCHE ENGINE, a giant
                      mining crawler - shoot its boulders down, and hit its side
                      radiators while they glow after each throw.
                      Snow, ice, rock and sky textures are generated for the game.
                      Enemy models (CC BY 4.0): "Spider Robot" by muhmdhsn313, "Buster
                      Drone" by lavadragon, "Velocity 90" by f3nix, "Combat Turret" by danila_.

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
  ?level=2      start on a level

LEVEL 4 - NIGHT SWAMP
  A night run along a causeway through black water. Your Warthog has headlights.
  - FLARE PODS: glowing orange pods hanging from vines. Shoot one and it pops
    into a slow-falling flare that lights the area for about 10 seconds.
  - SWAMPLERS: toothy swamp beasts that hop between banks, lunge at you and spit
    acid. Some are camouflaged (a faint cyan shimmer) until a flare lights them up
    or they get close. Head shots do double damage.
  - LEAPERS: armored eel machines that jump out of the water and fire at the top
    of the arc. The head is the weak spot.
  - BOSS - MIRE SERPENT: surfaces beside the road, spits acid globs (shoot them
    down) and fires bursts. The three glowing green sacs on its back take triple
    damage; the head takes extra; body armor takes very little. Below half health
    it gets faster and calls in leapers.
  Swamplers: "Swampler" by Jeepster, concept by Katarzyna Zalecka, for Ancient
  Beast (AncientBeast.com), CC-BY-SA 3.0.
  The serpent's body is "Monster03" by LostBoyz2078 (CC BY-NC 4.0).

LEVEL 5 - STORM COAST (final level)
  A cliff road in a thunderstorm, sea far below on the left. Something huge is
  in the water. Tentacles sweep the road - shoot the glowing tips to drive them off.
  At the outlook the camera moves into the gunner's seat for the final fight.
  BOSS - THE TIDEFATHER (body: "Deep monstrosity" by Vasian-Digital3D, CC BY 4.0), 4 phases:
    1. Four tentacles slam the outlook. Shoot each glowing tip while it winds up.
    2. It rises. Burst the three pink gill sacs (they launch drones). Shoot boulders.
    3. It moves closer. When it opens its maw and charges, pour fire into the glowing
       core to stagger it - or take a big beam hit.
    4. Last stand: claws on the cliff, everything at once. Shoot its six eyes and the core.
  Health cells and turret crates keep dropping during the fight.

TURRETS
  Shoot a floating weapon crate (three per level, plus one before every boss) to swap the
  Warthog's minigun for another turret until its ammo runs out:
  - GAUSS CANNON: hold the trigger to charge (~0.5 s); fires one rail shot that pierces every
    enemy on the line and strips shields. 14 shots.
  - ROCKET POD: slower (~1.6 rockets/s) but each one explodes, hitting groups, vehicles and
    shells/boulders in the air. 24 rockets.
  - FLAMETHROWER: continuous close-range cone (about 25 m, dashed ring on the crosshair),
    sets enemies burning and burns down shields. 12 seconds of fuel.
  You can load your own turret models in the MODELS screen (GAUSS / ROCKET / FLAME TURRET).

CUSTOM MODELS
  Title screen > MODELS lets you swap any enemy for a .glb file of your own
  (Grunt, Level 1 boss, Jackal, Ghost, Banshee, Shade turret, Watchtower).
  - Pick a slot, LOAD .GLB..., then TURN 90 until the model faces the yellow arrow.
    STAND UPRIGHT tips it over if it comes in lying down; SMALLER/BIGGER fine-tune size.
  - It is auto-sized to the built-in model (blue outline), centred and set on the ground.
    Walkers are auto-rigged from their shape, so a model standing in a T or A pose
    with legs apart works best. A Jackal with a Mixamo skeleton keeps its own rig.
  - Ghost/Banshee/Shade/Watchtower keep their own textures (no Covenant shader).
  - USE BUILT-IN puts the original back. DONE reloads the game with your changes.
  - Files are stored in this browser's storage on that machine only (not in the folder),
    so load them once on the Pi itself. Clearing the browser's site data removes them.

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
  Sky & ground textures: Poly Haven (CC0)
  Ghost, Grunt/Elite voice and explosion sound effects: fan-made clips supplied by the owner
  Music (Pixabay): divineawakeningfrequency, AtlasAudio, luis_humanoide, sergepavkinmusic,
                   kulakovka, nastelbom, leberch
Halo is a Microsoft trademark; this is an unaffiliated fan project.

TWO WAYS TO PLAY
  index.html  The campaign: START plays Level 1 to 5 in order, no skipping.
              Score carries over between levels. Die in Levels 2-5 and you get
              a 10 second CONTINUE countdown (3 continues per level) that
              restarts the level you're on. Die in Level 1, run out of
              continues or let the countdown run out = GAME OVER, back to Level 1.
              Progress lasts until you close the browser tab.
  admin.html  Pick any level, MODELS screen, PLAY AGAIN - for testing.

MUSIC (all metal now)
  Title: title_metal (mrclaps)        Level 1: level1_metal (alec_koff)
  Level 2: heavy_metal                Level 3: level3_metal (nickpanek)
  Level 4: level4_metal (nickpanek)   Level 5: level5_metal (strawberry_candy)
  Bosses: boss_metal

BOSS MODELS (Nov 2026 swap)
  Level 1  THORNBACK      "Forest Monster Beetle" by ArachnoBoy - CC BY-NC 4.0
  Level 3  THE AVALANCHE  "Monsters 02" by LostBoyz2078 - CC BY 4.0 (shoot the glowing chest crystals)
  Level 4  MIRE SERPENT   "Monster03" by LostBoyz2078 - CC BY-NC 4.0
  Level 5  THE TIDEFATHER "Deep monstrosity" by Vasian-Digital3D - CC BY 4.0
  The NC (non-commercial) ones are fine for personal use; swap them out before
  sharing or selling the game.
