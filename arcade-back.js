/* =====================================================================
   TRIGGER HAPPY ARCADE — shared "back to the game menu" controls
   Every game loads this file with:  <script src="../../arcade-back.js"></script>
   Change it here once and every game picks it up.

   Ways to get back to the menu:
     Light gun ... hold A + B, then pull the trigger while pointing OFF the screen
     Keyboard .... hold Esc for 1 second, or press Home
     Gamepad ..... hold Select + Start

   OpenFIRE default mouse mode: Trigger = left click, A = right click, B = middle click.
   ===================================================================== */
(function () {
  var MENU_URL = '../../index.html';
  var EDGE = 0.04;          // how close to a screen edge (fraction of the screen) still counts as "off screen"
  var ESC_HOLD_MS = 1000;

  var done = false;
  function go() {
    if (done) return; done = true;
    flash();
    setTimeout(function () { location.href = MENU_URL; }, 180);
  }

  /* quick white flash so you know the combo worked */
  function flash() {
    try {
      var d = document.createElement('div');
      d.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:.85;z-index:2147483647;pointer-events:none;transition:opacity .18s';
      document.body.appendChild(d);
      requestAnimationFrame(function () { d.style.opacity = '0'; });
    } catch (e) { }
  }

  /* ---------- light gun: A + B held, trigger pulled off screen ---------- */
  var lastX = innerWidth / 2, lastY = innerHeight / 2;
  addEventListener('pointermove', function (e) { lastX = e.clientX; lastY = e.clientY; }, true);
  function offscreen(x, y) {
    var w = innerWidth, h = innerHeight, m = Math.min(w, h) * EDGE;
    return x <= m || y <= m || x >= w - 1 - m || y >= h - 1 - m;
  }
  // Watch the button state on every pointer event. Browsers only send "pointerdown" for the FIRST
  // button pressed; the trigger pulled while A+B are already held arrives as a "pointermove".
  var prevButtons = 0;
  function gunCombo(e) {
    var nb = e.buttons | 0, triggerPulled = (nb & 1) && !(prevButtons & 1);
    prevButtons = nb;
    // bit 1 = trigger (left), bit 2 = A (right), bit 4 = B (middle)
    if (!triggerPulled || (nb & 6) !== 6) return;
    var x = e.clientX != null ? e.clientX : lastX, y = e.clientY != null ? e.clientY : lastY;
    if (!offscreen(x, y)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    go();
  }
  ['pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mouseup'].forEach(function (t) { addEventListener(t, gunCombo, true); });
  addEventListener('contextmenu', function (e) { e.preventDefault(); }, true); // holding A (right click) shouldn't pop a menu

  /* ---------- keyboard: hold Esc 1 s, or Home ---------- */
  var escTimer = null;
  addEventListener('keydown', function (e) {
    if (e.key === 'Home') go();
    if (e.key === 'Escape' && !escTimer && !e.repeat) escTimer = setTimeout(go, ESC_HOLD_MS);
  }, true);
  addEventListener('keyup', function (e) {
    if (e.key === 'Escape' && escTimer) { clearTimeout(escTimer); escTimer = null; }
  }, true);

  /* ---------- gamepad: Select + Start held ---------- */
  (function poll() {
    var ps = navigator.getGamepads ? navigator.getGamepads() : [];
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (p && p.buttons[8] && p.buttons[9] && p.buttons[8].pressed && p.buttons[9].pressed) go();
    }
    requestAnimationFrame(poll);
  })();
})();
