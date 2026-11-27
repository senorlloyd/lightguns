// HOG RUN — fan-made Warthog turret-gunner light gun rail shooter (personal, non-commercial use)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { toCreasedNormals, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as CUSTOM from './custom.js';

// ---------------------------------------------------------------- settings
const Q = new URLSearchParams(location.search);
const RENDER_SCALE = parseFloat(Q.get('scale') || '0.75'); // 0.75 for the Pi, ?scale=1 on a PC
const SHOW_FPS = Q.get('fps') !== '0';
const DEBUG = Q.get('debug');
// ---------------------------------------------------------------- levels
const LEVELS = {
  1: { name: 'RINGWORLD HILLS', horizon: 0xa3acbd, fog: [110, 620], hemi: [0xcfe4ff, 0x4f5a36, 1.15], sunCol: 0xffe2bd, sunI: 2.75, sunPos: [-210, 310, -150], exposure: 1.1,
       tex: { ground: 'grass', road: 'road', rock: 'rock', sky: 'sky' }, groundTint: [0.78, 1.08, 0.62], mtn: 0x7f8ea6, props: 'forest', canyon: false,
       track: (i) => V(Math.sin(i * 0.52) * 110 + Math.sin(i * 1.27) * 45, 0, i * 68), relief: 80, music: 'level1_metal', boss: 'THORNBACK' },
  2: { name: 'DESERT CANYON', horizon: 0xc9b9a0, fog: [90, 520], hemi: [0xc6d8f0, 0x9a6a46, 1.35], sunCol: 0xffc890, sunI: 3.0, sunPos: [-330, 175, -150], exposure: 1.18,
       tex: { ground: 'desert_sand', road: 'desert_road', rock: 'desert_rock', sky: 'desert_sky' }, groundTint: [1.5, 1.28, 1.08], mtn: 0xb98a6e, props: 'desert', canyon: true,
       track: (i) => V(Math.sin(i * 0.7 + 1) * 85 + Math.sin(i * 1.9) * 28, 0, i * 68), relief: 26, music: 'heavy_metal', boss: 'WRAITH' },
  3: { name: 'FROZEN PASS', horizon: 0xc9d3df, fog: [80, 470], hemi: [0xe4eefa, 0x8d9bb0, 1.45], sunCol: 0xffe8d6, sunI: 2.3, sunPos: [-330, 150, -110], exposure: 1.02,
       tex: { ground: 'snow', road: 'snow_road', rock: 'snow_rock', sky: 'snow_sky' }, groundTint: [0.98, 1.0, 1.04], mtn: 0xdfe6ef, props: 'snow', canyon: false, pass: true, ring: false, snow: true,
       lake: [0.5, 0.62], track: (i) => V(Math.sin(i * 0.6 + 2) * 95 + Math.sin(i * 1.5) * 35, 0, i * 68), relief: 55, music: 'level3_metal', boss: 'THE AVALANCHE' },
  4: { name: 'NIGHT SWAMP', horizon: 0x0b141b, fog: [30, 290], hemi: [0x5c7ab0, 0x18240f, 0.7], sunCol: 0xa9c6ff, sunI: 1.1, sunPos: [180, 230, 160], exposure: 1.0,
       tex: { ground: 'swamp_mud', road: 'swamp_road', rock: 'swamp_rock', sky: 'swamp_sky' }, groundTint: [0.9, 1.0, 0.95], mtn: 0x0e171b, props: 'swamp', canyon: false, swamp: true, ring: false,
       track: (i) => V(Math.sin(i * 0.8 + 3) * 70 + Math.sin(i * 2.1) * 25, 0, i * 68), relief: 5, music: 'level4_metal', boss: 'MIRE SERPENT' },
  5: { name: 'STORM COAST', horizon: 0x2c3540, fog: [70, 560], hemi: [0x9fb2c8, 0x2a2e2a, 0.95], sunCol: 0xc0cee0, sunI: 1.3, sunPos: [-220, 260, -140], exposure: 1.0,
       tex: { ground: 'coast_ground', road: 'road', rock: 'rock', sky: 'storm_sky' }, groundTint: [0.85, 0.9, 0.9], mtn: 0x2a3138, props: 'coast', canyon: false, coast: true, ring: false,
       track: (i) => V(Math.sin(i * 0.5 + 1) * 70 + Math.sin(i * 1.3) * 22, 0, i * 68), relief: 30, music: 'level5_metal', boss: 'THE TIDEFATHER' },
};
// admin.html sets window.HOG_ADMIN: free level select + MODELS screen. index.html is the campaign: levels in order, no skipping.
const ADMIN = !!window.HOG_ADMIN;
const CAMP_KEY = 'hogrun_campaign', CONTINUES = 3;
const camp = (() => { try { return JSON.parse(sessionStorage.getItem(CAMP_KEY)) || null; } catch (e) { return null; } })();
function campURL() { const u = new URL(location.href); u.searchParams.delete('level'); u.searchParams.delete('autostart'); return u.toString(); }
function goLevel(c) { saveCamp(c); try { sessionStorage.setItem(CAMP_KEY + '_go', '1'); } catch (e) {} location.href = campURL(); }
function saveCamp(c) { try { if (c) sessionStorage.setItem(CAMP_KEY, JSON.stringify(c)); else sessionStorage.removeItem(CAMP_KEY); } catch (e) {} }
const LEVEL = ADMIN ? (LEVELS[+Q.get('level')] ? +Q.get('level') : 1) : (camp && LEVELS[camp.level] ? camp.level : 1);
const LV = LEVELS[LEVEL];
function gotoLevel(n) { const u = new URL(location.href); u.searchParams.set('level', n); u.searchParams.set('autostart', '1'); location.href = u.toString(); }
const RUN_SPEED = 13;          // m/s along the track
const FIRE_RATE = 15;          // rounds / sec
const SPIN_TIME = 0.55;       // matches the sped-up spin-up sample        // barrel spin-up
const HEAT_PER_SHOT = 0.0135;  // ~5 s of continuous fire to overheat
const COOL_RATE = 0.5;         // heat lost per second while not firing
const SHIELD_MAX = 100, HEALTH_MAX = 100, SHIELD_DELAY = 3, SHIELD_RATE = 45;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _v1 = V(), _v2 = V(), _v3 = V();

// ---------------------------------------------------------------- renderer
const glCanvas = document.getElementById('gl');
const hud = document.getElementById('hud');
const hx = hud.getContext('2d');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = LV.exposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const HORIZON = new THREE.Color(LV.horizon);
scene.fog = new THREE.Fog(HORIZON, LV.fog[0], LV.fog[1]);
const camera = new THREE.PerspectiveCamera(56, 16 / 9, 0.3, 9000);
let W = 0, H = 0;
function resize() {
  W = innerWidth; H = innerHeight;
  renderer.setSize(Math.round(W * RENDER_SCALE), Math.round(H * RENDER_SCALE), false);
  hud.width = W; hud.height = H;
  camera.aspect = W / H; camera.updateProjectionMatrix();
  const uScale = (H * RENDER_SCALE) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  for (const p of particleSystems) p.mat.uniforms.uScale.value = uScale;
}

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const hemiL = new THREE.HemisphereLight(...LV.hemi); scene.add(hemiL);
const sun = new THREE.DirectionalLight(LV.sunCol, LV.sunI);
sun.position.set(...LV.sunPos); // matches the sun in each level's sky photo
// one dynamic light, always present (so shaders never recompile): flares at the muzzle and at explosions
const flashLight = new THREE.PointLight(0xffb060, 0, 55, 1.7); scene.add(flashLight); let flashI = 0;
function lightFlash(p, color, power) { if (power >= flashI * 0.6) { flashLight.position.copy(p); flashLight.color.set(color); flashI = Math.max(flashI, power); } }
// soft vignette as a CSS overlay (no per-frame cost)
{ const vg = document.createElement('div'); vg.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1;background:radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,8,20,.38) 100%)'; document.body.appendChild(vg); }
scene.add(sun);

// ---------------------------------------------------------------- noise / terrain height
function hash(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, o = 4) { let s = 0, a = 1, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }
const baseH = (x, z) => (fbm(x * 0.0035 + 11, z * 0.0035 - 7) - 0.5) * LV.relief + (fbm(x * 0.018, z * 0.018, 3) - 0.5) * (LV.canyon ? 4 : 9);

// ---------------------------------------------------------------- the track
const STEP = 2;
const ctrl = [];
for (let i = 0; i < 19; i++) ctrl.push(LV.track(i));
const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
const TRACK_LEN = curve.getLength();
const NS = Math.floor(TRACK_LEN / STEP);
const PP = curve.getSpacedPoints(NS);       // samples every ~2 m
let roadH = PP.map(p => baseH(p.x, p.z));
for (let pass = 0; pass < 6; pass++) {       // smooth the road profile
  roadH = roadH.map((_, i) => { let s = 0, n = 0; for (let k = -18; k <= 18; k++) { const j = clamp(i + k, 0, NS); s += roadH[j]; n++; } return s / n; });
}
if (LV.swamp) roadH = roadH.map((_, i) => 0.5 + Math.sin(i * 0.013) * 0.4);
if (LV.coast) roadH = roadH.map((h, i) => 34 + (i / NS) * 22 + h * 0.25);   // coast road: climbs steadily to the outlook, high above the sea   // swamp causeway: nearly flat, always above the water
PP.forEach((p, i) => p.y = roadH[i]);
// frozen lake (level 3): a flat stretch of road across the ice, as a fraction of the run before the boss arena
const LAKE = LV.lake ? [Math.round((TRACK_LEN - 70) * LV.lake[0] / STEP), Math.round((TRACK_LEN - 70) * LV.lake[1] / STEP)] : null;
let LAKE_Y = 0;
if (LAKE) {
  LAKE_Y = Math.min(...roadH.slice(LAKE[0], LAKE[1] + 1)) - 0.6;
  for (let i = 0; i <= NS; i++) { const w = smooth(LAKE[0] - 35, LAKE[0], i) * (1 - smooth(LAKE[1], LAKE[1] + 35, i)); roadH[i] = lerp(roadH[i], LAKE_Y, w); }
  PP.forEach((p, i) => p.y = roadH[i]);
}
const lakeW = (i) => LAKE ? smooth(LAKE[0] - 8, LAKE[0] + 4, i) * (1 - smooth(LAKE[1] - 4, LAKE[1] + 8, i)) : 0;
function nearest(x, z) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i <= NS; i += 6) { const dx = PP[i].x - x, dz = PP[i].z - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = i; } }
  for (let i = Math.max(0, bi - 6); i <= Math.min(NS, bi + 6); i++) { const dx = PP[i].x - x, dz = PP[i].z - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = i; } }
  return [bi, Math.sqrt(bd)];
}
function groundH(x, z) {
  const [i, d] = nearest(x, z);
  const t = smooth(6, 42, d);
  let h = lerp(roadH[i], baseH(x, z), t);
  if (LV.canyon) {   // sheer canyon walls with a terrace, edges wobble so they look eroded
    const e = d + (fbm(x * 0.02 + 5, z * 0.02) - 0.5) * 22;
    h += 46 * smooth(30, 44, e) + 22 * smooth(78, 92, e) + Math.max(0, e - 100) * 0.1;
  } else if (LV.swamp) {   // swamp: the road is a low causeway; the land beside it sinks under black water, with islands
    const isl = fbm(x * 0.018 + 4, z * 0.018 - 2), bed = -2.6 + (fbm(x * 0.05, z * 0.05, 3) - 0.5) * 1.6;
    h = lerp(roadH[i], bed, smooth(13, 24, d)) + Math.max(0, isl - 0.55) * 16 * smooth(14, 30, d) + Math.min(18, Math.max(0, d - 160) * 0.12);
  } else if (LV.coast) {   // cliff coast: sea far below on the left (and dead ahead past the outlook), rising headlands on the right
    const j = Math.min(i, NS - 1), dx = PP[j + 1].x - PP[j].x, dz = PP[j + 1].z - PP[j].z, dl = Math.hypot(dx, dz) || 1;
    const lat = ((x - PP[i].x) * -dz + (z - PP[i].z) * dx) / dl;
    let sea = -lat;
    if (i >= NS - 40) { const ax = PP[NS].x - PP[NS - 4].x, az = PP[NS].z - PP[NS - 4].z, al = Math.hypot(ax, az) || 1; sea = Math.max(sea, ((x - PP[NS].x) * ax + (z - PP[NS].z) * az) / al + 50); }
    const e = sea + (fbm(x * 0.03 + 3, z * 0.03 - 5) - 0.5) * 12;
    if (sea > 0) {
      const endD = Math.hypot(x - PP[NS].x, z - PP[NS].z);
      const stack = Math.max(0, fbm(x * 0.012 + 7, z * 0.012 + 1) - 0.62) * 260 * smooth(70, 110, e) * smooth(280, 340, endD);
      h = lerp(roadH[i] + (fbm(x * 0.05, z * 0.05, 3) - 0.5) * 1.5 * smooth(7, 12, e), -22 + Math.min(stack, roadH[i] * 0.8), smooth(13, 20, e));
    } else {
      const land = roadH[i] + Math.min(95, Math.max(0, lat - 14) * 0.55) + (fbm(x * 0.02, z * 0.02, 3) - 0.5) * 8 * smooth(10, 30, lat);
      h = lerp(roadH[i], land, smooth(7, 16, lat));
    }
  } else if (LV.pass) {   // mountain pass: steep snowy slopes climbing away from the road
    const e = d + (fbm(x * 0.015 + 9, z * 0.015) - 0.5) * 26;
    h += Math.min(85, Math.max(0, e - 32) * 0.5) + Math.max(0, e - 120) * 0.25;
  } else h += Math.min(28, Math.max(0, d - 55) * 0.16);
  if (LAKE) { const lw = lakeW(i) * (1 - smooth(48, 72, d)); if (lw > 0) h = lerp(h, LAKE_Y - 0.5, lw); }
  return h;
}
function trackAt(s, out = V()) { // position on the track at distance s
  const f = clamp(s / STEP, 0, NS - 0.001), i = Math.floor(f);
  return out.copy(PP[i]).lerp(PP[i + 1], f - i);
}
function trackDir(s, out = V()) {
  const i = clamp(Math.floor(s / STEP), 0, NS - 3);
  return out.copy(PP[i + 3]).sub(PP[i]).setY(0).normalize();
}
const UP = V(0, 1, 0);
function trackSide(s, out = V()) { return trackDir(s, out).cross(UP).normalize(); } // screen-right when facing along the track
function groundPoint(s, side) { const p = trackAt(s), r = trackSide(s); p.addScaledVector(r, side); p.y = groundH(p.x, p.z); return p; }

// ---------------------------------------------------------------- world building
function canvasTex(size, draw, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}
function buildWorld() {
  // sky dome: Poly Haven photo sky (equirectangular)
  const skyTex = TEX[LV.tex.sky]; skyTex.wrapS = THREE.ClampToEdgeWrapping; skyTex.anisotropy = 1;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(7000, 48, 24), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false }));
  sky.scale.x = -1; sky.renderOrder = -10; skyGroup.add(sky);

  // the ring arcing across the sky
  const ringTex = canvasTex(1024, (g, s) => {
    g.fillStyle = '#c9d3d8'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * s;
      g.fillStyle = ['#5f8a4f', '#4c7a8e', '#86a36a', '#e8eef0', '#3f6f9a'][i % 5];
      g.fillRect(x, s * 0.18, rand(10, 60), s * 0.64);
    }
    g.fillStyle = '#9aa7ae'; g.fillRect(0, 0, s, s * 0.16); g.fillRect(0, s * 0.84, s, s * 0.16);
  });
  ringTex.repeat.set(6, 1);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(5200, 5200, 650, 160, 1, true, 0, Math.PI * 2),
    new THREE.MeshBasicMaterial({ map: ringTex, side: THREE.DoubleSide, fog: false, transparent: true, opacity: 0.78, depthWrite: false }));
  ring.rotation.set(Math.PI / 2 - 0.75, 0, 0.32);
  ring.position.set(-700, -1700, 5600);
  ring.renderOrder = -9; if (LV.ring !== false) skyGroup.add(ring);

  // distant mountains (unfogged haze silhouettes)
  const mGeo = new THREE.ConeGeometry(1, 1, 5, 1); mGeo.translate(0, 0.5, 0);
  const mMat = new THREE.MeshBasicMaterial({ color: LV.mtn, fog: false });
  const mtn = new THREE.InstancedMesh(mGeo, mMat, 60); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 + rand(-0.04, 0.04), r = rand(1500, 1900);
    m4.compose(V(Math.cos(a) * r, -120, Math.sin(a) * r), q.setFromAxisAngle(UP, rand(0, 6)), V(rand(260, 520), rand(180, 420), rand(260, 520)));
    mtn.setMatrixAt(i, m4); mtn.setColorAt(i, new THREE.Color(LV.mtn).offsetHSL(0, 0, rand(-0.06, 0.03)));
  }
  mtn.renderOrder = -8; skyGroup.add(mtn);

  // terrain
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of PP) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  minX -= 650; maxX += 650; minZ -= 650; maxZ += 650;
  const sx = maxX - minX, sz = maxZ - minZ;
  const segX = Math.min(180, Math.round(sx / 9)), segZ = Math.min(270, Math.round(sz / 9));
  const tg = new THREE.PlaneGeometry(sx, sz, segX, segZ); tg.rotateX(-Math.PI / 2);
  tg.translate(minX + sx / 2, 0, minZ + sz / 2);
  const pos = tg.attributes.position, col = new Float32Array(pos.count * 3), dist = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, groundH(x, z)); dist[i] = nearest(x, z)[1];
  }
  tg.computeVertexNormals();
  const nrm = tg.attributes.normal, blend = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    // tint breaks up texture tiling: big soft light/dark + slightly yellower patches
    const n1 = fbm(x * 0.012, z * 0.012, 3), n2 = fbm(x * 0.05 + 30, z * 0.05, 2);
    const br = 0.78 + n1 * 0.45;
    col[i * 3] = br * (1.0 + (n2 - 0.5) * 0.25); col[i * 3 + 1] = br; col[i * 3 + 2] = br * (0.92 - (n2 - 0.5) * 0.2);
    if (LV.canyon) {   // sandstone strata bands up the canyon walls
      const y = pos.getY(i), band = 0.82 + 0.18 * Math.sin(y * 0.55 + fbm(x * 0.01, z * 0.01) * 4) + 0.08 * Math.sin(y * 2.1);
      col[i * 3] *= band * 1.04; col[i * 3 + 1] *= band * 0.97; col[i * 3 + 2] *= band * 0.92;
    }
    blend[i * 2] = LV.pass ? smooth(0.62, 0.42, nrm.getY(i)) * 0.8 : smooth(0.88, 0.7, nrm.getY(i));          // rock on steep slopes (snow clings longer in the pass)
    blend[i * 2 + 1] = smooth(13, 5, dist[i]) * 0.9;          // gravel near the road
  }
  tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tg.setAttribute('blend', new THREE.BufferAttribute(blend, 2));
  const tmat = new THREE.MeshLambertMaterial({ vertexColors: true });
  tmat.onBeforeCompile = sh => {
    sh.uniforms.grassMap = { value: TEX[LV.tex.ground] }; sh.uniforms.rockMap = { value: TEX[LV.tex.rock] }; sh.uniforms.roadMap = { value: TEX[LV.tex.road] }; sh.uniforms.gTint = { value: V(...LV.groundTint) };
    sh.vertexShader = 'attribute vec2 blend; varying vec2 vBlend; varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vBlend = blend; vWP = position;');
    sh.fragmentShader = 'uniform sampler2D grassMap, rockMap, roadMap; uniform vec3 gTint; varying vec2 vBlend; varying vec3 vWP;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      vec3 c = texture2D(grassMap, vWP.xz * 0.12).rgb * gTint;   // ground photo, tinted per level
      if (vBlend.y > 0.01) c = mix(c, texture2D(roadMap, vWP.xz * 0.2).rgb, vBlend.y);
      if (vBlend.x > 0.01) c = mix(c, texture2D(rockMap, vec2(vWP.x + vWP.z, vWP.y) * 0.09).rgb, vBlend.x);
      diffuseColor.rgb *= c * 1.15;`);
  };
  const terrain = new THREE.Mesh(tg, tmat);
  scene.add(terrain);

  // dirt road ribbon
  const rp = [], ruv = [], ri = [];
  for (let i = 0; i <= NS; i++) {
    const s = i * STEP, side = trackSide(s);
    for (const k of [-1, 1]) { const p = PP[i].clone().addScaledVector(side, k * 4.2); p.y = groundH(p.x, p.z) + 0.12; rp.push(p.x, p.y, p.z); ruv.push(k < 0 ? 0 : 1, s / 7); }
    if (i < NS) { const a = i * 2; ri.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2)); rg.setIndex(ri); rg.computeVertexNormals();
  const roadTex = canvasTex(512, (g, s) => {
    g.drawImage(TEX[LV.tex.road + '_img'], 0, 0, s, s);
    g.fillStyle = 'rgba(50,38,26,.32)'; g.fillRect(s * 0.2, 0, s * 0.13, s); g.fillRect(s * 0.67, 0, s * 0.13, s);
    const gr = g.createLinearGradient(0, 0, s, 0); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.12, 'rgba(0,0,0,0)'); gr.addColorStop(0.88, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = gr; g.fillRect(0, 0, s, s);
  });
  roadTex.repeat.set(1, 1);
  const road = new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ map: roadTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  scene.add(road);

  // trees + rocks (instanced: one draw call each)
  if (LV.props === 'desert') { buildDesertProps(minX, maxX, minZ, maxZ, m4, q); return; }
  if (LV.props === 'snow') { buildSnowProps(minX, maxX, minZ, maxZ, m4, q); return; }
  if (LV.props === 'swamp') { buildSwampProps(minX, maxX, minZ, maxZ, m4, q); return; }
  if (LV.props === 'coast') { buildCoastProps(minX, maxX, minZ, maxZ, m4, q); return; }
  // ---- trees: 3 instanced species, jagged tiers, baked shading, wind sway, ground shadows
  const treeMats = [];
  const swayMat = (opts) => {
    const m = new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true, flatShading: true }, opts));
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = windTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = instanceMatrix[3].xyz; float h = max(position.y - 2.5, 0.0);
        float w = sin(uTime * 1.4 + ip.x * 0.07 + ip.z * 0.05) + 0.4 * sin(uTime * 3.1 + ip.z * 0.11);
        transformed.x += w * h * 0.018; transformed.z += w * h * 0.010;`);
    };
    treeMats.push(m); return m;
  };
  const shadeVerts = (g, base, top, y0, y1, under = 0.55, smoothN = false) => {   // bottom/inside darker, tips lighter, undersides darkest
    g = g.toNonIndexed(); if (!smoothN) g.computeVertexNormals();
    const P = g.attributes.position, N = g.attributes.normal, col = new Float32Array(P.count * 3), c = new THREE.Color(), cb = new THREE.Color(base), ct = new THREE.Color(top);
    for (let i = 0; i < P.count; i++) {
      const t = clamp((P.getY(i) - y0) / (y1 - y0), 0, 1), r = Math.hypot(P.getX(i), P.getZ(i));
      c.copy(cb).lerp(ct, t * 0.75 + Math.min(1, r / 2.6) * 0.25);
      if (N.getY(i) < -0.2) c.multiplyScalar(under);
      c.multiplyScalar(rand(0.9, 1.08)); col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
  };
  const jag = (g, amt, keepTop) => { const P = g.attributes.position; for (let i = 0; i < P.count; i++) { if (keepTop && P.getY(i) >= keepTop - 0.01) continue; P.setXYZ(i, P.getX(i) + rand(-amt, amt), P.getY(i) - rand(0, amt * 1.4), P.getZ(i) + rand(-amt, amt)); } return g; };
  const tierStack = (tiers, r0, r1, h, y0, gap) => {
    const parts = [];
    for (let i = 0; i < tiers; i++) {
      const f = i / Math.max(1, tiers - 1), r = lerp(r0, r1, f), y = y0 + i * gap;
      const cg = new THREE.ConeGeometry(r, h * lerp(1, 0.8, f), 8, 1, true); cg.translate(0, y + h / 2, 0);
      cg.rotateY(rand(0, 6)); jag(cg, 0.28 * r / r0, y + h * lerp(1, 0.8, f)); parts.push(cg);
    }
    return mergeGeo(parts);
  };
  const pineG = shadeVerts(tierStack(4, 2.5, 1.0, 4.6, 2.4, 2.1), 0x1f3d1c, 0x6fae4f, 2.4, 13);
  const firG = shadeVerts(tierStack(3, 3.1, 1.7, 4.2, 1.2, 1.6), 0x22421d, 0x79b356, 1.2, 9);
  // broadleaf: several soft, lumpy leaf clumps (smooth-shaded) on a forked trunk
  const clump = (r, x, y, z) => {
    let g = new THREE.IcosahedronGeometry(r, 1); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
    const P = g.attributes.position, v = V();
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); const n = v.clone().normalize(); v.addScaledVector(n, rand(-0.12, 0.2) * r); P.setXYZ(i, v.x, v.y * 0.78, v.z); }
    g.translate(x, y, z); g.computeVertexNormals(); return g;
  };
  const crown = [clump(2.0, 0, 6.1, 0), clump(1.6, 1.5, 5.4, 0.5), clump(1.55, -1.4, 5.5, -0.4), clump(1.5, 0.3, 5.2, -1.5), clump(1.45, -0.4, 5.3, 1.5), clump(1.5, 0.2, 7.3, 0.2)];
  const crownG = shadeVerts(mergeGeo(crown), 0x33602a, 0xb8dc78, 3.6, 8.6, 0.72, true);
  const br = []; for (const [ax, az] of [[0.55, 0.3], [-0.5, -0.25], [0.1, -0.6]]) { const c = new THREE.CylinderGeometry(0.1, 0.2, 2.4, 5, 1, true); c.translate(0, 1.2, 0); c.rotateZ(-ax); c.rotateX(az); c.translate(0, 3.3, 0); br.push(c); }
  const branchG = shadeVerts(mergeGeo(br), 0x3b2a1d, 0x6a5038, 3, 5.6, 1);
  const blobG = mergeColored([crownG, branchG]);
  const trunkG = shadeVerts(new THREE.CylinderGeometry(0.22, 0.42, 4.6, 6, 1, true).translate(0, 2.3, 0), 0x3b2a1d, 0x6a5038, 0, 4.6, 1);
  const species = [
    { g: pineG, w: 0.5, s: [0.8, 1.45] }, { g: firG, w: 0.3, s: [0.8, 1.25] }, { g: blobG, w: 0.2, s: [0.8, 1.25], smooth: true },
  ];
  const N_TREES = 850;
  const sp = species.map(o => ({ ...o, mesh: new THREE.InstancedMesh(o.g, swayMat(o.smooth ? { flatShading: false } : {}), N_TREES), n: 0 }));
  const trunks = new THREE.InstancedMesh(trunkG, swayMat({}), N_TREES);
  const shadowTex = canvasTex(64, (g, s2) => { const gr = g.createRadialGradient(s2 / 2, s2 / 2, 2, s2 / 2, s2 / 2, s2 / 2); gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(0.6, 'rgba(0,0,0,.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s2, s2); });
  const shG = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const shadows = new THREE.InstancedMesh(shG, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), N_TREES);
  let n = 0; const qN = new THREE.Quaternion(), nrmV = V();
  for (let tries = 0; n < N_TREES && tries < 20000; tries++) {
    const x = rand(minX + 500, maxX - 500), z = rand(minZ + 500, maxZ - 500);
    const d = nearest(x, z)[1];
    if (d < 13 || d > 240 || fbm(x * 0.01 + 50, z * 0.01) < 0.46) continue;
    let k = Math.random(), si = 0; while (k > species[si].w && si < species.length - 1) { k -= species[si].w; si++; }
    const o = sp[si], sc = rand(...o.s), gy = groundH(x, z);
    m4.compose(V(x, gy - 0.3, z), q.setFromAxisAngle(UP, rand(0, 6)), V(sc, sc * rand(0.85, 1.25), sc));
    o.mesh.setMatrixAt(o.n, m4); o.mesh.setColorAt(o.n, new THREE.Color(1, 1, 1).offsetHSL(rand(-0.025, 0.025), 0, rand(-0.07, 0.05)));
    o.n++;
    trunks.setMatrixAt(n, m4);
    // soft shadow tilted to the slope
    nrmV.set(groundH(x - 1, z) - groundH(x + 1, z), 2, groundH(x, z - 1) - groundH(x, z + 1)).normalize();
    m4.compose(V(x, gy + 0.08, z), qN.setFromUnitVectors(UP, nrmV), V(7 * sc, 1, 7 * sc)); shadows.setMatrixAt(n, m4);
    n++;
  }
  for (const o of sp) { o.mesh.count = o.n; scene.add(o.mesh); }
  trunks.count = shadows.count = n; scene.add(trunks, shadows);
  const rockG = new THREE.DodecahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(rockG, new THREE.MeshLambertMaterial({ map: TEX.rock, color: 0xcfcfcf, flatShading: true }), 260);
  for (let i = 0; i < 260; i++) {
    let x, z, d; do { x = rand(minX + 500, maxX - 500); z = rand(minZ + 500, maxZ - 500); d = nearest(x, z)[1]; } while (d < 9 || d > 200);
    const s = rand(0.6, 4.5);
    m4.compose(V(x, groundH(x, z), z), q.setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), 0)), V(s * rand(0.8, 1.6), s * 0.6, s));
    rocks.setMatrixAt(i, m4);
  }
  scene.add(rocks);
}
// desert: sandstone boulders, hoodoo rock stacks, dry scrub (all instanced)
// ---- level 3 scenery: snowy pines, frosted boulders, the ice sheet over the lake
let ICE = null;
function buildSnowProps(minX, maxX, minZ, maxZ, m4, q) {
  const tint = (g, c) => { g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count, a = new Float32Array(n * 3), cc = new THREE.Color(c); for (let i = 0; i < n; i++) cc.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; };
  // pine: dark tiers with a snow cap on each
  const parts = [tint(new THREE.CylinderGeometry(0.18, 0.28, 2, 6).translate(0, 1, 0), 0x4a3526)];
  for (let k = 0; k < 4; k++) {
    const y = 1.4 + k * 1.55, r = 2.3 - k * 0.48;
    parts.push(tint(new THREE.ConeGeometry(r, 2.6, 8).translate(0, y + 1.3, 0), 0x1f3b2c));
    parts.push(tint(new THREE.ConeGeometry(r * 0.78, 1.5, 8).translate(0, y + 2.05, 0), 0xf1f6fb));
  }
  const pineGeo = mergeColored(parts); pineGeo.computeVertexNormals();
  const pines = new THREE.InstancedMesh(pineGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 900);
  let n = 0;
  for (let tries = 0; tries < 9000 && n < 900; tries++) {
    const x = rand(minX, maxX), z = rand(minZ, maxZ), [i, d] = nearest(x, z);
    if (d < 13 || d > 330 || (LAKE && lakeW(i) > 0.05 && d < 78)) continue;
    const y = groundH(x, z); if (Math.abs(groundH(x + 3, z) - y) > 4.5) continue;   // not on cliffs
    const sc = rand(0.8, 1.8); m4.compose(V(x, y - 0.2, z), q.setFromAxisAngle(UP, rand(0, 6)), V(sc, sc * rand(0.9, 1.25), sc));
    pines.setMatrixAt(n++, m4);
  }
  pines.count = n; scene.add(pines);
  // frosted boulders: rock below, snow on top
  const bg = new THREE.IcosahedronGeometry(1, 1).toNonIndexed(); const bp = bg.attributes.position, bc = new Float32Array(bp.count * 3);
  for (let i = 0; i < bp.count; i++) { const v = V(bp.getX(i), bp.getY(i), bp.getZ(i)); v.multiplyScalar(1 + (fbm(v.x * 3 + 5, v.z * 3 + v.y) - 0.5) * 0.5); bp.setXYZ(i, v.x, v.y * 0.7, v.z); }
  bg.computeVertexNormals();
  for (let i = 0; i < bp.count; i++) { const up = bg.attributes.normal.getY(i); (up > 0.45 ? C(0xeef3f8) : C(0x5d6470)).toArray(bc, i * 3); }
  bg.setAttribute('color', new THREE.BufferAttribute(bc, 3)); bg.deleteAttribute('uv');
  const rocks = new THREE.InstancedMesh(bg, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 260); n = 0;
  for (let tries = 0; tries < 4000 && n < 260; tries++) {
    const x = rand(minX, maxX), z = rand(minZ, maxZ), [i, d] = nearest(x, z);
    if (d < 9 || d > 260 || (LAKE && lakeW(i) > 0.05 && d < 75)) continue;
    const sc = rand(0.8, 3.6); m4.compose(V(x, groundH(x, z) + sc * 0.15, z), q.setFromAxisAngle(UP, rand(0, 6)), V(sc * rand(0.8, 1.4), sc, sc * rand(0.8, 1.4)));
    rocks.setMatrixAt(n++, m4);
  }
  rocks.count = n; scene.add(rocks);
  // ice sheet over the lake: one wide ribbon following the road
  if (!LAKE) return;
  const iceTex = canvasTex(512, (g, sz) => {
    g.fillStyle = '#b9dcee'; g.fillRect(0, 0, sz, sz);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '235,248,255' : '120,170,205'},${rand(0.04, 0.12)})`; g.beginPath(); g.ellipse(rand(0, sz), rand(0, sz), rand(10, 70), rand(4, 30), rand(0, 3), 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(245,252,255,.55)'; g.lineWidth = 1.2;
    for (let i = 0; i < 28; i++) { let x = rand(0, sz), y = rand(0, sz); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += rand(-40, 40); y += rand(-40, 40); g.lineTo(x, y); } g.stroke(); }
  }, 1);
  const ip = [], iuv = [], ii = []; const i0 = LAKE[0] - 10, i1 = LAKE[1] + 10; let row = 0;
  for (let i = i0; i <= i1; i++) {
    const sd = trackSide(i * STEP), w = 70 * Math.sin(clamp((i - i0) / (i1 - i0), 0, 1) * Math.PI) ** 0.35;
    for (const k of [-1, 1]) { const pt = PP[i].clone().addScaledVector(sd, k * w); ip.push(pt.x, LAKE_Y + 0.05, pt.z); iuv.push(k * w / 24, i * STEP / 24); }
    if (i < i1) { const a = row * 2; ii.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } row++;
  }
  const ig = new THREE.BufferGeometry(); ig.setAttribute('position', new THREE.Float32BufferAttribute(ip, 3)); ig.setAttribute('uv', new THREE.Float32BufferAttribute(iuv, 2)); ig.setIndex(ii); ig.computeVertexNormals();
  ICE = new THREE.Mesh(ig, new THREE.MeshStandardMaterial({ map: iceTex, roughness: 0.12, metalness: 0.08, color: 0xe6f6ff, polygonOffset: true, polygonOffsetFactor: -1 }));
  scene.add(ICE);
}
function buildDesertProps(minX, maxX, minZ, maxZ, m4, q) {
  const rockMat = new THREE.MeshLambertMaterial({ map: TEX.desert_rock, color: 0xf0d2b8, flatShading: true });
  const boulders = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rockMat, 420);
  let n = 0;
  for (let tries = 0; n < 420 && tries < 20000; tries++) {
    const x = rand(minX + 500, maxX - 500), z = rand(minZ + 500, maxZ - 500), d = nearest(x, z)[1];
    if (d < 10 || d > 220) continue;
    const sc = d < 40 ? rand(0.5, 2.4) : rand(1.5, 6);
    m4.compose(V(x, groundH(x, z) - sc * 0.2, z), q.setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), 0)), V(sc * rand(0.8, 1.7), sc * rand(0.5, 0.9), sc));
    boulders.setMatrixAt(n++, m4);
  }
  boulders.count = n; scene.add(boulders);
  // hoodoos: stacked, tapering rock drums on the canyon floor
  const parts = []; let y = 0;
  for (let i = 0; i < 4; i++) { const r = 1.6 - i * 0.28, h = rand(2.2, 3.2); const c = new THREE.CylinderGeometry(r * 0.85, r, h, 7, 1); c.translate(0, y + h / 2, 0); parts.push(c); y += h * 0.95; }
  const cap = new THREE.CylinderGeometry(1.5, 0.7, 1.0, 7, 1); cap.translate(0, y + 0.5, 0); parts.push(cap);
  const hoodoos = new THREE.InstancedMesh(mergeGeo(parts), rockMat, 90);
  n = 0;
  for (let tries = 0; n < 90 && tries < 8000; tries++) {
    const x = rand(minX + 500, maxX - 500), z = rand(minZ + 500, maxZ - 500), d = nearest(x, z)[1];
    if (d < 14 || d > 34) continue;
    const sc = rand(0.7, 1.4);
    m4.compose(V(x, groundH(x, z) - 0.5, z), q.setFromAxisAngle(UP, rand(0, 6)), V(sc, sc * rand(0.8, 1.4), sc)); hoodoos.setMatrixAt(n++, m4);
  }
  hoodoos.count = n; scene.add(hoodoos);
  // dry scrub
  const scrubParts = []; for (let i = 0; i < 4; i++) { const g = new THREE.IcosahedronGeometry(rand(0.5, 0.8), 0); g.translate(rand(-0.5, 0.5), rand(0.3, 0.6), rand(-0.5, 0.5)); scrubParts.push(g); }
  const scrub = new THREE.InstancedMesh(mergeGeo(scrubParts), new THREE.MeshLambertMaterial({ color: 0x8a8a52, flatShading: true }), 500);
  n = 0;
  for (let tries = 0; n < 500 && tries < 12000; tries++) {
    const x = rand(minX + 500, maxX - 500), z = rand(minZ + 500, maxZ - 500), d = nearest(x, z)[1];
    if (d < 6 || d > 40) continue;
    const sc = rand(0.6, 1.5);
    m4.compose(V(x, groundH(x, z), z), q.setFromAxisAngle(UP, rand(0, 6)), V(sc, sc * rand(0.6, 1), sc)); scrub.setMatrixAt(n, m4);
    scrub.setColorAt(n++, new THREE.Color(0x8a8a52).offsetHSL(rand(-0.04, 0.04), rand(-0.1, 0.05), rand(-0.08, 0.06)));
  }
  scrub.count = n; scene.add(scrub);
}
function mergeColored(list) {   // like mergeGeo but keeps vertex colors
  const pos = [], nor = [], col = [];
  for (const g of list) { pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); col.push(...g.attributes.color.array); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return out;
}
function mergeGeo(list) {
  const pos = [], nor = [];
  for (let g of list) { g = g.toNonIndexed(); pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return out;
}
const skyGroup = new THREE.Group(); scene.add(skyGroup);
const windTime = { value: 0 };

// ---------------------------------------------------------------- particles (one draw call per system)
const particleSystems = [];
class Particles {
  constructor(max, additive = true) {
    this.max = max; this.list = [];
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rgba', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 500 } },
      vertexShader: 'attribute float size; attribute vec4 rgba; varying vec4 vC; uniform float uScale; void main(){ vC=rgba; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=min(400.,size*uScale/max(.1,-mv.z)); gl_Position=projectionMatrix*mv; }',
      fragmentShader: additive
        ? 'varying vec4 vC; void main(){ float r=length(gl_PointCoord-.5)*2.; float a=1.-smoothstep(0.,1.,r); a*=a; gl_FragColor=vec4(vC.rgb*a*vC.a,1.); }'
        : 'varying vec4 vC; void main(){ float r=length(gl_PointCoord-.5)*2.; float a=1.-smoothstep(.3,1.,r); gl_FragColor=vec4(vC.rgb,a*vC.a); }'
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.geo = g;
    scene.add(this.points); particleSystems.push(this);
  }
  spawn(p, vel, life, s0, s1, color, a = 1, drag = 0, grav = 0) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ x: p.x, y: p.y, z: p.z, vx: vel.x, vy: vel.y, vz: vel.z, life, t: 0, s0, s1, r: color.r, g: color.g, b: color.b, a, drag, grav });
  }
  update(dt) {
    let n = 0; const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) { const p = L[i]; p.t += dt; if (p.t >= p.life) { L[i] = L[L.length - 1]; L.pop(); } }
    for (const p of L) {
      const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy = p.vy * k - p.grav * dt; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const f = p.t / p.life;
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      this.col[n * 4] = p.r; this.col[n * 4 + 1] = p.g; this.col[n * 4 + 2] = p.b; this.col[n * 4 + 3] = p.a * (1 - f);
      this.size[n] = lerp(p.s0, p.s1, f); n++;
    }
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'rgba', 'size']) this.geo.attributes[k].needsUpdate = true;
  }
}
const fx = new Particles(1800, true);     // sparks, flashes, plasma, fire
const smoke = new Particles(500, false);  // smoke, dust, confetti
const C = (h) => new THREE.Color(h);
const COL = { muzzle: C(0xffc860), spark: C(0xffd890), plasma: C(0x5fb6ff), plasmaPink: C(0xff6fd8), fire: C(0xff7a20), green: C(0x8cff6a), blue: C(0x8fd0ff), smoke: C(0x555555), dust: C(0x9b8a6a), white: C(0xffffff), cyan: C(0x4fe8ff), cyanHot: C(0xb8fbff) };
function burst(p, n, speed, life, s0, s1, color, a = 1, drag = 2, grav = 0, sys = fx) {
  for (let i = 0; i < n; i++) { _v1.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.3, 1)); sys.spawn(p, _v1, life * rand(0.6, 1.2), s0, s1, color, a, drag, grav); }
}
function explosion(at, size = 1, quiet) {
  const p = at.clone();
  burst(p, 30 * size, 14 * size, 0.55, 3 * size, 7 * size, COL.fire, 1, 3);
  burst(p, 20 * size, 9 * size, 0.3, 5 * size, 2 * size, COL.white, 1, 4);
  burst(p, 40, 22 * size, 0.9, 0.4, 0.1, COL.spark, 1, 1.5, 14);
  burst(p, 18 * size, 5 * size, 2.2, 3 * size, 9 * size, COL.smoke, 0.55, 1.2, -2.5, smoke);
  addDebris(p, 10 * size, size);
  shake = Math.max(shake, 0.35 * size); if (!quiet) sfx.boom(size);
  lightFlash(p, 0xff9a40, 1400 * size);
}
const confettiCols = [0xff4d6d, 0xffd23f, 0x3bceac, 0x6a4cff, 0xff8c42, 0x4cc9f0].map(C);
function confetti(at) {
  const p = at.clone();
  for (let i = 0; i < 70; i++) { _v1.set(rand(-1, 1), rand(0.4, 1.6), rand(-1, 1)).multiplyScalar(rand(4, 11)); smoke.spawn(p, _v1, rand(1.2, 2.2), 0.35, 0.3, confettiCols[i % 6], 1, 1.8, 6); }
  burst(p, 12, 6, 0.4, 1.5, 3, COL.white, 1, 3);
}

// tracer lines (one draw call)
const MAX_TR = 48;
const trPos = new Float32Array(MAX_TR * 6), trCol = new Float32Array(MAX_TR * 6), tracers = [];
const trGeo = new THREE.BufferGeometry();
trGeo.setAttribute('position', new THREE.BufferAttribute(trPos, 3).setUsage(THREE.DynamicDrawUsage));
trGeo.setAttribute('color', new THREE.BufferAttribute(trCol, 3).setUsage(THREE.DynamicDrawUsage));
const trLines = new THREE.LineSegments(trGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
trLines.frustumCulled = false; scene.add(trLines);
function updateTracers(dt) {
  let n = 0;
  for (let i = tracers.length - 1; i >= 0; i--) { tracers[i].t += dt; if (tracers[i].t > 0.07) tracers.splice(i, 1); }
  for (const t of tracers.slice(-MAX_TR)) {
    const k = 1 - t.t / 0.07; const a = t.a, b = t.b;
    // draw a short streak travelling from muzzle to target
    const f0 = clamp(t.t / 0.05, 0, 1), f1 = clamp(f0 + 0.35, 0, 1);
    trPos.set([lerp(a.x, b.x, f0), lerp(a.y, b.y, f0), lerp(a.z, b.z, f0), lerp(a.x, b.x, f1), lerp(a.y, b.y, f1), lerp(a.z, b.z, f1)], n * 6);
    trCol.set([1 * k, 0.75 * k, 0.35 * k, 1 * k, 0.95 * k, 0.7 * k], n * 6); n++;
  }
  trGeo.setDrawRange(0, n * 2); trGeo.attributes.position.needsUpdate = trGeo.attributes.color.needsUpdate = true;
}

// debris chunks (instanced)
const DEB = 140;
const debMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), DEB);
debMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); debMesh.frustumCulled = false; scene.add(debMesh);
const debris = []; const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const debCols = [0x3a2a52, 0x6b4a8f, 0x2c2c32, 0x8f7ab0].map(C);
function addDebris(p, n, size) {
  for (let i = 0; i < n; i++) {
    if (debris.length >= DEB) debris.shift();
    debris.push({ p: p.clone(), v: V(rand(-1, 1), rand(0.5, 1.6), rand(-1, 1)).multiplyScalar(rand(6, 16) * size), r: V(rand(0, 6), rand(0, 6), rand(0, 6)), w: V(rand(-9, 9), rand(-9, 9), rand(-9, 9)), s: rand(0.15, 0.6) * size, t: 0, c: debCols[i % 4] });
  }
}
function updateDebris(dt) {
  let n = 0;
  for (let i = debris.length - 1; i >= 0; i--) { if ((debris[i].t += dt) > 3) debris.splice(i, 1); }
  for (const d of debris) {
    d.v.y -= 22 * dt; d.p.addScaledVector(d.v, dt); d.r.addScaledVector(d.w, dt);
    const gy = groundH(d.p.x, d.p.z); if (d.p.y < gy + d.s * 0.5) { d.p.y = gy + d.s * 0.5; d.v.multiplyScalar(0.4); d.v.y = Math.abs(d.v.y) * 0.3; d.w.multiplyScalar(0.5); }
    const s = d.s * (d.t > 2.4 ? (3 - d.t) / 0.6 : 1);
    _m4.compose(d.p, _q.setFromEuler(_e.set(d.r.x, d.r.y, d.r.z)), _v1.set(s, s, s));
    debMesh.setMatrixAt(n, _m4); debMesh.setColorAt(n, d.c); n++;
  }
  debMesh.count = n; debMesh.instanceMatrix.needsUpdate = true; if (debMesh.instanceColor) debMesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------- audio (synthesized placeholders)
const sfx = (() => {
  let ac = null, master, noise, eng = null;
  const buf = {};
  let gunMode = 'idle', fireLoop = null, spinSrc = null, boomCount = 0, hum = null, voices = 0, tauntT = 0, screamT = 0;
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0.6; master.connect(ac.destination);
    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (const [k, b64] of Object.entries(window.HOG_AUDIO || {})) {
      ac.decodeAudioData(b64ToBuf(b64)).then(b => { buf[k] = b; if (k === 'hog_loop') eng = loop('hog_loop', 0); if (k === 'ghost_hum') hum = loop('ghost_hum', 0); });
    }
  }
  let flameN = null, windN = null, drillN = null, rumbleN = null, shotT = 0, crackT = 0;
  function play(name, vol = 1, rate = 1) {
    if (!ac || !buf[name]) return null; const s = ac.createBufferSource(); s.buffer = buf[name]; s.playbackRate.value = rate;
    const g = ac.createGain(); g.gain.value = vol; s.connect(g).connect(master); s.start(); return { s, g };
  }
  function loop(name, vol = 1, rate = 1) {
    if (!ac || !buf[name]) return null; const s = ac.createBufferSource(); s.buffer = buf[name]; s.loop = true; s.playbackRate.value = rate;
    const g = ac.createGain(); g.gain.setValueAtTime(0, ac.currentTime); g.gain.linearRampToValueAtTime(vol, ac.currentTime + 0.03);
    s.connect(g).connect(master); s.start(0, Math.random() * buf[name].duration * 0.5); return { s, g };
  }
  function stop(n, fade = 0.05) { if (!n) return; const t = ac.currentTime; n.g.gain.cancelScheduledValues(t); n.g.gain.setValueAtTime(n.g.gain.value, t); n.g.gain.linearRampToValueAtTime(0, t + fade); n.s.stop(t + fade + 0.02); }
  function nz(dur, f0, f1, vol, type = 'lowpass', q = 1) {
    if (!ac) return; const t = ac.currentTime, s = ac.createBufferSource(); s.buffer = noise;
    const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur);
  }
  function tone(dur, f0, f1, vol, type = 'sine') {
    if (!ac) return; const t = ac.currentTime, o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur);
  }
  return {
    init, loaded: () => Object.keys(buf).join(',') + (eng ? ' +engine' : ''), mode: () => gunMode,
    gaussCharge() { if (buf.gauss_charge) play('gauss_charge', 0.8, 1.25); else { tone(0.55, 180, 1400, 0.12, 'sawtooth'); tone(0.55, 360, 2800, 0.05, 'sine'); } },
    gaussFire() { if (buf.gauss_fire) play('gauss_fire', 0.95, rand(0.95, 1.05)); else { nz(0.5, 6000, 200, 0.7, 'bandpass', 0.8); tone(0.35, 900, 60, 0.45, 'square'); } },
    rocketLaunch() { if (buf.rocket_launch) play('rocket_launch', 0.75, rand(0.9, 1.15)); else { nz(0.45, 3000, 300, 0.35, 'bandpass', 1.5); tone(0.25, 220, 90, 0.15, 'triangle'); } },
    flameTick() { if (!buf.flame_loop) nz(0.14, 900, 400, 0.18, 'lowpass', 0.7); },
    flame(on) {   // ignition burst, then a held loop while the trigger is down
      if (!ac || !buf.flame_loop) return;
      if (on && !flameN) { play('flame_start', 0.7); flameN = loop('flame_loop', 0.6); }
      else if (!on && flameN) { stop(flameN, 0.25); flameN = null; }
    },
    cannon(d = 0) { if (buf.cannon) play('cannon', 0.8 * (d ? this.near(d) : 1), rand(0.92, 1.05)); else this.boom(0.5); },
    pickup() { tone(0.12, 600, 900, 0.18, 'square'); setTimeout(() => tone(0.18, 900, 1500, 0.15, 'square'), 90); },
    // minigun: spin-up -> firing loop -> wind-down, driven by the trigger state every frame
    gunState(trigger, firing) {
      if (!ac) return;
      if (trigger && gunMode === 'idle') { spinSrc = play('gun_spinup', 0.8, 1.45); gunMode = 'spinup'; }
      if (firing && gunMode !== 'fire') { fireLoop = loop('gun_fire', 0.85); gunMode = 'fire'; }
      if (!trigger && gunMode !== 'idle') {
        stop(fireLoop, 0.04); fireLoop = null; if (spinSrc) stop(spinSrc, 0.05); spinSrc = null;
        play('gun_winddown', gunMode === 'fire' ? 0.75 : 0.4, gunMode === 'fire' ? 1 : 1.3); gunMode = 'idle';
      }
    },
    engine(v) { if (eng) { eng.g.gain.setTargetAtTime(Math.min(1, v) * 0.55, ac.currentTime, 0.25); eng.s.playbackRate.setTargetAtTime(0.78 + 0.32 * Math.min(1, v), ac.currentTime, 0.4); } },
    plasma() { tone(0.16, 1100 * rand(0.85, 1.15), 280, 0.12); },
    boltZip() { tone(0.12, 700, 1600, 0.08, 'square'); },
    boom(s = 1) {
      const pick = a => a[Math.floor(Math.random() * a.length)];
      const name = s >= 1.5 ? pick(['boom_xl', 'boom_l1', 'boom_l2']) : s >= 0.95 ? pick(['boom_l1', 'boom_l2', 'boom_m1']) : s >= 0.55 ? pick(['boom_m1', 'boom_m2']) : 'boom_s';
      if (buf[name] && boomCount < 5) { const n = play(name, clamp(0.45 + s * 0.35, 0.4, 1), rand(0.9, 1.08)); if (n) { boomCount++; n.s.onended = () => boomCount--; } }
      else if (!buf[name]) { nz(0.9 * s, 1400, 60, 0.7); tone(0.5, 90, 30, 0.6 * s, 'sine'); }
    },
    hitEnemy() { tone(0.04, 1800, 1200, 0.05, 'square'); },
    shieldHit() { if (buf.shield_thud) play('shield_thud', 0.55, rand(1.05, 1.2)); nz(0.18, 4200, 1500, 0.22, 'bandpass', 3); },
    hurt() { if (buf.hurt_thud) play('hurt_thud', 0.95, rand(0.95, 1.05)); else nz(0.25, 800, 120, 0.5); },
    enemyShot(kind, d) {   // each enemy family gets its own gun sound; capped so volleys don't stack up
      if (!ac || ac.currentTime < shotT) return; shotT = ac.currentTime + 0.05; const v = this.near(d);
      if (kind === 'engine') { if (buf.beam_shot) play('beam_shot', 0.35 * v, rand(1.2, 1.4)); return; }
      if (kind === 'sled') { if (buf.beam_shot) return play('beam_shot', 0.5 * v, rand(0.95, 1.1)); }
      if (kind === 'crawler' || kind === 'drone' || kind === 'fturret') { if (buf.frost_shot) return play('frost_shot', 0.5 * v, rand(0.9, 1.15)); }
      if (buf.plasma_shot1) play(Math.random() < 0.5 ? 'plasma_shot1' : 'plasma_shot2', 0.45 * v, rand(0.9, 1.12)); else this.plasma();
    },
    volley(d) { if (buf.alien_volley) play('alien_volley', 0.7 * this.near(d)); },
    iceCrack(d = 0) { if (!ac || ac.currentTime < crackT) return; crackT = ac.currentTime + 0.08; if (buf.ice_crack) play('ice_crack', 0.75 * (d ? this.near(d) : 1), rand(0.9, 1.15)); },
    impact(d = 0) { if (buf.impact_thud) play('impact_thud', 0.8 * (d ? this.near(d) : 1), rand(0.9, 1.05)); },
    stinger() { if (buf.boss_stinger) play('boss_stinger', 0.9); },
    wind(v) { if (!ac || !buf.wind_loop) return; if (!windN) windN = loop('wind_loop', 0); windN.g.gain.setTargetAtTime(v, ac.currentTime, 0.4); },
    engineLoops(on, d = 60, rage = 0) {   // the Avalanche Engine's drill and motor rumble
      if (!ac) return;
      if (!on) { if (drillN) { stop(drillN, 0.6); drillN = null; } if (rumbleN) { stop(rumbleN, 0.6); rumbleN = null; } return; }
      if (!drillN && buf.drill_loop) drillN = loop('drill_loop', 0); if (!rumbleN && buf.engine_rumble) rumbleN = loop('engine_rumble', 0, 0.7);
      const v = this.near(d);
      if (drillN) { drillN.g.gain.setTargetAtTime(0.45 * v, ac.currentTime, 0.2); drillN.s.playbackRate.setTargetAtTime(1 + rage * 0.35, ac.currentTime, 0.3); }
      if (rumbleN) rumbleN.g.gain.setTargetAtTime(0.5 * v, ac.currentTime, 0.2);
    },
    recharge() { tone(0.7, 280, 1300, 0.12, 'triangle'); },
    overheat() { nz(1.1, 7000, 2500, 0.25, 'highpass'); },
    pop() { tone(0.12, 500, 1400, 0.25, 'square'); nz(0.15, 3000, 800, 0.2); },
    ui() { tone(0.1, 660, 990, 0.18, 'square'); },
    plasmaBoom() { if (buf.boom_l2) play(Math.random() < 0.5 ? 'boom_l2' : 'boom_m1', 0.85, rand(1.05, 1.2)); else nz(1.2, 2200, 70, 0.8); tone(0.7, 220, 40, 0.5, 'sine'); tone(0.45, 1800, 200, 0.22, 'sawtooth'); },
    // distance -> volume (full inside 12 m, fading out by ~90 m)
    near(d) { return clamp(1.15 - d / 80, 0.15, 1); },
    voice(name, vol) { if (!buf[name] || voices >= 3) return; const n = play(name, vol, rand(0.94, 1.08)); if (n) { voices++; n.s.onended = () => voices--; } },
    gruntDie(d) { if (Math.random() < 0.75) this.voice('gdeath' + (1 + Math.floor(Math.random() * 7)), 0.75 * this.near(d)); },
    gruntScream(d) { if (!ac || ac.currentTime < screamT) return; screamT = ac.currentTime + 6; this.voice('gscream', 0.8 * this.near(d)); },
    // taunts: rare on purpose (30 s minimum gap, never in the first 12 s of a run, and only by chance)
    taunt(chance, runTime) { if (!ac || runTime < 12 || ac.currentTime < tauntT || Math.random() > chance) return; tauntT = ac.currentTime + 30; this.voice('taunt' + (1 + Math.floor(Math.random() * 5)), 0.9); },
    resetTaunts() { tauntT = 0; },
    ghostHum(level) { if (hum) { hum.g.gain.setTargetAtTime(level * 0.55, ac.currentTime, 0.15); hum.s.playbackRate.setTargetAtTime(0.92 + level * 0.18, ac.currentTime, 0.2); } },
    ghostFire(d) { if (buf.ghost_fire1) play(Math.random() < 0.5 ? 'ghost_fire1' : 'ghost_fire2', 0.7 * this.near(d), rand(0.95, 1.06)); else this.plasma(); },
    ghostBoost(d) { if (buf.ghost_boost) play('ghost_boost', 0.85 * this.near(d)); },
    ghostDie(d) { if (buf.ghost_die) play('ghost_die', 0.95 * this.near(d), rand(0.95, 1.05)); else this.boom(0.6); },
    eliteHurt() { if (buf.elite_hurt) play('elite_hurt', 0.9, rand(0.95, 1.05)); },
    eliteDie() { if (buf.elite_die) play('elite_die', 1); },
    swordCharge() { tone(0.55, 180, 900, 0.16, 'sawtooth'); nz(0.55, 400, 3000, 0.12, 'bandpass', 4); },
    swordWhoosh() { nz(0.28, 700, 3500, 0.45, 'bandpass', 2); tone(0.25, 500, 1400, 0.1, 'sine'); },
    swordHit() { nz(0.35, 3000, 300, 0.6); tone(0.3, 160, 50, 0.5, 'square'); },
    cellHit() { tone(0.06, 1400, 2200, 0.06, 'sine'); },
    shieldBoss() { tone(0.2, 900, 1500, 0.08, 'sine'); },
  };
})();

// ---------------------------------------------------------------- music (separate files in ./music, streamed with <audio>)
const MUSIC_VOL = Q.get('music') === '0' ? 0 : parseFloat(Q.get('music') || '0.5');
const music = (() => {
  const files = { title: 'title_metal', run: LV.music, boss: LV.bossMusic || 'boss_metal', win: 'victory', lose: 'gameover' };
  const els = {}, fades = []; let cur = null, want = null, unlocked = false;
  const el = k => { if (!els[k]) { const a = new Audio('music/' + files[k] + '.mp3'); a.loop = !(k === 'win' || k === 'lose'); a.preload = 'auto'; a.volume = 0; els[k] = a; } return els[k]; };
  function start(k) {
    if (cur === k) return; cur = k;
    const a = el(k); try { a.currentTime = 0; } catch (e) {}
    const p = a.play(); if (p) p.catch(() => { if (cur !== k) return; unlocked = false; want = k; cur = null; a.pause(); a.volume = 0; });
    fades.push({ a, to: MUSIC_VOL, stop: false });
    for (const o in els) if (o !== k && !els[o].paused) fades.push({ a: els[o], to: 0, stop: true });   // fade out everything else
  }
  return {
    play(k) { want = k; if (unlocked && MUSIC_VOL > 0) start(k); },
    unlock() { if (unlocked) return; unlocked = true; if (want && MUSIC_VOL > 0) start(want); },
    els: () => Object.values(els),
    update(dt) {
      for (let i = fades.length - 1; i >= 0; i--) {
        const f = fades[i]; if (fades.some((g, j) => j > i && g.a === f.a)) { fades.splice(i, 1); continue; } // newest fade wins
        const step = dt / 1.6 * Math.max(MUSIC_VOL, 0.01);
        f.a.volume = clamp(f.a.volume + Math.sign(f.to - f.a.volume) * step, 0, 1);
        if (Math.abs(f.a.volume - f.to) <= step) { f.a.volume = f.to; if (f.stop) f.a.pause(); fades.splice(i, 1); }
      }
      // safety net: anything that isn't the current track and isn't fading out gets stopped
      for (const o in els) { const a = els[o]; if (o !== cur && !a.paused && !fades.some(f => f.a === a)) { a.pause(); a.volume = 0; } }
    },
  };
})();

// ---------------------------------------------------------------- models
const loader = new GLTFLoader();
const M = {};
function b64ToBuf(b64) { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
const TEX = {};
function loadImage(b64) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/jpeg;base64,' + b64; }); }
async function loadTextures() {
  for (const [k, b64] of Object.entries(window.HOG_TEX || {})) {
    const img = await loadImage(b64); const t = new THREE.Texture(img); t.needsUpdate = true;
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; TEX[k] = t; TEX[k + '_img'] = img;
  }
}
async function loadModels(progress) {
  const all = Object.assign({}, window.HOG_ASSETS, window.HOG_LOCAL || {});   // HOG_LOCAL: models kept out of git (local/*.js)
  const names = Object.keys(all); let done = 0;
  for (const n of names) {
    const g = await loader.parseAsync(b64ToBuf(all[n]), '');
    M[n + '_anims'] = g.animations;
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      if (o.isSkinnedMesh) o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.metalness !== undefined) { m.metalness = Math.min(m.metalness, 0.55); m.roughness = Math.max(m.roughness, 0.35); }
        if (/glow|efct|trans/i.test(m.name || '')) { m.emissive = m.color.clone(); m.emissiveIntensity = 1.4; }
      }
    });
    M[n] = g.scene; progress(++done / names.length);
  }
}
// custom models from the MODELS screen replace the built-in ones, fitted to the same size
const BASE = {}, BUILTIN = {}, CUSTOMIZED = new Set(); let customRecs = {};
async function applyCustom() {
  customRecs = await CUSTOM.loadAll();
  for (const slot of CUSTOM.SLOTS) {
    if (M[slot.id]) { BUILTIN[slot.id] = M[slot.id]; BASE[slot.id] = CUSTOM.boxOf(M[slot.id]); }
    const rec = customRecs[slot.id]; if (!rec) continue;
    try {
      const g = await CUSTOM.parse(rec.buf);
      const keepSkin = slot.id === 'jackal' && CUSTOM.hasMixamo(g.scene);
      g.scene.traverse(o => { if (!o.isMesh) return; for (const m of [].concat(o.material)) if (m.metalness !== undefined) { m.metalness = Math.min(m.metalness, 0.55); m.roughness = Math.max(m.roughness, 0.35); } });
      M[slot.id] = CUSTOM.fit(g.scene, slot, BASE[slot.id] || null, rec, keepSkin);
      M[slot.id + '_anims'] = keepSkin ? g.animations : [];
      M[slot.id + '_mixamo'] = keepSkin; CUSTOMIZED.add(slot.id);
    } catch (e) { console.warn('custom model failed for', slot.id, e); }
  }
}
// ---------------------------------------------------------------- auto-rig (the bipeds ship without skeletons)
// Bakes every mesh into model space, builds a simple bone hierarchy and assigns each vertex to
// one or two bones by body region, so we can animate legs/arms/spine procedurally.
function autoRig(src, joints, classify) {
  src.updateMatrixWorld(true);
  const root = new THREE.Group(); root.name = 'rigRoot';
  const bones = {}, list = [];
  for (const [name, parent, pos] of joints) {
    const b = new THREE.Bone(); b.name = 'rig_' + name;
    const wp = V(...pos); b.userData.wp = wp;
    if (parent) { b.position.copy(wp).sub(bones[parent].userData.wp); bones[parent].add(b); } else b.position.copy(wp);
    bones[name] = b; list.push(b);
  }
  const index = Object.fromEntries(list.map((b, i) => [b.name.slice(4), i]));
  root.add(list[0]); root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(list);   // bind pose = bones where they sit now
  skeleton.calculateInverses();
  const p = V();
  src.traverse(m => {
    if (!m.isMesh) return;
    const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld);
    const pos = g.attributes.position, n = pos.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(pos, i);
      const w = classify(p, m.name);            // [[bone, weight], ...]
      let tot = 0; w.forEach(([, x]) => tot += x);
      w.slice(0, 4).forEach(([b, x], k) => { si[i * 4 + k] = index[b]; sw[i * 4 + k] = x / tot; });
    }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    const sm = new THREE.SkinnedMesh(g, m.material); sm.name = m.name; sm.frustumCulled = false;
    root.add(sm); sm.bind(skeleton, new THREE.Matrix4());
  });
  return root;
}
// custom bipeds get joints measured from their own shape
function rigCustomBipeds() {
  for (const id of ['grunt', 'elite', 'jackal']) {
    if (!CUSTOMIZED.has(id) || M[id + '_mixamo']) continue;
    const ms = CUSTOM.measureBiped(M[id]);
    M[id] = autoRig(M[id], ms.joints, ms.classify); M[id].userData.custom = true;
    if (id === 'elite') {   // sword trail markers off the left hand, pointing forward
      const arm = M.elite.getObjectByName('rig_armL');
      for (const [nm, f] of [['swordMid', 0.25], ['swordTip', 0.55]]) { const o = new THREE.Object3D(); o.name = nm; o.position.copy(ms.hand).add(V(0, -0.05 * ms.H, f * ms.H)).sub(ms.shL); arm.add(o); }
      M.elite.traverse(n => { if (n.isMesh && /sword|blade|energy|glow/i.test(n.material.name || '')) n.material.userData.sword = true; });
    }
  }
}
const mix2 = (a, b, t) => t <= 0 ? [[a, 1]] : t >= 1 ? [[b, 1]] : [[a, 1 - t], [b, t]];
function rigBipeds() {
  rigCustomBipeds();
  // Grunt (model units: 0.86 tall, faces +Z)
  if (!CUSTOMIZED.has('grunt')) M.grunt = autoRig(M.grunt, [
    ['root', null, [0, 0, 0]], ['hips', 'root', [0, 0.26, 0]], ['spine', 'hips', [0, 0.28, 0]], ['head', 'spine', [0, 0.66, 0.05]],
    ['armL', 'spine', [-0.22, 0.58, 0]], ['armR', 'spine', [0.22, 0.58, 0]], ['legL', 'hips', [-0.13, 0.25, 0]], ['legR', 'hips', [0.13, 0.25, 0]],
  ], (v) => {
    const ax = Math.abs(v.x), side = v.x < 0 ? 'L' : 'R';
    if (v.y < 0.3 && ax < 0.31) return mix2('leg' + side, 'spine', smooth(0.2, 0.3, v.y));
    if (ax > 0.21) return mix2('spine', 'arm' + side, smooth(0.21, 0.27, ax));
    if (v.y > 0.64 && v.z > -0.06) return mix2('spine', 'head', smooth(0.64, 0.7, v.y));
    return [['spine', 1]];
  });
  if (CUSTOMIZED.has('elite')) return;
  // Elite (model units: feet at 0.17, ~1.8 tall, faces +Z; left hand holds the sword)
  M.elite = autoRig(M.elite, [
    ['root', null, [0.05, 0, 0]], ['hips', 'root', [0.05, 1.0, 0.05]], ['spine', 'hips', [0.05, 1.05, 0.05]], ['head', 'spine', [0.25, 1.6, 0.35]],
    ['armL', 'spine', [-0.12, 1.45, 0.1]], ['armR', 'spine', [0.5, 1.42, 0.15]],
    ['legL', 'hips', [-0.18, 1.0, 0.05]], ['legR', 'hips', [0.27, 1.0, 0.05]], ['shinL', 'legL', [-0.3, 0.72, 0.2]], ['shinR', 'legR', [0.32, 0.72, 0.2]],
  ], (v, mesh) => {
    if (mesh === 'Object_9' || mesh === 'Object_10') return [['armL', 1]];            // sword + hand
    const side = v.x < 0.04 ? 'L' : 'R';
    if (v.y < 1.06) {
      const leg = mix2('leg' + side, 'spine', smooth(0.96, 1.06, v.y));
      if (v.y < 0.82) return mix2('shin' + side, 'leg' + side, smooth(0.66, 0.82, v.y));
      return leg;
    }
    if (v.x > 0.5 && v.y > 1.12) return mix2('spine', 'armR', smooth(0.5, 0.6, v.x));
    if (v.x < -0.12 && v.y > 1.12) return mix2('spine', 'armL', smooth(-0.12, -0.22, v.x));
    if (v.y > 1.6 && v.z > 0.15 && v.x > 0.0) return mix2('spine', 'head', smooth(1.6, 1.68, v.y));
    return [['spine', 1]];
  });
  // energy sword: find the blade tip (farthest blade vertex from the hand) and pin markers to the arm bone
  const arm = M.elite.getObjectByName('rig_armL'), joint = V(-0.12, 1.45, 0.1);
  let blade = null, hand = V(); M.elite.traverse(n => { if (n.name === 'Object_9') blade = n; if (n.name === 'Object_10') { n.geometry.computeBoundingBox(); n.geometry.boundingBox.getCenter(hand); } });
  const P = blade.geometry.attributes.position, q = V(); let tip = V(), best = 0;
  for (let i = 0; i < P.count; i++) { q.fromBufferAttribute(P, i); const d = q.distanceTo(hand); if (d > best) { best = d; tip.copy(q); } }
  for (const [nm, f] of [['swordTip', 1], ['swordMid', 0.45]]) { const o = new THREE.Object3D(); o.name = nm; o.position.copy(hand).lerp(tip, f).sub(joint); arm.add(o); }
  blade.material.userData.sword = true;
}
// ---------------------------------------------------------------- Covenant finish for the toy-style models
// No UVs on these, so a procedural panel/seam texture is projected from three sides (triplanar),
// edges are softened with creased normals, and the flat matte colors become glossy alloy + glowing seams.
let covTex = null;
function makeCovTex() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const det = document.createElement('canvas'); det.width = det.height = S; const d = det.getContext('2d');
  const glo = document.createElement('canvas'); glo.width = glo.height = S; const q = glo.getContext('2d');
  d.fillStyle = '#c8c8c8'; d.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) { d.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},.05)`; d.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 6, 2 + Math.random() * 6); }
  // curves are drawn 9x with offsets so the texture tiles without seams
  const curve = (ctx, w, col) => { const x = Math.random() * S, y = Math.random() * S, p = [rand(-200, 200), rand(-200, 200), rand(-200, 200), rand(-200, 200), rand(-260, 260), rand(-260, 260)];
    ctx.strokeStyle = col; ctx.lineWidth = w;
    for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) { const ox = x + k * S, oy = y + j * S; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.bezierCurveTo(ox + p[0], oy + p[1], ox + p[2], oy + p[3], ox + p[4], oy + p[5]); ctx.stroke(); } };
  for (let i = 0; i < 30; i++) curve(d, 7, 'rgba(20,20,20,.75)');      // organic panel seams
  for (let i = 0; i < 6; i++) curve(q, 6, 'rgba(255,255,255,1)');                               // glowing light lines
  for (let i = 0; i < 18; i++) { q.fillStyle = 'rgba(255,255,255,.9)'; q.beginPath(); q.arc(Math.random() * S, Math.random() * S, 3 + Math.random() * 5, 0, 7); q.fill(); }
  const a = d.getImageData(0, 0, S, S).data, b = q.getImageData(0, 0, S, S).data, out = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) { out.data[i * 4] = a[i * 4]; out.data[i * 4 + 1] = b[i * 4]; out.data[i * 4 + 2] = 0; out.data[i * 4 + 3] = 255; }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; return t;
}
function covMaterial(src, opts) {
  const m = new THREE.MeshStandardMaterial({ color: src.color, metalness: opts.metal, roughness: opts.rough, envMapIntensity: 1.6, emissive: opts.glow || 0x000000 });
  m.name = src.name;
  m.onBeforeCompile = sh => {
    sh.uniforms.covTex = { value: covTex }; sh.uniforms.covScale = { value: opts.scale || 0.7 }; sh.uniforms.glowAmt = { value: opts.glowAmt || 0 };
    sh.vertexShader = 'varying vec3 vOP; varying vec3 vON;\n' + sh.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n vOP = transformed * vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz)); vON = objectNormal;   // after skinning, in world meters, whatever units the model uses');
    sh.fragmentShader = 'uniform sampler2D covTex; uniform float covScale, glowAmt; varying vec3 vOP; varying vec3 vON; vec4 covT;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 bw = pow(abs(normalize(vON)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        covT = texture2D(covTex, vOP.yz * covScale) * bw.x + texture2D(covTex, vOP.xz * covScale) * bw.y + texture2D(covTex, vOP.xy * covScale) * bw.z;
        diffuseColor.rgb *= 0.35 + 0.85 * covT.r;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor *= 0.7 + 0.6 * (1.0 - covT.r);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(0.35, 0.75, 1.0) * covT.g * glowAmt;');
  };
  return m;
}
// soft cool rim light on enemies so they pop against the hills
function addRim(m, col, k) {
  if (m.userData.rim) return; m.userData.rim = true;
  const prev = m.onBeforeCompile, prevKey = prev.toString();
  m.onBeforeCompile = (sh, rd) => {
    prev.call(m, sh, rd);
    sh.uniforms.rimCol = { value: new THREE.Color(col) }; sh.uniforms.rimK = { value: k };
    sh.fragmentShader = 'uniform vec3 rimCol; uniform float rimK;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n totalEmissiveRadiance += rimCol * rimK * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);');
  };
  m.customProgramCacheKey = () => 'rim|' + prevKey;
}
function rimModels() {
  for (const k of ['grunt', 'elite', 'ghost', 'banshee', 'shade', 'watchtower'])
    M[k].traverse(n => { if (n.isMesh && n.material.isMeshStandardMaterial && !n.material.transparent) addRim(n.material, 0xa8d4ff, k === 'elite' ? 0.45 : 0.35); });
}
function covenantFinish() {
  covTex = makeCovTex();
  for (const k of ['shade', 'ghost', 'banshee', 'watchtower']) {
    if (CUSTOMIZED.has(k)) continue;
    M[k].traverse(n => {
      if (!n.isMesh) return;
      n.geometry = toCreasedNormals(n.geometry, THREE.MathUtils.degToRad(35));
      const src = n.material, nm = src.name || '';
      if (/COV_/.test(nm)) n.material = covMaterial(src, { metal: 0.6, rough: 0.3, glowAmt: 0.55, scale: 0.45 });
      else if (/metl_|rubr_/.test(nm)) n.material = covMaterial(src, { metal: 0.75, rough: 0.4, scale: 0.9 });
      else if (/glow_/.test(nm)) n.material = new THREE.MeshBasicMaterial({ color: 0x8fdcff, toneMapped: false });
      else if (/scrn_/.test(nm)) n.material = new THREE.MeshBasicMaterial({ color: 0xff8fe0, toneMapped: false });
      else if (/efct_shield/.test(nm)) { n.material = new THREE.MeshBasicMaterial({ color: 0x5fb4ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }); n.material.name = nm; }
      else if (/efct_/.test(nm)) n.material = new THREE.MeshBasicMaterial({ color: 0xd6a8ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      else if (/trans_/.test(nm)) n.material = new THREE.MeshStandardMaterial({ color: 0x9fd0ff, metalness: 0.3, roughness: 0.08, transparent: true, opacity: 0.8, emissive: 0x1a4a7a, envMapIntensity: 2 });
      else n.material = covMaterial(src, { metal: 0.5, rough: 0.35 });
      if (n.material.name !== nm) n.material.name = nm;
    });
  }
}

// Warthog tires/axles: move each part's pivot to its hub so it can spin (model: front = -X, axle = Z)
function prepWheels() {
  M.warthog.updateMatrixWorld(true);
  M.warthog.traverse(n => {
    if (!n.isMesh || !/^(Tire|Axel)_/.test(n.parent.name)) return;
    const g = n.geometry; g.computeBoundingBox(); const c = g.boundingBox.getCenter(V());
    g.translate(-c.x, -c.y, -c.z); g.computeBoundingSphere();
    n.parent.position.add(c); n.parent.rotation.order = 'YZX'; n.parent.userData.wheel = c.x < 0 ? 'front' : 'rear';
  });
}
function rigOf(obj) { const r = {}; obj.traverse(b => { if (b.isBone) r[b.name.slice(4)] = b; }); for (const k in r) r[k].userData.r0 = r[k].rotation.clone(); r.hips && (r.hips.userData.p0 = r.hips.position.clone()); return r; }
// procedural gait: phase advances with ground speed
function gait(r, ph, amp, opts = {}) {
  const sL = Math.sin(ph), sR = Math.sin(ph + Math.PI);
  r.legL.rotation.x = sL * amp; r.legR.rotation.x = sR * amp;
  if (r.shinL) { r.shinL.rotation.x = Math.max(0, -Math.cos(ph)) * amp * 1.3; r.shinR.rotation.x = Math.max(0, Math.cos(ph)) * amp * 1.3; }
  r.hips.position.y = r.hips.userData.p0.y + Math.abs(Math.cos(ph)) * amp * (opts.bob ?? 0.05);
  r.spine.rotation.z = Math.sin(ph) * amp * (opts.waddle ?? 0.2);
  r.spine.rotation.x = (opts.lean ?? 0) + Math.abs(Math.sin(ph * 2)) * amp * 0.05;
}

function cloneModel(name, skinned) {
  const o = skinned ? skClone(M[name]) : M[name].clone(true);
  const mats = [];
  o.traverse(c => { if (c.isMesh) { const src = c.material; c.material = src.clone(); c.material.onBeforeCompile = src.onBeforeCompile; c.material.customProgramCacheKey = src.customProgramCacheKey; mats.push(c.material); if (c.isSkinnedMesh) c.frustumCulled = false; } });
  o.userData.mats = mats;
  return o;
}

// ---------------------------------------------------------------- player vehicle
const vehicle = new THREE.Group(); scene.add(vehicle);
const vBody = new THREE.Group(); vehicle.add(vBody);
let hog, turret, tSwivel, tBody, tBarrel, tMuzzle, wheels = [], wheelSpin = 0, steer = 0, lastHeading = null;
const WHEEL_R = 0.222 * 2.8, WHEELBASE = 1.3 * 2.8;
const BED = V(0, 1.75, -1.75);   // turret mount (vehicle space; +Z = forward)
const CAM_OFF = V(0, 4.6, -6.4);
function buildVehicle() {
  hog = cloneModel('warthog'); hog.rotation.y = Math.PI / 2; hog.scale.setScalar(2.8); hog.position.y = 0.45 * 2.8;
  vBody.add(hog);
  wheels = []; hog.traverse(n => { if (n.userData.wheel) wheels.push(n); });
  turret = cloneModel('turret', true); turret.scale.setScalar(0.36); turret.position.copy(BED); vBody.add(turret);
  tSwivel = turret.getObjectByName('bn_turret_swivel_01');
  tBody = turret.getObjectByName('bn_turret_body_02');
  tBarrel = turret.getObjectByName('bn_turret_barrel_03');
  tMuzzle = turret.getObjectByName('bn_turret_barrel_end_05');
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 7.2), new THREE.MeshBasicMaterial({
    transparent: true, depthWrite: false, map: canvasTex(64, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); })
  }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.2; vehicle.add(shadow);
}

// ---------------------------------------------------------------- game state
const G = {
  state: 'loading', s: 0, speed: 0, score: 0, kills: 0, shots: 0, hits: 0, time: 0,
  shield: SHIELD_MAX, health: HEALTH_MAX, sinceHit: 99, heat: 0, overheated: false, spin: 0, fireT: 0,
  combo: 0, comboT: 0, msg: '', msgT: 0, boss: null, party: false, endT: 0, won: false,
};
const enemies = [], bolts = [], popups = [];
let shake = 0, hurtFlash = 0, shieldFlash = 0; const slashFx = [];
const ENEMY_SHADOW = { grunt: 2.2, elite: 3.6, ghost: 5.2, shade: 3.8, cell: 2.2, crawler: 2.4, sled: 5, fturret: 3.6, drone: 2.2 };
let enemyShadows = null;
function makeEnemyShadows() {
  const tex = canvasTex(64, (g, s2) => { const gr = g.createRadialGradient(s2 / 2, s2 / 2, 2, s2 / 2, s2 / 2, s2 / 2); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(0.65, 'rgba(0,0,0,.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s2, s2); });
  enemyShadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), 96);
  enemyShadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage); enemyShadows.frustumCulled = false; scene.add(enemyShadows);
}
function updateEnemyShadows() {
  let n = 0;
  for (const e of enemies) {
    const base = ENEMY_SHADOW[e.kind]; if (!base || e.dead || n >= 96) continue;
    const gy = groundH(e.pos.x, e.pos.z), h = Math.max(0, e.pos.y - gy), k = clamp(1 - h / 8, 0.15, 1) * (e.alive ? 1 : 0.6);
    _m4.compose(_v1.set(e.pos.x, gy + 0.07, e.pos.z), _q.identity(), _v2.set(base * k, 1, base * k)); enemyShadows.setMatrixAt(n++, _m4);
  }
  enemyShadows.count = n; enemyShadows.instanceMatrix.needsUpdate = true;
}
const input = { x: 0.5, y: 0.5, down: false, a: false, b: false, off: false, clicked: null };

// ---------------------------------------------------------------- enemies
class Enemy {
  constructor(kind, obj, hp, hits, score) {
    this.kind = kind; this.obj = obj; this.hp = this.maxHp = hp; this.hits = hits; this.score = score;
    this.alive = true; this.dead = false; this.t = 0; this.cool = rand(1, 2.5); this.flash = 0; this.vel = V(); this.deadT = 0;
    this.mats = []; obj.traverse(c => { if (c.isMesh) this.mats.push(c.material); });
    scene.add(obj); enemies.push(this);
  }
  get pos() { return this.obj.position; }
  hitTest(ray) { // returns [dist, idx]
    let best = null;
    for (let i = 0; i < this.hits.length; i++) {
      const h = this.hits[i]; _v1.copy(h.o); this.obj.localToWorld(_v1);
      _v2.copy(_v1).sub(ray.origin); const t = _v2.dot(ray.direction); if (t < 0) continue;
      const d2 = _v2.lengthSq() - t * t, r2 = h.r * h.r; if (d2 > r2) continue;
      const dist = t - Math.sqrt(r2 - d2); if (!best || dist < best[0]) best = [dist, i];
    }
    return best;
  }
  damage(n, idx, at) {
    if (!this.alive) return;
    const mult = this.hits[idx].m || 1; n *= mult;
    if (this.shieldHp !== undefined && this.shieldHp > 0) {
      this.shieldHp -= n; this.shieldT = 0; this.sflash = 1;
      burst(at, 4, 6, 0.25, 0.6, 0.1, COL.blue, 1, 3); if (Math.random() < 0.3) sfx.shieldBoss(); return;
    }
    this.hp -= n; this.flash = 1; this.lastHit = idx;
    if (this.hp <= 0) { this.alive = false; this.die(at, idx); award(this, at, idx); }
  }
  setFlash() {
    const f = Math.max(this.flash, this.sflash || 0);
    if (f <= 0 && !this._flashOn) return;
    for (const m of this.mats) {
      if (!m.emissive) continue;
      if (m.userData.e0 === undefined) { m.userData.e0 = m.emissive.clone(); m.userData.ei0 = m.emissiveIntensity; }
      if (f > 0) { m.emissive.set(this.sflash > this.flash ? 0x4aa8ff : 0xffffff); m.emissiveIntensity = f * (this.sflash > this.flash ? 1.2 : 0.6); }
      else { m.emissive.copy(m.userData.e0); m.emissiveIntensity = m.userData.ei0; }
    }
    this._flashOn = f > 0;
  }
  aimAtPlayer(spread, speed, color, dmg, size = 1.1, from, quiet) {
    const src = from || _v3.copy(this.pos).add(V(0, 1, 0));
    const target = camera.position.clone().add(V(rand(-1, 1), rand(-0.6, 0.8), rand(-1, 1)).multiplyScalar(spread));
    target.addScaledVector(vehicleFwd, G.speed * 0.35); // lead a little
    const v = target.sub(src).normalize().multiplyScalar(speed);
    bolts.push({ p: src.clone(), v, color, dmg, size, life: 4, hp: 1 });
    if (!quiet) sfx.enemyShot(this.kind, this.pos.distanceTo(vehicle.position));
  }
  remove() { scene.remove(this.obj); this.dead = true; }
}
const vehicleFwd = V(0, 0, 1);

function grunt(p, opts = {}) {
  const g = new THREE.Group(); const m = cloneModel('grunt', true); m.scale.setScalar(1.7); g.add(m); g.position.copy(p);
  const e = new Enemy('grunt', g, 4, [{ o: V(0, 0.6, 0), r: 0.62 }, { o: V(0, 1.18, 0.1), r: 0.33, m: 2 }], 100);
  e.home = p.clone(); e.phase = rand(0, 6); e.flee = false; e.perch = opts.perch;
  e.rig = rigOf(m); e.gph = rand(0, 6); e.last = p.clone(); e.aimT = 0;
  e.update = function (dt) {
    if (!this.alive) {
      this.deadT += dt; this.vel.y -= 20 * dt; this.pos.addScaledVector(this.vel, dt);
      this.obj.rotation.x += this.spinX * dt; this.obj.rotation.z += this.spinZ * dt;
      const gy = groundH(this.pos.x, this.pos.z); const air = this.pos.y > gy + 0.05;
      if (!air) { this.pos.y = gy; this.vel.set(0, 0, 0); this.spinX = this.spinZ = 0; }
      const r = this.rig, k = air ? 1 : Math.max(0, 1 - (this.deadT - 0.3) * 2);   // limbs flail in the air, then go limp
      r.armL.rotation.z = -1.2 * k - 0.3 + Math.sin(this.deadT * 25) * 0.6 * k; r.armR.rotation.z = 1.2 * k + 0.3 - Math.sin(this.deadT * 23) * 0.6 * k;
      r.legL.rotation.x = Math.sin(this.deadT * 20) * 0.8 * k; r.legR.rotation.x = -Math.sin(this.deadT * 20) * 0.8 * k; r.head.rotation.x = 0.5;
      if (this.deadT > 2.2) this.remove(); return;
    }
    this.t += dt; const toP = _v1.copy(vehicle.position).sub(this.pos); const d = toP.length();
    if (!this.seen && d < 60) { this.seen = true; sfx.taunt(0.12, G.time); }
    if (this.flee) { this.pos.addScaledVector(_v2.copy(toP).setY(0).normalize(), -6.5 * dt); this.obj.lookAt(_v2.copy(this.pos).sub(toP.setY(0))); }
    else if (!this.perch) {
      const side = trackSide(G.s);
      this.pos.copy(this.home).addScaledVector(side, Math.sin(this.t * 1.3 + this.phase) * 1.8);
      this.obj.lookAt(vehicle.position.x, this.pos.y, vehicle.position.z);
    } else this.obj.lookAt(vehicle.position.x, this.pos.y, vehicle.position.z);
    if (!this.perch) this.pos.y = groundH(this.pos.x, this.pos.z);
    // animate: speed-driven waddle, panicked flailing when fleeing, arm up when shooting
    const sp = this.last.distanceTo(this.pos) / Math.max(dt, 1e-3); this.last.copy(this.pos);
    const r = this.rig;
    this.gph += dt * (this.flee ? 16 : 3 + sp * 4);
    gait(r, this.gph, this.flee ? 0.75 : clamp(0.15 + sp * 0.18, 0.15, 0.6), { waddle: 0.35, bob: 0.06, lean: this.flee ? 0.35 : 0.08 });
    if (this.flee) {
      r.armL.rotation.set(-0.4, 0, -2.4 + Math.sin(this.t * 22) * 0.5); r.armR.rotation.set(-0.4, 0, 2.4 + Math.sin(this.t * 19) * 0.5);
      r.head.rotation.x = -0.35 + Math.sin(this.t * 14) * 0.15;
    } else {
      const sw = Math.sin(this.gph) * 0.35 + Math.sin(this.t * 1.7 + this.phase) * 0.06;
      r.armL.rotation.set(-sw, 0, -0.1 + Math.sin(this.t * 2.1) * 0.05);
      this.aimT = Math.max(0, this.aimT - dt);
      const aim = Math.min(1, this.aimT * 3);
      r.armR.rotation.set(lerp(sw, -1.25, aim), 0, lerp(0.1, -0.35, aim));
      r.head.rotation.set(Math.sin(this.t * 1.3 + this.phase) * 0.08, Math.sin(this.t * 0.9 + this.phase) * 0.25, 0);
    }
    this.cool -= dt;
    if (!this.flee && this.cool <= 0 && d < 95 && d > 6) { this.cool = rand(1.6, 3.2); this.aimT = 0.6; this.aimAtPlayer(3.2, 32, Math.random() < 0.5 ? COL.green : COL.plasma, 7, 1.0); }
  };
  e.die = function (at, idx) {
    this.vel.copy(this.pos).sub(vehicle.position).setY(0).normalize().multiplyScalar(rand(3, 7)); this.vel.y = rand(6, 10);
    this.spinX = rand(-8, 8); this.spinZ = rand(-8, 8);
    sfx.gruntDie(this.pos.distanceTo(vehicle.position));
    if (G.party) { confetti(_v1.copy(this.pos).add(V(0, 1.2, 0))); sfx.pop(); }
    else { burst(_v1.copy(this.pos).add(V(0, 1, 0)), 14, 5, 0.6, 1.2, 2.5, COL.blue, 0.8, 2); sfx.hitEnemy(); }
    for (const o of enemies) if (o.kind === 'grunt' && o.alive && o !== this && o.pos.distanceTo(this.pos) < 14 && Math.random() < 0.3) { o.flee = true; sfx.gruntScream(o.pos.distanceTo(vehicle.position)); }
  };
  return e;
}

function ghost(s, side) {
  const g = new THREE.Group(); const m = cloneModel('ghost', true); g.add(m);
  const e = new Enemy('ghost', g, 26, [{ o: V(0, 0.7, -0.2), r: 1.6 }, { o: V(0, 0.7, 1.3), r: 1.15 }, { o: V(0, 1.85, -1.05), r: 0.45 }], 400);
  e.gs = s; e.side = side; e.phase = rand(0, 6); e.gap = s - G.s; e.charge = false; e.gunSide = 0;
  // Grunt pilot, seated with hands on the handlebars
  const rider = cloneModel('grunt', true); rider.scale.setScalar(1.6); rider.position.set(0, 0.32, -1.2); g.add(rider);
  const rr = rigOf(rider);
  rr.legL.rotation.set(-1.35, 0, -0.25); rr.legR.rotation.set(-1.35, 0, 0.25);
  rr.armL.rotation.set(-1.0, 0, 0.35); rr.armR.rotation.set(-1.0, 0, -0.35); rr.spine.rotation.x = 0.25;
  e.rider = rider; e.rr = rr;
  rider.traverse(c => { if (c.isMesh) e.mats.push(c.material); });
  const baseDamage = e.damage;
  e.damage = function (n, idx, at) {
    if (!this.alive) return;
    if (idx === 2) { this.pilotShot = true; popups.push({ p: at.clone().add(V(0, 0.8, 0)), t: -0.15, text: 'PILOT DOWN! +250', col: '#ffd24a' }); G.score += 250; n = 999; }
    baseDamage.call(this, n, idx, at);
  };
  e.ejectRider = function () {
    if (!this.rider) return; const wp = this.rider.getWorldPosition(V()); g.remove(this.rider); this.rider = null;
    const gr = grunt(wp); gr.alive = false; gr.die(wp); gr.vel.y += 4; G.kills++;
  };
  e.update = function (dt) {
    if (!this.alive) {
      this.deadT += dt; this.vel.y -= 18 * dt; this.pos.addScaledVector(this.vel, dt); this.obj.rotation.z += 4 * dt; this.obj.rotation.x += 2 * dt;
      if (Math.random() < 0.6) smoke.spawn(this.pos, V(0, 2, 0), 1.4, 2, 6, COL.smoke, 0.5, 1, -1);
      const gy = groundH(this.pos.x, this.pos.z); if (this.pos.y < gy + 0.5 && this.vel.y < 0) { this.remove(); explosion(this.pos, 0.9); }
      if (this.deadT > 3) this.remove(); return;
    }
    this.t += dt;
    if (!this.charge && this.t > 13) { this.charge = true; this.msgd = true; sfx.ghostBoost(this.pos.distanceTo(vehicle.position)); }
    const want = this.charge ? 4 : 20 + Math.sin(this.t * 0.7 + this.phase) * 6;
    this.gap = lerp(this.gap, want, dt * (this.charge ? 0.9 : 0.5));
    const side = this.charge ? lerp(this.side, 0, 0.7) : this.side + Math.sin(this.t * 0.9 + this.phase) * 6;
    const p = groundPoint(G.s + this.gap, side); p.y += 0.65 + Math.sin(this.t * 3) * 0.1;
    this.pos.copy(p);
    this.obj.lookAt(vehicle.position.x, this.pos.y, vehicle.position.z);
    this.obj.rotateZ(Math.sin(this.t * 0.9 + this.phase) * 0.18);
    if (this.rr) { this.rr.head.rotation.y = Math.sin(this.t * 1.7) * 0.25; this.rr.spine.rotation.z = -Math.sin(this.t * 0.9 + this.phase) * 0.15; }
    // hover engine glow + dust, thrusters (boost trail when charging)
    this.obj.updateMatrixWorld();
    if (Math.random() < 0.5) fx.spawn(_v1.set(rand(-0.4, 0.4), 0.1, rand(-0.5, 0.3)).applyMatrix4(this.obj.matrixWorld), V(0, -1, 0), 0.25, 1.2, 0.4, COL.plasma, 0.7, 2);
    if (Math.random() < 0.35) { const gp = _v1.copy(this.pos); gp.y = groundH(gp.x, gp.z) + 0.2; smoke.spawn(gp, V(rand(-2, 2), 0.8, rand(-2, 2)), 1.0, 1, 3.5, COL.dust, 0.35, 1.5, -0.5); }
    const boost = this.charge ? 1 : 0.25;
    for (const sx of [-0.35, 0.35]) {
      const tp = _v1.set(sx, 0.45, -1.95).applyMatrix4(this.obj.matrixWorld);
      const back = _v2.set(0, 0, -1).transformDirection(this.obj.matrixWorld).multiplyScalar(4 + 10 * boost);
      if (Math.random() < 0.4 + boost * 0.6) fx.spawn(tp, back, 0.15 + 0.35 * boost, 0.7 + boost, 0.2, this.charge ? COL.cyanHot : COL.plasma, 0.9, 1);
    }
    if (this.charge && this.gap < 5.5) { damagePlayer(30); this.alive = false; award(this, this.pos, 0, true); explosion(this.pos, 1); this.remove(); return; }
    this.cool -= dt;
    if (this.cool <= 0 && !this.charge) {
      this.cool = rand(1.6, 2.4); this.burstN = 4; sfx.ghostFire(this.pos.distanceTo(vehicle.position));
    }
    if (this.burstN > 0) { this.bt = (this.bt || 0) - dt; if (this.bt <= 0) { this.bt = 0.12; this.burstN--; this.gunSide ^= 1; const mz = V(this.gunSide ? 0.45 : -0.45, 0.45, 1.85).applyMatrix4(this.obj.matrixWorld); fx.spawn(mz, V(), 0.07, 1.6, 0.4, COL.plasmaPink, 1); this.aimAtPlayer(3.5, 48, COL.plasmaPink, 4, 0.8, mz, true); } }
  };
  e.die = function (at) { this.vel.set(rand(-4, 4), 9, 0).addScaledVector(vehicleFwd, G.speed); explosion(this.pos, this.pilotShot ? 0.4 : 0.6, true); sfx.ghostDie(this.pos.distanceTo(vehicle.position)); this.ejectRider(); };
  return e;
}

function banshee(s, side, height) {
  const g = new THREE.Group(); const m = cloneModel('banshee', true); m.position.y = -2.2; g.add(m);
  const e = new Enemy('banshee', g, 30, [{ o: V(0, 0, 0.4), r: 1.6 }, { o: V(2.3, 0, -0.2), r: 1.1 }, { o: V(-2.3, 0, -0.2), r: 1.1 }], 600);
  e.mode = 'approach'; e.target = V(); e.speed = 28; e.side = side; e.h = height;
  e.pos.copy(groundPoint(s, side)).add(V(0, height, 0));
  e.update = function (dt) {
    if (!this.alive) {
      this.deadT += dt; this.vel.y -= 14 * dt; this.pos.addScaledVector(this.vel, dt); this.obj.rotateZ(5 * dt);
      if (Math.random() < 0.8) { fx.spawn(this.pos, V(0, 1, 0), 0.4, 3, 1, COL.fire, 1, 1); smoke.spawn(this.pos, V(0, 1, 0), 2, 2, 7, COL.smoke, 0.6, 1, -1); }
      if (this.pos.y < groundH(this.pos.x, this.pos.z) + 1) { explosion(this.pos, 1.2); this.remove(); }
      if (this.deadT > 5) this.remove(); return;
    }
    this.t += dt;
    if (this.mode === 'approach') {
      this.target.copy(groundPoint(G.s + 14, this.side * 0.3)).add(V(0, 9, 0));
      if (this.pos.distanceTo(this.target) < 14) { this.mode = 'away'; this.away = groundPoint(G.s + 150, -this.side * rand(0.6, 1.2)).add(V(0, rand(26, 40), 0)); }
    } else {
      this.target.copy(this.away); this.away.addScaledVector(vehicleFwd, G.speed * dt);
      if (this.pos.distanceTo(this.target) < 18) { this.mode = 'approach'; this.side = rand(-30, 30); }
    }
    const want = _v1.copy(this.target).sub(this.pos).normalize().multiplyScalar(this.speed).addScaledVector(vehicleFwd, G.speed * 0.8);
    this.vel.lerp(want, dt * 1.6); this.pos.addScaledVector(this.vel, dt);
    const look = _v2.copy(this.pos).add(this.vel);
    this.obj.lookAt(look);
    const turn = this.vel.clone().normalize().cross(want.normalize()).y;
    this.bank = lerp(this.bank || 0, clamp(-turn * 3, -0.9, 0.9), dt * 3); this.obj.rotateZ(this.bank);
    this.cool -= dt;
    if (this.mode === 'approach' && this.cool <= 0 && this.pos.distanceTo(vehicle.position) < 110) {
      this.cool = rand(0.9, 1.6);
      const big = Math.random() < 0.3;
      this.aimAtPlayer(big ? 2 : 3, big ? 34 : 55, big ? COL.green : COL.plasmaPink, big ? 18 : 5, big ? 2.2 : 0.9, _v3.copy(this.pos).addScaledVector(_v2.copy(this.vel).normalize(), 3));
    }
  };
  e.die = function () { this.vel.multiplyScalar(0.6); explosion(this.pos, 0.6); };
  return e;
}

const shadeTipGeo = new THREE.SphereGeometry(0.16, 10, 8), shadeTipMat = new THREE.MeshBasicMaterial({ color: 0x9fe6ff, toneMapped: false });
function shade(p) {
  const g = new THREE.Group(); const m = cloneModel('shade', true); m.scale.setScalar(0.85); g.add(m); g.position.copy(p);
  const e = new Enemy('shade', g, 32, [{ o: V(0, 1.9, 0.4), r: 1.5 }, { o: V(0, 0.8, 0), r: 0.9 }], 500);
  e.tips = [-1, 1].map(sd => { const o = new THREE.Mesh(shadeTipGeo, shadeTipMat); o.position.set(sd * 0.59, 1.71, 2.8); g.add(o); return o; });
  e.shieldMats = []; m.traverse(n => { if (n.isMesh && /efct_shield/.test(n.material.name)) e.shieldMats.push(n.material); });
  e.side = 0;
  e.update = function (dt) {
    if (!this.alive) { this.remove(); return; }
    this.t += dt; this.obj.lookAt(vehicle.position.x, this.pos.y, vehicle.position.z);
    for (const sm of this.shieldMats) sm.opacity = 0.28 + Math.sin(this.t * 5) * 0.08 + (this.flash > 0 ? 0.4 : 0);
    for (const t of this.tips) t.scale.setScalar(1 + Math.sin(this.t * 9 + t.position.x) * 0.15);
    if (Math.random() < 0.3) { const t = this.tips[Math.random() < 0.5 ? 0 : 1]; fx.spawn(t.getWorldPosition(_v1), V(0, 0.6, 0), 0.35, 0.5, 0.1, COL.plasma, 0.8, 1); }
    const d = this.pos.distanceTo(vehicle.position); this.cool -= dt;
    if (this.cool <= 0 && d < 120) { this.cool = rand(1.8, 2.6); this.burstN = 6; }
    if (this.burstN > 0) { this.bt = (this.bt || 0) - dt; if (this.bt <= 0) { this.bt = 0.09; this.burstN--; this.side ^= 1; const tp = this.tips[this.side].getWorldPosition(V()); fx.spawn(tp, V(), 0.08, 2.2, 0.6, COL.plasma, 1); this.aimAtPlayer(3, 60, COL.plasma, 4, 0.9, tp); } }
  };
  e.die = function () { explosion(_v1.copy(this.pos).add(V(0, 1.5, 0)), 1); };
  return e;
}

function watchtower(p) {
  const g = new THREE.Group(); const m = cloneModel('watchtower'); g.add(m); g.position.copy(p);
  const e = new Enemy('watchtower', g, 70, [{ o: V(0, 3, 0), r: 2.6 }, { o: V(0, 7.5, 0), r: 3.4 }, { o: V(0, 10.5, 0), r: 3.4 }], 800);
  g.lookAt(vehicle.position.x, p.y, vehicle.position.z);
  e.parts = ['mesh_watchtower_canopy', 'mesh_watchtower_platform'].map(n => m.getObjectByName(n)).filter(Boolean);
  e.crew = [];
  for (let i = 0; i < 2; i++) { const gp = p.clone().add(V(rand(-2, 2), 9.4, rand(-2, 2))); e.crew.push(grunt(gp, { perch: true })); }
  e.update = function (dt) {
    if (!this.alive) {
      this.deadT += dt;
      this.parts.forEach((pt, i) => { if (!pt.userData.v) { scene.attach(pt); pt.userData.v = V(rand(-6, 6), rand(8, 14), rand(-6, 6)); } pt.userData.v.y -= 18 * dt; pt.position.addScaledVector(pt.userData.v, dt); pt.rotation.x += dt * (i + 1.5); if (this.deadT > 3.9) scene.remove(pt); });
      this.obj.position.y -= dt * 3; if (Math.random() < 0.5) smoke.spawn(_v1.copy(this.pos).add(V(rand(-3, 3), rand(3, 10), rand(-3, 3))), V(0, 3, 0), 2, 4, 10, COL.smoke, 0.5, 1, -1);
      if (this.deadT > 4) this.remove(); return;
    }
  };
  e.die = function () {
    explosion(_v1.copy(this.pos).add(V(0, 8, 0)), 1.6); explosion(_v1.copy(this.pos).add(V(0, 3, 0)), 1);
    for (const c of this.crew) if (c.alive) { c.perch = false; c.damage(99, 0, c.pos); }
  };
  return e;
}

function elite(p) {
  const g = new THREE.Group(); const m = cloneModel('elite', true); m.scale.setScalar(2.1); m.position.y = -0.36; g.add(m); g.position.copy(p);
  const e = new Enemy('elite', g, 140, [{ o: V(0, 2.25, 0), r: 1.2 }, { o: V(0.3, 3.5, 0.37), r: 0.6, m: 1.5 }, { o: V(0, 1.1, 0), r: 0.9 }], 3000);
  e.rig = rigOf(m); e.gph = 0; e.last = p.clone(); e.slashT = 0; e.stag = 0;
  e.swordMats = []; m.traverse(n => { if (n.isMesh && n.material.userData.sword) e.swordMats.push(n.material); });
  const eDamage = e.damage;
  e.damage = function (n, idx, at) { const hp0 = this.hp; eDamage.call(this, n, idx, at); if (this.mode === 'windup') this.stag += hp0 - this.hp; };
  e.shieldHp = e.shieldMax = 45; e.shieldT = 0; e.sflash = 0; e.mode = 'stalk'; e.modeT = 2; e.jump = null; e.waveT = 6;
  const bz = creature('beetle');   // "Forest Monster Beetle" by ArachnoBoy (CC BY-NC 4.0) stands in for the sword boss
  if (bz) { m.visible = false; g.add(bz); e.bz = bz.userData; e.bz.play('.'); e.bzw = bz; e.mats = e.bz.mats;
    e.hits = [{ o: V(0, 3.2, 0), r: 2.6 }, { o: V(0, 3.4, 2.7), r: 1.2, m: 1.5 }, { o: V(0, 1.4, 0), r: 2.2 }]; }
  e.update = function (dt) {
    if (!this.alive) {
      this.deadT += dt; this.obj.rotation.x = Math.min(Math.PI / 2, this.obj.rotation.x + dt * 2.5);
      if (this.deadT > 3) this.remove(); return;
    }
    this.t += dt; this.shieldT += dt;
    if (this.shieldT > 2.6 && this.shieldHp < this.shieldMax) { if (this.shieldHp <= 0) sfx.recharge(); this.shieldHp = Math.min(this.shieldMax, this.shieldHp + 30 * dt); this.sflash = Math.max(this.sflash, 0.25); }
    if (this.shieldHp <= 0 && Math.random() < 0.3) fx.spawn(_v1.copy(this.pos).add(V(rand(-.5, .5), rand(0.5, 2.5), rand(-.5, .5))), V(0, 2, 0), 0.4, 0.4, 0.1, COL.blue, 1, 1);
    const toP = _v1.copy(vehicle.position).sub(this.pos).setY(0); const d = toP.length();
    this.modeT -= dt;
    if (this.jump) { // parabolic leap
      this.jump.t += dt; const f = Math.min(1, this.jump.t / this.jump.d);
      this.pos.lerpVectors(this.jump.a, this.jump.b, f); this.pos.y += Math.sin(f * Math.PI) * this.jump.h;
      if (f >= 1) { this.jump = null; burst(this.pos, 10, 5, 0.6, 1.5, 3.5, COL.dust, 0.6, 2, 0, smoke); }
    } else if (this.mode === 'stalk') {
      if (this.modeT <= 0) {
        if (Math.random() < 0.45 || this.t < 3) { const b = groundPoint(G.s + rand(14, 26), rand(-10, 10)); this.jump = { a: this.pos.clone(), b, t: 0, d: 0.9, h: rand(3, 6) }; this.modeT = rand(1.2, 2.2); }
        else { this.mode = 'charge'; this.atkSide = rand(-1.8, 1.8); G.msg = 'INCOMING!'; G.msgT = 1.2; }
      }
      if (Math.random() < dt * 0.8) this.aimAtPlayer(2.5, 40, COL.plasmaPink, 6, 1.0, _v3.copy(this.pos).add(V(0, 2.7, 0)));
    } else if (this.mode === 'charge') {
      // run up to the Warthog's hood
      const A = _v2.copy(vehicle.position).addScaledVector(vehicleFwd, this.bz ? 7.5 : 4.6).addScaledVector(trackSide(G.s, _v3), this.atkSide);
      const to = A.sub(this.pos).setY(0), dA = to.length();
      if (dA > 0.8) this.pos.addScaledVector(to.normalize(), Math.min(dA, 15 * dt));
      else { this.mode = 'windup'; this.modeT = 0.65; this.stag = 0; this.combo = 0; sfx.swordCharge(); }
    } else if (this.mode === 'windup') {
      if (this.stag >= 10) { this.mode = 'stagger'; this.modeT = 0.7; sfx.eliteHurt(); popups.push({ p: this.pos.clone().add(V(0, 3.6, 0)), t: 0, text: 'STAGGERED!', col: '#8fd0ff' }); G.score += 300; }
      else if (this.modeT <= 0) { this.mode = 'slash'; this.atkT = 0; this.combo = 1; this.hitDone = false; sfx.swordWhoosh(); }
    } else if (this.mode === 'slash') {
      this.atkT += dt; const f = this.atkT / 0.3;
      if (!this.hitDone && f > 0.45) { this.hitDone = true; damagePlayer(20); slashFx.push({ t: 0, a: this.combo === 1 ? -0.7 : 0.55 }); sfx.swordHit(); shake = Math.max(shake, 0.5); }
      if (f >= 1) { if (this.combo < 2) { this.combo = 2; this.atkT = 0; this.hitDone = false; sfx.swordWhoosh(); } else { this.mode = 'recover'; this.modeT = 0.45; } }
    } else if (this.mode === 'recover' || this.mode === 'stagger') {
      if (this.modeT <= 0) { this.mode = 'stalk'; this.modeT = 1.6; this.jump = { a: this.pos.clone(), b: groundPoint(G.s + 22, rand(-9, 9)), t: 0, d: 1.1, h: 7 }; }
    }
    if (!this.jump) this.pos.y = groundH(this.pos.x, this.pos.z);
    if (this.mode === 'stagger') this.pos.addScaledVector(_v2.copy(this.pos).sub(vehicle.position).setY(0).normalize(), 3 * dt);
    this.obj.lookAt(vehicle.position.x, this.pos.y, vehicle.position.z);
    // animate
    const r = this.rig, sp = _v2.copy(this.pos).sub(this.last).setY(0).length() / Math.max(dt, 1e-3); this.last.copy(this.pos);
    this.slashT = Math.max(0, this.slashT - dt);
    if (this.jump) {
      const f = this.jump.t / this.jump.d, tuck = Math.sin(f * Math.PI);
      r.legL.rotation.x = r.legR.rotation.x = -0.9 * tuck - 0.2; r.shinL.rotation.x = r.shinR.rotation.x = 1.4 * tuck + 0.2;
      r.spine.rotation.x = 0.25; r.armR.rotation.set(-0.6 * tuck, 0, 0.5 * tuck); r.armL.rotation.set(-0.8 * tuck, 0, -0.4);
      r.hips.position.y = r.hips.userData.p0.y;
    } else if (this.mode === 'windup' || this.mode === 'slash' || this.mode === 'recover' || this.mode === 'stagger') {
      const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
      const REST = [0, 0, 0, 0], UP = [-1.2, 0, -0.6, -0.15], LOW = [1.0, 0, 0.9, 0.4], HIGH = [-0.6, 0, 0.8, 0.1], RECOIL = [-1.4, 0, -1.2, -0.45];
      let a = REST, b = REST, f = 0;
      if (this.mode === 'windup') { a = REST; b = UP; f = ease(clamp(1 - this.modeT / 0.65, 0, 1)); }
      else if (this.mode === 'slash') { a = this.combo === 1 ? UP : LOW; b = this.combo === 1 ? LOW : HIGH; f = ease(clamp(this.atkT / 0.3, 0, 1)); }
      else if (this.mode === 'recover') { a = HIGH; b = REST; f = clamp(1 - this.modeT / 0.45, 0, 1); }
      else { a = RECOIL; b = REST; f = clamp(1 - this.modeT / 0.7, 0, 1) * 0.6; }
      r.armL.rotation.set(lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f));
      r.spine.rotation.set(lerp(a[3], b[3], f), 0, 0);
      r.armR.rotation.set(this.mode === 'stagger' ? -1.2 : 0.4, 0, this.mode === 'stagger' ? 0.8 : 0.3);
      r.legL.rotation.x = 0.25; r.legR.rotation.x = -0.3; r.shinL.rotation.x = 0.35; r.shinR.rotation.x = 0.5;
      r.hips.position.y = r.hips.userData.p0.y - 0.06;
      // blade trail while swinging
      if (this.mode === 'slash' && !this.bz) {
        const tip = this.obj.getObjectByName('swordTip').getWorldPosition(_v2), mid = this.obj.getObjectByName('swordMid').getWorldPosition(_v3);
        for (let i = 0; i <= 6; i++) fx.spawn(_v1.copy(mid).lerp(tip, i / 6), V(), 0.22, 1.1, 0.3, C(0xff5a8a), 0.9, 1);
        if (this.lastTip) for (let i = 1; i < 4; i++) fx.spawn(_v1.copy(this.lastTip).lerp(tip, i / 4), V(), 0.22, 1.0, 0.3, C(0xff8ab0), 0.9, 1);
        this.lastTip = (this.lastTip || V()).copy(tip);
      } else this.lastTip = null;
    } else {
      const charging = this.mode === 'charge';
      this.gph += dt * (charging ? 13 : 2 + sp * 1.2);
      gait(r, this.gph, charging ? 0.75 : clamp(0.08 + sp * 0.1, 0.08, 0.5), { waddle: 0.08, bob: 0.08, lean: charging ? 0.35 : 0.05 });
      const sw = Math.sin(this.gph) * (charging ? 0.6 : 0.2);
      r.armR.rotation.set(sw, 0, 0);
      const slash = 0;
      r.armL.rotation.set(charging ? -0.9 - slash * 1.2 : -sw * 0.6 + Math.sin(this.t * 2) * 0.05, 0, charging ? -0.3 + slash * 1.4 : 0);
      r.head.rotation.set(Math.sin(this.t * 1.1) * 0.06, Math.sin(this.t * 0.7) * 0.15, 0);
    }
    this.waveT -= dt;
    if (this.waveT <= 0) { this.waveT = 13; const sd = rand(-14, 14); for (let i = 0; i < 3; i++) grunt(groundPoint(G.s + rand(26, 38), sd + rand(-5, 5))); cells(32, sd + rand(-3, 3), 1); }
    this.sflash = Math.max(0, this.sflash - dt * 3);
    const glow = this.mode === 'windup' ? 0.5 + 3 * (1 - this.modeT / 0.65) : this.mode === 'slash' ? 3.5 : 0.4 + Math.sin(this.t * 6) * 0.15;
    for (const sm of this.swordMats) { sm.emissive.setRGB(1, 0.2, 0.35); sm.emissiveIntensity = glow; }
    if (this.bz) this.beetlePose(dt);
    if (!this.bz && this.mode === 'windup' && Math.random() < 0.6) fx.spawn(this.obj.getObjectByName('swordTip').getWorldPosition(_v1), V(rand(-1, 1), rand(0, 2), rand(-1, 1)), 0.3, 0.8, 0.1, C(0xff5a8a), 1, 1);
  };
  // the beetle has one walk cycle; rearing, lunging and recoiling are layered on top
  e.beetlePose = function (dt) {
    const w = this.bzw, charging = this.mode === 'charge' || this.jump;
    if (this.bz.mixer) this.bz.mixer.update(dt * (charging ? 2.2 : this.mode === 'stalk' ? 1 : 0.4));
    let rx = 0, z = 0, y = 0;
    if (this.mode === 'windup') { const f = clamp(1 - this.modeT / 0.65, 0, 1); rx = -0.55 * f; y = 0.6 * f; if (Math.random() < 0.5) fx.spawn(this.obj.localToWorld(V(rand(-1, 1), 4, 3)), V(0, 1, 0), 0.3, 0.8, 0.1, C(0x9dff5a), 1, 1); }
    else if (this.mode === 'slash') { const f = clamp(this.atkT / 0.3, 0, 1); rx = lerp(-0.55, 0.3, f); z = Math.sin(f * Math.PI) * 1.6; }
    else if (this.mode === 'stagger') { rx = -0.25 + Math.sin(this.t * 40) * 0.08; z = -0.6; }
    else if (this.jump) rx = -0.2;
    w.rotation.x = lerp(w.rotation.x, rx, Math.min(1, dt * 12)); w.position.z = lerp(w.position.z, z, Math.min(1, dt * 12)); w.position.y = lerp(w.position.y, y, Math.min(1, dt * 12));
  };
  e.die = function () { burst(_v1.copy(this.pos).add(V(0, 1.5, 0)), 40, 8, 1, 1, 3, this.bz ? C(0x9dff5a) : COL.blue, 1, 2); sfx.boom(1.6); if (!this.bz) sfx.eliteDie(); win(); };
  G.boss = e;
  return e;
}

// ---------------------------------------------------------------- plasma cells (shoot to detonate)
const CELL_R = 13;                       // blast radius (m)
const cellGeo = {
  base: new THREE.CylinderGeometry(0.75, 0.95, 0.35, 10).translate(0, 0.17, 0),
  cap: new THREE.CylinderGeometry(0.5, 0.42, 0.3, 10).translate(0, 2.5, 0),
  ribs: new THREE.CylinderGeometry(0.46, 0.46, 2.1, 6, 1, true).translate(0, 1.4, 0),
  glass: new THREE.CylinderGeometry(0.4, 0.4, 2.1, 14, 1, true).translate(0, 1.4, 0),
  core: new THREE.CylinderGeometry(0.2, 0.2, 2.1, 8).translate(0, 1.4, 0),
};
const cellCore = new THREE.MeshBasicMaterial({ color: 0x9ffcff, toneMapped: false });
const cellGlass = new THREE.MeshBasicMaterial({ color: 0x3ad8ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const cellMetal = new THREE.MeshStandardMaterial({ color: 0x3b3456, metalness: 0.5, roughness: 0.4 });
const cellRib = new THREE.MeshStandardMaterial({ color: 0x6a5a92, metalness: 0.6, roughness: 0.35, wireframe: true });
let cellHinted = false;
function cell(p) {
  const g = new THREE.Group(); g.position.copy(p); g.rotation.y = rand(0, 6);
  const metal = cellMetal.clone();
  g.add(new THREE.Mesh(cellGeo.base, metal), new THREE.Mesh(cellGeo.cap, metal), new THREE.Mesh(cellGeo.core, cellCore), new THREE.Mesh(cellGeo.glass, cellGlass), new THREE.Mesh(cellGeo.ribs, cellRib));
  const e = new Enemy('cell', g, 3, [{ o: V(0, 1.4, 0), r: 0.85 }, { o: V(0, 0.4, 0), r: 0.9 }], 50);
  e.mats = [metal];
  e.update = function (dt) {
    if (!this.alive) { this.remove(); return; }
    if (Math.random() < 0.25) fx.spawn(_v1.copy(this.pos).add(V(rand(-.3, .3), rand(0.4, 2.4), rand(-.3, .3))), V(0, rand(0.5, 1.5), 0), 0.8, 0.5, 0.1, COL.cyan, 0.8, 0.5);
    if (!cellHinted && this.pos.distanceTo(vehicle.position) < 70) { cellHinted = true; say('SHOOT THE PLASMA CELLS!', 2.5); }
  };
  e.damage = function (n, idx, at) { if (!this.alive) return; this.hp -= n; this.flash = 1; sfx.cellHit(); burst(at, 3, 4, 0.2, 0.5, 0.1, COL.cyan, 1, 3); if (this.hp <= 0) { this.alive = false; award(this, at, 0); plasmaBlast(_v1.copy(this.pos).add(V(0, 1.2, 0))); } };
  return e;
}
function cells(sOff, side, n = 1) {
  const c = groundPoint(G.s + sOff, side);
  for (let i = 0; i < n; i++) { const a = i * 2.4 + rand(0, 0.6), r = n > 1 ? 1.6 : 0; const p = c.clone().add(V(Math.cos(a) * r, 0, Math.sin(a) * r)); p.y = groundH(p.x, p.z); cell(p); }
}
// expanding shockwave rings
const rings = [];
const ringGeo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
function plasmaBlast(at) {
  const p = at.clone();
  burst(p, 70, 20, 0.7, 4, 11, COL.cyan, 1, 3);
  burst(p, 30, 10, 0.35, 9, 2, COL.cyanHot, 1, 4);
  burst(p, 60, 30, 1.1, 0.5, 0.1, COL.cyanHot, 1, 1.5, 12);
  burst(p, 14, 5, 2, 3, 9, C(0x5a7a9a), 0.45, 1.2, -2, smoke);
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x6ff0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  m.position.copy(p); m.position.y -= 0.8; scene.add(m); rings.push({ m, t: 0 });
  lightFlash(p, 0x5fe8ff, 2600);
  shake = Math.max(shake, 0.45); sfx.plasmaBoom();
  pendingBlasts.push({ p: p.clone(), t: 0.12 });
}
const pendingBlasts = [];
function updateBlasts(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt; const f = r.t / 0.55;
    r.m.scale.setScalar(1 + f * CELL_R * 1.25); r.m.material.opacity = Math.max(0, 1 - f);
    if (f >= 1) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); }
  }
  for (let i = pendingBlasts.length - 1; i >= 0; i--) {
    const b = pendingBlasts[i]; b.t -= dt; if (b.t > 0) continue;
    pendingBlasts.splice(i, 1);
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = _v1.copy(e.pos).sub(b.p).setY(0).length(); if (d > CELL_R) continue;
      if (e.kind === 'cell') { e.blastT = 0.15 + d * 0.02; continue; }        // chain reaction (slight delay)
      if (e.kind === 'elite') { e.shieldHp = 0; e.shieldT = 0; e.damage(45, 0, e.pos.clone()); e.flash = 1; continue; }
      if (e.kind === 'watchtower') { e.damage(45, 0, e.pos.clone()); continue; }
      if (e.kind === 'tidefather' || e.kind === 'tentacle' || e.kind === 'gill') continue;
      if (e.kind === 'wraith' || e.kind === 'engine' || e.kind === 'serpent') { e.damage(110, 0, e.pos.clone()); continue; }
      if (e.kind === 'icicle' || e.kind === 'crack' || e.kind === 'crate' || e.kind === 'flarepod') continue;
      e.damage(999, 0, e.pos.clone());
    }
    for (const bo of bolts) if (bo.p.distanceTo(b.p) < CELL_R) bo.life = 0;
  }
  for (const e of enemies) if (e.kind === 'cell' && e.alive && e.blastT !== undefined) { e.blastT -= dt; if (e.blastT <= 0) e.damage(99, 0, e.pos.clone()); }
}

// ---------------------------------------------------------------- energy shields (blocks shots from the front)
const shieldGeo = new THREE.CircleGeometry(1, 28);
function makeShield(rx, ry) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uHit: { value: 0 }, uHp: { value: 1 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform float uT, uHit, uHp; varying vec2 vP;
      void main(){ float r = length(vP); float rim = smoothstep(0.7, 1.0, r);
        float hex = abs(sin(vP.x * 14.0 + uT * 2.0) * sin(vP.y * 14.0 - uT * 1.3));
        float a = 0.16 + rim * 0.55 + hex * 0.08 + uHit * 0.5; a *= (1.0 - smoothstep(0.98, 1.0, r));
        vec3 c = mix(vec3(0.25, 0.65, 1.0), vec3(1.0, 0.45, 0.35), 1.0 - uHp) + uHit * 0.6;
        gl_FragColor = vec4(c * a * (0.6 + 0.4 * sin(uT * 7.0 + r * 9.0) * (1.0 - uHp)), 1.0); }`
  });
  const mesh = new THREE.Mesh(shieldGeo, m); mesh.scale.set(rx, ry, 1); return mesh;
}
// ray vs. shield ellipse (shield faces its local +Z); returns distance or null
function shieldHit(e, ray) {
  if (!e.shield || !e.shieldUp || e.shieldBroken) return null;
  const sh = e.shield; sh.updateMatrixWorld();
  const c = sh.getWorldPosition(_v1), n = _v2.set(0, 0, 1).transformDirection(sh.matrixWorld);
  const den = n.dot(ray.direction); if (Math.abs(den) < 1e-4) return null;
  const t = _v3.copy(c).sub(ray.origin).dot(n) / den; if (t < 0) return null;
  const hp = ray.at(t, V()); sh.worldToLocal(hp);
  return (hp.x * hp.x + hp.y * hp.y) <= 1 ? t : null;
}
function shieldDamage(e, n, at) {
  e.shieldHpNow -= n; e.shieldMat.uniforms.uHit.value = 1; burst(at, 3, 5, 0.2, 0.5, 0.1, COL.blue, 1, 3);
  if (e.shieldHpNow <= 0 && !e.shieldBroken) {
    e.shieldBroken = true; e.shield.visible = false; burst(e.shield.getWorldPosition(V()), 30, 8, 0.5, 1, 0.2, COL.cyanHot, 1, 2);
    popups.push({ p: at.clone(), t: 0, text: 'SHIELD BROKEN', col: '#8fd0ff' }); sfx.shieldHit();
  }
}

// ---------------------------------------------------------------- Jackals (local model) / shield-Grunt fallback
// bone posing in model space: rotation about a model-space axis, whatever the bone's own local frame is
function prepBones(model) {
  model.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(model.matrixWorld).invert(), tmp = new THREE.Matrix4(), pos = V(), scl = V();
  const B = {};
  model.traverse(b => { if (!b.isBone) return; const k = b.name.replace(/^mixamorig:?/, '').replace(/_\d+$/, '');
    tmp.multiplyMatrices(inv, b.parent.matrixWorld); const pq = new THREE.Quaternion(); tmp.decompose(pos, pq, scl);
    b.userData.q0 = b.quaternion.clone(); b.userData.p0 = b.position.clone(); b.userData.pq = pq; b.userData.pqi = pq.clone().invert(); B[k] = b; });
  return B;
}
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), AX = V(1, 0, 0), AY = V(0, 1, 0), AZ = V(0, 0, 1);
function pose(b, ax, ay, az) {   // model-space Euler-ish (X then Z then Y) applied on top of the rest pose
  if (!b) return;
  _qa.setFromAxisAngle(AY, ay || 0).multiply(_qb.setFromAxisAngle(AZ, az || 0)).multiply(_qb.setFromAxisAngle(AX, ax || 0));
  b.quaternion.copy(b.userData.pqi).multiply(_qa).multiply(b.userData.pq).multiply(b.userData.q0);
}
function jackal(p, opts = {}) {
  if (!M.jackal) return shieldGrunt(p);
  const g = new THREE.Group(); const m = cloneModel('jackal', true); m.scale.setScalar(1.25); g.add(m); g.position.copy(p);
  const e = new Enemy('jackal', g, 3, [{ o: V(0, 1.1, 0.05), r: 0.5 }, { o: V(0.06, 1.68, 0.55), r: 0.3, m: 2 }, { o: V(0, 0.5, -0.1), r: 0.45 }], 150);
  e.B = prepBones(m); e.mixer = new THREE.AnimationMixer(m);
  if (e.B.rig_hips) {   // auto-rigged custom model: point the Mixamo bone names at the generic joints
    const A = { Hips: 'hips', Spine1: 'spine', Head: 'head', LeftArm: 'armL', RightArm: 'armR', LeftUpLeg: 'legL', RightUpLeg: 'legR', LeftLeg: 'shinL', RightLeg: 'shinR' };
    for (const k in A) e.B[k] = e.B['rig_' + A[k]];
  }
  const anim = (M.jackal_anims || [])[0];
  if (anim) {
    const clip = M.jackal_rollClip || (M.jackal_rollClip = (() => { const c = anim.clone(); for (const t of c.tracks) if (/Hips.*position/.test(t.name)) for (let i = 0; i < t.values.length; i += 3) { t.values[i] = t.values[0]; t.values[i + 2] = t.values[2]; } return c; })());
    e.roll = e.mixer.clipAction(clip); e.roll.setLoop(THREE.LoopOnce); e.roll.clampWhenFinished = false;
  } else {   // no roll animation in the file: a quick tumble instead
    e.roll = { t: 0, isRunning() { return this.t > 0; }, reset() { return this; }, play() { this.t = 0.6; } };
    e.mixer = { update(dt) { e.roll.t = Math.max(0, e.roll.t - dt); m.rotation.z = Math.sin((1 - e.roll.t / 0.6) * Math.PI) * 0.9 * (e.rollDir || 1) * -1; m.position.y = Math.sin((1 - e.roll.t / 0.6) * Math.PI) * 0.25; }, stopAllAction() { m.rotation.z = 0; m.position.y = 0; } };
  }
  setupShield(e, g, V(-0.1, 1.15, 0.95), 0.75, 0.95, 7);
  jackalBrain(e, p, opts); return e;
}
function shieldGrunt(p) {   // same mechanic with models we always have
  const e = grunt(p); e.kind = 'jackal'; e.score = 150; e.hp = e.maxHp = 3;
  setupShield(e, e.obj, V(0, 0.75, 0.75), 0.62, 0.72, 6);
  const base = e.update; e.update = function (dt) { base.call(this, dt); shieldTick(this, dt); };
  return e;
}
function setupShield(e, parent, at, rx, ry, hp) {
  e.shield = makeShield(rx, ry); e.shield.position.copy(at); e.shieldHome = at.clone(); parent.add(e.shield);
  e.shieldMat = e.shield.material; e.shieldUp = true; e.shieldBroken = false; e.shieldHpNow = e.shieldHpMax = hp; e.shieldLower = 0;
  const baseHit = e.hitTest, baseDmg = e.damage;
  e.hitTest = function (ray) { const body = baseHit.call(this, ray), sd = shieldHit(this, ray); if (sd !== null && (!body || sd < body[0])) return [sd, -1]; return body; };
  e.damage = function (n, idx, at) { if (idx === -1) { shieldDamage(this, n, at); this.hurt = (this.hurt || 0) + n; return; } this.hurt = (this.hurt || 0) + n; baseDmg.call(this, n, idx, at); };
}
function shieldTick(e, dt) {
  if (!e.shield) return;
  e.shieldMat.uniforms.uT.value += dt; e.shieldMat.uniforms.uHit.value = Math.max(0, e.shieldMat.uniforms.uHit.value - dt * 5);
  e.shieldMat.uniforms.uHp.value = clamp(e.shieldHpNow / e.shieldHpMax, 0, 1);
  if (!e.shieldBroken) e.shieldHpNow = Math.min(e.shieldHpMax, e.shieldHpNow + dt * 1.5);
  // lowered = swung out to the side (body exposed) while firing
  const k = e.shieldLower; e.shieldUp = k < 0.5;
  e.shield.position.copy(e.shieldHome).add(_v1.set(-k * 0.9, -k * 0.35, -k * 0.4)); e.shield.rotation.y = -k * 1.2;
  if (!e.alive) e.shield.visible = false;
}
function jackalBrain(e, p, opts) {
  e.home = p.clone(); e.phase = rand(0, 6); e.last = p.clone(); e.gph = rand(0, 6); e.fireT = rand(1.5, 3); e.burst = 0; e.rollCd = rand(2, 4);
  e.update = function (dt) {
    const B = this.B;
    if (!this.alive) {
      this.deadT += dt; this.mixer.stopAllAction(); const k = Math.min(1, this.deadT * 2.2);
      this.obj.rotation.x = -k * 1.35; this.pos.y = lerp(this.pos.y, groundH(this.pos.x, this.pos.z), dt * 4);
      pose(B.LeftArm, -k * 1.2, 0, -k * 0.6); pose(B.RightArm, -k * 1.4, 0, k * 0.6); pose(B.Head, -k * 0.6, 0, 0);
      shieldTick(this, dt); if (this.deadT > 2.4) this.remove(); return;
    }
    this.t += dt; const d = this.pos.distanceTo(vehicle.position);
    // sidestep / strafe while facing the hog
    const side = trackSide(G.s), rolling = this.roll.isRunning();
    if (rolling) this.pos.addScaledVector(side, this.rollDir * 3.2 * dt);
    else this.pos.copy(this.home).addScaledVector(side, Math.sin(this.t * 0.8 + this.phase) * 2.4);
    if (rolling) this.home.addScaledVector(side, this.rollDir * 3.2 * dt);
    this.pos.y = groundH(this.pos.x, this.pos.z);
    this.obj.lookAt(vehicle.position.x, this.pos.y, vehicle.position.z);
    // dodge roll when hurt
    this.rollCd -= dt;
    if (!rolling && this.hurt > 3 && this.rollCd <= 0) { this.hurt = 0; this.rollCd = rand(3, 5); this.rollDir = Math.random() < 0.5 ? -1 : 1; this.roll.reset().play(); }
    // fire: swing the shield aside, 3 quick bolts, raise it again
    this.fireT -= dt;
    if (this.fireT <= 0 && d < 100 && !rolling) { this.burst = 3; this.fireT = rand(2.6, 4.2); this.bt = 0.35; }
    if (this.burst > 0) { this.shieldLower = Math.min(1, this.shieldLower + dt * 5); this.bt -= dt; if (this.bt <= 0 && this.shieldLower > 0.8) { this.bt = 0.22; this.burst--; this.aimAtPlayer(2.8, 44, COL.green, 6, 0.9, _v3.copy(this.pos).add(V(0, 1.3, 0)).addScaledVector(_v2.copy(vehicle.position).sub(this.pos).setY(0).normalize(), 0.8)); } }
    else this.shieldLower = Math.max(0, this.shieldLower - dt * 3);
    shieldTick(this, dt);
    if (rolling) { this.mixer.update(dt); return; }
    // procedural crouched gait + aiming arm
    const sp = this.last.distanceTo(this.pos) / Math.max(dt, 1e-3); this.last.copy(this.pos);
    this.gph += dt * (3 + sp * 3.5); const a = clamp(0.12 + sp * 0.16, 0.1, 0.5), sL = Math.sin(this.gph), sR = Math.sin(this.gph + Math.PI);
    for (const k in B) { const b = B[k]; b.quaternion.copy(b.userData.q0); }
    pose(B.LeftUpLeg, sL * a, 0, 0); pose(B.RightUpLeg, sR * a, 0, 0);
    pose(B.LeftLeg, Math.max(0, -Math.cos(this.gph)) * a * 1.2, 0, 0); pose(B.RightLeg, Math.max(0, Math.cos(this.gph)) * a * 1.2, 0, 0);
    pose(B.Spine1, Math.sin(this.t * 1.7) * 0.04, 0, Math.sin(this.gph) * a * 0.15);
    pose(B.Head, Math.sin(this.t * 1.1 + this.phase) * 0.08, Math.sin(this.t * 0.7) * 0.25, 0);
    const aim = this.shieldLower;
    pose(B.RightArm, -aim * 1.1, 0, aim * 0.3); pose(B.RightForeArm, -aim * 0.4, 0, 0);
    pose(B.LeftArm, aim * 0.3, 0, -aim * 0.5);
    const hb = B.Hips; if (hb) hb.position.y = hb.userData.p0.y + Math.abs(Math.cos(this.gph)) * a * 0.02;
  };
  e.die = function (at) { sfx.gruntDie(this.pos.distanceTo(vehicle.position)); burst(_v1.copy(this.pos).add(V(0, 1.2, 0)), 16, 5, 0.6, 1.2, 2.5, COL.blue, 0.8, 2); };
}

// ---------------------------------------------------------------- Wraith (level 2 boss)
const mortars = [];
const markerGeo = new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2);
function prepWraith() {   // re-pivot turret (yaw) and mortar (pitch) so they can move
  const w = M.wraith; if (!w || w.userData.prepped) return; w.userData.prepped = true; w.updateMatrixWorld(true);
  const get = n => { let f = null; w.traverse(o => { if (!f && o.name && o.name.includes(n)) f = o; }); return f; };
  const mk = (name, pivot, nodes) => { const piv = new THREE.Group(); piv.name = name; piv.position.copy(pivot); w.add(piv); for (const nd of nodes) if (nd) piv.attach(nd); return piv; };
  mk('wTurret', V(0, 4.2, -3.5), [get('Turret')]);
  mk('wMortar', V(0, 4.4, -8.6), [get('Mortar_Upper'), get('Stableizers1'), get('Stableizers2')]);
}
function wraith(p) {
  prepWraith();
  const g = new THREE.Group(); const m = cloneModel('wraith'); const S = 0.74; m.scale.setScalar(S); m.position.set(0, 0.5, 2.6 * S); g.add(m); g.position.copy(p);
  const o = (x, y, z) => V(x * S, y * S + 0.5, z * S + 2.6 * S);
  const e = new Enemy('wraith', g, 440, [{ o: o(0, 2.4, -3), r: 3.2 }, { o: o(0, 2.2, -8), r: 3.0 }, { o: o(5, 1.2, -2.5), r: 2.0 }, { o: o(-5, 1.2, -2.5), r: 2.0 }, { o: o(0, 4.6, -8.6), r: 1.3, m: 3 }], 5000);
  e.turret = m.getObjectByName('wTurret'); e.mortar = m.getObjectByName('wMortar'); e.vent = 4;
  e.ventMats = []; e.mortar.traverse(n => { if (n.isMesh) e.ventMats.push(n.material); });
  e.mortT = 3.5; e.gunT = 2; e.slide = 0; e.phase2 = false; e.ventHot = 0; e.dieT = 0;
  const baseDmg = e.damage;
  e.damage = function (n, idx, at) { if (!this.alive) return; const vent = idx === this.vent; if (vent && this.ventHot <= 0) n *= 0.2; else if (!vent) n *= 0.55; baseDmg.call(this, n, idx, at); if (vent && this.ventHot > 0) popups.length < 40 && Math.random() < 0.2 && popups.push({ p: at.clone(), t: 0, text: 'CRITICAL!', col: '#ffd24a' }); };
  e.update = function (dt) {
    if (!this.alive) {
      this.dieT += dt; this.pos.y -= dt * 0.6; this.obj.rotation.z += dt * 0.15;
      if (Math.random() < dt * 6) explosion(_v1.copy(this.pos).add(V(rand(-4, 4), rand(1, 4), rand(-5, 2))), rand(0.6, 1.1));
      if (this.dieT > 2.6 && !this.bigBoom) { this.bigBoom = true; explosion(_v1.copy(this.pos).add(V(0, 3, 0)), 2.2); if (this.mortar) { scene.attach(this.mortar); this.mortarFly = V(rand(-3, 3), 14, rand(-2, 2)); } }
      if (this.mortarFly) { this.mortarFly.y -= 20 * dt; this.mortar.position.addScaledVector(this.mortarFly, dt); this.mortar.rotation.x += dt * 4; }
      if (this.dieT > 4.5) { if (this.mortarFly) scene.remove(this.mortar); this.remove(); }
      return;
    }
    this.t += dt;
    if (!this.phase2 && this.hp < this.maxHp * 0.5) { this.phase2 = true; say('WRAITH ENRAGED', 1.6); ghost(G.s + 70, -10); ghost(G.s + 80, 10); }
    // hover + slow strafing slide across the arena
    if (this.slideT === undefined || (this.slideT -= dt) <= 0) { this.slideT = rand(3, 5); this.slideTo = rand(-12, 12); }
    this.slide = lerp(this.slide, this.slideTo, dt * 0.5);
    const gp = groundPoint(ARENA + 16, this.slide); this.pos.x = gp.x; this.pos.z = gp.z; this.pos.y = gp.y + 0.6 + Math.sin(this.t * 1.6) * 0.15;
    this.obj.lookAt(vehicle.position.x, this.pos.y, vehicle.position.z); this.obj.rotateZ(clamp((this.slideTo - this.slide) * 0.02, -0.12, 0.12));
    // turret tracks the camera
    _v1.copy(camera.position); this.turret.parent.updateMatrixWorld(); this.turret.parent.worldToLocal(_v1);
    this.turret.rotation.y = lerp(this.turret.rotation.y, clamp(Math.atan2(_v1.x - this.turret.position.x, _v1.z - this.turret.position.z), -1, 1), dt * 3);
    this.gunT -= dt;
    if (this.gunT <= 0) { this.gunT = this.phase2 ? 1.6 : 2.2; this.gb = 5; }
    if (this.gb > 0) { this.gbt = (this.gbt || 0) - dt; if (this.gbt <= 0) { this.gbt = 0.11; this.gb--; const mz = this.turret.localToWorld(V(0, 0.6, 2.2)); fx.spawn(mz, V(), 0.08, 2.4, 0.6, COL.plasma, 1); this.aimAtPlayer(3.4, 55, COL.plasma, 5, 1.0, mz); } }
    // mortar: wind-up (pitch back + glow), launch an arcing shell you can shoot down, vent runs hot
    this.mortT -= dt; this.ventHot = Math.max(0, this.ventHot - dt);
    const wind = clamp(1 - this.mortT / 0.9, 0, 1);
    this.mortar.rotation.x = lerp(this.mortar.rotation.x, this.mortT < 0.9 ? -0.45 * wind : (this.recoil || 0), dt * 8);
    this.recoil = Math.max(0, (this.recoil || 0) - dt * 1.2);
    if (this.mortT <= 0) {
      this.mortT = this.phase2 ? rand(2.6, 3.4) : rand(3.8, 4.6); this.recoil = 0.35; this.ventHot = 2.4;
      const from = this.mortar.localToWorld(V(0, 5.2, -0.6)); launchMortar(from, this);
    }
    const glow = this.ventHot > 0 ? 0.6 + 0.4 * Math.sin(this.t * 14) : wind * 0.8;
    for (const vm of this.ventMats) if (vm.emissive) { vm.emissive.setRGB(1, 0.35, 0.9); vm.emissiveIntensity = glow * 1.4; }
    if (this.ventHot > 0 && Math.random() < 0.5) fx.spawn(this.mortar.localToWorld(V(0, 4, 0)), V(rand(-1, 1), 3, rand(-1, 1)), 0.5, 0.8, 0.2, COL.plasmaPink, 0.8, 1);
  };
  e.die = function () { say('WRAITH DOWN!', 3); sfx.boom(1.6); win(); };
  e.shieldHp = undefined; G.boss = e;
  return e;
}
const boulderGeo = (() => { const g = new THREE.IcosahedronGeometry(1.1, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * rand(0.8, 1.2), p.getY(i) * rand(0.8, 1.2), p.getZ(i) * rand(0.8, 1.2)); g.computeVertexNormals(); return g; })();
const boulderMat = new THREE.MeshStandardMaterial({ color: 0xd8ecf8, roughness: 0.35, metalness: 0.05, emissive: 0x2a5a80, emissiveIntensity: 0.35, flatShading: true });
COL.acid = C(0x9dff3a);
const acidGeo = new THREE.IcosahedronGeometry(0.9, 1), acidMat = new THREE.MeshStandardMaterial({ color: 0x2f6a08, emissive: 0x7dff2a, emissiveIntensity: 1.4, roughness: 0.2 });
function launchMortar(from, owner, style) {
  const ice = style === true || style === 'ice', acid = style === 'acid';
  const target = vehicle.position.clone().add(V(rand(-3.5, 3.5), 0, rand(-2, 5))); target.y = groundH(target.x, target.z);
  const T = 2.5, v = target.clone().sub(from).divideScalar(T); v.y = (target.y - from.y) / T + 0.5 * 18 * T;
  const marker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: ice ? 0x7fd8ff : acid ? 0x9dff3a : 0xff5a8a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  marker.position.copy(target).add(V(0, 0.15, 0)); marker.scale.setScalar(5); scene.add(marker);
  let mesh = null; if (ice) { mesh = new THREE.Mesh(boulderGeo, boulderMat); mesh.position.copy(from); scene.add(mesh); }
  if (acid) { mesh = new THREE.Mesh(acidGeo, acidMat); mesh.position.copy(from); scene.add(mesh); }
  mortars.push({ p: from.clone(), v, t: 0, T, hp: 6, marker, target, ice, acid, mesh, spin: V(rand(-4, 4), rand(-4, 4), rand(-4, 4)) });
  sfx.cannon(from.distanceTo(vehicle.position)); fx.spawn(from, V(0, 6, 0), 0.3, 4, 1, ice ? COL.white : acid ? COL.acid : COL.plasmaPink, 1);
  if (!mortars.hinted) { mortars.hinted = true; say(ice ? 'SHOOT THE BOULDERS!' : acid ? 'SHOOT THE ACID GLOBS!' : 'SHOOT THE MORTARS!', 2); }
}
function updateMortars(dt) {
  for (let i = mortars.length - 1; i >= 0; i--) {
    const m = mortars[i]; m.t += dt; m.v.y -= 18 * dt; m.p.addScaledVector(m.v, dt);
    if (m.acid) { m.mesh.position.copy(m.p); m.mesh.scale.setScalar(1 + Math.sin(m.t * 18) * 0.12); fx.spawn(m.p, V(rand(-1, 1), rand(-1, 1), rand(-1, 1)), 0.5, 1.4, 0.3, COL.acid, 0.8, 1); }
    else if (m.mesh) { m.mesh.position.copy(m.p); m.mesh.rotation.x += m.spin.x * dt; m.mesh.rotation.y += m.spin.y * dt; if (Math.random() < 0.6) smoke.spawn(m.p, V(rand(-1, 1), rand(-1, 1), rand(-1, 1)), 0.6, 0.8, 2, COL.white, 0.5, 1); }
    else { fx.spawn(m.p, V(), 0.06, 4.2, 2.4, COL.plasmaPink, 1); fx.spawn(m.p, V(rand(-1, 1), rand(-1, 1), rand(-1, 1)), 0.4, 2.2, 0.3, COL.plasmaPink, 0.7, 1); }
    m.marker.material.opacity = 0.4 + 0.4 * Math.sin(m.t * 12); m.marker.scale.setScalar(5 - m.t * 0.8);
    const done = m.hp <= 0 || m.t >= m.T;
    if (done) {
      if (m.hp <= 0) { burst(m.p, 30, 9, 0.5, 1.4, 0.3, m.ice ? COL.white : m.acid ? COL.acid : COL.plasmaPink, 1, 2); G.score += 200; popups.push({ p: m.p.clone(), t: 0, text: m.ice ? 'BOULDER DOWN +200' : m.acid ? 'GLOB POPPED +200' : 'MORTAR DOWN +200', col: m.ice ? '#cfefff' : m.acid ? '#b8ff7a' : '#ffb0d8' }); sfx.boltZip(); if (m.ice) iceShatter(m.p, 1.2); }
      else { if (m.ice) { iceShatter(m.p, 1.6); sfx.impact(); sfx.boom(0.6); shake = Math.max(shake, 0.35); } else if (m.acid) { burst(m.p, 40, 10, 0.8, 0.8, 0.3, COL.acid, 1, 1.5, 10); burst(m.p, 12, 3, 1.6, 2, 5, C(0x5a8a2a), 0.5, 1.5, -1, smoke); lightFlash(m.p, 0x9dff3a, 1800); sfx.boom(0.5); } else { explosion(m.p, 1.1); lightFlash(m.p, 0xff60c0, 2200); } if (m.p.distanceTo(vehicle.position) < 7 && G.state === 'play') damagePlayer(m.ice ? 24 : 28); }
      scene.remove(m.marker); m.marker.material.dispose(); if (m.mesh) scene.remove(m.mesh); mortars.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------- level 4: night swamp (all original: scenery, flares, leapers, the Mire Serpent)
const swamp = { water: null, waterY: -0.9, flies: null, lights: [], flares: [], head: [] };
function buildSwampProps(minX, maxX, minZ, maxZ, m4, q) {
  swamp.waterY = -0.9;
  // black water with a faint moonlit sheen
  const wTex = canvasTex(256, (g, sz) => { g.fillStyle = '#0d1a1c'; g.fillRect(0, 0, sz, sz); for (let i = 0; i < 160; i++) { g.strokeStyle = `rgba(120,160,170,${rand(0.03, 0.09)})`; g.lineWidth = rand(1, 2); g.beginPath(); const x = rand(0, sz), y = rand(0, sz); g.moveTo(x, y); g.quadraticCurveTo(x + rand(10, 30), y + rand(-4, 4), x + rand(20, 60), y); g.stroke(); } }, 1);
  wTex.wrapS = wTex.wrapT = THREE.RepeatWrapping; wTex.repeat.set(40, 40);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX + 600, maxZ - minZ + 600).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: wTex, color: 0x2a3c40, transparent: true, opacity: 0.96 }));
  water.position.set((minX + maxX) / 2, swamp.waterY, (minZ + maxZ) / 2); scene.add(water); swamp.water = water;
  const tint = (g, c) => { g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count, a = new Float32Array(n * 3), cc = new THREE.Color(c); for (let i = 0; i < n; i++) cc.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; };
  // swamp cypress: flared trunk, flat drooping canopy, hanging moss
  const parts = [tint(new THREE.CylinderGeometry(0.35, 1.5, 3, 8).translate(0, 1.5, 0), 0x3b3226), tint(new THREE.CylinderGeometry(0.28, 0.4, 9, 7).translate(0, 7.2, 0), 0x40362a)];
  for (const [x, y, z, r] of [[0, 11.5, 0, 3.6], [2.2, 10.4, 1, 2.6], [-2.4, 10.8, -0.6, 2.8], [0.6, 12.6, -1.8, 2.4]]) parts.push(tint(new THREE.SphereGeometry(r, 9, 6).scale(1, 0.38, 1).translate(x, y, z), 0x1d3222));
  for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2, rr = rand(1.6, 3.2); parts.push(tint(new THREE.ConeGeometry(0.22, rand(2.2, 3.6), 4).rotateX(Math.PI).translate(Math.cos(a) * rr, 9.2, Math.sin(a) * rr), 0x6c7a5c)); }
  const treeGeo = mergeColored(parts); treeGeo.computeVertexNormals();
  const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 700); let n = 0;
  for (let t = 0; t < 7000 && n < 700; t++) { const x = rand(minX, maxX), z = rand(minZ, maxZ), [i, d] = nearest(x, z); if (d < 11 || d > 300) continue; const sc = rand(0.7, 1.5);
    m4.compose(V(x, Math.min(groundH(x, z), swamp.waterY) - 0.3, z), q.setFromAxisAngle(UP, rand(0, 6)), V(sc, sc * rand(0.85, 1.25), sc)); trees.setMatrixAt(n++, m4); }
  trees.count = n; scene.add(trees);
  // reeds and glowing bulb plants along the water's edge
  const reedGeo = mergeColored(Array.from({ length: 7 }, () => tint(new THREE.ConeGeometry(0.05, rand(1.2, 2.2), 3).translate(rand(-0.5, 0.5), 0.8, rand(-0.5, 0.5)), 0x4a5a2c)));
  const reeds = new THREE.InstancedMesh(reedGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), 900); n = 0;
  for (let t = 0; t < 6000 && n < 900; t++) { const x = rand(minX, maxX), z = rand(minZ, maxZ), [i, d] = nearest(x, z); if (d < 7 || d > 120) continue; m4.compose(V(x, Math.max(groundH(x, z), swamp.waterY) - 0.2, z), q.setFromAxisAngle(UP, rand(0, 6)), V(1, rand(0.8, 1.4), 1)); reeds.setMatrixAt(n++, m4); }
  reeds.count = n; scene.add(reeds);
  const glow = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 420); n = 0;
  const gc = [C(0x5ff0c8), C(0xb07bff), C(0x8fe8ff)];
  for (let t = 0; t < 5000 && n < 420; t++) { const x = rand(minX, maxX), z = rand(minZ, maxZ), [i, d] = nearest(x, z); if (d < 6 || d > 90) continue;
    m4.compose(V(x, Math.max(groundH(x, z), swamp.waterY) + rand(0.1, 0.8), z), q.identity(), V(1, 1, 1).multiplyScalar(rand(0.6, 1.4))); glow.setMatrixAt(n, m4); glow.setColorAt(n, gc[n % 3].clone().multiplyScalar(rand(0.6, 1.3))); n++; }
  glow.count = n; scene.add(glow);
}
// headlights so the road ahead is readable at night, fireflies drifting over the water
function initSwamp() {
  for (const sx of [-0.9, 0.9]) {
    const L = new THREE.SpotLight(0xfff1d6, 260, 95, 0.42, 0.55, 1.6); L.position.set(sx, 1.6, 2.2); const tgt = new THREE.Object3D(); tgt.position.set(sx * 2, -1, 28); vehicle.add(L, tgt); L.target = tgt; swamp.lights.push(L);
  }
  const N = 260, g = new THREE.BufferGeometry(), a = new Float32Array(N * 3), c = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { a[i * 3] = rand(-60, 60); a[i * 3 + 1] = rand(0.5, 6); a[i * 3 + 2] = rand(-20, 90); }
  g.setAttribute('position', new THREE.BufferAttribute(a, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  swamp.flies = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  swamp.flies.frustumCulled = false; scene.add(swamp.flies);
  // two pooled lights for flares
  for (let k = 0; k < 2; k++) { const L = new THREE.PointLight(0xff9a50, 0, 55, 1.4); scene.add(L); swamp.flareLights = swamp.flareLights || []; swamp.flareLights.push(L); }
}
function updateSwamp(dt) {
  if (!swamp.flies) initSwamp();
  const t = G.time || performance.now() / 1000;
  swamp.flies.position.copy(vehicle.position); swamp.flies.rotation.y = Math.atan2(vehicleFwd.x, vehicleFwd.z);
  const A = swamp.flies.geometry.attributes.position.array, Cc = swamp.flies.geometry.attributes.color.array;
  for (let i = 0; i < A.length; i += 3) { A[i] += Math.sin(t * 0.7 + i) * dt * 0.6; A[i + 1] += Math.cos(t * 0.9 + i * 0.3) * dt * 0.3; const b = Math.max(0, Math.sin(t * 2.2 + i * 1.7)) ** 3; Cc[i] = 0.75 * b; Cc[i + 1] = 1.0 * b; Cc[i + 2] = 0.35 * b; }
  swamp.flies.geometry.attributes.position.needsUpdate = swamp.flies.geometry.attributes.color.needsUpdate = true;
  if (swamp.water) swamp.water.material.map.offset.x += dt * 0.004;
  // flares: drift down, light the area, reveal camouflaged things, burn out
  for (let i = swamp.flares.length - 1; i >= 0; i--) {
    const f = swamp.flares[i]; f.t += dt; f.p.y = Math.max(f.floor, f.p.y - dt * 0.45); f.m.position.copy(f.p); f.m.scale.setScalar(1 + Math.sin(f.t * 30) * 0.08);
    const life = clamp(1 - (f.t - 9) / 2, 0, 1); f.L.position.copy(f.p); f.L.intensity = 650 * life * (0.9 + Math.random() * 0.2);
    if (Math.random() < 0.5) fx.spawn(f.p, V(rand(-1, 1), rand(-2, 0), rand(-1, 1)), 0.5, 0.6, 0.4, COL.fire, 1);
    for (const e of enemies) if (e.camo && e.alive && e.pos.distanceTo(f.p) < 32) e.reveal = 2;
    if (f.t > 11) { scene.remove(f.m); f.L.intensity = 0; swamp.flares.splice(i, 1); }
  }
  // camouflage fades toward visible when revealed, close, or just fired
  for (const e of enemies) {
    if (!e.camo) continue; e.reveal = Math.max(0, (e.reveal || 0) - dt);
    const near = e.alive && e.pos.distanceTo(vehicle.position) < 20; const want = !e.alive || e.reveal > 0 || near ? 1 : 0.08;
    e.vis = lerp(e.vis === undefined ? 0.08 : e.vis, want, dt * 4);
    e.obj.traverse(o => { if (o.isMesh) { for (const m of [].concat(o.material)) { m.transparent = e.vis < 0.98; m.opacity = e.vis; m.depthWrite = e.vis > 0.5; } } });
    if (e.vis < 0.5 && e.alive && Math.random() < 0.08) fx.spawn(_v1.copy(e.pos).add(V(rand(-1, 1), rand(0.3, 1.6), rand(-1, 1))), V(), 0.3, 0.5, 0.05, COL.cyan, 0.6);
  }
}
function clearLevel4() { for (const f of swamp.flares) { scene.remove(f.m); f.L.intensity = 0; } swamp.flares.length = 0; flareHinted = false; }
// flare pods: glowing seed pods hanging from branches by the road; shoot one and it bursts into a slow-falling flare
let flareHinted = false;
const podMat = new THREE.MeshStandardMaterial({ color: 0x3a1a08, emissive: 0xff7a1a, emissiveIntensity: 0.9, roughness: 0.6 });
function flarePod(sOff, side, h = 7) {
  const p = groundPoint(G.s + sOff, side); p.y = Math.max(p.y, swamp.waterY) + h;
  const g = new THREE.Group(); g.position.copy(p);
  const pod = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 9).scale(1, 1.35, 1), podMat); g.add(pod);
  const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 6, 4).translate(0, 3.6, 0), new THREE.MeshLambertMaterial({ color: 0x2f3a22 })); g.add(vine);
  const e = new Enemy('flarepod', g, 1, [{ o: V(0, 0, 0), r: 1.3 }], 50); e.mats = [];
  e.update = function (dt) { this.t += dt; this.obj.rotation.z = Math.sin(this.t * 1.3) * 0.08; podMat.emissiveIntensity = 0.7 + Math.sin(performance.now() / 300) * 0.3;
    if (!flareHinted && this.pos.distanceTo(vehicle.position) < 70) { flareHinted = true; say('SHOOT THE FLARE PODS TO LIGHT THE WAY!', 2.4); } };
  e.damage = function () { if (!this.alive) return; this.alive = false; award(this, this.pos, 0); launchFlare(this.pos.clone()); sfx.pop(); this.remove(); };
  e.die = () => {};
  return e;
}
function launchFlare(p) {
  const L = swamp.flareLights.reduce((a, l) => (a.intensity <= l.intensity ? a : l));
  const old = swamp.flares.findIndex(f => f.L === L); if (old >= 0) { scene.remove(swamp.flares[old].m); swamp.flares.splice(old, 1); }
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd090, toneMapped: false })); m.position.copy(p); scene.add(m);
  swamp.flares.push({ p, m, L, t: 0, floor: Math.max(groundH(p.x, p.z), swamp.waterY) + 3 });
  burst(p, 30, 8, 0.5, 0.7, 0.2, COL.fire, 1, 1.5);
}
function camo(e) { e.camo = true; e.vis = 0.08; const mats = []; e.obj.traverse(o => { if (o.isMesh) { o.material = [].concat(o.material).map(m => m.clone()); if (o.material.length === 1) o.material = o.material[0]; mats.push(...[].concat(o.material)); } }); e.mats = mats; return e; }
// leaper: an armored, eel-like machine that bursts out of the water in an arc and fires at the top of its jump
function leaperModel() {
  const g = new THREE.Group(), plate = new THREE.MeshStandardMaterial({ color: 0x24423e, metalness: 0.5, roughness: 0.4 }), belly = new THREE.MeshStandardMaterial({ color: 0x8a9a5a, roughness: 0.6 });
  for (let k = 0; k < 6; k++) { const r = 0.55 - Math.abs(k - 2) * 0.08; const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8).scale(1, 0.85, 1.3), k % 2 ? plate : belly); seg.position.z = 1.6 - k * 0.65; g.add(seg); }
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.3, 8).rotateX(Math.PI / 2), plate); head.position.z = 2.4; g.add(head);
  for (const sx of [-0.22, 0.22]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff27a, toneMapped: false })); eye.position.set(sx, 0.25, 2.25); g.add(eye); }
  for (const sx of [-1, 1]) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.6), plate); fin.position.set(sx * 0.6, 0, 1.1); fin.rotation.z = sx * 0.3; g.add(fin); }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 0.7), plate); tail.position.z = -2.3; g.add(tail);
  return g;
}
function leaper(sOff, side) {
  const g = new THREE.Group(); g.add(leaperModel());
  const a = groundPoint(G.s + sOff, side), b = groundPoint(G.s + sOff - rand(8, 16), -side * rand(0.4, 1.1)); a.y = b.y = swamp.waterY - 1;
  g.position.copy(a);
  const e = new Enemy('leaper', g, 3, [{ o: V(0, 0, 0.8), r: 1.1 }, { o: V(0, 0.2, 2.3), r: 0.5, m: 2 }], 150);
  e.hitTest = function (ray) { return this.wait > 0 ? null : Enemy.prototype.hitTest.call(this, ray); };
  e.a = a; e.b = b; e.wait = rand(0.3, 1.6); e.jumps = 0; e.dur = 1.9;
  e.update = function (dt) {
    if (!this.alive) { this.deadT += dt; this.pos.y -= dt * 6; this.obj.rotation.x += dt * 4; if (this.deadT > 1) this.remove(); return; }
    if (this.wait > 0) { this.wait -= dt; this.obj.visible = false; if (this.wait <= 0) { this.t = 0; splash(this.a); } return; }
    this.obj.visible = true; this.t += dt; const u = clamp(this.t / this.dur, 0, 1);
    this.pos.lerpVectors(this.a, this.b, u); this.pos.y = swamp.waterY - 1 + Math.sin(u * Math.PI) * 9;
    const vy = Math.cos(u * Math.PI); this.obj.lookAt(_v1.copy(this.b).sub(this.a).setY(vy * 12).add(this.pos)); this.obj.rotateZ(this.t * 4);
    if (u > 0.45 && !this.fired) { this.fired = true; this.aimAtPlayer(2.2, 45, COL.plasmaGreen || C(0x8dff5a), 5, 1.1); }
    if (u >= 1) { splash(this.b); this.jumps++; if (this.jumps >= 2) { this.alive = false; this.remove(); return; } [this.a, this.b] = [this.b, groundPoint(G.s + rand(40, 70), rand(-18, 18))]; this.a.y = this.b.y = swamp.waterY - 1; this.wait = rand(1, 2.5); this.fired = false; }
  };
  e.die = function () { burst(this.pos, 20, 7, 0.5, 0.6, 0.2, C(0x8dff5a), 1, 2); explosion(this.pos, 0.5); sfx.boom(0.4); };
  return e;
}
function splash(p) { const at = p.clone(); at.y = swamp.waterY + 0.1; burst(at, 26, 7, 0.9, 0.5, 0.3, C(0x9fc8d0), 0.9, 1.5, 12); burst(at, 8, 3, 1, 1.4, 3, C(0x6a8a90), 0.5, 2, 6, smoke); }
// the Mire Serpent: a huge segmented water machine-beast that surfaces, spits glob mortars and dives
// Mire Serpent body: "Space Worm" by Benji Smith (CC-BY 3.0, OpenGameArt), stretched to boss size; falls back to the procedural serpent
let WORM_RX = Math.PI / 2;   // mouth end up
function wormRig(L = 22, W = 8) {
  if (!M.worm || CUSTOMIZED.has('worm')) return null;
  const o = cloneModel('worm', true);
  const inner = new THREE.Group(); inner.add(o); inner.rotation.x = WORM_RX; inner.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(inner, true), sz = b.getSize(V()), c = b.getCenter(V());
  inner.position.set(-c.x, -b.min.y, -c.z);
  const sc = new THREE.Group(); sc.scale.set(W / Math.max(sz.x, sz.z), L / sz.y, W / Math.max(sz.x, sz.z)); sc.add(inner);
  const anims = M.worm_anims || [], mixer = anims.length ? new THREE.AnimationMixer(o) : null, act = {};
  for (const a of anims) act[a.name] = mixer.clipAction(a);
  return { root: sc, mixer, act, mats: o.userData.mats || [], L, W };
}
// "Monster03" by LostBoyz2078 (CC BY-NC 4.0) as the Mire Serpent's body
function nagaRig() { const w = creature('naga'); if (!w) return null; const u = w.userData, n = Object.keys(u.act)[0]; const act = n ? { Swim: u.act[n] } : {}; return { root: w, mixer: u.mixer, act, mats: u.mats, L: u.H, W: u.H * 0.5 }; }
function serpent(p) {
  const g = new THREE.Group(); g.position.copy(p); g.position.y = swamp.waterY;
  const hide = new THREE.MeshStandardMaterial({ color: 0x1f3a34, metalness: 0.35, roughness: 0.5 }), ridge = new THREE.MeshStandardMaterial({ color: 0x0f1d1a, metalness: 0.5, roughness: 0.4 });
  const sacMat = new THREE.MeshStandardMaterial({ color: 0x173006, emissive: 0x9dff3a, emissiveIntensity: 1.2, roughness: 0.3 });
  const segs = [], N = 16;
  for (let k = 0; k < N; k++) {
    const r = 2.3 - k * 0.09, s = new THREE.Group(); const body = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10).scale(1, 0.9, 1.25), hide); s.add(body);
    const sp = new THREE.Mesh(new THREE.ConeGeometry(r * 0.35, r * 1.1, 6), ridge); sp.position.y = r * 0.95; s.add(sp);
    g.add(s); segs.push({ s, r });
  }
  const head = new THREE.Group(); g.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 10).scale(1, 0.75, 1.5), hide); head.add(skull);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.6, 3.6), ridge); jaw.position.set(0, -1.6, 1.6); head.add(jaw);
  for (const sx of [-1.1, 1.1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe14a, toneMapped: false })); eye.position.set(sx, 0.7, 2.6); head.add(eye); }
  for (let k = 0; k < 5; k++) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.2, 6), ridge); h.position.set((k - 2) * 0.7, 1.9, -0.6 - Math.abs(k - 2) * 0.4); h.rotation.x = -0.5; head.add(h); }
  const sacs = [4, 8, 12].map(k => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 9), sacMat); segs[k].s.add(m); m.position.y = segs[k].r * 0.8; m.position.z = -0.6; return m; });
  let bodyPts = [2, 6, 10, 14].map(k => segs[k].s), rear = null;
  const rig = nagaRig() || wormRig(28, 7.5);
  if (rig) {   // swap the procedural body for the Space Worm; sacs, head and body hit points ride on it
    for (const sg of segs) sg.s.visible = false; for (const c of head.children) c.visible = false;
    rear = new THREE.Group(); g.add(rear); rear.add(rig.root);
    for (const m of rig.mats) if (m.color) m.color.multiplyScalar(0.8);
    rear.add(head); head.position.set(0, rig.L * 0.97, 0.6);
    [0.74, 0.6, 0.46].forEach((h, i) => { rear.add(sacs[i]); sacs[i].position.set(0, rig.L * h, rig.W * 0.44); sacs[i].scale.setScalar(1.5); });
    bodyPts = [0.82, 0.66, 0.5, 0.36].map(h => { const o = new THREE.Object3D(); o.position.y = rig.L * h; rear.add(o); return o; });
    if (rig.act.Swim) rig.act.Swim.play();
  }
  const hits = [{ o: V(), r: rig ? 3.4 : 3, m: 1.5 }, ...sacs.map(() => ({ o: V(), r: rig ? 1.7 : 1.4, m: 3 })), ...bodyPts.map(() => ({ o: V(), r: rig ? 3.3 : 2.4 }))];
  const e = new Enemy('serpent', g, 520, hits, 5000);
  e.mats = []; e.segs = segs; e.head = head; e.sacs = sacs; e.sacMat = sacMat; e.jaw = rig ? null : jaw; e.rig = rig; e.rear = rear; e.bodyPts = bodyPts;
  e.state = 'under'; e.st = 1.5; e.rise = 0; e.spot = V(); e.phase2 = false; e.dieT = 0;
  e.pickSpot = function () {   // somewhere in front of the Warthog, in open water, not where it surfaced last
    const fwd = trackDir(ARENA, V()), side = V(fwd.z, 0, -fwd.x), base = trackAt(ARENA, V()); let best = null;
    for (let k = 0; k < 40; k++) {
      const c = base.clone().addScaledVector(fwd, rand(32, 46)).addScaledVector(side, rand(-17, 17));
      if (groundH(c.x, c.z) > swamp.waterY - 0.6) continue;
      if (this.spot.lengthSq() && c.distanceTo(this.spot) < 10) continue;
      best = c; break;
    }
    this.spot.copy(best || groundPoint(ARENA + 48, (Math.random() < 0.5 ? -1 : 1) * 16)); this.spot.y = swamp.waterY;
  };
  e.pickSpot();
  e.hitTest = function (ray) {   // hit spheres follow the animated body: head, sacs, a few body segments
    if (this.rise < 0.35) return null;
    const list = [this.head, ...this.sacs, ...this.bodyPts];
    let best = null;
    for (let i = 0; i < list.length; i++) { list[i].getWorldPosition(_v1); _v2.copy(_v1).sub(ray.origin); const t = _v2.dot(ray.direction); if (t < 0) continue; const d2 = _v2.lengthSq() - t * t, r2 = this.hits[i].r ** 2; if (d2 > r2) continue; const dist = t - Math.sqrt(r2 - d2); if (!best || dist < best[0]) best = [dist, i]; }
    return best;
  };
  e.damage = function (n, idx, at) {
    if (!this.alive || this.rise < 0.35) return;
    const sac = idx >= 1 && idx <= 3; n *= (this.hits[idx] || {}).m || 1; if (!sac && idx !== 0) n *= 0.3;
    this.hp -= n; burst(at, sac ? 8 : 3, 6, 0.3, 0.6, 0.1, sac ? C(0x9dff3a) : COL.spark, 1, 3);
    if (sac && Math.random() < 0.2) popups.push({ p: at.clone(), t: 0, text: 'WEAK POINT!', col: '#b8ff7a' });
    if (this.hp <= 0) { this.alive = false; this.die(); award(this, at, idx); }
  };
  e.update = function (dt) {
    this.t += dt;
    if (!this.alive) {
      this.dieT += dt; this.rise = Math.max(0, 1 - this.dieT / 4); this.pose(dt, true);
      if (Math.random() < dt * 8) explosion(this.head.getWorldPosition(V()).add(V(rand(-4, 4), rand(-2, 3), rand(-4, 4))), rand(0.6, 1.2));
      if (Math.random() < 0.4) splash(this.spot.clone().add(V(rand(-8, 8), 0, rand(-8, 8))));
      if (this.dieT > 4.5) this.remove(); return;
    }
    if (!this.phase2 && this.hp < this.maxHp * 0.5) { this.phase2 = true; say('THE SERPENT IS ENRAGED!', 1.8); sfx.stinger(); leaper(70, -14); leaper(78, 14); }
    this.st -= dt;
    if (this.state === 'under') {
      this.rise = Math.max(0, this.rise - dt * 1.5);
      if (Math.random() < 0.5) fx.spawn(this.spot.clone().add(V(rand(-3, 3), 0.2, rand(-3, 3))), V(0, 2, 0), 0.4, 0.6, 0.3, C(0x9fc8d0), 0.7);
      if (this.st <= 0) { this.state = 'up'; this.st = this.phase2 ? 5.5 : 7; this.spitT = 1.6; splash(this.spot); splash(this.spot.clone().add(V(3, 0, 2))); sfx.cannon(); }
    } else {
      this.rise = Math.min(1, this.rise + dt * 1.2);
      this.spitT -= dt;
      if (this.rise > 0.9 && this.spitT <= 0) {
        this.spitT = this.phase2 ? 1.6 : 2.4; const from = this.head.localToWorld(V(0, -0.5, 3.5));
        if (this.rig && this.rig.act.Bite) { const b = this.rig.act.Bite; b.reset(); b.setLoop(THREE.LoopOnce, 1); b.clampWhenFinished = false; b.fadeIn(0.15).play(); setTimeout(() => b.fadeOut(0.3), 900); }
        launchMortar(from, this, 'acid'); if (this.phase2) setTimeout(() => { if (this.alive) launchMortar(this.head.localToWorld(V(0, -0.5, 3.5)), this, 'acid'); }, 350);
        this.burstN = this.phase2 ? 6 : 4;
      }
      if (this.burstN > 0) { this.bt = (this.bt || 0) - dt; if (this.bt <= 0) { this.bt = 0.12; this.burstN--; this.aimAtPlayer(3, 50, C(0x9dff3a), 4, 1.2, this.head.localToWorld(V(0, -0.3, 3.4)), this.burstN % 2 === 1); } }
      if (this.st <= 0) { this.state = 'under'; this.st = this.phase2 ? 1.6 : 2.6; splash(this.spot); this.pickSpot(); }
    }
    this.sacMat.emissiveIntensity = 0.9 + Math.sin(this.t * 6) * 0.4 + (this.state === 'up' ? 0.8 : 0);
    this.pose(dt, false);
  };
  // body arcs out of the water from behind the spot, head reared up facing the Warthog
  e.pose = function (dt, dying) {
    const toV = _v3.copy(vehicle.position).sub(this.spot).setY(0).normalize(), fwd = toV.clone(), side = V(-fwd.z, 0, fwd.x);
    this.obj.position.copy(this.spot); this.obj.updateMatrixWorld();
    if (this.rig) {
      const R = this.rise, L = this.rig.L; if (this.rig.mixer) this.rig.mixer.update(dt * (this.state === 'up' ? 1 : 1.6));
      this.rear.position.set(Math.sin(this.t * 0.9) * 0.6, lerp(-L * 1.05, -L * 0.4, R) - (dying ? (1 - R) * 4 : 0), 0);
      this.rear.rotation.set(0.22 * R + Math.sin(this.t * 1.3) * 0.05 + (this.state === 'up' && this.spitT < 0.4 ? 0.18 : 0), Math.atan2(fwd.x, fwd.z), Math.sin(this.t * 0.8) * 0.09 * (dying ? 3 : 1), 'YXZ');
      this.head.lookAt(vehicle.position.x, vehicle.position.y + 2, vehicle.position.z);
      return;
    }
    const R = this.rise, wig = this.t * (this.state === 'up' ? 2 : 4);
    for (let k = 0; k < this.segs.length; k++) {
      const u = k / (this.segs.length - 1);   // 0 = near the head, 1 = tail end
      const along = -u * 22, h = Math.sin((1 - u) * Math.PI * 0.85) * 8 * R - 3 * (1 - R) - u * 1.5;
      const lat = Math.sin(u * 5 + wig) * 2.2 * (dying ? 2 : 1);
      this.segs[k].s.position.copy(fwd).multiplyScalar(along).addScaledVector(side, lat).setY(h);
      this.segs[k].s.lookAt(this.obj.localToWorld(V().copy(fwd).multiplyScalar(along + 2).addScaledVector(side, Math.sin((u - 0.05) * 5 + wig) * 2.2).setY(h)));
    }
    this.head.position.copy(fwd).multiplyScalar(3).setY(6 + 5 * R - 8 * (1 - R) - (dying ? (1 - R) * 4 : 0));
    this.head.lookAt(vehicle.position.x, vehicle.position.y + 2 + (1 - R) * -6, vehicle.position.z);
    if (this.jaw) this.jaw.rotation.x = this.state === 'up' && this.spitT < 0.4 ? 0.5 : 0.1;
  };
  e.die = function () { say('MIRE SERPENT DOWN!', 3); sfx.boom(1.6); win(); };
  G.boss = e; return e;
}
// swampler: a squat, toothy swamp beast ("Swampler" by Jeepster for Ancient Beast, CC-BY-SA 3.0) — hops between banks, lunges and spits
function swampler(p) {
  const g = new THREE.Group(); g.position.copy(p);
  const fm = frostModel('swampler');
  if (fm) g.add(fm);
  else { const m = new THREE.MeshStandardMaterial({ color: 0x4a5a2c, roughness: 0.6 }); const b = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9).scale(1, 0.8, 1.1), m); b.position.y = 1; g.add(b); }
  const e = new Enemy('swampler', g, 3, [{ o: V(0, 0.95, 0), r: 0.85 }, { o: V(0, 1.85, 0.15), r: 0.6, m: 2 }], 120);
  e.mats = fm ? fm.userData.mats : []; e.home = p.clone(); e.cool = rand(1.4, 2.8); e.hop = null; e.hopT = rand(1.5, 3.5);
  e.update = function (dt) {
    if (!this.alive) { this.deadT += dt; this.obj.rotation.z = Math.min(Math.PI / 2, this.obj.rotation.z + dt * 5); this.pos.y -= dt * 0.8; if (this.deadT > 1) this.remove(); return; }
    this.t += dt; const d = this.pos.distanceTo(vehicle.position);
    if (this.hop) {   // parabolic hop with a stretch on take-off and a squash on landing
      this.hop.t += dt; const u = Math.min(1, this.hop.t / this.hop.T);
      this.pos.lerpVectors(this.hop.a, this.hop.b, u); this.pos.y += Math.sin(u * Math.PI) * this.hop.h;
      const st = u < 0.5 ? 1 + (0.5 - u) * 0.5 : 1; this.obj.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st));
      if (u >= 1) { this.hop = null; this.obj.scale.set(1.25, 0.75, 1.25); if (groundH(this.pos.x, this.pos.z) < swamp.waterY) splash(this.pos); }
    } else {
      this.obj.scale.lerp(_v1.set(1, 1 + Math.sin(this.t * 3) * 0.04, 1), Math.min(1, dt * 8));   // breathing
      this.hopT -= dt;
      if (this.hopT <= 0) {
        this.hopT = rand(1.8, 3.6); const b = this.home.clone().add(V(rand(-5, 5), 0, rand(-5, 5))); b.y = Math.max(groundH(b.x, b.z), swamp.waterY - 0.3);
        if (d < 40 && Math.random() < 0.35) { b.lerp(vehicle.position, 0.25); b.y = Math.max(groundH(b.x, b.z), swamp.waterY - 0.3); }   // lunge toward the Warthog
        this.hop = { a: this.pos.clone(), b, t: 0, T: rand(0.55, 0.8), h: rand(2, 3.5) };
      }
    }
    if (!this.hop) this.pos.y = Math.max(groundH(this.pos.x, this.pos.z), swamp.waterY - 0.3);
    this.obj.rotation.y = Math.atan2(vehicle.position.x - this.pos.x, vehicle.position.z - this.pos.z);
    this.cool -= dt;
    if (this.cool <= 0 && d < 85 && !this.hop) { this.cool = rand(1.8, 3); this.obj.scale.set(1.15, 0.85, 1.15); this.aimAtPlayer(2.6, 38, COL.acid, 4, 1.0, this.obj.localToWorld(V(0, 1.5, 1.1))); }
  };
  e.die = function () { burst(_v1.copy(this.pos).add(V(0, 1, 0)), 22, 7, 0.5, 0.6, 0.2, COL.acid, 1, 2); burst(this.pos, 8, 3, 1.2, 1.5, 3, C(0x4a5a2c), 0.5, 1.5, -1, smoke); sfx.boom(0.35); };
  return e;
}
function swamplers(sOff, side, n, spread = 6) { for (let i = 0; i < n; i++) swampler(groundPoint(G.s + sOff + rand(-spread, spread), side + rand(-spread, spread) * 0.8)); }
function level4Script(gS, A) {
  return [
    { s: 25, f: () => say('LEVEL 4 · NIGHT SWAMP') },
    { s: 40, f: () => { flarePod(70, -9); camo(swampler(groundPoint(G.s + 80, -11))); camo(swampler(groundPoint(G.s + 86, -8))); swamplers(95, 10, 2); } },
    { s: 95, f: () => { leaper(80, -14); leaper(90, 15); flarePod(85, 10); } },
    { s: 150, f: () => { say('DRONES IN THE TREES'); drone(G.s + 95, -10, 9); drone(G.s + 105, 10, 11); cells(80, -9, 1); } },
    { s: 205, f: () => { flarePod(75, -10); flarePod(95, 11); for (let i = 0; i < 4; i++) camo(swampler(groundPoint(G.s + 82 + i * 4, (i % 2 ? 1 : -1) * rand(7, 12)))); } },
    { s: 265, f: () => { leaper(70, -12); leaper(78, 13); leaper(88, -15); sled(G.s + 115, 10); } },
    { s: 325, f: () => { fturret(groundPoint(G.s + 100, -18)); flarePod(80, 9); swamplers(85, 11, 3); } },
    { s: 385, f: () => { say('SOMETHING IN THE WATER…', 2); leaper(65, -10); leaper(72, 11); leaper(80, -13); leaper(88, 14); } },
    { s: 445, f: () => { flarePod(70, -9); flarePod(88, 10); for (let i = 0; i < 5; i++) camo(swampler(groundPoint(G.s + 78 + i * 5, (i % 2 ? 1 : -1) * rand(7, 13)))); cells(85, 0, 1); } },
    { s: 510, f: () => { drone(G.s + 90, -12, 10); drone(G.s + 100, 0, 12); drone(G.s + 110, 12, 9); sled(G.s + 120, -10); } },
    { s: 575, f: () => { leaper(70, -13); leaper(80, 12); flarePod(80, -10); camo(swampler(groundPoint(G.s + 88, -10))); camo(swampler(groundPoint(G.s + 92, 10))); } },
    { s: 640, f: () => { fturret(groundPoint(G.s + 100, 18)); sled(G.s + 110, -12); sled(G.s + 120, 12); } },
    { s: 705, f: () => { flarePod(70, 9); flarePod(90, -9); for (let i = 0; i < 6; i++) camo(swampler(groundPoint(G.s + 76 + i * 5, (i % 2 ? 1 : -1) * rand(7, 13)))); } },
    { s: 775, f: () => { leaper(65, -12); leaper(70, 12); leaper(80, -14); leaper(86, 14); drone(G.s + 100, 0, 10); cells(78, 9, 1); } },
    { s: 845, f: () => { swamplers(80, -10, 4); swamplers(90, 10, 3); flarePod(85, 0, 10); } },
    { s: 905, f: () => { fturret(groundPoint(G.s + 100, -18)); sled(G.s + 115, 10); leaper(80, -13); } },
    { s: 960, f: () => { say('MIRE SERPENT'); music.play('boss'); serpent(groundPoint(ARENA + 32, 0)); cells(ARENA - G.s + 14, -10, 1); cells(ARENA - G.s + 18, 11, 1); flarePod(ARENA - G.s + 12, -9, 8); flarePod(ARENA - G.s + 14, 9, 8); } },
  ].map(ev => ({ s: ev.s * A, f: ev.f }));
}
// ---------------------------------------------------------------- level 5: storm coast (all original: the cliff road, the storm, the Tidefather and its tentacles)
const storm = { rain: null, t: 4, flash: 0, bolts: [], sea: null, hemi0: LV.hemi[2], fpv: false };
function buildCoastProps(minX, maxX, minZ, maxZ, m4, q) {
  // the sea: dark, choppy, endless
  const sTex = canvasTex(256, (g, sz) => { g.fillStyle = '#1b2a33'; g.fillRect(0, 0, sz, sz); for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(${rand(120, 190) | 0},${rand(150, 200) | 0},${rand(170, 210) | 0},${rand(0.04, 0.14)})`; g.lineWidth = rand(1, 2.5); g.beginPath(); const x = rand(0, sz), y = rand(0, sz); g.moveTo(x, y); g.quadraticCurveTo(x + rand(8, 20), y + rand(-5, 5), x + rand(16, 46), y + rand(-2, 2)); g.stroke(); } }, 1);
  sTex.repeat.set(70, 70);
  const geo = new THREE.PlaneGeometry(5000, 5000, 90, 90).rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: sTex, color: 0x6d8796, roughness: 0.38, metalness: 0.15, envMapIntensity: 0.25 }));
  sea.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2); scene.add(sea); storm.sea = sea; sea.userData.base = geo.attributes.position.array.slice();
  const tint = (g, c) => { g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count, a = new Float32Array(n * 3), cc = new THREE.Color(c); for (let i = 0; i < n; i++) cc.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; };
  // wind-bent pines on the land side, leaning away from the sea
  const tp = [tint(new THREE.CylinderGeometry(0.22, 0.4, 5, 6).translate(0, 2.5, 0), 0x3a2f25)];
  for (let k = 0; k < 4; k++) tp.push(tint(new THREE.ConeGeometry(2.6 - k * 0.5, 2.6, 7).translate(0.4 + k * 0.25, 3.6 + k * 1.5, 0), k % 2 ? 0x1e3324 : 0x24402b));
  const treeGeo = mergeColored(tp); treeGeo.computeVertexNormals();
  const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 900); let n = 0;
  const rockGeo = new THREE.DodecahedronGeometry(1, 0); const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.95, flatShading: true }), 700); let r = 0;
  for (let t = 0; t < 9000 && (n < 900 || r < 700); t++) {
    const x = rand(minX, maxX), z = rand(minZ, maxZ), [i, d] = nearest(x, z); if (d < 9 || d > 320) continue;
    const y = groundH(x, z); if (y < 3) continue;
    const j = Math.min(i, NS - 1), dx = PP[j + 1].x - PP[j].x, dz = PP[j + 1].z - PP[j].z, lat = ((x - PP[i].x) * -dz + (z - PP[i].z) * dx) / (Math.hypot(dx, dz) || 1);
    if (lat > 12 && n < 900 && Math.random() < 0.7) { const sc = rand(0.8, 1.6); const yaw = Math.atan2(dz, dx) + Math.PI; m4.compose(V(x, y - 0.3, z), q.setFromAxisAngle(UP, yaw), V(sc, sc * rand(0.9, 1.3), sc)); trees.setMatrixAt(n++, m4); }
    else if (r < 700) { const sc = rand(0.6, 3.2); m4.compose(V(x, y + sc * 0.2, z), q.setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), rand(0, 3))), V(sc, sc * rand(0.5, 0.9), sc * rand(0.8, 1.3))); rocks.setMatrixAt(r++, m4); }
  }
  trees.count = n; rocks.count = r; scene.add(trees, rocks);
}
function initStorm() {
  const N = 1600, g = new THREE.BufferGeometry(), a = new Float32Array(N * 6);
  for (let i = 0; i < N; i++) { const x = rand(-45, 45), y = rand(-10, 40), z = rand(-30, 60); a.set([x, y, z, x - 0.25, y - 1.4, z], i * 6); }
  g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  storm.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xa9bccf, transparent: true, opacity: 0.32, depthWrite: false }));
  storm.rain.frustumCulled = false; scene.add(storm.rain);
}
// lightning: a jagged bolt into the sea, the whole scene flashes, thunder follows
function strike(at, big) {
  if (!at) { at = vehicle.position.clone().addScaledVector(vehicleFwd, rand(120, 380)).addScaledVector(trackSide(G.s), -rand(60, 320)); at.y = 0; }
  const pts = []; let p = at.clone().add(V(rand(-40, 40), 260, rand(-40, 40)));
  while (p.y > at.y) { pts.push(p.clone()); p.lerp(at, 0.14).add(V(rand(-9, 9), -rand(6, 16), rand(-9, 9))); } pts.push(at.clone());
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xe8f2ff, toneMapped: false, transparent: true }));
  scene.add(line); storm.bolts.push({ line, t: 0 }); storm.flash = big ? 1.4 : 1;
  const d = at.distanceTo(vehicle.position); setTimeout(() => { sfx.boom(big ? 1.7 : 1.1); sfx.cannon(d * 0.5); shake = Math.max(shake, big ? 0.4 : 0.15); }, Math.min(1800, d * 2.4));
}
function updateStorm(dt) {
  if (!storm.rain) initStorm();
  const A = storm.rain.geometry.attributes.position.array;
  for (let i = 0; i < A.length; i += 6) { A[i + 1] -= dt * 42; A[i + 4] -= dt * 42; A[i] -= dt * 7; A[i + 3] -= dt * 7; if (A[i + 1] < -10) { const x = rand(-45, 45), y = 40, z = rand(-30, 60); A[i] = x; A[i + 1] = y; A[i + 2] = z; A[i + 3] = x - 0.25; A[i + 4] = y - 1.4; A[i + 5] = z; } }
  storm.rain.geometry.attributes.position.needsUpdate = true;
  storm.rain.position.copy(vehicle.position); storm.rain.rotation.y = Math.atan2(vehicleFwd.x, vehicleFwd.z);
  sfx.wind(G.state === 'play' ? 0.45 : 0.12);
  storm.t -= dt; if (storm.t <= 0) { storm.t = rand(5, 12); strike(); }
  storm.flash = Math.max(0, storm.flash - dt * 4);
  hemiL.intensity = storm.hemi0 + storm.flash * (Math.random() < 0.6 ? 3.2 : 1.2);
  for (let i = storm.bolts.length - 1; i >= 0; i--) { const b = storm.bolts[i]; b.t += dt; b.line.material.opacity = b.t < 0.25 ? (Math.random() < 0.7 ? 1 : 0.2) : Math.max(0, 1 - (b.t - 0.25) * 5); if (b.t > 0.5) { scene.remove(b.line); storm.bolts.splice(i, 1); } }
  // swell: big slow waves near the camera
  if (storm.sea) {
    const sea = storm.sea, P = sea.geometry.attributes.position.array, B = sea.userData.base, t = G.time || 0;
    for (let i = 0; i < P.length; i += 3) { const x = B[i] + sea.position.x, z = B[i + 2] + sea.position.z; P[i + 1] = Math.sin(x * 0.02 + t * 0.9) * 1.2 + Math.sin(z * 0.027 - t * 1.3) * 1.0 + Math.sin((x + z) * 0.05 + t * 2.1) * 0.35; }
    sea.geometry.attributes.position.needsUpdate = true; sea.geometry.computeVertexNormals(); sea.material.map.offset.x += dt * 0.006;
  }
  if (G.boss && G.boss.kind === 'tidefather') {} // the boss runs its own show
}
// first-person gunner view for the final stand: ease in, hide the Warthog body, keep the guns
function fpvUpdate(dt) { const want = storm.fpv && G.state === 'play' ? 1 : 0; G.fpvK = lerp(G.fpvK || 0, want, Math.min(1, dt * 1.6)); if (Math.abs(G.fpvK - want) < 0.01) G.fpvK = want; if (hog) hog.visible = G.fpvK < 0.55; }
function clearLevel5() { storm.fpv = false; G.fpvK = 0; if (hog) hog.visible = true; for (const b of storm.bolts) scene.remove(b.line); storm.bolts.length = 0; tideRefs.length = 0; }

// ---- the Tidefather (original design): a colossal horseshoe-crab-shelled sea titan with an anglerfish lure, six eyes and barbed tentacles
const tideRefs = [];
const tideShellTex = () => canvasTex(512, (g, sz) => {
  g.fillStyle = '#2b3236'; g.fillRect(0, 0, sz, sz);
  for (let i = 0; i < 26; i++) { g.strokeStyle = 'rgba(10,14,16,0.7)'; g.lineWidth = rand(2, 5); g.beginPath(); g.moveTo(rand(0, sz), 0); g.bezierCurveTo(rand(0, sz), sz * 0.3, rand(0, sz), sz * 0.7, rand(0, sz), sz); g.stroke(); }
  for (let i = 0; i < 900; i++) { const r = rand(1, 6); g.fillStyle = `rgba(${rand(90, 150) | 0},${rand(95, 140) | 0},${rand(90, 120) | 0},${rand(0.15, 0.5)})`; g.beginPath(); g.arc(rand(0, sz), rand(0, sz), r, 0, 7); g.fill(); }
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(0,0,0,${rand(0.05, 0.2)})`; g.fillRect(rand(0, sz), rand(0, sz), 2, 2); }
}, 3);
const tideVeinTex = () => canvasTex(512, (g, sz) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, sz, sz); g.strokeStyle = '#7ff3ff'; g.shadowColor = '#7ff3ff'; g.shadowBlur = 6;
  for (let i = 0; i < 18; i++) { g.lineWidth = rand(1, 3); g.beginPath(); let x = rand(0, sz), y = rand(0, sz); g.moveTo(x, y); for (let k = 0; k < 7; k++) { x += rand(-40, 40); y += rand(10, 50); g.lineTo(x, y); } g.stroke(); }
}, 3);
function tidefatherModel() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const shellMat = new THREE.MeshStandardMaterial({ map: tideShellTex(), emissiveMap: tideVeinTex(), emissive: 0x3fd8ff, emissiveIntensity: 0.9, roughness: 0.55, metalness: 0.25 });
  const hide = new THREE.MeshStandardMaterial({ color: 0x1f2629, roughness: 0.7, metalness: 0.1 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xb9b19a, roughness: 0.5 });
  const flesh = new THREE.MeshStandardMaterial({ color: 0x3a0c12, roughness: 0.6, side: THREE.BackSide });
  // the shell: a wide horseshoe dome with a ridged spine and a spiked rim
  const dome = new THREE.Mesh(new THREE.SphereGeometry(24, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1.15), shellMat); body.add(dome);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3, 50).translate(0, 11, 0), shellMat); body.add(spine);
  for (let k = 0; k < 9; k++) { const s = new THREE.Mesh(new THREE.ConeGeometry(1.4, 6 - Math.abs(k - 4) * 0.6, 6), bone); s.position.set(0, 13 + Math.cos((k - 4) * 0.35) * 1.5, -20 + k * 5); body.add(s); }
  for (let k = 0; k < 26; k++) { const a = (k / 26) * Math.PI * 2; if (Math.abs(Math.sin(a)) > 0.92 && Math.cos(a) > 0) continue; const sp = new THREE.Mesh(new THREE.ConeGeometry(1.1, 5, 6), bone); sp.position.set(Math.sin(a) * 24, -0.5, Math.cos(a) * 27.6); sp.rotation.set(Math.cos(a) * 1.3, 0, -Math.sin(a) * 1.3); body.add(sp); }
  const belly = new THREE.Mesh(new THREE.SphereGeometry(22, 28, 14).scale(1, 0.55, 1.1).translate(0, -5, -2), hide); body.add(belly);
  // tail plates trailing back into the sea
  for (let k = 0; k < 6; k++) { const p = new THREE.Mesh(new THREE.SphereGeometry(13 - k * 1.6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 0.7), shellMat); p.position.set(0, -3 - k * 2.4, -28 - k * 8); p.rotation.x = 0.25 + k * 0.08; body.add(p); }
  // the maw under the front rim: lip, hinged jaw with two rows of teeth, glowing core deep inside
  const mawG = new THREE.Group(); mawG.position.set(0, -5, 22); body.add(mawG);
  const cavity = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 14).scale(1.3, 0.75, 1), flesh); cavity.position.z = -3; mawG.add(cavity);
  const jaw = new THREE.Group(); jaw.position.set(0, -2, -4); mawG.add(jaw);
  const jawM = new THREE.Mesh(new THREE.SphereGeometry(11, 22, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1.25, 0.5, 1.05), hide); jawM.position.z = 4; jaw.add(jawM);
  for (let k = 0; k < 14; k++) { const a = -1.25 + k * (2.5 / 13); const t = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.8, 5), bone); t.position.set(Math.sin(a) * 11.5, 1.2, 4 + Math.cos(a) * 9.5); jaw.add(t); }
  for (let k = 0; k < 14; k++) { const a = -1.25 + k * (2.5 / 13); const t = new THREE.Mesh(new THREE.ConeGeometry(0.75, 4.2, 5), bone); t.position.set(Math.sin(a) * 11.8, 2.2, Math.cos(a) * 10 - 1); t.rotation.x = Math.PI; mawG.add(t); }
  const coreMat = new THREE.MeshStandardMaterial({ color: 0x2a0606, emissive: 0xff5a1a, emissiveIntensity: 1.2, roughness: 0.3 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(3.6, 18, 14), coreMat); core.position.set(0, 0, -4); mawG.add(core);
  const coreLight = new THREE.PointLight(0xff6a2a, 0, 90, 1.5); core.add(coreLight);
  // six eyes, three per side along the front rim
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x2a1a00, emissive: 0xffb12a, emissiveIntensity: 1.6, roughness: 0.2 });
  const eyes = [];
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
    const e = new THREE.Group(); e.position.set(sx * (6 + k * 5.2), 2.5 + k * 1.1, 26 - k * 2.6); body.add(e);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1.7 - k * 0.2, 16, 12), eyeMat); e.add(ball);
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.4 - k * 0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0x050505 })); slit.position.z = 1.5 - k * 0.2; e.add(slit);
    const brow = new THREE.Mesh(new THREE.ConeGeometry(1.2, 4, 5), shellMat); brow.position.set(0, 1.9, 0.2); brow.rotation.x = 1.2; e.add(brow);
    eyes.push(e);
  }
  // the lure: an arching stalk from the crown with a bioluminescent bulb
  const lc = new THREE.CatmullRomCurve3([V(0, 11, 4), V(0, 22, 10), V(0, 27, 22), V(0, 21, 33)]);
  const stalk = new THREE.Mesh(new THREE.TubeGeometry(lc, 30, 0.9, 8), hide); body.add(stalk);
  const lureMat = new THREE.MeshStandardMaterial({ color: 0x0a2a30, emissive: 0x6ff8ff, emissiveIntensity: 2.2, roughness: 0.2 });
  const lure = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12), lureMat); lure.position.set(0, 20, 34); body.add(lure);
  const lureLight = new THREE.PointLight(0x6ff8ff, 900, 120, 1.6); lure.add(lureLight);
  // gill sacs (weak points in phase 2): one on each flank, one under the chin
  const gillMat = new THREE.MeshStandardMaterial({ color: 0x3a0f22, emissive: 0xff4f9a, emissiveIntensity: 1.3, roughness: 0.35 });
  const gills = [V(-21, -2, 12), V(21, -2, 12), V(0, 7, 24)].map(p => { const m = new THREE.Mesh(new THREE.SphereGeometry(4, 18, 14).scale(1, 1.15, 0.9), gillMat.clone()); m.position.copy(p); body.add(m); return m; });
  // huge crab-like forelimbs that grab the cliff in the last stand (hidden until then)
  const arms = [-1, 1].map(sx => {
    const a = new THREE.Group(); a.position.set(sx * 20, -6, 16); body.add(a); a.visible = false;
    const up = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.2, 26, 10).translate(0, 13, 0), shellMat); a.add(up);
    const fore = new THREE.Group(); fore.position.y = 26; a.add(fore);
    const lo = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 22, 10).translate(0, 11, 0), shellMat); fore.add(lo);
    for (const s of [-1, 1]) { const claw = new THREE.Mesh(new THREE.ConeGeometry(1.8, 9, 7).translate(0, 4.5, 0), bone); claw.position.set(s * 1.2, 22, 0); claw.rotation.z = -s * 0.35; fore.add(claw); }
    return { a, fore, sx };
  });
  body.scale.setScalar(1.6);
  g.userData = { body, mawG, jaw, core, coreMat, coreLight, eyes, eyeMat, lure, lureMat, lureLight, gills, arms, shellMat };
  return g;
}
// swap the procedural Tidefather body for "Deep monstrosity" (Vasian-Digital3D, CC BY 4.0); the glowing weak points get pinned to its bones
function abyssify(m) {
  const u = m.userData, aw = creature('abyss'); if (!aw) return null;
  const eyeMeshes = new Set(); for (const ey of u.eyes) { eyeMeshes.add(ey.children[0]); eyeMeshes.add(ey.children[1]); }
  u.body.traverse(o => { if (o.isMesh && o !== u.core && !eyeMeshes.has(o) && !u.gills.includes(o)) o.visible = false; });
  m.add(u.lureLight); u.lureLight.position.set(0, 30, 40);
  m.add(aw); u.aw = aw.userData; u.awRoot = aw; aw.position.y = u.body.position.y - 22; m.updateMatrixWorld(true);
  const head = u.aw.bone('head'), chest = u.aw.bone('spine1') || u.aw.bone('spine'); u.headB = head; u.chestB = chest;
  const hp = head ? head.getWorldPosition(V()) : m.localToWorld(V(0, 60, 0)), cp = chest ? chest.getWorldPosition(V()) : m.localToWorld(V(0, 45, 0));
  const fw = m.localToWorld(V(0, 0, 1)).sub(m.getWorldPosition(V())).normalize(), sd = V(fw.z, 0, -fw.x);
  pinTo(m, head, u.core, hp.clone().addScaledVector(fw, 6).add(V(0, -1.5, 0)));
  u.eyes.forEach((ey, i) => { const sx = i < 3 ? -1 : 1, k = i % 3; pinTo(m, head, ey, hp.clone().addScaledVector(sd, sx * (2.4 + k * 2.2)).addScaledVector(fw, 4 - k).add(V(0, 2 + k * 1.2, 0))); });
  [V(-10, -2, 7), V(10, -2, 7), V(0, 6, 9)].forEach((o, i) => pinTo(m, chest, u.gills[i], cp.clone().addScaledVector(sd, o.x).add(V(0, o.y, 0)).addScaledVector(fw, o.z)));
  u.aw.play('^idle_battle_1$');
  u.awAct = (k, back = '^idle_battle_1$') => { const d = u.aw.play(k, { once: true, fade: 0.3 }); if (back) { clearTimeout(u.awT); u.awT = setTimeout(() => u.aw && u.aw.play(back, { fade: 0.4 }), Math.max(200, d * 1000 - 300)); } return d; };
  return aw;
}
// a distant sighting during the drive: it rises out of the sea, looks at you, roars and sinks
function sighting(dist, side, hold = 5, closer) {
  const m = tidefatherModel(); scene.add(m); const u = m.userData; abyssify(m);
  const at = trackAt(G.s + dist).addScaledVector(trackSide(G.s + dist), side); at.y = 0; m.position.copy(at);
  m.lookAt(vehicle.position.x, 0, vehicle.position.z); u.body.position.y = -70; u.lureLight.intensity = 400;
  let t = 0; const th = { update(dt) {
    t += dt; const up = t < 3 ? t / 3 : t < 3 + hold ? 1 : Math.max(0, 1 - (t - 3 - hold) / 3);
    u.body.position.y = lerp(-70, closer ? 14 : 6, smooth(0, 1, up)); u.body.rotation.z = Math.sin(t * 0.7) * 0.03;
    if (u.aw) { u.awRoot.position.y = u.body.position.y - 22; u.aw.mixer && u.aw.mixer.update(dt); if (t > 1 && !th.ro2) { th.ro2 = true; u.awAct('^att_battle_11_01$'); } }
    m.lookAt(vehicle.position.x, 0, vehicle.position.z);
    if (t > 1 && !th.roared) { th.roared = true; strike(at.clone().add(V(rand(-30, 30), 0, rand(-30, 30))), true); sfx.stinger(); say(closer ? 'IT\'S FOLLOWING US…' : 'WHAT IS THAT?!', 2.2); }
    if (closer && t > 3.5 && t < 3 + hold && Math.random() < dt * 0.6) launchMortar(u.lure.getWorldPosition(V()).add(V(0, -10, 0)), null, true);
    if (Math.random() < dt * 6 && up > 0.05 && up < 0.95) splashAt(m.position.clone().add(V(rand(-25, 25), 0, rand(-25, 25))), 2.5);
    if (t > 6 + hold) { scene.remove(m); return true; }
  } };
  tideRefs.push(th);
}
function splashAt(p, size = 1) { p.y = 0.5; burst(p, 30 * size | 0, 10 * size, 1.2, 1.4 * size, 3 * size, C(0xc8d6df), 0.9, 1.2, 14); burst(p, 10, 4 * size, 2, 3 * size, 9 * size, C(0x8aa0ad), 0.45, 1.2, -1, smoke); }
// tentacle: a barbed limb that rises from the sea, winds up (glowing tip) and slams down next to the Warthog. Shoot the tip.
let _tentTex = null; const tentMat = () => new THREE.MeshStandardMaterial({ map: _tentTex || (_tentTex = tideShellTex()), color: 0x8a9499, roughness: 0.5, metalness: 0.2, emissiveMap: _tentVein || (_tentVein = tideVeinTex()), emissive: 0x3fd8ff, emissiveIntensity: 0.5 });
let _tentVein = null;
function tentacle(base, owner, opts = {}) {
  const g = new THREE.Group(); const mat = tentMat(), barb = new THREE.MeshStandardMaterial({ color: 0xb9b19a, roughness: 0.5 });
  const N = 20, segs = [];
  for (let k = 0; k < N; k++) { const u = k / (N - 1), r = lerp(3.6, 0.8, u); const s = new THREE.Group(); const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9).scale(1, 1, 1.6), mat); s.add(m);
    if (k % 2 === 0 && k < N - 2) { const b = new THREE.Mesh(new THREE.ConeGeometry(r * 0.25, r * 1.1, 5), barb); b.position.y = r * 0.95; s.add(b); }
    g.add(s); segs.push(s); }
  const tipMat = new THREE.MeshStandardMaterial({ color: 0x3a1006, emissive: 0xff6a1a, emissiveIntensity: 0.6, roughness: 0.3 });
  const tip = new THREE.Mesh(new THREE.SphereGeometry(1.7, 14, 10), tipMat); g.add(tip);
  for (let k = 0; k < 5; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.4, 5), barb); const a = k / 5 * Math.PI * 2; c.position.set(Math.cos(a) * 1.4, Math.sin(a) * 1.4, 0.6); c.rotation.x = Math.PI / 2; tip.add(c); }
  const e = new Enemy('tentacle', g, opts.hp || 26, [{ o: V(), r: 2.6 }], 400);
  e.mats = [tipMat]; e.segs = segs; e.tip = tip; e.tipMat = tipMat; e.base = base.clone(); e.owner = owner; e.sweep = opts.sweep;
  e.state = 'rise'; e.st = 0; e.up = 0; e.cur = V(); e.side = opts.side || (Math.random() < 0.5 ? -1 : 1); e.ph = rand(0, 6); e.next = rand(1.5, 4);
  e.idle = () => vehicle.position.clone().addScaledVector(vehicleFwd, rand(22, 34)).addScaledVector(trackSide(G.s), e.side * rand(9, 16)).add(V(0, rand(14, 22), 0));
  e.goal = e.idle(); e.cur.copy(base).add(V(0, -20, 0));
  e.hitTest = function (ray) { if (this.up < 0.4) return null; this.tip.getWorldPosition(_v1); _v2.copy(_v1).sub(ray.origin); const t = _v2.dot(ray.direction); if (t < 0) return null; const d2 = _v2.lengthSq() - t * t, r2 = (this.state === 'wind' ? 3.2 : 2.6) ** 2; if (d2 > r2) return null; return [t - Math.sqrt(r2 - d2), 0]; };
  e.damage = function (n, idx, at) {
    if (!this.alive || this.up < 0.4) return; this.hp -= n; this.flash = 1; burst(at, 6, 6, 0.3, 0.6, 0.1, C(0xff8a3a), 1, 3);
    if (this.hp <= 0) { this.alive = false; this.die(at); award(this, at, 0); }
  };
  e.update = function (dt) {
    this.t += dt; this.st += dt; const veh = vehicle.position;
    if (!this.alive) {   // severed: the limb thrashes and sinks back into the sea
      this.deadT += dt; this.cur.lerp(this.base.clone().add(V(0, -30, 0)), dt * 0.8); this.up = Math.max(0, this.up - dt * 0.5);
      if (this.deadT < 1.2 && Math.random() < 0.6) burst(this.tip.getWorldPosition(V()), 4, 5, 0.6, 0.8, 0.2, C(0x6ff8ff), 0.9, 2, 10);
      this.pose(dt); if (this.deadT > 3) this.remove(); return;
    }
    if (this.state === 'rise') { this.up = Math.min(1, this.up + dt * 0.6); this.cur.lerp(this.goal, dt * 1.5); if (this.up >= 1) { this.state = 'idle'; this.st = 0; } if (Math.random() < dt * 5) splashAt(this.base.clone(), 1.3); }
    else if (this.state === 'idle') {
      this.cur.lerp(this.goal, dt * 1.2); this.cur.y += Math.sin(this.t * 1.7 + this.ph) * dt * 2;
      this.next -= dt; const busy = enemies.filter(o => o.kind === 'tentacle' && o.alive && (o.state === 'wind' || o.state === 'slam')).length;
      if (this.next <= 0 && busy < (this.owner && this.owner.phase >= 4 ? 2 : 1)) { this.state = 'wind'; this.st = 0; this.goal = this.cur.clone().add(V(0, 16, 0)).addScaledVector(vehicleFwd, -4); say(this.sweep ? 'TENTACLE!' : 'SHOOT THE TIP!', 1); }
    } else if (this.state === 'wind') {   // rears back, tip glows hot: the window to shoot it
      this.cur.lerp(this.goal, dt * 2.5); const k = this.st / (this.sweep ? 2.6 : 2.2); this.tipMat.emissiveIntensity = 0.6 + k * 3 + Math.sin(this.t * 30) * 0.4 * k;
      if (k >= 1) { this.state = 'slam'; this.st = 0; this.from = this.cur.clone();
        this.strikeAt = this.sweep ? groundPoint(G.s + rand(28, 38), this.side * rand(0, 4)) : veh.clone().addScaledVector(vehicleFwd, rand(7, 10)).addScaledVector(trackSide(G.s), this.side * rand(3, 5)); this.strikeAt.y = groundH(this.strikeAt.x, this.strikeAt.z) + 1.2; }
    } else if (this.state === 'slam') {
      const k = Math.min(1, this.st / 0.32); this.cur.lerpVectors(this.from, this.strikeAt, k * k);
      if (k >= 1) { this.state = 'drag'; this.st = 0; const at = this.strikeAt.clone(); explosion(at, 1.2, true); burst(at, 40, 14, 0.9, 1.4, 0.4, COL.dust, 1, 1.5, 16); burst(at, 14, 4, 2, 3, 7, COL.dust, 0.6, 1.5, -1, smoke); sfx.impact(); sfx.boom(1.3); shake = Math.max(shake, 1.1); lightFlash(at, 0xffd9a0, 900);
        if (!this.sweep && G.state === 'play') damagePlayer(14); }
    } else if (this.state === 'drag') {
      if (this.st > 0.9) { this.state = 'idle'; this.st = 0; this.goal = this.idle(); this.next = rand(3.5, 7) * (this.owner && this.owner.phase >= 3 ? 0.8 : 1); this.tipMat.emissiveIntensity = 0.6; if (this.sweep) { this.state = 'leave'; } }
    } else if (this.state === 'leave') { this.up = Math.max(0, this.up - dt * 0.5); this.cur.lerp(this.base.clone().add(V(0, -25, 0)), dt * 0.8); if (this.up <= 0) { this.alive = false; this.remove(); return; } }
    this.pose(dt);
  };
  // the limb follows a curve from its base in the sea, up over the cliff, to the tip, with a ripple running along it
  const _a = V(), _b = V(), _c = V(), _p = V(), _n = V();
  e.pose = function () {
    _a.copy(this.base); _c.copy(this.cur); _b.copy(_a).lerp(_c, 0.5); _b.y = Math.max(_a.y, _c.y) + 14 * this.up + 6;
    const bez = (u, out) => out.set(0, 0, 0).addScaledVector(_a, (1 - u) * (1 - u)).addScaledVector(_b, 2 * u * (1 - u)).addScaledVector(_c, u * u);
    const side = trackSide(G.s);
    for (let k = 0; k < this.segs.length; k++) { const u = k / (this.segs.length - 1) * Math.max(0.15, this.up); bez(u, _p); _p.addScaledVector(side, Math.sin(u * 7 - this.t * 3 + this.ph) * 2.2 * (1 - u) * (this.alive ? 1 : 2.5)); this.segs[k].position.copy(_p); bez(Math.min(1, u + 0.03), _n); this.segs[k].lookAt(_n); }
    this.tip.position.copy(this.segs[this.segs.length - 1].position); this.obj.position.set(0, 0, 0); this.hits[0].o.copy(this.tip.position);
  };
  e.die = function (at) { burst(at, 50, 12, 0.8, 1.2, 0.3, C(0x6ff8ff), 1, 2, 10); explosion(at, 0.8); sfx.boom(0.9); popups.push({ p: at.clone(), t: 0, text: this.sweep ? 'DRIVEN OFF!' : 'TENTACLE SEVERED!', col: '#7ff3ff' }); if (this.owner && this.owner.alive) this.owner.limbLost(this); };
  // Enemy.pos is the group origin (world 0); give it a meaningful position for scoring/culling
  Object.defineProperty(e, 'pos', { get() { return this.tip.position; } });
  e.pose(0);
  return e;
}
// gill sac: rides on the Tidefather's body; a separate target so it shows up as its own weak point
function gillSac(owner, mesh, i) {
  const holder = new THREE.Group();
  const e = new Enemy('gill', holder, 55, [{ o: V(), r: 7 }], 800); e.mats = [mesh.material]; e.mesh = mesh; e.owner = owner;
  e.update = function (dt) {
    this.t += dt; this.mesh.getWorldPosition(this.obj.position);
    if (!this.alive) return;
    const on = owner.phase === 2 && owner.ready; this.mesh.material.emissiveIntensity = on ? 1.3 + Math.sin(this.t * 5 + i) * 0.6 : 0.5; this.mesh.scale.setScalar(1 + Math.sin(this.t * 3 + i) * 0.06);
    if (on) { this.spawnT = (this.spawnT ?? rand(3, 7)) - dt; if (this.spawnT <= 0) { this.spawnT = rand(9, 13); if (enemies.filter(o => o.kind === 'drone' && o.alive).length < 4) { const d = drone(ARENA + rand(40, 70), rand(-22, 22), rand(12, 18)); if (d) { d.pos.copy(this.obj.position); } burst(this.obj.position, 20, 8, 0.6, 1, 0.3, C(0xff4f9a), 1, 2); } } }
  };
  e.hitTest = function (ray) { if (!(owner.phase === 2 && owner.ready) || !this.alive) return null; return Enemy.prototype.hitTest.call(this, ray); };
  e.die = function (at) { this.mesh.visible = false; burst(at, 60, 14, 0.9, 1.6, 0.4, C(0xff4f9a), 1, 1.5, 8); explosion(at, 1.4); sfx.boom(1.2); shake = Math.max(shake, 0.5); popups.push({ p: at.clone(), t: 0, text: 'GILL BURST!', col: '#ff9ac8' }); owner.gillLost(this); this.remove(); };
  return e;
}
// the boss itself
function tidefather() {
  const m = tidefatherModel(), u = m.userData; const end = trackAt(L - 1), dir = trackDir(L - 8), side = trackSide(L - 8);
  const e = new Enemy('tidefather', m, 1000, [{ o: V(), r: 1 }], 25000); e.mats = []; e.u = u;
  e.phase = 0; e.ready = false; e.st = 0; e.floor = [1000, 760, 500, 200, 0]; e.dist = 200; e.lift = -70; e.liftGoal = -70; e.lost = 0; e.gillsLeft = 3;
  e.maw = 0; e.charge = -1; e.coreHit = 0; e.stagger = 0; e.boulderT = 6; e.regrowT = 0; e.cellT = 18; e.crateT = 30; e.chargeT = 6; e.armT = 6; e.deadT = 0;
  e.home = () => end.clone().addScaledVector(dir, e.dist - 70).setY(0);
  m.position.copy(e.home()); u.body.position.y = e.lift; m.lookAt(vehicle.position.x, 0, vehicle.position.z); abyssify(m);
  e.hurt = function (n) { if (!this.alive) return; this.hp = Math.max(this.floor[this.phase] ?? 0, this.hp - n); this.flash = 0.4; };
  e.limbLost = function (t) { if (this.phase === 1 && !t.regrown) { this.lost++; this.hurt(60); } else this.hurt(this.phase >= 3 ? 10 : 0); };
  e.gillLost = function () { this.gillsLeft--; this.hurt(87); };
  const spawnTent = (n, regrown) => { for (let i = 0; i < n; i++) { const b = end.clone().addScaledVector(dir, rand(-24, 10)).addScaledVector(side, (i % 2 ? 1 : -1) * rand(14, 34)); b.y = -4; const t = tentacle(b, e, { side: i % 2 ? 1 : -1, hp: regrown ? 22 : 26 }); t.regrown = regrown; t.next = 2.5 + i * 2.2; } };
  e.tents = () => enemies.filter(o => o.kind === 'tentacle' && o.alive && o.owner === e).length;
  // hit test: the core when the maw is open, eyes in the last stand, otherwise the shell soaks rounds
  const eyeR = 3.4;
  e.hitTest = function (ray) {
    if (!this.ready) return null; let best = null; const test = (p, r, idx) => { _v2.copy(p).sub(ray.origin); const t = _v2.dot(ray.direction); if (t < 0) return; const d2 = _v2.lengthSq() - t * t; if (d2 > r * r) return; const d = t - Math.sqrt(r * r - d2); if (!best || d < best[0]) best = [d, idx]; };
    if (this.maw > 0.45) test(u.core.getWorldPosition(_v1), 8, 1);
    if (this.phase >= 4) u.eyes.forEach((ey, i) => { if (!ey.userData.dead) test(ey.getWorldPosition(_v1), eyeR, 10 + i); });
    if (!best) { if (u.chestB) { u.chestB.getWorldPosition(_v1); test(_v1, 17, 0); } else { u.body.getWorldPosition(_v1); _v1.y += 6; test(_v1, 38, 0); } if (best) best[0] += 40; }   // the shell only soaks rounds that hit nothing else
    return best;
  };
  e.damage = function (n, idx, at) {
    if (!this.alive) return;
    if (idx === 1) { this.hurt(n * 2); this.coreHit += n; burst(at, 6, 7, 0.3, 0.7, 0.1, C(0xff8a3a), 1, 3); if (Math.random() < 0.15) popups.push({ p: at.clone(), t: 0, text: 'CORE HIT!', col: '#ffb070' }); }
    else if (idx >= 10) { const ey = u.eyes[idx - 10]; ey.userData.hp = (ey.userData.hp ?? 22) - n; this.hurt(n * 3); burst(at, 6, 6, 0.3, 0.6, 0.1, C(0xffc04a), 1, 3);
      if (ey.userData.hp <= 0 && !ey.userData.dead) { ey.userData.dead = true; ey.children[0].material = new THREE.MeshStandardMaterial({ color: 0x150a05, roughness: 0.8 }); burst(at, 40, 10, 0.7, 1.2, 0.3, C(0xffc04a), 1, 2, 8); explosion(at, 0.9); this.hurt(25); popups.push({ p: at.clone(), t: 0, text: 'EYE DOWN!', col: '#ffd24a' }); sfx.stinger(); } }
    else { burst(at, 2, 5, 0.2, 0.4, 0.1, COL.spark, 1, 3); if (Math.random() < 0.02) popups.push({ p: at.clone(), t: 0, text: 'ARMORED', col: '#9fb0bd' }); }
    if (this.hp <= 0 && this.alive) { this.alive = false; this.die(); award(this, at, 0); }
  };
  e.setPhase = function (p) {
    this.phase = p; this.st = 0; this.ready = false;
    if (u.aw && p > 1) u.awAct('^att_battle_11_01$');
    if (p === 1) { say('THE TIDEFATHER', 3); sfx.stinger(); this.liftGoal = vehicle.position.y - 16; this.dist = 200; setTimeout(() => { spawnTent(4, false); this.ready = true; say('SHOOT THE GLOWING TIPS!', 2.2); }, 4200); }
    if (p === 2) { say('IT RISES!', 2.4); sfx.stinger(); this.liftGoal = vehicle.position.y + 10; this.dist = 170; strike(this.pos.clone().add(V(30, 0, 0)), true); setTimeout(() => { this.ready = true; say('BURST ITS GILLS!', 2.2); }, 3500); }
    if (p === 3) { say('IT\'S DIVING…', 2); this.liftGoal = -70; setTimeout(() => { if (!this.alive) return; this.dist = 135; this.liftGoal = vehicle.position.y + 12; strike(this.home().add(V(-20, 0, 10)), true); say('THE MAW OPENS — SHOOT THE CORE!', 2.6); sfx.stinger(); setTimeout(() => { this.ready = true; this.chargeT = 1.5; }, 2600); }, 3400); }
    if (p === 4) { say('LAST STAND — SHOOT ITS EYES!', 3); sfx.stinger(); this.dist = 100; this.liftGoal = vehicle.position.y + 11; if (!u.aw) u.arms.forEach(a => a.a.visible = true); setTimeout(() => { this.ready = true; shake = Math.max(shake, 1.4); sfx.boom(1.8); sfx.impact(); for (const a of u.arms) { const p = a.fore.localToWorld(V(0, 22, 0)); explosion(p, 1.5, true); burst(p, 60, 16, 1, 2, 0.5, COL.dust, 1, 1.5, 16); } }, 2600); }
  };
  e.update = function (dt) {
    this.t += dt; this.st += dt; const veh = vehicle.position;
    // move toward the current station, rise or sink, face the Warthog
    const home = this.home(); this.obj.position.lerp(home, dt * 0.5); this.lift = lerp(this.lift, this.liftGoal, dt * 0.7); u.body.position.y = this.lift + Math.sin(this.t * 0.6) * 1.2;
    _v1.set(veh.x, 0, veh.z); this.obj.lookAt(_v1); u.body.rotation.z = Math.sin(this.t * 0.45) * 0.03; u.body.rotation.x = -0.08 + (this.phase === 4 ? 0.12 : 0);
    if (Math.random() < dt * 3 && Math.abs(this.lift - this.liftGoal) > 3) splashAt(this.obj.position.clone().add(V(rand(-30, 30), 0, rand(-30, 30))), 3);
    u.lure.position.y = 20 + Math.sin(this.t * 1.3) * 1.5; u.lureLight.intensity = 900 + Math.sin(this.t * 4) * 300;
    for (const ey of u.eyes) if (!ey.userData.dead) ey.lookAt(veh);
    if (u.aw) { u.awRoot.position.y = u.body.position.y - 22; u.aw.mixer && u.aw.mixer.update(dt); }
    this.obj.updateMatrixWorld(); this.hits[0].o.copy(this.obj.worldToLocal(u.core.getWorldPosition(V())));
    if (!this.alive) return this.dying(dt);
    if (this.phase === 0) { this.setPhase(1); }
    // phase changes
    if (this.phase === 1 && this.ready && this.lost >= 4) this.setPhase(2);
    if (this.phase === 2 && this.ready && this.gillsLeft <= 0) this.setPhase(3);
    if (this.phase === 3 && this.ready && this.hp <= 200) { this.charge = -1; this.setPhase(4); }
    // the arena keeps feeding you health and turret crates
    this.cellT -= dt; if (this.cellT <= 0) { this.cellT = rand(22, 30); cells(16, rand(-7, 7), 1); }
    this.crateT -= dt; if (this.crateT <= 0) { this.crateT = rand(34, 44); crate(20, rand(-6, 6), ['gauss', 'rockets', 'flame'][rand(0, 3) | 0]); }
    if (!this.ready) { this.maw = lerp(this.maw, 0, dt * 2); this.poseMaw(); return; }
    // regrow tentacles from phase 2 on
    if (this.phase >= 2) { const want = this.phase === 2 ? 1 : 2; if (this.tents() < want) { this.regrowT -= dt; if (this.regrowT <= 0) { this.regrowT = this.phase >= 4 ? 5 : 8; spawnTent(1, true); } } }
    // boulders from phase 2 on
    if (this.phase >= 2) { this.boulderT -= dt; if (this.boulderT <= 0) { this.boulderT = this.phase === 4 ? rand(3, 4.5) : rand(5, 7); if (u.aw) u.awAct('^att_battle_1_01$'); launchMortar(u.aw ? u.headB.getWorldPosition(V()).add(V(0, 8, 0)) : u.lure.getWorldPosition(V()).add(V(0, -8, 0)), this, true); } }
    // phase 4: drones too
    if (this.phase === 4) { this.droneT = (this.droneT ?? 4) - dt; if (this.droneT <= 0) { this.droneT = rand(8, 11); if (enemies.filter(o => o.kind === 'drone' && o.alive).length < 3) drone(ARENA + rand(40, 60), rand(-18, 18), rand(11, 16)); } }
    // the maw beam (phases 3 and 4): charge, interrupt by pouring fire into the core, or eat the blast
    if (this.phase >= 3) {
      if (this.stagger > 0) { this.stagger -= dt; this.maw = lerp(this.maw, 1, dt * 4); if (this.stagger <= 0) this.chargeT = this.phase === 4 ? 7 : 8.5; }
      else if (this.charge < 0) { this.maw = lerp(this.maw, 0.1, dt * 2); this.chargeT -= dt; if (this.chargeT <= 0) { this.charge = 0; this.coreHit = 0; if (u.aw) u.awAct('^att_battle_4_start$', '^att_battle_4_loop$'); say('IT\'S CHARGING — SHOOT THE CORE!', 1.8); sfx.gaussCharge && sfx.gaussCharge(); } }
      else {
        this.charge += dt; const T = this.phase === 4 ? 4 : 4.6, k = this.charge / T; this.maw = lerp(this.maw, 1, dt * 3);
        u.coreMat.emissiveIntensity = 1.2 + k * 5 + Math.sin(this.t * 40) * k; u.coreLight.intensity = 400 + k * 5000; u.core.scale.setScalar(1 + k * 0.6);
        if (Math.random() < k * 0.8) fx.spawn(u.core.getWorldPosition(V()).add(V(rand(-6, 6), rand(-4, 4), rand(-2, 6))), u.core.getWorldPosition(V()).sub(_v1).multiplyScalar(0), 0.4, 1.5, 0.2, C(0xff7a2a), 1, 0);
        const need = this.phase === 4 ? 30 : 36;
        if (this.coreHit >= need) { this.charge = -1; this.stagger = 3; if (u.aw) u.awAct('^dmg_critical_start_1$', '^dmg_critical_loop_1$'); setTimeout(() => u.aw && this.alive && u.awAct('^dmg_critical_end_1$'), 2600); u.coreMat.emissiveIntensity = 1.2; u.coreLight.intensity = 300; u.core.scale.setScalar(1); say('STAGGERED! KEEP FIRING!', 1.6); sfx.stinger(); explosion(u.core.getWorldPosition(V()), 1.6); shake = Math.max(shake, 0.7); this.hurt(30); }
        else if (k >= 1) { this.charge = -1; this.chargeT = this.phase === 4 ? 6 : 7.5; if (u.aw) u.awAct('^att_battle_4_end$'); this.fireBeam(); u.coreMat.emissiveIntensity = 1.2; u.coreLight.intensity = 0; u.core.scale.setScalar(1); }
      }
    }
    // phase 4: the claws hammer the outlook
    if (this.phase === 4) { this.armT -= dt; const a = u.arms[(this.t / 7 | 0) % 2]; if (this.armT < 1.2) a.fore.rotation.x = lerp(a.fore.rotation.x, -0.9, dt * 3); else a.fore.rotation.x = lerp(a.fore.rotation.x, 0.25, dt * 6);
      if (u.aw && this.armT <= 1.1 && !this.slamAnim) { this.slamAnim = true; u.awAct('^att_battle_3_01$'); }
      if (this.armT <= 0) { this.armT = rand(6, 8); this.slamAnim = false; const p = u.aw ? vehicle.position.clone().addScaledVector(vehicleFwd, 26).addScaledVector(trackSide(G.s), rand(-12, 12)) : a.fore.localToWorld(V(0, 22, 0)); explosion(p, 1.3, true); burst(p, 50, 14, 0.9, 1.6, 0.4, COL.dust, 1, 1.5, 16); sfx.impact(); sfx.boom(1.5); shake = Math.max(shake, 1.2); if (G.state === 'play') damagePlayer(10); }
      for (const a2 of u.arms) { a2.a.rotation.x = -0.9 + Math.sin(this.t * 0.8 + a2.sx) * 0.05; } }
    this.poseMaw();
  };
  e.poseMaw = function () { u.jaw.rotation.x = this.maw * 0.75; u.mawG.position.y = -5 - this.maw * 1.5; };
  e.fireBeam = function () {
    const from = u.core.getWorldPosition(V()), to = camera.position.clone().add(V(rand(-1, 1), -1.2, 0)); const len = from.distanceTo(to);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 3.2, len, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, len / 2), new THREE.MeshBasicMaterial({ color: 0xffa060, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    beam.position.copy(from); beam.lookAt(to); scene.add(beam); sfx.gaussFire(); sfx.boom(1.6); shake = Math.max(shake, 1.3); lightFlash(to, 0xff8a3a, 4000);
    if (G.state === 'play') damagePlayer(34);
    let t = 0; tideRefs.push({ update(dt) { t += dt; beam.material.opacity = Math.max(0, 0.9 - t * 1.2) * (0.8 + Math.random() * 0.2); beam.scale.x = beam.scale.y = 1 + Math.sin(t * 50) * 0.1; if (t > 0.8) { scene.remove(beam); return true; } } });
    say('BEAM HIT!', 1);
  };
  e.dying = function (dt) {   // a long death: eyes go out, explosions ripple over the shell, it slides back into the sea
    this.deadT += dt; this.maw = lerp(this.maw, 1, dt * 2); this.poseMaw();
    if (this.deadT < 6 && Math.random() < dt * 7) { const p = u.body.localToWorld(V(rand(-22, 22), rand(-4, 10), rand(-20, 26))); explosion(p, rand(1, 2), Math.random() < 0.6); shake = Math.max(shake, 0.4); }
    u.eyes.forEach((ey, i) => { if (this.deadT > 0.6 * i) ey.visible = Math.random() < 0.3 && this.deadT < 0.6 * i + 0.6; });
    u.lureLight.intensity = Math.max(0, 900 - this.deadT * 300); u.coreLight.intensity = Math.max(0, 3000 - this.deadT * 900);
    if (this.deadT > 2.5) { this.liftGoal = -110; for (const a of u.arms) a.a.rotation.x = lerp(a.a.rotation.x, -2, dt * 0.8); }
    if (this.deadT > 3 && !this.flashDone) { this.flashDone = true; strike(this.pos.clone(), true); sfx.stinger(); }
    if (this.deadT > 5.5 && !this.won) { this.won = true; for (let k = 0; k < 6; k++) splashAt(this.obj.position.clone().add(V(rand(-30, 30), 0, rand(-30, 30))), 4); win(); }
    if (this.deadT > 10) this.remove();
  };
  e.die = function () { if (u.aw) { clearTimeout(u.awT); u.aw.play('^dead_1$', { once: true, fade: 0.3 }); } say('THE TIDEFATHER FALLS!', 3); sfx.boom(2); shake = Math.max(shake, 1.5); for (const o of enemies) if ((o.kind === 'tentacle' || o.kind === 'drone' || o.kind === 'gill') && o.alive) { o.alive = false; o.die && o.kind !== 'gill' && o.die(o.pos.clone()); if (o.kind === 'drone') o.remove(); } };
  u.gills.forEach((g, i) => gillSac(e, g, i));
  G.boss = e; return e;
}
function updateLevel5(dt) { updateStorm(dt); fpvUpdate(dt); for (let i = tideRefs.length - 1; i >= 0; i--) if (tideRefs[i].update(dt)) tideRefs.splice(i, 1); }
function level5Script(gS, A) {
  const seaSide = (sOff) => { const p = trackAt(G.s + sOff).addScaledVector(trackSide(G.s + sOff), -rand(26, 40)); p.y = -4; return p; };
  return [
    { s: 25, f: () => say('LEVEL 5 · STORM COAST') },
    { s: 50, f: () => { drone(G.s + 90, -8, 10); crawlers(80, 6, 3); cells(78, 4, 1); } },
    { s: 115, f: () => sighting(330, -260, 4) },
    { s: 165, f: () => { fturret(groundPoint(G.s + 95, 18)); swamplers(80, 8, 3); sled(G.s + 115, 6); } },
    { s: 230, f: () => { drone(G.s + 90, -6, 10); drone(G.s + 100, 6, 12); crawlers(85, 7, 3); cells(85, 0, 1); } },
    { s: 300, f: () => { tentacle(seaSide(55), null, { sweep: true, side: -1, hp: 22 }); } },
    { s: 360, f: () => { swamplers(80, 7, 4); fturret(groundPoint(G.s + 100, 20)); } },
    { s: 420, f: () => { for (let k = 0; k < 3; k++) setTimeout(() => launchMortar(seaSide(70).add(V(0, 20, 0)).addScaledVector(trackSide(G.s), -60), null, true), k * 900); sled(G.s + 110, -4); cells(80, 5, 1); } },
    { s: 490, f: () => { drone(G.s + 90, 0, 11); crawlers(80, -5, 2); crawlers(90, 8, 3); } },
    { s: 560, f: () => sighting(160, -130, 7, true) },
    { s: 640, f: () => { swamplers(78, 6, 3); fturret(groundPoint(G.s + 100, 18)); cells(80, 3, 1); } },
    { s: 700, f: () => { tentacle(seaSide(45), null, { sweep: true, side: -1, hp: 22 }); setTimeout(() => tentacle(seaSide(65), null, { sweep: true, side: 1, hp: 22 }), 1300); } },
    { s: 780, f: () => { drone(G.s + 90, -6, 10); drone(G.s + 105, 6, 13); sled(G.s + 115, 5); crawlers(85, 7, 3); } },
    { s: 860, f: () => { swamplers(75, 6, 4); cells(78, 0, 2); } },
    { s: 940, f: () => { say('THE OUTLOOK', 2); storm.fpv = true; music.play('boss'); cells(ARENA - G.s + 16, -5, 1); setTimeout(() => tidefather(), 1800); } },
  ].map(ev => ({ s: ev.s * A, f: ev.f }));
}
// ---------------------------------------------------------------- level 3: snowfall, blizzards, icicles, lake cracks, the Avalanche Engine
const winter = { flakes: null, bliz: 0, blizMax: 0, overlay: null, holes: [], ledges: [] };
COL.ice = C(0xcfefff); COL.iceDeep = C(0x6fc6f0);
function iceShatter(at, size = 1) {
  sfx.iceCrack(at.distanceTo(vehicle.position));
  burst(at, Math.round(26 * size), 9 * size, 0.7, 0.5, 0.15, COL.ice, 1, 1.2, 14);
  burst(at, Math.round(14 * size), 5 * size, 0.4, 1.6 * size, 0.4, COL.iceDeep, 0.9, 2);
  burst(at, Math.round(10 * size), 3, 1.4, 2, 5 * size, COL.white, 0.45, 1.5, -1, smoke);
  lightFlash(at, 0xbfefff, 900 * size);
}
function initWinter() {
  const N = 2400, g = new THREE.BufferGeometry(), a = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { a[i * 3] = rand(-40, 40); a[i * 3 + 1] = rand(-6, 26); a[i * 3 + 2] = rand(-40, 40); }
  g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  winter.flakes = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.13, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
  winter.flakes.frustumCulled = false; scene.add(winter.flakes);
  const o = document.createElement('div'); o.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,rgba(232,240,250,.55) 0%,rgba(236,243,252,.92) 75%);z-index:3';
  document.body.appendChild(o); winter.overlay = o;
  winter.fog = [scene.fog.near, scene.fog.far];
}
function blizzard(t = 7) { winter.bliz = winter.blizMax = t; say('BLIZZARD!', 1.8); sfx.boom(0.3); }
function updateWinter(dt) {
  if (!winter.flakes) initWinter();
  winter.bliz = Math.max(0, winter.bliz - dt);
  const b = winter.blizMax ? smooth(0, 1.2, winter.bliz) * smooth(winter.blizMax, winter.blizMax - 1.2, winter.blizMax - winter.bliz) : 0;   // fade in and out
  scene.fog.near = lerp(winter.fog[0], 8, b); scene.fog.far = lerp(winter.fog[1], 70, b);
  winter.overlay.style.opacity = (b * 0.62).toFixed(3); sfx.wind(G.state === 'play' ? 0.12 + b * 0.75 : 0.06);
  const P = winter.flakes.geometry.attributes.position, A = P.array, wx = lerp(1.4, 22, b), wy = lerp(-2.2, -5, b), wz = lerp(0.6, 6, b), t = G.time || 0;
  for (let i = 0; i < A.length; i += 3) {
    A[i] += (wx + Math.sin(t * 1.3 + i) * 0.6) * dt; A[i + 1] += wy * dt; A[i + 2] += (wz + Math.cos(t + i * 0.7) * 0.5) * dt;
    if (A[i] > 40) A[i] -= 80; else if (A[i] < -40) A[i] += 80;
    if (A[i + 2] > 40) A[i + 2] -= 80; else if (A[i + 2] < -40) A[i + 2] += 80;
    if (A[i + 1] < -6) A[i + 1] += 32;
  }
  P.needsUpdate = true; winter.flakes.position.copy(camera.position); winter.flakes.material.size = lerp(0.13, 0.2, b);
  // lake holes fade back to black water slowly; drop them once far behind
  for (let i = winter.holes.length - 1; i >= 0; i--) { const h = winter.holes[i]; h.t += dt; if (h.t > 40) { scene.remove(h.m); winter.holes.splice(i, 1); } }
}
function clearLevel3() {
  for (const h of winter.holes) scene.remove(h.m); winter.holes.length = 0;
  for (const l of winter.ledges) scene.remove(l); winter.ledges.length = 0;
  winter.bliz = 0; winter.blizMax = 0; icicleHinted = false; crackHinted = false;
}
// icicles hanging from a rock ledge — shoot them to drop them on whoever is underneath
let icicleHinted = false;
const ledgeMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const icicleMat = new THREE.MeshStandardMaterial({ color: 0xcdeeff, roughness: 0.08, metalness: 0.1, emissive: 0x3a86c0, emissiveIntensity: 0.45, transparent: true, opacity: 0.88 });
function iceLedge(p, H = 9) {
  // the ledge: a snow-topped slab on a rock pillar, part of the scenery
  const ledge = new THREE.Group(); ledge.position.copy(p);
  const slab = new THREE.IcosahedronGeometry(1, 1).toNonIndexed(); slab.scale(4.2, 1.1, 3); slab.computeVertexNormals();
  const sc = new Float32Array(slab.attributes.position.count * 3); for (let i = 0; i < sc.length / 3; i++) (slab.attributes.normal.getY(i) > 0.1 ? C(0xf0f5fa) : C(0x7d8591)).toArray(sc, i * 3);
  slab.setAttribute('color', new THREE.BufferAttribute(sc, 3)); slab.deleteAttribute('uv');
  const s1 = new THREE.Mesh(slab, ledgeMat); s1.position.set(0, H + 0.6, 0); ledge.add(s1);
  const pil = new THREE.CylinderGeometry(1.4, 2.6, H + 2, 7, 3).toNonIndexed(); { const pp = pil.attributes.position; for (let i = 0; i < pp.count; i++) { const k = 1 + (fbm(pp.getX(i) * 2 + 3, pp.getY(i) * 0.7 + pp.getZ(i)) - 0.5) * 0.6; pp.setX(i, pp.getX(i) * k); pp.setZ(i, pp.getZ(i) * k); } pil.computeVertexNormals(); } const pc = new Float32Array(pil.attributes.position.count * 3); for (let i = 0; i < pc.length / 3; i++) (pil.attributes.normal.getY(i) > 0.35 ? C(0xeef3f8) : C(0x737b86)).toArray(pc, i * 3);
  pil.setAttribute('color', new THREE.BufferAttribute(pc, 3)); pil.deleteAttribute('uv');
  const s2 = new THREE.Mesh(pil, ledgeMat); s2.position.set(-3.4, (H + 2) / 2 - 1, -1.2); ledge.add(s2); const drift = new THREE.Mesh(new THREE.SphereGeometry(3.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 1), new THREE.MeshLambertMaterial({ color: 0xf2f6fb })); drift.position.set(-3.4, -0.2, -1.2); ledge.add(drift);
  scene.add(ledge); winter.ledges.push(ledge);
  // the icicle cluster is the target
  const g = new THREE.Group(); g.position.copy(p).add(V(0.6, H, 0));
  for (let k = 0; k < 7; k++) { const len = rand(1.4, 3.2), c = new THREE.Mesh(new THREE.ConeGeometry(rand(0.22, 0.42), len, 6), icicleMat); c.rotation.x = Math.PI; c.position.set(rand(-2.2, 2.2), -len / 2, rand(-1.2, 1.2)); g.add(c); }
  const e = new Enemy('icicle', g, 2, [{ o: V(0, -1.3, 0), r: 2.3 }], 75);
  e.mats = []; e.fallV = 0;
  e.update = function (dt) {
    if (this.alive) {
      if (Math.random() < 0.08) fx.spawn(_v1.copy(this.pos).add(V(rand(-2, 2), rand(-2.5, 0), rand(-1, 1))), V(), 0.25, 0.9, 0.1, COL.white, 0.9);
      if (!icicleHinted && this.pos.distanceTo(vehicle.position) < 75) { icicleHinted = true; say('SHOOT THE ICICLES!', 2.2); }
      return;
    }
    this.fallV += 22 * dt; this.pos.y -= this.fallV * dt;
    const gy = groundH(this.pos.x, this.pos.z);
    if (this.pos.y - 2 <= gy) { const at = V(this.pos.x, gy + 0.5, this.pos.z); iceShatter(at, 1.6); sfx.impact(at.distanceTo(vehicle.position)); shake = Math.max(shake, 0.3); this.remove(); crushBelow(at, 6.5); }
  };
  e.damage = function (n, idx, at) { if (!this.alive) return; this.hp -= n; burst(at, 4, 5, 0.25, 0.4, 0.1, COL.ice, 1, 3); sfx.cellHit(); if (this.hp <= 0) { this.alive = false; award(this, at, 0); sfx.boltZip(); } };
  e.die = () => {};
  return e;
}
function crushBelow(at, R) {
  let n = 0;
  for (const e of enemies) {
    if (!e.alive || e === G.boss || e.kind === 'icicle' || e.kind === 'crack' || e.kind === 'cell' || e.kind === 'crate') continue;
    if (_v1.copy(e.pos).sub(at).setY(0).length() > R) continue;
    if (e.shieldHp !== undefined) e.shieldHp = 0; e.damage(999, 0, e.pos.clone()); n++;
  }
  if (G.boss && G.boss.alive && G.boss.kind === 'engine' && G.boss.pos.distanceTo(at) < R + 6) G.boss.damage(60, 0, at);
  if (n >= 2) { G.score += 150 * n; popups.push({ p: at.clone().add(V(0, 3, 0)), t: 0, text: `ICE CRUSH x${n} +${150 * n}`, col: '#cfefff' }); }
}
function iceTrap(sOff, side, n = 3) {
  const p = groundPoint(G.s + sOff, side); iceLedge(p);
  for (let i = 0; i < n; i++) crawler(groundPoint(G.s + sOff + rand(-2.5, 2.5), side + rand(-2.5, 2.5)));
}
// cracks in the lake ice: shoot one (or wait) and it breaks open, dunking anything nearby
let crackHinted = false;
const crackTex = canvasTex(256, (g, sz) => {
  g.clearRect(0, 0, sz, sz); g.strokeStyle = 'rgba(20,60,90,.9)'; g.lineCap = 'round';
  const c = sz / 2;
  for (let k = 0; k < 9; k++) { let x = c, y = c, a = k / 9 * Math.PI * 2 + rand(-0.2, 0.2); g.lineWidth = 4; g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 6; j++) { a += rand(-0.5, 0.5); x += Math.cos(a) * rand(10, 22); y += Math.sin(a) * rand(10, 22); g.lineTo(x, y); g.lineWidth = Math.max(1, 4 - j * 0.6); } g.stroke(); }
});
crackTex.wrapS = crackTex.wrapT = THREE.ClampToEdgeWrapping;
const holeGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
function crack(p) {
  const g = new THREE.Group(); g.position.copy(p);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, opacity: 0.2 }));
  m.position.y = 0.08; m.scale.setScalar(2); m.rotation.y = rand(0, 6); g.add(m);
  const glint = new THREE.Mesh(holeGeo, new THREE.MeshBasicMaterial({ color: 0x9fe4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); glint.position.y = 0.1; g.add(glint);
  const e = new Enemy('crack', g, 1, [{ o: V(0, 0.4, 0), r: 2.6 }], 100);
  e.mats = []; e.life = rand(5, 7); e.grow = m; e.glint = glint;
  e.update = function (dt) {
    if (!this.alive) return;
    this.t += dt; const f = clamp(this.t / this.life, 0, 1);
    this.grow.scale.setScalar(2 + f * 9); this.grow.material.opacity = 0.25 + f * 0.75;
    this.glint.scale.setScalar(1.5 + f * 3); this.glint.material.opacity = 0.18 + 0.12 * Math.sin(this.t * 9);
    if (!crackHinted && this.pos.distanceTo(vehicle.position) < 70) { crackHinted = true; say('SHOOT THE CRACKS UNDER THEM!', 2.4); }
    if (f >= 1) this.breakOpen(false);
  };
  e.breakOpen = function (shot) {
    if (!this.alive) return; this.alive = false;
    const at = this.pos.clone(), R = 3 + clamp(this.t / this.life, 0, 1) * 4;
    const hole = new THREE.Mesh(holeGeo, new THREE.MeshLambertMaterial({ color: 0x0c2a3c })); hole.position.copy(at).add(V(0, 0.07, 0)); hole.scale.setScalar(R * 0.75); scene.add(hole); winter.holes.push({ m: hole, t: 0 });
    burst(at.clone().add(V(0, 0.5, 0)), 40, 10, 0.9, 0.6, 0.2, COL.ice, 1, 1, 16); burst(at, 18, 6, 1.2, 1, 3, C(0x9cc8e0), 0.7, 1.4, 8, smoke);
    sfx.boom(0.6); this.remove();
    let n = 0;
    for (const o of enemies) {
      if (!o.alive || o === this || o.kind === 'crack' || o.kind === 'icicle' || o.kind === 'engine' || o.kind === 'crate') continue;
      if (_v1.copy(o.pos).sub(at).setY(0).length() > R + 1.5) continue;
      if (o.shieldHp !== undefined) o.shieldHp = 0; o.damage(999, 0, o.pos.clone()); n++;
    }
    if (n) { const pts = 300 * n; G.score += pts; popups.push({ p: at.clone().add(V(0, 3, 0)), t: 0, text: `THROUGH THE ICE +${pts}`, col: '#9fe4ff' }); }
    if (shot) award(this, at, 0);
  };
  e.damage = function (n, idx, at) { if (this.alive) this.breakOpen(true); };
  e.die = () => {};
  return e;
}
function lakeCracks(n, near = 45, far = 95) {
  for (let i = 0; i < n; i++) { const side = (Math.random() < 0.5 ? -1 : 1) * rand(7, 26); const p = groundPoint(G.s + rand(near, far), side); p.y = LAKE_Y + 0.05; crack(p); }
}
// ---- the Avalanche Engine: an original boss, a huge mining crawler that drills through the pass
function engineModel() {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xd59a1c, metalness: 0.35, roughness: 0.55 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3b4048, metalness: 0.6, roughness: 0.45 });
  const frost = new THREE.MeshStandardMaterial({ color: 0xf2f7fb, roughness: 0.8 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x40180a, emissive: 0xff7a20, emissiveIntensity: 0.25, roughness: 0.4 });
  const win = new THREE.MeshStandardMaterial({ color: 0x0b1420, emissive: 0x7fd0ff, emissiveIntensity: 0.6 });
  const box = (w, h, d, m, x, y, z, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.x = rx; g.add(b); return b; };
  for (const sx of [-1, 1]) {   // treads with cleats
    box(3.2, 3, 17, steel, sx * 6, 1.5, 0);
    for (let k = 0; k < 14; k++) box(3.4, 0.35, 0.5, steel, sx * 6, 3.1, -7.8 + k * 1.2);
    box(3.4, 0.6, 17.4, frost, sx * 6, 3.25, 0);
  }
  box(9.5, 4.6, 13, paint, 0, 5.2, -0.5);                 // hull
  box(9.6, 0.5, 13.1, frost, 0, 7.6, -0.5);               // snow on the deck
  box(8.5, 3.4, 3, paint, 0, 4.8, 6.6, -0.45);            // sloped nose
  box(4.4, 3.2, 4, paint, 0, 9.3, -4.6);                  // cab
  box(4.5, 0.9, 0.2, win, 0, 9.8, -2.55);                 // cab windows
  box(4.6, 0.4, 4.1, frost, 0, 11, -4.6);
  for (const sx of [-1, 1]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.75, 5, 10), steel); st.position.set(sx * 3.2, 10, -6.4); g.add(st); }
  // radiators: the weak points, glow when hot
  const rads = [];
  for (const sx of [-1, 1]) { const r = box(0.5, 3, 5, glow, sx * 4.95, 5.4, -2.2); rads.push(r); for (let k = 0; k < 6; k++) box(0.6, 0.18, 5.1, steel, sx * 5.05, 4.2 + k * 0.48, -2.2); }
  // drill: a stack of tapering rings that spins
  const drill = new THREE.Group(); drill.position.set(0, 4.6, 8.4); g.add(drill);
  const dc = new THREE.Mesh(new THREE.ConeGeometry(3.1, 7.5, 12, 1).rotateX(Math.PI / 2).translate(0, 0, 3.75), new THREE.MeshStandardMaterial({ color: 0x8b939d, metalness: 0.8, roughness: 0.3, flatShading: true }));
  drill.add(dc);
  for (let k = 0; k < 5; k++) { const rr = 3.0 - k * 0.58, ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.22, 6, 18), steel); ring.position.z = 0.6 + k * 1.35; ring.rotation.z = k * 0.4; drill.add(ring); }
  for (let k = 0; k < 4; k++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 5.5), paint); fin.position.set(Math.cos(k * Math.PI / 2) * 1.6, Math.sin(k * Math.PI / 2) * 1.6, 2.6); fin.rotation.z = k * Math.PI / 2; fin.rotation.y = 0.25; drill.add(fin); }
  // boulder arm on the deck
  const arm = new THREE.Group(); arm.position.set(0, 8, 1.5); g.add(arm);
  const a1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 7.5).translate(0, 0, -3.5), paint); arm.add(a1);
  const bucket = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 2.4), steel); bucket.position.set(0, 0.5, -7.2); arm.add(bucket);
  const held = new THREE.Mesh(boulderGeo, boulderMat); held.position.set(0, 1.6, -7.2); held.scale.setScalar(1.1); arm.add(held);
  g.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return { g, drill, arm, held, rads, glow };
}
function engine(p) {
  const parts = engineModel(); const g = new THREE.Group(); g.add(parts.g); g.position.copy(p);
  const e = new Enemy('engine', g, 460, [
    { o: V(0, 5.2, -0.5), r: 5.2 }, { o: V(0, 9.3, -4.6), r: 2.6 }, { o: V(0, 4.6, 11), r: 3 },
    { o: V(6, 1.6, 0), r: 2.8 }, { o: V(-6, 1.6, 0), r: 2.8 },
    { o: V(5.2, 5.4, -2.2), r: 1.9, m: 3 }, { o: V(-5.2, 5.4, -2.2), r: 1.9, m: 3 }], 5000);
  Object.assign(e, parts); e.mats = [];   // keep the paint from flashing white; the radiators carry the feedback
  const bw = creature('brute');   // "Monsters 02" by LostBoyz2078 (CC BY 4.0): a frost brute instead of the machine
  if (bw) {
    parts.g.visible = false; g.add(bw); e.bw = bw.userData; e.bw.play('.'); g.lookAt(vehicle.position.x, p.y, vehicle.position.z); g.updateMatrixWorld(true);
    parts.glow.color.set(0x0a2a3a); parts.glow.emissive.set(0x6fe8ff);
    const chest = e.bw.bone('Spine_03'), head = e.bw.bone('Head'); e.chestB = chest; e.headB = head;
    e.rads = [-1, 1].map(sx => pinTo(g, chest, new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 0).scale(0.8, 1.5, 0.8), parts.glow), g.localToWorld(V(sx * 2.3, 7.6, 1.9))));
    for (const r of e.rads) r.rotation.z = r.position.x > 0 ? -0.4 : 0.4;
    pinTo(g, head, parts.drill, g.localToWorld(V(0, 9.6, 2.2))); parts.drill.scale.setScalar(0.12); parts.drill.visible = false;
    g.add(parts.arm); parts.arm.position.set(0, 12.4, 1.2); parts.arm.scale.setScalar(0.5); parts.arm.children[0].visible = parts.arm.children[1].visible = false;
    e.hitTest = function (ray) {
      let best = null; const test = (p, r, idx) => { _v2.copy(p).sub(ray.origin); const t = _v2.dot(ray.direction); if (t < 0) return; const d2 = _v2.lengthSq() - t * t; if (d2 > r * r) return; const d = t - Math.sqrt(r * r - d2); if (!best || d < best[0]) best = [d, idx]; };
      this.rads.forEach((r, i) => test(r.getWorldPosition(_v1), 1.5, 5 + i));
      if (this.headB) test(this.headB.getWorldPosition(_v1), 1.6, 1);
      test(this.chestB ? this.chestB.getWorldPosition(_v1) : this.obj.localToWorld(_v1.set(0, 6, 0)), 3.4, 0);
      test(this.obj.localToWorld(_v1.set(0, 2.5, 0)), 2.6, 2);
      return best;
    };
  }
  e.throwT = 3.5; e.shardT = 2.2; e.hot = 0; e.slide = 0; e.phase2 = false; e.dieT = 0; e.spinV = 3;
  e.damage = function (n, idx, at) {
    if (!this.alive) return;
    const vent = idx === 5 || idx === 6;
    if (vent) n *= this.hot > 0 ? 1 : 0.12; else n *= 0.45;
    n *= this.hits[idx].m || 1;
    this.hp -= n; this.flash = 1; this.hitT = 0.12;
    burst(at, vent && this.hot > 0 ? 6 : 3, 6, 0.25, 0.5, 0.1, vent && this.hot > 0 ? COL.fire : COL.spark, 1, 3);
    if (vent && this.hot > 0 && popups.length < 40 && Math.random() < 0.25) popups.push({ p: at.clone(), t: 0, text: this.bw ? 'CRYSTAL HIT!' : 'RADIATOR HIT!', col: this.bw ? '#9ff0ff' : '#ffb070' });
    if (this.hp <= 0) { this.alive = false; this.die(at, idx); award(this, at, idx); }
  };
  e.update = function (dt) {
    this.t += dt;
    if (!this.alive) {
      this.dieT += dt; this.obj.rotation.z = lerp(this.obj.rotation.z, 0.18, dt * 0.6); this.pos.y -= dt * 0.35;
      this.drill.rotation.z += dt * Math.max(0, 6 - this.dieT * 2);
      if (Math.random() < dt * 7) explosion(_v1.copy(this.pos).add(V(rand(-5, 5), rand(2, 8), rand(-6, 6))), rand(0.6, 1.2));
      if (Math.random() < 0.6) smoke.spawn(_v1.copy(this.pos).add(V(rand(-4, 4), 9, rand(-6, 2))), V(rand(-1, 1), 5, rand(-1, 1)), 2.5, 2, 6, COL.white, 0.5, 0.6, -1);
      if (this.dieT > 2.8 && !this.bigBoom) { this.bigBoom = true; explosion(_v1.copy(this.pos).add(V(0, 5, 0)), 2.6); iceShatter(_v1.copy(this.pos).add(V(0, 6, 0)), 3); scene.attach(this.drill); this.drillV = V(rand(-3, 3), 12, 8); }
      if (this.drillV) { this.drillV.y -= 20 * dt; this.drill.position.addScaledVector(this.drillV, dt); this.drill.rotation.x += dt * 3; }
      if (this.dieT > 5) { if (this.drillV) scene.remove(this.drill); this.remove(); }
      return;
    }
    if (!this.phase2 && this.hp < this.maxHp * 0.5) { this.phase2 = true; say(this.bw ? 'IT\'S ENRAGED!' : 'ENGINE OVERHEATING!', 1.8); if (this.bw) sfx.stinger(); sled(G.s + 70, -11); sled(G.s + 82, 11); blizzard(5); }
    // crawl side to side across the arena, nose to the player
    if (this.slideT === undefined || (this.slideT -= dt) <= 0) { this.slideT = rand(3.5, 5.5); this.slideTo = rand(-11, 11); }
    this.slide = lerp(this.slide, this.slideTo, dt * 0.35);
    const gp = groundPoint(ARENA + 28, this.slide); this.pos.x = gp.x; this.pos.z = gp.z; this.pos.y = gp.y + Math.sin(this.t * 9) * 0.04;
    this.obj.lookAt(vehicle.position.x, this.pos.y, vehicle.position.z);
    this.spinV = lerp(this.spinV, this.phase2 ? 11 : 5, dt); this.drill.rotation.z += this.spinV * dt;
    if (Math.random() < 0.35) smoke.spawn(this.drill.localToWorld(_v1.set(rand(-2, 2), rand(-2, 2), 6)), V(rand(-3, 3), rand(1, 4), rand(-3, 3)), 0.8, 0.8, 2.4, COL.white, 0.6, 1.5, 3);
    if (this.bw) { this.bw.mixer && this.bw.mixer.update(dt * (this.phase2 ? 1.4 : 1)); const lean = this.throwT < 1 ? -0.12 * clamp(1 - this.throwT, 0, 1) : (this.fling || 0) * 0.12; this.obj.children[1].rotation.x = lerp(this.obj.children[1].rotation.x, lean, dt * 8); }
    else for (const sx of [-1, 1]) if (Math.random() < 0.3) smoke.spawn(this.g.localToWorld(_v1.set(sx * 3.2, 12.6, -6.4)), V(rand(-0.5, 0.5), 4, rand(-0.5, 0.5)), 2, 1, 4, COL.smoke, 0.45, 0.8, -1);
    // ice shard spray from the drill
    this.shardT -= dt;
    if (this.shardT <= 0) { this.shardT = this.phase2 ? 1.8 : 2.6; this.sb = this.phase2 ? 7 : 5; sfx.volley(this.pos.distanceTo(vehicle.position)); }
    if (!this.bw) sfx.engineLoops(true, this.pos.distanceTo(vehicle.position), this.phase2 ? 1 : 0);
    if (this.sb > 0) { this.sbt = (this.sbt || 0) - dt; if (this.sbt <= 0) { this.sbt = 0.1; this.sb--; const mz = this.drill.localToWorld(V(rand(-1, 1), rand(-1, 1), 7.6)); this.aimAtPlayer(3.6, 50, COL.ice, 4, 1, mz, this.sb % 2 === 1); } }
    // boulder throw: arm winds back, flings, radiators run hot afterwards
    this.throwT -= dt; this.hot = Math.max(0, this.hot - dt);
    const wind = clamp(1 - this.throwT / 1.0, 0, 1);
    this.arm.rotation.x = lerp(this.arm.rotation.x, this.throwT < 1.0 ? 0.55 * wind : -(this.fling || 0), dt * 8);
    this.fling = Math.max(0, (this.fling || 0) - dt * 1.5);
    this.held.visible = this.throwT < 2.2 || this.fling <= 0.05;
    if (this.throwT <= 0) {
      this.throwT = this.phase2 ? rand(3, 3.8) : rand(4.2, 5); this.fling = 1.1; this.hot = 2.8;
      const from = this.arm.localToWorld(V(0, 1.6, -7.2)); launchMortar(from, this, true);
      if (this.phase2) setTimeout(() => { if (this.alive && G.state === 'play') launchMortar(this.arm.localToWorld(V(0, 1.6, -7.2)), this, true); }, 450);
      this.held.visible = false;
      if (!this.ventHinted) { this.ventHinted = true; setTimeout(() => say(this.bw ? 'SHOOT THE GLOWING CRYSTALS!' : 'HIT THE GLOWING RADIATORS!', 2.2), 900); }
    }
    const heat = this.hot > 0 ? 0.75 + 0.25 * Math.sin(this.t * 16) : 0.12 + wind * 0.4;
    this.glow.emissiveIntensity = heat * 2.2;
    if (this.hot > 0) for (const r of this.rads) if (Math.random() < 0.5) smoke.spawn(r.localToWorld(_v1.set(0, rand(-1, 1), rand(-2, 2))), V(rand(-1, 1), 3, rand(-1, 1)), 1, 0.6, 2.2, COL.white, 0.5, 1, -1);
  };
  e.die = function () { say(this.bw ? 'THE AVALANCHE FALLS!' : 'AVALANCHE ENGINE DOWN!', 3); sfx.boom(1.6); sfx.engineLoops(false); win(); };
  G.boss = e;
  return e;
}
// ---- Frost machines: level 3's own enemy roster (original designs, built from primitives)
const FROST = {
  armor: new THREE.MeshStandardMaterial({ color: 0xe3ebf3, metalness: 0.3, roughness: 0.45 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2c3440, metalness: 0.6, roughness: 0.4 }),
  core: new THREE.MeshStandardMaterial({ color: 0x0a2030, emissive: 0x4fd8ff, emissiveIntensity: 1.6 }),
};
// community models for the frost machines (CC BY, see credits): sized, centred and grounded; returns null if missing
const FROST_FIT = { beetle: { size: 6.5, by: 'len', yaw: 0 }, brute: { size: 11, by: 'h', yaw: 0 }, naga: { size: 24, by: 'h', yaw: 0 }, abyss: { size: 80, by: 'h', yaw: 0 }, swampler: { size: 2.3, by: 'h', yaw: 0 }, crawler: { size: 2.8, by: 'len', yaw: 0 }, drone: { size: 4.2, by: 'len', yaw: 0 }, sled: { size: 5.2, by: 'len', yaw: Math.PI / 2 }, fturret: { size: 3.4, by: 'h', yaw: 0 } };
// clips exported on one long timeline (each starting late) are shifted to start at 0
function normClips(name) { const A = M[name + '_anims']; if (!A || A._norm) return A; for (const c of A) { let t0 = Infinity; for (const t of c.tracks) t0 = Math.min(t0, t.times[0]); if (t0 > 0 && t0 < Infinity) { for (const t of c.tracks) t.shift(-t0); c.resetDuration(); } } A._norm = true; return A; }
// creature: a fitted, animated model with a simple play(name) that crossfades
function pinTo(holder, bone, mesh, worldPos) { scene.add(mesh); mesh.position.copy(worldPos); mesh.updateMatrixWorld(); holder.updateMatrixWorld(true); (bone || holder).attach(mesh); return mesh; }
function creature(name) {
  if (!M[name] || CUSTOMIZED.has(name)) return null; normClips(name);
  const w = frostModel(name); if (!w) return null; const u = w.userData; u.cur = null;
  u.find = (k) => { const re = new RegExp(k, 'i'); return Object.keys(u.act).find(n => re.test(n)); };
  u.play = (k, { once = false, fade = 0.25, speed = 1 } = {}) => { const n = u.find(k); if (!n) return 0; const a = u.act[n]; if (u.cur === a && !once) return a.getClip().duration;
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.timeScale = speed; a.enabled = true;
    if (u.cur && u.cur !== a) a.crossFadeFrom(u.cur, fade, false); a.play(); u.cur = a; return a.getClip().duration / speed; };
  u.bone = (k) => { const re = new RegExp(k, 'i'); let b = null; w.traverse(o => { if (!b && o.isBone && re.test(o.name)) b = o; }); return b; };
  return w;
}
function frostModel(name) {
  if (!M[name] || CUSTOMIZED.has(name)) return null;
  const f = FROST_FIT[name], o = cloneModel(name, !!M[name + '_anims'] && M[name + '_anims'].length > 0 && (() => { let sk = false; M[name].traverse(c => { if (c.isSkinnedMesh) sk = true; }); return sk; })());
  const inner = new THREE.Group(); inner.add(o); inner.rotation.y = f.yaw; inner.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(inner, true), sz = b.getSize(V()), c = b.getCenter(V());
  const k = f.size / (f.by === 'h' ? sz.y : Math.max(sz.x, sz.z));
  const wrap = new THREE.Group(); inner.position.set(-c.x, -b.min.y, -c.z); const sc = new THREE.Group(); sc.scale.setScalar(k); sc.add(inner); wrap.add(sc);
  const anims = M[name + '_anims'] || []; let mixer = null, act = {};
  if (anims.length) { mixer = new THREE.AnimationMixer(o); for (const a of anims) act[a.name] = mixer.clipAction(a); }
  wrap.userData = { mats: o.userData.mats || [], mixer, act, H: sz.y * k };
  return wrap;
}
function frostMats(g) { const mats = []; g.traverse(o => { if (o.isMesh && o.material !== FROST.core) { o.material = o.material.clone(); mats.push(o.material); } }); return mats; }
function frostDeath(e, size = 1) { explosion(_v1.copy(e.pos).add(V(0, 0.8 * size, 0)), 0.55 * size); iceShatter(_v1.copy(e.pos).add(V(0, 0.8 * size, 0)), 0.7 * size); }
// crawler: a six-legged ground walker with a glowing eye — the infantry
function crawler(p) {
  const g = new THREE.Group(); g.position.copy(p);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 8).scale(1, 0.6, 1.3), FROST.armor); body.position.y = 1.1; g.add(body);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.25, 1.4), FROST.dark); back.position.y = 1.55; g.add(back);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), FROST.core); eye.position.set(0, 1.2, 1.05); g.add(eye);
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.9, 6).rotateX(Math.PI / 2), FROST.dark); gun.position.set(0, 1.7, 0.5); g.add(gun);
  const legs = [];
  for (let k = 0; k < 6; k++) {
    const side = k < 3 ? 1 : -1, z = (k % 3 - 1) * 0.6, hip = new THREE.Group(); hip.position.set(side * 0.6, 1.1, z); g.add(hip);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.12).translate(0.45, 0, 0), FROST.dark); upper.rotation.z = side * 0.6; if (side < 0) upper.rotation.y = Math.PI; hip.add(upper);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1).translate(0, -0.55, 0), FROST.armor); foot.position.set(side * 0.75, 0.55, 0); hip.add(foot);
    legs.push({ hip, ph: k * 1.05 + (side > 0 ? 0 : Math.PI) });
  }
  const fm = frostModel('crawler');
  if (fm) { g.clear(); g.add(fm); if (fm.userData.act.Walk) fm.userData.act.Walk.play(); }
  const e = new Enemy('crawler', g, 3, [{ o: V(0, 1.15, 0), r: 1.0 }, { o: V(0, 1.2, 1.05), r: 0.35, m: 2 }], 100);
  e.mats = fm ? fm.userData.mats : frostMats(g); e.legs = fm ? [] : legs; e.mixer = fm && fm.userData.mixer; e.home = p.clone(); e.wander = V(rand(-3, 3), 0, rand(-3, 3)); e.cool = rand(1.2, 2.6);
  e.update = function (dt) {
    if (!this.alive) { this.deadT += dt; this.obj.rotation.x = Math.min(Math.PI, this.obj.rotation.x + dt * 6); if (this.deadT > 0.8) this.remove(); return; }
    this.t += dt; const step = this.t * 9; if (this.mixer) this.mixer.update(dt);
    for (const l of this.legs) l.hip.rotation.x = Math.sin(step + l.ph) * 0.35;
    const tgt = _v1.copy(this.home).add(this.wander); tgt.x += Math.sin(this.t * 0.7) * 2; const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z;
    this.pos.x += clamp(dx, -2, 2) * dt; this.pos.z += clamp(dz, -2, 2) * dt; this.pos.y = groundH(this.pos.x, this.pos.z) + Math.abs(Math.sin(step)) * 0.06;
    this.obj.lookAt(vehicle.position.x, this.pos.y, vehicle.position.z);
    const d = this.pos.distanceTo(vehicle.position); this.cool -= dt;
    if (this.cool <= 0 && d < 85) { this.cool = rand(1.6, 2.8); this.aimAtPlayer(2.6, 40, COL.ice, 4, 0.9, this.obj.localToWorld(V(0, 1.7, 1))); }
  };
  e.die = function () { frostDeath(this, 0.8); sfx.boom(0.4); };
  return e;
}
function crawlers(sOff, side, n, spread = 6) { for (let i = 0; i < n; i++) crawler(groundPoint(G.s + sOff + rand(-spread, spread), side + rand(-spread, spread) * 0.8)); }
// drone: a hovering orb with a spinning rotor ring — the air units
function drone(s, side, h) {
  const g = new THREE.Group();
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10), FROST.armor); g.add(orb);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.12, 6, 20).rotateX(Math.PI / 2), FROST.dark); g.add(band);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), FROST.core); eye.position.z = 0.8; g.add(eye);
  const rotor = new THREE.Group(); g.add(rotor);
  for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 0.3), FROST.dark); b.rotation.y = k * Math.PI / 3; b.position.y = 1.05; rotor.add(b); }
  const p = groundPoint(s, side); p.y += h; g.position.copy(p);
  const fm = frostModel('drone');
  if (fm) { g.clear(); fm.position.y = -fm.userData.H * 0.5; g.add(fm); const a = Object.values(fm.userData.act)[0]; if (a) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; a.play(); } }
  const e = new Enemy('drone', g, 4, [{ o: V(0, 0, 0), r: 1.5 }], 150);
  e.mats = fm ? fm.userData.mats : frostMats(g); e.rotor = rotor; e.mixer = fm && fm.userData.mixer; e.base = p.clone(); e.side = side; e.h = h; e.cool = rand(1.5, 3); e.vy = 0;
  e.update = function (dt) {
    this.t += dt;
    if (!this.alive) { this.vy -= 18 * dt; this.pos.y += this.vy * dt; this.obj.rotation.z += dt * 5; const gy = groundH(this.pos.x, this.pos.z); if (this.pos.y < gy + 0.5) { frostDeath(this, 1); sfx.boom(0.5); this.remove(); } return; }
    this.rotor.rotation.y += dt * 25; if (this.mixer) this.mixer.update(dt);
    this.pos.x = this.base.x + Math.sin(this.t * 0.9 + this.h) * 6; this.pos.z = this.base.z + Math.cos(this.t * 0.6) * 3; this.pos.y = this.base.y + Math.sin(this.t * 2) * 0.6;
    if (this.mixer) { this.obj.lookAt(camera.position.x, this.pos.y, camera.position.z); this.obj.rotateZ(Math.sin(this.t * 0.9 + this.h) * 0.15); } else this.obj.lookAt(camera.position);
    this.cool -= dt; const d = this.pos.distanceTo(vehicle.position);
    if (this.cool <= 0 && d < 110) { this.cool = rand(1.8, 3); this.burst = 3; }
    if (this.burst > 0) { this.bt = (this.bt || 0) - dt; if (this.bt <= 0) { this.bt = 0.14; this.burst--; this.aimAtPlayer(3, 48, COL.ice, 4, 0.9, this.obj.localToWorld(V(0, 0, 1)), this.burst > 0); } }
    // drones keep pace a little ahead of the Warthog until shot
    const rel = this.base.clone().sub(vehicle.position).dot(vehicleFwd); if (rel < 35) this.base.addScaledVector(vehicleFwd, G.speed * dt);
  };
  e.die = function () { sfx.boom(0.35); };
  return e;
}
// sled: an armored hover sled that rushes in and strafes — the fast attack vehicle
function sled(s, side) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 4.4), FROST.armor); hull.position.y = 0.9; g.add(hull);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 1.8), FROST.armor); nose.position.set(0, 0.75, 2.7); nose.rotation.x = 0.35; g.add(nose);
  for (const sx of [-1, 1]) { const ski = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 5.4), FROST.dark); ski.position.set(sx * 1.4, 0.25, 0.2); g.add(ski); }
  const glowUnder = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 3.4), FROST.core); glowUnder.position.y = 0.42; g.add(glowUnder);
  const pod = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8).scale(1, 0.7, 1.2), FROST.dark); pod.position.set(0, 1.6, -0.4); g.add(pod);
  const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.6, 8).rotateX(Math.PI / 2), FROST.dark); cannon.position.set(0, 1.5, 1.2); g.add(cannon);
  const fm = frostModel('sled'); if (fm) { g.clear(); fm.position.y = 0.35; g.add(fm); }
  const e = new Enemy('sled', g, 14, [{ o: V(0, 1, 0), r: 2.2 }, { o: V(0, 1.6, -0.4), r: 0.8, m: 2 }], 400);
  e.mats = fm ? fm.userData.mats : frostMats(g); e.rel = s - G.s; e.side = side; e.tside = side; e.cool = rand(1.5, 2.5);
  e.update = function (dt) {
    this.t += dt;
    if (!this.alive) { this.deadT += dt; this.pos.y -= dt * 1.2; this.obj.rotation.z += dt * 2; if (Math.random() < 0.4) smoke.spawn(this.pos, V(0, 3, 0), 1.2, 1, 3, COL.smoke, 0.5, 1, -1); if (this.deadT > 1.2) this.remove(); return; }
    this.rel = lerp(this.rel, 26 + Math.sin(this.t * 0.5) * 6, dt * 0.6);
    if ((this.st = (this.st || 0) - dt) <= 0) { this.st = rand(2, 3.5); this.tside = rand(-14, 14); }
    this.side = lerp(this.side, this.tside, dt * 0.8);
    const gp = groundPoint(G.s + this.rel, this.side); this.pos.set(gp.x, gp.y + 0.7 + Math.sin(this.t * 3) * 0.12, gp.z);
    this.obj.lookAt(vehicle.position.x, this.pos.y, vehicle.position.z); this.obj.rotateZ(clamp((this.side - this.tside) * 0.03, -0.25, 0.25));
    if (Math.random() < 0.5) smoke.spawn(_v1.copy(this.pos).add(V(rand(-1, 1), 0, rand(-1, 1))), V(rand(-2, 2), 1, rand(-2, 2)), 0.7, 0.8, 2, COL.white, 0.45, 1.5);
    this.cool -= dt;
    if (this.cool <= 0) { this.cool = rand(1.8, 2.6); this.burst = 4; }
    if (this.burst > 0) { this.bt = (this.bt || 0) - dt; if (this.bt <= 0) { this.bt = 0.12; this.burst--; this.aimAtPlayer(2.8, 55, COL.ice, 5, 1, this.obj.localToWorld(V(0, 1.5, 2.1)), this.burst > 0); } }
  };
  e.die = function () { frostDeath(this, 1.6); sfx.boom(0.9); shake = Math.max(shake, 0.25); };
  return e;
}
// frost turret: a stationary dome emplacement on a tripod
function fturret(p) {
  const g = new THREE.Group(); g.position.copy(p);
  for (let k = 0; k < 3; k++) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.6, 6), FROST.dark); const a = k * Math.PI * 2 / 3; leg.position.set(Math.cos(a) * 0.9, 1.1, Math.sin(a) * 0.9); leg.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); g.add(leg); }
  const head = new THREE.Group(); head.position.y = 2.5; g.add(head);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), FROST.armor); head.add(dome);
  const ringM = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.3, 16), FROST.dark); head.add(ringM);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), FROST.core); core.position.set(0, 0.5, 1.0); head.add(core);
  for (const sx of [-0.35, 0.35]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.8, 6).rotateX(Math.PI / 2), FROST.dark); b.position.set(sx, 0.45, 1.5); head.add(b); }
  const fm = frostModel('fturret');
  if (fm) { g.clear(); g.add(fm); const a = fm.userData.act.IDLE; if (a) a.play(); }
  const e = new Enemy('fturret', g, 10, [{ o: V(0, 2.4, 0), r: 1.6 }, { o: V(0, 2.8, 1), r: 0.5, m: 2.5 }], 300);
  e.mats = fm ? fm.userData.mats : frostMats(g); e.head = fm ? null : head; e.fm = fm; e.mixer = fm && fm.userData.mixer; e.cool = rand(1, 2);
  e.update = function (dt) {
    if (!this.alive) { this.deadT += dt; const hd = this.head || this.obj; if (this.head) { hd.position.y += dt * 4; hd.rotation.x += dt * 4; } else { this.obj.rotation.x += dt * 1.5; this.pos.y -= dt * 2; } if (this.deadT > 0.7) this.remove(); return; }
    this.t += dt; if (this.mixer) this.mixer.update(dt);
    if (this.head) { _v1.copy(camera.position); this.obj.worldToLocal(_v1); this.head.rotation.y = lerp(this.head.rotation.y, Math.atan2(_v1.x, _v1.z), dt * 3); }
    else this.obj.rotation.y = lerp(this.obj.rotation.y, Math.atan2(camera.position.x - this.pos.x, camera.position.z - this.pos.z), dt * 2);
    this.cool -= dt; const d = this.pos.distanceTo(vehicle.position);
    if (this.cool <= 0 && d < 120) { this.cool = rand(2, 2.8); this.burst = 6; const fa = this.fm && this.fm.userData.act.Action; if (fa) { fa.reset(); fa.setLoop(THREE.LoopOnce); fa.play(); } }
    if (this.burst > 0) { this.bt = (this.bt || 0) - dt; if (this.bt <= 0) { this.bt = 0.1; this.burst--; this.aimAtPlayer(3.2, 58, COL.ice, 4, 1, this.head ? this.head.localToWorld(V(this.burst % 2 ? 0.35 : -0.35, 0.45, 2.4)) : this.obj.localToWorld(V(this.burst % 2 ? 0.3 : -0.3, 2.6, 1.8)), this.burst > 0); } }
  };
  e.die = function () { frostDeath(this, 1.3); sfx.boom(0.8); };
  return e;
}
function level3Script(gS, A) {
  const lake = (f) => LV.lake[0] * 1000 + f * (LV.lake[1] - LV.lake[0]) * 1000;
  return [
    { s: 25, f: () => say('LEVEL 3 · FROZEN PASS') },
    { s: 45, f: () => { iceTrap(80, -9, 4); crawlers(85, 12, 2); } },
    { s: 100, f: () => { crawlers(75, 9, 3); cells(78, -10, 1); iceTrap(95, 11, 3); } },
    { s: 160, f: () => { say('SLEDS!'); sled(G.s + 110, -10); sled(G.s + 125, 10); } },
    { s: 215, f: () => { blizzard(7); crawlers(70, -12, 4); crawlers(80, 13, 3); } },
    { s: 275, f: () => { say('DRONES INBOUND'); drone(G.s + 90, -14, 9); drone(G.s + 100, 0, 12); drone(G.s + 110, 14, 10); } },
    { s: 330, f: () => { iceTrap(85, -10, 4); iceTrap(100, 10, 3); fturret(groundPoint(G.s + 110, -20)); } },
    { s: 395, f: () => { fturret(groundPoint(G.s + 105, 22)); cells(100, 16, 2); crawlers(85, -9, 4); } },
    { s: 450, f: () => { blizzard(6); sled(G.s + 110, -8); crawlers(80, 8, 3); } },
    { s: lake(0.02), f: () => { say('FROZEN LAKE!', 2); sled(G.s + 95, -14); sled(G.s + 105, 14); lakeCracks(3); } },
    { s: lake(0.3), f: () => { sled(G.s + 100, -12); sled(G.s + 110, 0); sled(G.s + 120, 12); lakeCracks(4); } },
    { s: lake(0.6), f: () => { crawlers(80, -15, 4); crawlers(85, 15, 3); lakeCracks(4, 40, 90); } },
    { s: lake(0.85), f: () => { sled(G.s + 100, -10); sled(G.s + 115, 10); lakeCracks(3); } },
    { s: 670, f: () => { blizzard(7); drone(G.s + 90, -12, 10); drone(G.s + 105, 12, 9); crawlers(75, 0, 4, 10); } },
    { s: 730, f: () => { iceTrap(80, -10, 4); iceTrap(95, 10, 4); cells(90, 0, 1); } },
    { s: 790, f: () => { fturret(groundPoint(G.s + 100, 20)); sled(G.s + 120, -10); crawlers(80, -8, 3); } },
    { s: 850, f: () => { blizzard(5); drone(G.s + 90, 0, 11); crawlers(70, -10, 3); crawlers(85, 10, 3); cells(78, 0, 2); } },
    { s: 905, f: () => { fturret(groundPoint(G.s + 100, -22)); iceTrap(85, 11, 4); } },
    { s: 960, f: () => { say('THE AVALANCHE'); music.play('boss'); engine(groundPoint(ARENA + 28, 0)); cells(ARENA - G.s + 16, -11, 1); cells(ARENA - G.s + 20, 12, 1); iceLedge(groundPoint(ARENA + 18, -16)); iceLedge(groundPoint(ARENA + 18, 16)); } },
  ].map(ev => ({ s: ev.s * A, f: ev.f }));
}
// ---------------------------------------------------------------- spawn script (by distance along the track)
const L = TRACK_LEN;
const ARENA = L - 70;
function script() {
  const gS = (sOff, side, n, spread = 7) => { for (let i = 0; i < n; i++) grunt(groundPoint(G.s + sOff + rand(-spread, spread), side + rand(-spread, spread) * 0.8)); };
  const A = ARENA / 1000; // encounters are laid out on a 0..1000 scale, stretched to the track
  let list = [
    { s: 25, f: () => say('LEVEL 1 · HANG ON, GUNNER!') },
    { s: 45, f: () => { gS(75, -16, 4); cells(78, -12, 1); } },
    { s: 95, f: () => { gS(70, 18, 5); cells(72, 15, 2); } },
    { s: 145, f: () => { shade(groundPoint(G.s + 95, -22)); cells(93, -17, 1); gS(80, -14, 3); } },
    { s: 200, f: () => { say('GHOSTS!'); ghost(G.s + 110, -10); ghost(G.s + 125, 12); } },
    { s: 260, f: () => { watchtower(groundPoint(G.s + 110, 26)); cells(106, 19, 2); gS(95, 14, 3); } },
    { s: 315, f: () => { say('BANSHEES INBOUND'); banshee(G.s + 200, -40, 34); banshee(G.s + 230, 40, 40); } },
    { s: 375, f: () => { gS(70, -15, 4); cells(74, -11, 1); ghost(G.s + 120, 8); } },
    { s: 430, f: () => { shade(groundPoint(G.s + 100, 22)); shade(groundPoint(G.s + 120, -24)); gS(85, 0, 4, 10); cells(88, 4, 1); } },
    { s: 490, f: () => { gS(65, 15, 4); gS(85, -18, 4); cells(68, 11, 1); cells(88, -14, 2); } },
    { s: 545, f: () => { banshee(G.s + 200, -30, 30); banshee(G.s + 220, 0, 46); banshee(G.s + 240, 30, 36); } },
    { s: 605, f: () => { say('GHOST SQUADRON'); ghost(G.s + 110, -12); ghost(G.s + 120, 0); ghost(G.s + 130, 12); } },
    { s: 665, f: () => { watchtower(groundPoint(G.s + 105, -27)); cells(100, -21, 1); gS(80, 16, 5); cells(83, 12, 1); } },
    { s: 720, f: () => { shade(groundPoint(G.s + 95, 20)); ghost(G.s + 120, -10); gS(75, -14, 4); cells(78, -10, 1); } },
    { s: 780, f: () => { banshee(G.s + 200, -25, 32); banshee(G.s + 230, 25, 40); gS(70, 0, 5, 12); } },
    { s: 840, f: () => { ghost(G.s + 110, -14); ghost(G.s + 125, 14); shade(groundPoint(G.s + 110, -26)); } },
    { s: 900, f: () => { gS(70, -16, 5); gS(80, 16, 5); cells(73, -12, 2); cells(83, 12, 2); } },
    { s: 960, f: () => { say('THORNBACK'); music.play('boss'); elite(groundPoint(ARENA + 24, 0)); cells(ARENA - G.s + 20, -11, 1); cells(ARENA - G.s + 28, 12, 1); } },
  ].map(ev => ({ s: ev.s * A, f: ev.f }));
  if (LEVEL === 2) list = level2Script(gS, A);
  if (LEVEL === 3) list = level3Script(gS, A);
  if (LEVEL === 4) list = level4Script(gS, A);
  if (LEVEL === 5) list = level5Script(gS, A);
  const kinds = ['gauss', 'rockets', 'flame'].sort(() => Math.random() - 0.5);
  [[180, kinds[0]], [420, kinds[1]], [690, kinds[2]], [930, null]].forEach(([at, k], i) => list.push({ s: at * A, f: () => crate(55, i % 2 ? 5 : -5, k) }));
  list.sort((a, b) => a.s - b.s);
  return list;
}
function level2Script(gS, A) {
  const jS = (sOff, side, n, spread = 6) => { for (let i = 0; i < n; i++) jackal(groundPoint(G.s + sOff + rand(-spread, spread), side + rand(-spread, spread) * 0.6)); };
  return [
    { s: 25, f: () => say('INTO THE CANYON') },
    { s: 45, f: () => { jS(75, -10, 2); gS(80, 12, 3); cells(82, 9, 1); } },
    { s: 100, f: () => { say('SHIELDS UP — WAIT FOR THEM TO FIRE'); jS(70, 8, 3); } },
    { s: 155, f: () => { ghost(G.s + 110, -10); ghost(G.s + 125, 10); } },
    { s: 210, f: () => { shade(groundPoint(G.s + 95, -18)); jS(80, -8, 2); gS(85, 10, 3); cells(90, -12, 1); } },
    { s: 265, f: () => { say('BANSHEES INBOUND'); banshee(G.s + 200, -35, 34); banshee(G.s + 230, 35, 40); } },
    { s: 320, f: () => { watchtower(groundPoint(G.s + 105, 22)); cells(100, 16, 2); jS(85, -10, 3); } },
    { s: 380, f: () => { say('GHOST SQUADRON'); ghost(G.s + 110, -12); ghost(G.s + 120, 0); ghost(G.s + 130, 12); } },
    { s: 440, f: () => { jS(70, 0, 4, 9); cells(74, 3, 2); } },
    { s: 500, f: () => { shade(groundPoint(G.s + 100, 18)); shade(groundPoint(G.s + 115, -18)); gS(85, 0, 5, 10); } },
    { s: 560, f: () => { banshee(G.s + 200, -25, 30); banshee(G.s + 230, 25, 40); jS(75, -9, 2); } },
    { s: 620, f: () => { ghost(G.s + 110, -10); ghost(G.s + 125, 10); jS(80, 0, 3, 8); } },
    { s: 680, f: () => { watchtower(groundPoint(G.s + 105, -22)); cells(100, -16, 1); gS(80, 12, 4); cells(83, 9, 1); } },
    { s: 740, f: () => { jS(70, -10, 3); jS(85, 10, 3); cells(78, 0, 1); } },
    { s: 800, f: () => { banshee(G.s + 200, -30, 32); banshee(G.s + 215, 0, 44); banshee(G.s + 240, 30, 36); } },
    { s: 860, f: () => { shade(groundPoint(G.s + 95, -16)); ghost(G.s + 120, 8); jS(80, 6, 3); } },
    { s: 960, f: () => { say('WRAITH'); music.play('boss'); wraith(groundPoint(ARENA + 16, 0)); cells(ARENA - G.s + 18, -10, 1); cells(ARENA - G.s + 22, 11, 1); } },
  ].map(ev => ({ s: ev.s * A, f: ev.f }));
}
let events = [];
function say(t, d = 2) { G.msg = t; G.msgT = d; if (t === LV.boss || /OVERHEATING/.test(t)) sfx.stinger(); }

// ---------------------------------------------------------------- scoring & damage
function award(e, at, idx, noPoints) {
  if (noPoints) return;
  G.kills++; G.combo = G.comboT > 0 ? G.combo + 1 : 1; G.comboT = 2.2;
  const mult = Math.min(5, 1 + Math.floor(G.combo / 3));
  let pts = e.score * mult; const head = e.kind === 'grunt' && idx === 1;
  if (head) pts += 50;
  G.score += pts;
  popups.push({ p: at.clone(), t: 0, text: `+${pts}${head ? ' HEADSHOT' : ''}${mult > 1 ? ' x' + mult : ''}`, col: head ? '#ffd24a' : '#ffffff' });
}
function damagePlayer(n) {
  G.sinceHit = 0; shake = Math.max(shake, 0.25);
  if (G.shield > 0) { const s = Math.min(G.shield, n); G.shield -= s; n -= s; shieldFlash = 1; sfx.shieldHit(); if (G.shield <= 0) sfx.taunt(0.5, G.time); }
  if (n > 0) { G.health -= n; hurtFlash = 1; sfx.hurt(); }
  if (G.health <= 0 && G.state === 'play') { G.health = 0; G.won = false; G.endT = 0; say('GUNNER DOWN', 3); music.play('lose');
    // campaign, levels 2-5: offer a continue (restart this level) with a 10 second countdown
    if (!ADMIN && LEVEL > 1 && (camp ? camp.cont : CONTINUES) > 0) { G.state = 'continue'; G.contT = 10; } else { G.state = 'results'; if (!ADMIN) saveCamp(null); } }
}
function win() { G.won = true; music.play('win'); setTimeout(() => { if (G.state === 'play') { G.state = 'results'; G.endT = 0; } }, 2500); say(LV.boss + ' DOWN!', 3); }

// ---------------------------------------------------------------- firing
const ray = new THREE.Ray(); const raycaster = new THREE.Raycaster();
function aimRay(spread = 0) {
  raycaster.setFromCamera({ x: (input.x * 2 - 1) + rand(-spread, spread), y: -(input.y * 2 - 1) + rand(-spread, spread) }, camera);
  ray.copy(raycaster.ray); return ray;
}
function groundHit(r, maxD = 450) {
  for (let t = 4; t < maxD; t += 3) {
    _v1.copy(r.direction).multiplyScalar(t).add(r.origin);
    if (_v1.y < groundH(_v1.x, _v1.z)) return t - 1.5;
  }
  return null;
}
function trace(r) { // nearest thing along the ray
  let best = { d: 400, e: null, idx: 0, bolt: null };
  for (const e of enemies) { if (!e.alive) continue; const h = e.hitTest(r); if (h && h[0] < best.d) best = { d: h[0], e, idx: h[1] }; }
  for (const b of bolts) { _v2.copy(b.p).sub(r.origin); const t = _v2.dot(r.direction); if (t < 0) continue; if (_v2.lengthSq() - t * t < 1.1 * 1.1 && t < best.d) best = { d: t, e: null, bolt: b }; }
  for (const m of mortars) { _v2.copy(m.p).sub(r.origin); const t = _v2.dot(r.direction); if (t < 0) continue; if (_v2.lengthSq() - t * t < 2.0 * 2.0 && t < best.d) best = { d: t, e: null, mortar: m }; }
  const gh = groundHit(r, best.d); if (gh !== null && gh < best.d) best = { d: gh, e: null, ground: true };
  return best;
}
const muzzleP = V();
function fireRound() {
  G.shots++; G.heat += HEAT_PER_SHOT; shake = Math.max(shake, 0.03);
  const r = aimRay(0.008); const hit = trace(r);
  const end = r.at(hit.d, V());
  tMuzzle.getWorldPosition(muzzleP);
  tracers.push({ a: muzzleP.clone(), b: end, t: 0 });
  fx.spawn(muzzleP, _v1.copy(vehicleFwd).multiplyScalar(4), 0.06, 2.2, 0.6, COL.muzzle, 1);
  lightFlash(muzzleP, 0xffc070, rand(18, 32));
  if (hit.e) { G.hits++; hit.e.damage(1, hit.idx, end); burst(end, 4, 7, 0.25, 0.5, 0.1, hit.e.shieldHp > 0 ? COL.blue : COL.spark, 1, 3); }
  else if (hit.mortar) { G.hits++; hit.mortar.hp--; burst(end, 5, 6, 0.25, 0.6, 0.1, COL.plasmaPink, 1, 3); }
  else if (hit.bolt) { hit.bolt.life = 0; G.score += 50; popups.push({ p: end.clone(), t: 0, text: '+50', col: '#8fd0ff' }); burst(end, 10, 6, 0.3, 1, 0.2, hit.bolt.color, 1, 3); sfx.boltZip(); }
  else if (hit.ground) { burst(end, 3, 3, 0.5, 0.8, 2.2, COL.dust, 0.7, 2, 3, smoke); if (Math.random() < 0.4) burst(end, 3, 5, 0.2, 0.3, 0.1, COL.spark, 1, 2, 10); }
  if (G.heat >= 1) { G.heat = 1; G.overheated = true; sfx.overheat(); say('OVERHEAT', 1); sfx.taunt(0.4, G.time); }
}

// ---------------------------------------------------------------- swappable Warthog turrets (original designs)
const WEAPONS = {
  minigun: { name: 'MINIGUN', col: '#ffd24a' },
  gauss: { name: 'GAUSS CANNON', col: '#5fe8ff', ammo: 9 },
  rockets: { name: 'ROCKET POD', col: '#ff9a3c', ammo: 32 },
  flame: { name: 'FLAMETHROWER', col: '#ff5a2a', ammo: 15 },
};
// procedural textures: painted metal with panel lines, scuffs, rivets and optional hazard stripes or scorching
function panelTex(base, accent, opts = {}) {
  return canvasTex(512, (g, sz) => {
    g.fillStyle = base; g.fillRect(0, 0, sz, sz);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${rand(0.02, 0.06)})`; g.fillRect(rand(0, sz), rand(0, sz), rand(2, 30), rand(1, 3)); }
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 3;
    for (let k = 0; k < 4; k++) { const y = rand(0, sz); g.beginPath(); g.moveTo(0, y); g.lineTo(sz, y); g.stroke(); const x = rand(0, sz); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, sz); g.stroke(); }
    g.fillStyle = 'rgba(20,20,20,.55)'; for (let i = 0; i < 60; i++) { g.beginPath(); g.arc(rand(0, sz), rand(0, sz), 3, 0, 7); g.fill(); }
    if (opts.stripes) { g.save(); g.beginPath(); g.rect(0, sz * 0.78, sz, sz * 0.12); g.clip(); for (let x = -sz; x < sz * 2; x += 46) { g.fillStyle = accent; g.beginPath(); g.moveTo(x, sz * 0.78); g.lineTo(x + 23, sz * 0.78); g.lineTo(x + 23 + sz * 0.12, sz * 0.9); g.lineTo(x + sz * 0.12, sz * 0.9); g.fill(); } g.restore(); }
    if (opts.scorch) for (let i = 0; i < 26; i++) { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 60); gr.addColorStop(0, 'rgba(10,6,4,.5)'); gr.addColorStop(1, 'rgba(10,6,4,0)'); g.save(); g.translate(rand(0, sz), rand(0, sz)); g.fillStyle = gr; g.fillRect(-60, -60, 120, 120); g.restore(); }
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(200,200,200,${rand(0.08, 0.2)})`; g.lineWidth = 1; g.beginPath(); const x = rand(0, sz), y = rand(0, sz); g.moveTo(x, y); g.lineTo(x + rand(-25, 25), y + rand(-6, 6)); g.stroke(); }
  }, 1);
}
function weaponParts() {
  const mat = (map, metal = 0.55, rough = 0.45, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ map, metalness: metal, roughness: rough }, extra));
  const glowM = (c, i = 2) => new THREE.MeshStandardMaterial({ color: 0x101418, emissive: c, emissiveIntensity: i, roughness: 0.3 });
  const steel = mat(panelTex('#3a4049', '#000'), 0.7, 0.35);
  const mount = (name) => { const root = new THREE.Group(); root.name = name; const swivel = new THREE.Group(); swivel.name = 'swivel'; root.add(swivel);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.35, 16), steel); base.position.y = 0.18; swivel.add(base);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.6, 10), steel); ped.position.y = 0.6; swivel.add(ped);
    const body = new THREE.Group(); body.name = 'body'; body.position.y = 0.95; swivel.add(body);
    for (const sx of [-1, 1]) { const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.4), steel); yoke.position.set(sx * 0.5, 0.95, 0); swivel.add(yoke); }
    const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; body.add(muzzle);
    return { root, swivel, body, muzzle }; };
  const add = (parent, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); parent.add(o); return o; };
  const cyl = (r1, r2, h, n = 14) => new THREE.CylinderGeometry(r1, r2, h, n).rotateX(Math.PI / 2);
  // GAUSS: twin rails wrapped in glowing coils, capacitor bank behind
  const G1 = mount('turret_gauss'), gPaint = mat(panelTex('#2a3440', '#5fe8ff'), 0.6, 0.35), coil = glowM(0x3fe0ff, 0.4);
  add(G1.body, new THREE.BoxGeometry(0.8, 0.55, 1.1), gPaint, 0, 0, -0.1);
  add(G1.body, new THREE.BoxGeometry(0.95, 0.38, 0.6), gPaint, 0, 0.05, -0.85);
  for (let k = 0; k < 3; k++) add(G1.body, new THREE.BoxGeometry(0.98, 0.06, 0.08), glowM(0x3fe0ff, 1.2), 0, 0.12 - k * 0.1, -1.16);
  for (const sx of [-1, 1]) add(G1.body, new THREE.BoxGeometry(0.09, 0.22, 2.3), steel, sx * 0.17, 0.05, 1.45);
  const coils = [];
  for (let k = 0; k < 6; k++) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.06, 8, 16), coil.clone()); c.position.set(0, 0.05, 0.6 + k * 0.32); G1.body.add(c); coils.push(c); }
  add(G1.body, new THREE.BoxGeometry(0.5, 0.08, 2.3), steel, 0, 0.27, 1.45);
  add(G1.body, cyl(0.07, 0.07, 0.5, 8), glowM(0x9ff6ff, 1.5), 0, 0.4, -0.2);
  G1.muzzle.position.set(0, 0.05, 2.7); G1.coils = coils;
  // ROCKETS: six-tube pod with armor cheeks and hazard stripes
  const R1 = mount('turret_rockets'), rPaint = mat(panelTex('#4b5534', '#e6b422', { stripes: true }), 0.4, 0.55), tubeIn = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.9 });
  add(R1.body, new THREE.BoxGeometry(1.25, 0.85, 1.5), rPaint, 0, 0.05, 0.2);
  const tubes = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
    const x = (c - 1) * 0.36, y = 0.25 - r * 0.38;
    add(R1.body, cyl(0.15, 0.15, 1.65, 12), steel, x, y, 0.28); add(R1.body, cyl(0.12, 0.12, 0.05, 12), tubeIn, x, y, 1.11);
    const tip = add(R1.body, new THREE.ConeGeometry(0.1, 0.25, 10).rotateX(Math.PI / 2), mat(null, 0.3, 0.5, { color: 0xc8361e }), x, y, 0.98); tubes.push({ x, y, tip });
  }
  for (const sx of [-1, 1]) add(R1.body, new THREE.BoxGeometry(0.1, 1.0, 1.7), rPaint, sx * 0.7, 0.05, 0.2);
  add(R1.body, new THREE.BoxGeometry(0.22, 0.18, 0.45), steel, 0.45, 0.6, -0.1); add(R1.body, cyl(0.06, 0.06, 0.06, 10), glowM(0xff5a2a, 2), 0.45, 0.6, 0.14);
  R1.muzzle.position.set(0, 0.05, 1.15); R1.tubes = tubes;
  // FLAME: finned heat shroud and nozzle, twin brass fuel tanks, hoses, pilot light
  const F1 = mount('turret_flame'), fPaint = mat(panelTex('#5a1c14', '#000', { scorch: true }), 0.45, 0.5), brass = mat(panelTex('#a8822e', '#000'), 0.8, 0.3);
  add(F1.body, new THREE.BoxGeometry(0.75, 0.55, 0.9), fPaint, 0, 0, -0.1);
  add(F1.body, cyl(0.2, 0.26, 1.3, 14), steel, 0, 0.05, 0.85);
  for (let k = 0; k < 7; k++) add(F1.body, cyl(0.31, 0.31, 0.05, 14), steel, 0, 0.05, 0.4 + k * 0.14);
  add(F1.body, cyl(0.13, 0.19, 0.35, 12), fPaint, 0, 0.05, 1.62);
  for (const sx of [-1, 1]) { add(F1.body, new THREE.CapsuleGeometry(0.2, 0.75, 6, 12).rotateX(Math.PI / 2), brass, sx * 0.62, 0.0, -0.15); add(F1.body, new THREE.TorusGeometry(0.22, 0.03, 6, 14, Math.PI), steel, sx * 0.4, 0.15, 0.3, 0, Math.PI / 2, 0); }
  const pilot = add(F1.body, new THREE.SphereGeometry(0.06, 8, 6), glowM(0x4fa8ff, 3), 0, -0.13, 1.8);
  F1.muzzle.position.set(0, 0.05, 1.85); F1.pilot = pilot;
  for (const t of [G1, R1, F1]) t.root.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return { gauss: G1, rockets: R1, flame: F1 };
}
let WPN = null;
function buildWeaponModels() { WPN = weaponParts(); for (const k of ['gauss', 'rockets', 'flame']) M['turret_' + k] = WPN[k].root; }
// mount every turret on the bed; a custom model from the MODELS screen rides on the pitch group whole
function mountWeapons() {
  for (const k of ['gauss', 'rockets', 'flame']) {
    let rig = WPN[k];
    if (CUSTOMIZED.has('turret_' + k)) {
      const cm = M['turret_' + k]; const root = new THREE.Group(), swivel = new THREE.Group(), body = new THREE.Group(); body.position.y = 0.95; root.add(swivel); swivel.add(body);
      cm.position.y -= 0.95; body.add(cm); body.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(cm); const muzzle = new THREE.Object3D(); muzzle.position.set(0, (bb.min.y + bb.max.y) / 2 - 0.95, bb.max.z); body.add(muzzle);
      rig = { root, swivel, body, muzzle, custom: true }; WPN[k] = rig;
    }
    rig.root.position.copy(BED); rig.root.scale.setScalar(0.62); rig.root.visible = false; vBody.add(rig.root);
  }
}
function setWeapon(k) {
  G.weapon = k; const W0 = WEAPONS[k]; if (k !== 'flame') sfx.flame(false);
  if (turret) turret.visible = k === 'minigun';
  for (const w of ['gauss', 'rockets', 'flame']) if (WPN && WPN[w]) WPN[w].root.visible = w === k;
  G.ammo = W0.ammo || 0; G.ammoMax = W0.ammo || 1; G.charge = 0; G.wCool = 0;
  if (k !== 'minigun') { G.overheated = false; G.heat = 0; G.spin = 0; }
}
function activeRig() { return G.weapon && G.weapon !== 'minigun' && WPN ? WPN[G.weapon] : null; }
const rockets = [];
const rocketGeo = new THREE.ConeGeometry(0.11, 0.6, 8).rotateX(Math.PI / 2), rocketMat = new THREE.MeshStandardMaterial({ color: 0xd8d0c0, emissive: 0xff6020, emissiveIntensity: 0.4 });
function fireWeapon(dt) {
  const rig = activeRig(); if (!rig) return;
  const held = input.down && !input.off; G.wCool = Math.max(0, G.wCool - dt);
  rig.muzzle.getWorldPosition(muzzleP);
  if (G.weapon === 'gauss') {
    if (held && G.wCool <= 0) { if (G.charge === 0) sfx.gaussCharge(); G.charge = Math.min(1, G.charge + dt / 0.35); }
    else if (!held) G.charge = Math.max(0, G.charge - dt * 3);
    if (rig.coils) rig.coils.forEach((c, i) => { c.material.emissiveIntensity = 0.3 + (G.charge * 6 > i ? 2.6 : 0) + (G.wCool > 0.3 ? 1.5 : 0); });
    if (G.charge >= 1) {   // one piercing rail shot through everything on the line
      G.charge = 0; G.wCool = 0.45; G.ammo--; G.shots++;
      const r = aimRay(0); const end = V(); const hitList = [];
      for (const e of enemies) { if (!e.alive || e.kind === 'crack') continue; const h = e.hitTest(r); if (h) hitList.push([h[0], e, h[1]]); }
      hitList.sort((a, b) => a[0] - b[0]);
      const gh = groundHit(r, 220); const stop = gh !== null ? gh : 220;
      for (const [d, e, idx] of hitList) { if (d > stop) break; const at = r.at(d, V()); if (e.shieldHp !== undefined && e.shieldHp > 0) { e.shieldHp = 0; e.sflash = 1; } e.damage(75, idx, at); G.hits++; burst(at, 18, 10, 0.4, 0.9, 0.1, COL.cyan, 1, 3); explosion(at, 0.45); }
      for (const m of mortars) { _v2.copy(m.p).sub(r.origin); const t = _v2.dot(r.direction); if (t > 0 && t < stop && _v2.lengthSq() - t * t < 4) m.hp = 0; }
      for (const b of bolts) { _v2.copy(b.p).sub(r.origin); const t = _v2.dot(r.direction); if (t > 0 && t < stop && _v2.lengthSq() - t * t < 2) b.life = 0; }
      r.at(stop, end); railBeam(muzzleP.clone(), end); if (gh !== null) burst(end, 16, 7, 0.5, 1, 2.5, COL.dust, 0.8, 2, 4, smoke);
      lightFlash(muzzleP, 0x7fefff, 1400); shake = Math.max(shake, 0.32); sfx.gaussFire();
    }
  } else if (G.weapon === 'rockets') {
    if (held && G.wCool <= 0) {
      G.wCool = 0.3; G.ammo--; G.shots++;
      const r = aimRay(0); const th = trace(r); const tgt = r.at(Math.min(th.d, 200), V());
      const tube = rig.tubes ? rig.tubes[G.ammo % 6] : null; const from = tube ? rig.body.localToWorld(V(tube.x, tube.y, 1.15)) : muzzleP.clone();
      const m = new THREE.Mesh(rocketGeo, rocketMat); m.position.copy(from); scene.add(m);
      const v = tgt.sub(from).normalize().multiplyScalar(100);
      rockets.push({ p: from, v, m, t: 0, lock: th.e || null, lockIdx: th.idx || 0, aim: r.at(Math.min(th.d, 200), V()) }); if (tube) { tube.tip.visible = false; setTimeout(() => { tube.tip.visible = true; }, 550); }
      fx.spawn(from, _v1.copy(v).multiplyScalar(-0.05), 0.15, 2.4, 0.4, COL.fire, 1); smoke.spawn(from, V(rand(-1, 1), 1, rand(-1, 1)), 0.5, 0.4, 1.2, COL.white, 0.3, 1.5);
      lightFlash(from, 0xffa050, 300); shake = Math.max(shake, 0.12); sfx.rocketLaunch();
    }
  } else if (G.weapon === 'flame') {
    if (rig.pilot) rig.pilot.scale.setScalar(0.8 + Math.random() * 0.5);
    sfx.flame(held);
    if (held) {
      G.ammo -= dt; G.flameT = (G.flameT || 0) - dt;
      const r = aimRay(0); const dir = r.direction;
      for (let i = 0; i < 9; i++) { const sp = rand(22, 34); _v1.copy(dir).multiplyScalar(sp).add(V(rand(-2.5, 2.5), rand(-1, 2.5), rand(-2.5, 2.5))); fx.spawn(muzzleP, _v1, rand(0.55, 0.85), 0.5, rand(2.6, 4.2), Math.random() < 0.3 ? COL.spark : COL.fire, 0.9, 1.6, -1.5); }
      if (Math.random() < 0.5) smoke.spawn(_v2.copy(muzzleP).addScaledVector(dir, rand(10, 22)), V(rand(-1, 1), 3, rand(-1, 1)), 1.6, 1.5, 5, COL.smoke, 0.35, 1, -1.5);
      lightFlash(_v2.copy(muzzleP).addScaledVector(dir, 6), 0xff8030, 220);
      if (G.flameT <= 0) {
        G.flameT = 0.08; sfx.flameTick(); G.shots++;
        for (const e of enemies) {
          if (!e.alive || e.kind === 'crack' || e.kind === 'icicle' || e.kind === 'crate') continue;
          _v3.copy(e.pos).add(V(0, 1, 0)).sub(r.origin); const d = _v3.length(); if (d > (e === G.boss ? 40 : 32)) continue;
          const ang = _v3.normalize().angleTo(dir); if (ang > 0.26 + 0.7 / Math.max(d, 4) + (e === G.boss ? 0.15 : 0)) continue;
          if (e.shieldHp !== undefined && e.shieldHp > 0) { e.shieldHp -= 7; e.sflash = 1; }
          else e.damage(4, 0, e.pos.clone().add(V(0, 1, 0)));
          e.burnT = 2; G.hits++;
        }
        for (const b of bolts) if (b.p.distanceTo(r.origin) < 26 && _v3.copy(b.p).sub(r.origin).normalize().angleTo(dir) < 0.3) b.life = 0;
      }
    }
  }
  if (G.ammo <= 0) { setWeapon('minigun'); say('BACK TO THE MINIGUN', 1.4); }
}
function updateRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const k = rockets[i]; k.t += dt;
    // home in on the locked target (or the aim point), so shots land where the crosshair was
    let goal = k.aim;
    if (k.lock && k.lock.alive) { const h = k.lock.hits[k.lockIdx] || k.lock.hits[0]; goal = k.lock.obj.localToWorld(h.o.clone()); }
    const want = goal.clone().sub(k.p); if (want.lengthSq() > 1) { want.normalize().multiplyScalar(100); k.v.lerp(want, Math.min(1, dt * 9)).setLength(100); }
    const step = k.v.clone().multiplyScalar(dt), sl = step.length();
    const r = new THREE.Ray(k.p.clone(), k.v.clone().normalize()); let boom = null;
    for (const e of enemies) { if (!e.alive || e.kind === 'crack' || e.kind === 'crate') continue; const h = e.hitTest(r); if (h && h[0] <= sl + 0.5) { boom = r.at(h[0], new THREE.Vector3()); break; } }
    for (const m of mortars) if (m.p.distanceTo(k.p) < 2.5) { m.hp = 0; boom = k.p.clone(); }
    k.p.add(step); k.m.position.copy(k.p); k.m.lookAt(k.p.clone().add(k.v));
    const gy = groundH(k.p.x, k.p.z);
    if (!boom && k.t > 0.12 && k.p.y <= gy + 0.2 && k.p.distanceTo(goal) < 12) boom = k.p.clone();
    if (!boom && k.p.y <= gy + 0.2) k.p.y = gy + 0.25;   // skim over bumps on the way
    if (!boom && k.p.distanceTo(goal) < 1.2) boom = k.p.clone();
    if (!boom && k.t > 3) boom = k.p.clone();
    smoke.spawn(k.p, V(rand(-0.4, 0.4), rand(0, 0.6), rand(-0.4, 0.4)), 0.9, 0.4, 1.4, COL.white, 0.4, 1.2); fx.spawn(k.p, V(), 0.06, 1.1, 0.4, COL.fire, 1);
    if (boom) {
      scene.remove(k.m); rockets.splice(i, 1); explosion(boom, 1.3); lightFlash(boom, 0xffa050, 1800); shake = Math.max(shake, 0.22); sfx.boom(0.8);
      for (const e of enemies) {
        if (!e.alive || e.kind === 'crack' || e.kind === 'crate') continue; const d = e.pos.clone().add(V(0, 1, 0)).distanceTo(boom); const R = e === G.boss ? 12 : 8.5; if (d > R) continue;
        if (e.kind === 'icicle') { e.damage(5, 0, boom); continue; }
        if (e.shieldHp !== undefined && e.shieldHp > 0) { e.shieldHp -= 45; e.sflash = 1; if (e.shieldHp > 0) continue; }
        e.damage(lerp(45, 18, d / R), 0, boom.clone()); G.hits++;
      }
      for (const b of bolts) if (b.p.distanceTo(boom) < 5) b.life = 0;
    }
  }
}
const beams = [];
const beamMat = new THREE.MeshBasicMaterial({ color: 0x8ff4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
function railBeam(a, b) {
  const len = a.distanceTo(b), m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, len), beamMat.clone()); m.position.copy(a).lerp(b, 0.5); m.lookAt(b); scene.add(m); beams.push({ m, t: 0 });
  for (let i = 0; i < 24; i++) fx.spawn(_v1.copy(a).lerp(b, Math.random()), V(rand(-1, 1), rand(-1, 1), rand(-1, 1)), 0.4, 0.6, 0.1, COL.cyan, 1, 2);
}
function updateBeams(dt) { for (let i = beams.length - 1; i >= 0; i--) { const b = beams[i]; b.t += dt; b.m.material.opacity = Math.max(0, 1 - b.t / 0.3); b.m.scale.x = b.m.scale.y = 1 + b.t * 6; if (b.t > 0.3) { scene.remove(b.m); b.m.geometry.dispose(); beams.splice(i, 1); } } }
function updateBurn(dt) { for (const e of enemies) { if (!e.burnT || !e.alive) continue; e.burnT -= dt; if (Math.random() < 0.5) fx.spawn(_v1.copy(e.pos).add(V(rand(-0.6, 0.6), rand(0.4, 1.8), rand(-0.6, 0.6))), V(0, 2, 0), 0.4, 0.8, 0.2, COL.fire, 0.8, 1, -2); if ((e.burnTick = (e.burnTick || 0) - dt) <= 0) { e.burnTick = 0.25; if (!['icicle', 'crack', 'cell', 'crate'].includes(e.kind)) e.damage(1.4, 0, e.pos.clone()); } } }
function crateTex(k) {
  const W0 = WEAPONS[k];
  return canvasTex(256, (g, sz) => {
    g.fillStyle = 'rgba(10,20,30,.55)'; g.fillRect(0, 0, sz, sz); g.strokeStyle = W0.col; g.lineWidth = 10; g.strokeRect(8, 8, sz - 16, sz - 16);
    g.fillStyle = W0.col; g.strokeStyle = W0.col; g.lineWidth = 12; g.lineCap = 'round'; g.lineJoin = 'round'; const c = sz / 2;
    if (k === 'gauss') { g.beginPath(); g.moveTo(c + 20, 40); g.lineTo(c - 35, c + 10); g.lineTo(c + 5, c + 10); g.lineTo(c - 20, sz - 40); g.lineTo(c + 40, c - 15); g.lineTo(c, c - 15); g.closePath(); g.fill(); }
    if (k === 'rockets') { g.save(); g.translate(c, c); g.rotate(-0.8); g.beginPath(); g.moveTo(0, -80); g.lineTo(22, -40); g.lineTo(22, 50); g.lineTo(-22, 50); g.lineTo(-22, -40); g.closePath(); g.fill(); g.beginPath(); g.moveTo(-22, 20); g.lineTo(-45, 60); g.lineTo(-22, 50); g.moveTo(22, 20); g.lineTo(45, 60); g.lineTo(22, 50); g.fill(); g.stroke(); g.restore(); }
    if (k === 'flame') { g.beginPath(); g.moveTo(c, 36); g.bezierCurveTo(c + 70, 100, c + 60, sz - 40, c, sz - 36); g.bezierCurveTo(c - 60, sz - 40, c - 70, 120, c - 10, 70); g.bezierCurveTo(c - 15, 110, c + 10, 120, c, 36); g.fill(); g.fillStyle = 'rgba(10,20,30,.9)'; g.beginPath(); g.ellipse(c, sz - 80, 22, 32, 0, 0, 7); g.fill(); }
  });
}
const crateTexes = {};
function crate(sOff, side, k) {
  k = k || ['gauss', 'rockets', 'flame'][Math.floor(Math.random() * 3)];
  if (!crateTexes[k]) crateTexes[k] = crateTex(k);
  const g = new THREE.Group(); const p = groundPoint(G.s + sOff, side); p.y += 3.2; g.position.copy(p);
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshBasicMaterial({ map: crateTexes[k], transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.7, 1.7, 1.7)), new THREE.LineBasicMaterial({ color: WEAPONS[k].col, toneMapped: false }));
  g.add(box, frame);
  const e = new Enemy('crate', g, 1, [{ o: V(0, 0, 0), r: 1.4 }], 50); e.mats = []; e.weaponK = k; e.base = p.clone();
  e.update = function (dt) { this.t += dt; this.obj.rotation.y += dt * 1.4; this.pos.y = this.base.y + Math.sin(this.t * 2.4) * 0.25; if (Math.random() < 0.15) fx.spawn(_v1.copy(this.pos).add(V(rand(-1, 1), rand(-1, 1), rand(-1, 1))), V(0, 1, 0), 0.5, 0.5, 0.1, C(WEAPONS[k].col), 1); };
  e.damage = function () { if (!this.alive) return; this.alive = false; const W0 = WEAPONS[this.weaponK]; setWeapon(this.weaponK); say(W0.name + '!', 1.8); sfx.pickup(); burst(this.pos, 30, 8, 0.6, 0.6, 0.1, C(W0.col), 1, 2); this.remove(); };
  e.die = () => {};
  if (!crate.hinted) { crate.hinted = true; setTimeout(() => say('SHOOT THE CRATE FOR A NEW TURRET!', 2.2), 400); }
  return e;
}
// ---------------------------------------------------------------- input (OpenFIRE guns appear as a mouse)
function setXY(e) {
  input.x = clamp(e.clientX / W, 0, 1); input.y = clamp(e.clientY / H, 0, 1);
  input.off = e.clientX <= 2 || e.clientY <= 2 || e.clientX >= W - 3 || e.clientY >= H - 3;
}
addEventListener('pointermove', setXY);
addEventListener('pointerdown', e => {
  setXY(e); sfx.init(); music.unlock();
  if (e.button === 0) { input.down = true; input.clicked = { x: input.x * W, y: input.y * H }; }
  if (e.button === 2) input.a = true; if (e.button === 1) input.b = true;
});
addEventListener('pointerup', e => { if (e.button === 0) input.down = false; if (e.button === 2) input.a = false; if (e.button === 1) input.b = false; });
addEventListener('mouseout', e => { if (!e.relatedTarget) input.off = true; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => { if (e.key === 'p') G.party = !G.party; });   // back-to-menu (A+B+off-screen, Esc hold, Home) is handled by ../../arcade-back.js
addEventListener('resize', resize);

// ---------------------------------------------------------------- game flow
function resetRun() {
  slashFx.length = 0; for (const m of mortars) { scene.remove(m.marker); if (m.mesh) scene.remove(m.mesh); } mortars.length = 0; clearLevel3(); clearLevel4(); clearLevel5(); for (const e of enemies) scene.remove(e.obj); enemies.length = 0; bolts.length = 0; popups.length = 0; pendingBlasts.length = 0; cellHinted = false;
  Object.assign(G, { s: 0, speed: 0, score: 0, kills: 0, shots: 0, hits: 0, time: 0, shield: SHIELD_MAX, health: HEALTH_MAX, sinceHit: 99, heat: 0, overheated: false, spin: 0, combo: 0, comboT: 0, boss: null, won: false, msg: '', msgT: 0 });
  events = script();
  for (const k of rockets) scene.remove(k.m); rockets.length = 0; for (const b of beams) scene.remove(b.m); beams.length = 0;
  if (WPN) setWeapon('minigun'); else G.weapon = 'minigun'; sfx.engineLoops(false);
}
function startRun() { resetRun(); if (!ADMIN && camp) G.score = camp.score || 0; sfx.resetTaunts(); G.state = 'play'; music.play('run'); G.snap = true; G.camInit = false; sfx.ui(); }

function placeVehicle(dt) {
  trackAt(G.s, vehicle.position); vehicle.position.y = groundH(vehicle.position.x, vehicle.position.z);
  // look well ahead, using the averaged ground height, so grade changes are gentle
  const back = trackAt(G.s - 3, _v3); back.y = groundH(back.x, back.z);
  const ahead = trackAt(G.s + 12, _v1); ahead.y = groundH(ahead.x, ahead.z);
  vehicle.position.y = Math.max(vehicle.position.y, (back.y + ahead.y) / 2 - 0.15);
  const fwd = _v2.copy(ahead).sub(back).normalize();
  vehicleFwd.copy(fwd).setY(0).normalize();
  const lookPt = fwd.add(vehicle.position);
  const m = _m4.lookAt(lookPt, vehicle.position, UP); // +Z toward ahead
  _q.setFromRotationMatrix(m);
  if (dt === 0 || vehicle.quaternion.lengthSq() === 0 || G.snap) { vehicle.quaternion.copy(_q); G.snap = false; }
  else vehicle.quaternion.slerp(_q, Math.min(1, dt * 2.5));
  // wheels: roll with ground speed, fronts steer into the curve
  const heading = Math.atan2(vehicleFwd.x, vehicleFwd.z);
  let yawRate = 0; if (lastHeading !== null && dt > 0) { let d = heading - lastHeading; d = Math.atan2(Math.sin(d), Math.cos(d)); yawRate = d / dt; } lastHeading = heading;
  const wantSteer = G.speed > 0.5 ? clamp(Math.atan(WHEELBASE * yawRate / G.speed), -0.45, 0.45) : steer;
  steer = lerp(steer, wantSteer, Math.min(1, dt * 4));
  wheelSpin += G.speed / WHEEL_R * dt;
  for (const w of wheels) { w.rotation.z = wheelSpin; w.rotation.y = w.userData.wheel === 'front' ? steer : 0; }
  // light bumps & sway (the camera only gets a fraction of this)
  const t = performance.now() / 1000, sp = G.speed / RUN_SPEED;
  vBody.position.y = (Math.sin(t * 9.3) * 0.012 + Math.sin(t * 4.1) * 0.018) * sp;
  vBody.rotation.z = Math.sin(t * 2.3) * 0.008 * sp; vBody.rotation.x = Math.sin(t * 3.7) * 0.005 * sp;
}
const camLook = V();
function placeCamera(dt) {
  vehicle.updateMatrixWorld(true);
  _v3.copy(CAM_OFF); if (G.fpvK > 0) _v3.lerp(_v1.set(0, BED.y + 1.62, BED.z - 0.95), G.fpvK);   // level 5: ease into the gunner's seat
  vehicle.localToWorld(_v3); _v3.y += vBody.position.y * 0.4;
  if (G.camInit) camera.position.lerp(_v3, Math.min(1, dt * 10)); else { camera.position.copy(_v3); G.camInit = true; }
  // look ahead, drifting slightly toward where the gunner aims
  _v1.set((0.5 - input.x) * 9, 0.2 - (input.y - 0.5) * 5 + (G.fpvK || 0) * 1.2, 30); vehicle.localToWorld(_v1);
  camLook.lerp(_v1, Math.min(1, dt * 3)); if (camLook.lengthSq() === 0) camLook.copy(_v1);
  camera.lookAt(camLook);
  if (shake > 0) { camera.rotation.x += rand(-1, 1) * shake * 0.02; camera.rotation.y += rand(-1, 1) * shake * 0.02; }
}
function aimTurret(dt) {
  const r = aimRay(); const hit = trace(r); const tgt = r.at(Math.min(hit.d, 150), V());
  turret.worldToLocal(tgt); // turret-model space (+Z forward)
  const piv = 2.6; const yaw = Math.atan2(tgt.x, tgt.z);
  const pitch = Math.atan2(tgt.y - piv, Math.hypot(tgt.x, tgt.z));
  tSwivel.rotation.y = lerp(tSwivel.rotation.y, clamp(yaw, -1.4, 1.4), Math.min(1, dt * 14));
  tBody.rotation.x = lerp(tBody.rotation.x, clamp(-pitch, -0.7, 0.8), Math.min(1, dt * 14));
  tBarrel.rotation.y += G.spin * dt * 40;
  const rig = activeRig();
  if (rig) {
    _v1.copy(r.at(Math.min(hit.d, 150), V())); rig.root.worldToLocal(_v1);
    const y2 = Math.atan2(_v1.x, _v1.z), p2 = Math.atan2(_v1.y - 0.95, Math.hypot(_v1.x, _v1.z));
    rig.swivel.rotation.y = lerp(rig.swivel.rotation.y, clamp(y2, -1.4, 1.4), Math.min(1, dt * 14));
    rig.body.rotation.x = lerp(rig.body.rotation.x, clamp(-p2, -0.7, 0.8), Math.min(1, dt * 14));
    if (G.weapon === 'gauss' && G.wCool > 0.3) rig.body.position.z = -0.25 * (G.wCool - 0.3) / 0.15; else rig.body.position.z = lerp(rig.body.position.z, 0, dt * 10);
  }
}

function updatePlay(dt) {
  G.time += dt;
  // speed: ease off when lots of enemies are up, stop for the boss
  const alive = enemies.filter(e => e.alive && e.kind !== 'watchtower' && e.kind !== 'cell' && e.kind !== 'icicle' && e.kind !== 'crack' && e.kind !== 'crate').length;
  let target = RUN_SPEED * (alive > 6 ? 0.65 : alive > 3 ? 0.82 : 1);
  if (G.s > ARENA - 25) target = 0;
  G.speed = lerp(G.speed, target, dt * (target === 0 ? 0.8 : 1.5));
  G.s = Math.min(ARENA, G.s + G.speed * dt);
  sfx.engine(0.25 + 0.75 * G.speed / RUN_SPEED);
  while (events.length && G.s >= events[0].s) events.shift().f();

  // gun
  const canFire = input.down && !input.off && !G.overheated && G.weapon === 'minigun';
  if (G.weapon !== 'minigun') fireWeapon(dt);
  G.spin = clamp(G.spin + (canFire ? dt / SPIN_TIME : -dt / 0.8), 0, 1);
  sfx.gunState(canFire, canFire && G.spin >= 1);
  if (canFire && G.spin >= 1) { G.fireT -= dt; while (G.fireT <= 0) { G.fireT += 1 / FIRE_RATE; fireRound(); } }
  else { G.fireT = 0; G.heat = Math.max(0, G.heat - COOL_RATE * dt * (input.off && input.down ? 3 : 1)); }
  if (G.overheated) { G.heat = Math.max(0, G.heat - dt * 0.55); if (Math.random() < 0.5) smoke.spawn(muzzleP, V(rand(-1, 1), 3, rand(-1, 1)), 1, 0.6, 2.4, COL.white, 0.35, 1, -1); if (G.heat < 0.3) G.overheated = false; }

  // shields: off-screen trigger = take cover (faster recharge)
  G.sinceHit += dt * (input.off && input.down ? 2.5 : 1);
  if (G.sinceHit > SHIELD_DELAY && G.shield < SHIELD_MAX) { if (G.shield === 0 || G.shieldWasLow) { G.shieldWasLow = false; sfx.recharge(); } G.shield = Math.min(SHIELD_MAX, G.shield + SHIELD_RATE * dt); }
  if (G.shield < 1) G.shieldWasLow = true;

  G.comboT -= dt;
  { let lv = 0; for (const e of enemies) if (e.kind === 'ghost' && e.alive) lv = Math.max(lv, clamp(1.2 - e.pos.distanceTo(vehicle.position) / 70, 0, 1)); sfx.ghostHum(lv); }
  for (const e of enemies) {
    if (e.dead) continue; e.update(dt);
    e.flash = Math.max(0, e.flash - dt * 6); e.setFlash();
    // cull things left behind
    if (e.alive && e.kind !== 'banshee' && e.kind !== 'wraith' && e.kind !== 'engine' && e.kind !== 'serpent' && e.kind !== 'tidefather' && e.kind !== 'tentacle' && e.kind !== 'gill' && _v1.copy(e.pos).sub(vehicle.position).dot(vehicleFwd) < -10) { e.alive = false; e.remove(); }
  }
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead) enemies.splice(i, 1);
}

function updateBolts(dt) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i]; b.life -= dt;
    b.p.addScaledVector(b.v, dt);
    fx.spawn(b.p, V(), 0.05, b.size * 2.2, b.size * 1.2, b.color, 1);
    fx.spawn(b.p, V(), 0.18, b.size * 1.1, 0.2, b.color, 0.6);
    if (G.state === 'play' && b.p.distanceTo(camera.position) < 1.6) { damagePlayer(b.dmg); b.life = 0; burst(b.p, 8, 4, 0.3, 1.2, 0.3, b.color, 1, 3); }
    if (b.life <= 0 || b.p.y < groundH(b.p.x, b.p.z)) { if (b.life > 0) burst(b.p, 6, 3, 0.3, 1, 0.2, b.color, 1, 3); bolts.splice(i, 1); }
  }
}

// ---------------------------------------------------------------- HUD
const font = (px, w = 800) => `${w} ${Math.round(px)}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
const buttons = [];
// title banner (supplied art) with a sweeping chrome glint
const logoImg = new Image(); if (window.HOG_LOGO) logoImg.src = 'data:image/png;base64,' + window.HOG_LOGO;
const logoFx = document.createElement('canvas'), lfx = logoFx.getContext('2d');
function drawLogo(cy, maxW) {
  if (!logoImg.complete || !logoImg.naturalWidth) return false;
  const w = Math.min(maxW, logoImg.naturalWidth * 1.2), h = w * logoImg.naturalHeight / logoImg.naturalWidth;
  if (logoFx.width !== Math.round(w)) { logoFx.width = Math.round(w); logoFx.height = Math.round(h); }
  lfx.globalCompositeOperation = 'source-over'; lfx.clearRect(0, 0, logoFx.width, logoFx.height);
  lfx.drawImage(logoImg, 0, 0, logoFx.width, logoFx.height);
  const t = (performance.now() / 1000) % 4.5, sx = (t / 1.4) * (w + h * 2) - h;   // glint crosses in 1.4 s, then rests
  if (t < 1.4) {
    lfx.globalCompositeOperation = 'source-atop';
    const g = lfx.createLinearGradient(sx - h * 0.6, 0, sx + h * 0.6, h);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    lfx.fillStyle = g; lfx.fillRect(0, 0, logoFx.width, logoFx.height);
  }
  hx.save(); hx.shadowColor = 'rgba(0,10,30,.7)'; hx.shadowBlur = h * 0.18; hx.shadowOffsetY = h * 0.06;
  hx.drawImage(logoFx, W / 2 - w / 2, cy - h / 2); hx.restore();
  return true;
}
function button(id, label, x, y, w, h, hot) {
  const hover = input.x * W > x && input.x * W < x + w && input.y * H > y && input.y * H < y + h;
  hx.fillStyle = hover ? 'rgba(120,200,255,.35)' : 'rgba(10,25,40,.55)'; hx.strokeStyle = hot || '#8fd0ff'; hx.lineWidth = 3;
  hx.beginPath(); hx.moveTo(x + 14, y); hx.lineTo(x + w, y); hx.lineTo(x + w - 14, y + h); hx.lineTo(x, y + h); hx.closePath(); hx.fill(); hx.stroke();
  hx.fillStyle = '#e9f6ff'; hx.font = font(h * 0.42); hx.textAlign = 'center'; hx.textBaseline = 'middle'; hx.fillText(label, x + w / 2, y + h / 2 + 1);
  buttons.push({ id, x, y, w, h });
}
function consumeClick() {
  const c = input.clicked; input.clicked = null; if (!c) return null;
  for (const b of buttons) if (c.x > b.x && c.x < b.x + b.w && c.y > b.y && c.y < b.y + b.h) return b.id;
  return null;
}
function title(text, y, size, col = '#eef7ff') {
  hx.textAlign = 'center'; hx.textBaseline = 'middle'; hx.font = font(size, 900);
  hx.lineWidth = size * 0.12; hx.strokeStyle = 'rgba(0,20,40,.75)'; hx.strokeText(text, W / 2, y);
  const gr = hx.createLinearGradient(0, y - size / 2, 0, y + size / 2); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, col); gr.addColorStop(1, '#7fa8c4');
  hx.fillStyle = gr; hx.fillText(text, W / 2, y);
}
function crosshair() {
  const x = input.x * W, y = input.y * H, u = Math.min(W, H) / 900;
  const r = 26 * u;
  hx.strokeStyle = input.off ? 'rgba(255,255,255,.3)' : G.overheated ? '#ff5040' : '#c8ecff'; hx.lineWidth = 2.5 * u;
  hx.beginPath(); hx.arc(x, y, r, 0, Math.PI * 2); hx.stroke();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { hx.beginPath(); hx.moveTo(x + dx * r * 0.45, y + dy * r * 0.45); hx.lineTo(x + dx * r * 1.4, y + dy * r * 1.4); hx.stroke(); }
  hx.fillStyle = hx.strokeStyle; hx.fillRect(x - 1.5 * u, y - 1.5 * u, 3 * u, 3 * u);
  if (G.state === 'play' && G.weapon && G.weapon !== 'minigun') { // ammo arc + charge ring for the mounted turret
    const W0 = WEAPONS[G.weapon], f = clamp(G.ammo / G.ammoMax, 0, 1);
    hx.lineWidth = 6 * u; hx.strokeStyle = 'rgba(0,0,0,.35)'; hx.beginPath(); hx.arc(x, y, r + 10 * u, Math.PI * 0.75, Math.PI * 2.25); hx.stroke();
    hx.strokeStyle = W0.col; hx.beginPath(); hx.arc(x, y, r + 10 * u, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * f)); hx.stroke();
    if (G.weapon === 'gauss' && G.charge > 0) { hx.lineWidth = 4 * u; hx.strokeStyle = '#bff8ff'; hx.beginPath(); hx.arc(x, y, r * 0.7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * G.charge); hx.stroke(); }
    if (G.weapon === 'flame') { hx.lineWidth = 1.5 * u; hx.strokeStyle = 'rgba(255,120,60,.5)'; hx.setLineDash([6 * u, 6 * u]); hx.beginPath(); hx.arc(x, y, r * 2.6, 0, Math.PI * 2); hx.stroke(); hx.setLineDash([]); }
    hx.font = font(15 * u, 800); hx.textAlign = 'center'; hx.fillStyle = W0.col; hx.fillText(W0.name, x, y + r + 34 * u);
    return;
  }
  if (G.state === 'play') { // heat arc
    hx.lineWidth = 6 * u; hx.strokeStyle = 'rgba(0,0,0,.35)'; hx.beginPath(); hx.arc(x, y, r + 10 * u, Math.PI * 0.75, Math.PI * 2.25); hx.stroke();
    hx.strokeStyle = G.overheated ? (performance.now() % 300 < 150 ? '#ff3020' : '#ffb020') : `hsl(${40 - G.heat * 40},100%,${55 + G.heat * 10}%)`;
    hx.beginPath(); hx.arc(x, y, r + 10 * u, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * G.heat)); hx.stroke();
  }
}
function drawHUD(dt, fps) {
  hx.clearRect(0, 0, W, H); buttons.length = 0;
  const u = Math.min(W, H) / 900;
  if (hurtFlash > 0 || shieldFlash > 0) {
    const gr = hx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, hurtFlash > 0 ? `rgba(255,30,20,${hurtFlash * 0.6})` : `rgba(80,180,255,${shieldFlash * 0.5})`);
    hx.fillStyle = gr; hx.fillRect(0, 0, W, H);
  }
  for (let i = slashFx.length - 1; i >= 0; i--) {   // energy-sword slash across the screen
    const sl = slashFx[i]; sl.t += dt; const k = 1 - sl.t / 0.5; if (k <= 0) { slashFx.splice(i, 1); continue; }
    hx.save(); hx.translate(W / 2, H * 0.45); hx.rotate(sl.a); hx.globalCompositeOperation = 'lighter';
    const L2 = W * 0.65 * Math.min(1, sl.t / 0.08);
    hx.shadowColor = 'rgba(255,60,110,1)'; hx.shadowBlur = 40 * u;
    hx.strokeStyle = `rgba(255,70,120,${k})`; hx.lineWidth = 34 * u * k; hx.lineCap = 'round'; hx.beginPath(); hx.moveTo(-L2, 0); hx.lineTo(L2, 0); hx.stroke();
    hx.strokeStyle = `rgba(255,230,240,${k})`; hx.lineWidth = 8 * u * k; hx.beginPath(); hx.moveTo(-L2, 0); hx.lineTo(L2, 0); hx.stroke();
    hx.restore();
  }
  if (G.state !== 'loading') {   // sun glare + lens ghosts when the sun is on screen
    _v1.copy(sun.position).normalize().multiplyScalar(2000).add(camera.position).project(camera);
    if (_v1.z < 1 && Math.abs(_v1.x) < 1.3 && Math.abs(_v1.y) < 1.3) {
      const sx = (_v1.x * 0.5 + 0.5) * W, sy = (-_v1.y * 0.5 + 0.5) * H, edge = clamp(1.3 - Math.max(Math.abs(_v1.x), Math.abs(_v1.y)), 0, 1);
      hx.save(); hx.globalCompositeOperation = 'lighter';
      const gr = hx.createRadialGradient(sx, sy, 0, sx, sy, 260 * u); gr.addColorStop(0, `rgba(255,240,210,${0.55 * edge})`); gr.addColorStop(0.25, `rgba(255,210,150,${0.18 * edge})`); gr.addColorStop(1, 'rgba(255,200,140,0)');
      hx.fillStyle = gr; hx.fillRect(sx - 260 * u, sy - 260 * u, 520 * u, 520 * u);
      for (const [f, r, a] of [[0.45, 34, 0.08], [0.9, 18, 0.1], [1.35, 60, 0.05]]) {
        const gx = sx + (W / 2 - sx) * f * 2, gy = sy + (H / 2 - sy) * f * 2;
        hx.fillStyle = `rgba(190,220,255,${a * edge})`; hx.beginPath(); hx.arc(gx, gy, r * u, 0, 7); hx.fill();
      }
      hx.restore();
    }
  }
  if (G.state === 'loading') { if (!drawLogo(H * 0.4, W * 0.75)) title('HOG RUN', H * 0.4, 110 * u); hx.font = font(26 * u, 600); hx.fillStyle = '#dff'; hx.fillText(`LOADING ${Math.round(loadP * 100)}%`, W / 2, H * 0.55); return; }
  if (G.state === 'play' || G.state === 'results') {
    // shields + health (top center)
    const bw = 520 * u, bx = W / 2 - bw / 2, by = 26 * u;
    hx.fillStyle = 'rgba(0,15,30,.5)'; hx.fillRect(bx - 4 * u, by - 4 * u, bw + 8 * u, 40 * u);
    const segs = 20;
    for (let i = 0; i < segs; i++) {
      const on = G.shield / SHIELD_MAX > i / segs;
      hx.fillStyle = on ? (G.shield < 30 ? (performance.now() % 400 < 200 ? '#ff6a4a' : '#ffd0a0') : '#6fc8ff') : 'rgba(110,200,255,.12)';
      hx.fillRect(bx + i * (bw / segs) + 1, by, bw / segs - 3, 20 * u);
    }
    for (let i = 0; i < 10; i++) { hx.fillStyle = G.health / HEALTH_MAX > i / 10 ? '#ff5a4a' : 'rgba(255,90,74,.15)'; hx.fillRect(bx + i * (bw / 10) + 1, by + 25 * u, bw / 10 - 3, 7 * u); }
    // score
    hx.textAlign = 'right'; hx.textBaseline = 'top'; hx.font = font(40 * u, 900); hx.fillStyle = '#fff'; hx.strokeStyle = 'rgba(0,0,0,.6)'; hx.lineWidth = 5 * u;
    hx.strokeText(G.score.toLocaleString(), W - 30 * u, 22 * u); hx.fillText(G.score.toLocaleString(), W - 30 * u, 22 * u);
    if (G.comboT > 0 && G.combo > 2) { hx.font = font(24 * u, 800); hx.fillStyle = '#ffd24a'; hx.fillText(`COMBO ${G.combo}  x${Math.min(5, 1 + Math.floor(G.combo / 3))}`, W - 30 * u, 70 * u); }
    // motion tracker
    const rx = 110 * u, ry = H - 110 * u, rr = 85 * u;
    hx.fillStyle = 'rgba(0,25,45,.5)'; hx.beginPath(); hx.arc(rx, ry, rr, 0, 7); hx.fill();
    hx.strokeStyle = 'rgba(120,200,255,.5)'; hx.lineWidth = 2; hx.beginPath(); hx.arc(rx, ry, rr, 0, 7); hx.arc(rx, ry, rr * 0.5, 0, 7); hx.stroke();
    const sw = (performance.now() / 1000) % 1.5 / 1.5; hx.strokeStyle = `rgba(140,220,255,${0.5 * (1 - sw)})`; hx.beginPath(); hx.arc(rx, ry, rr * sw, 0, 7); hx.stroke();
    const right = trackSide(G.s, _v3);
    for (const e of enemies) {
      if (!e.alive) continue; _v1.copy(e.pos).sub(vehicle.position);
      const f = _v1.dot(vehicleFwd), s = _v1.dot(right), d = Math.hypot(f, s); if (d > 120) continue;
      const k = rr / 120; hx.fillStyle = e.kind === 'elite' || e.kind === 'wraith' ? '#ffd24a' : e.kind === 'cell' ? '#4fe8ff' : '#ff4a3a';
      hx.beginPath(); hx.arc(rx + s * k, ry - f * k, (e.kind === 'grunt' || e.kind === 'cell' ? 3.5 : 6) * u, 0, 7); hx.fill();
    }
    hx.fillStyle = '#bfe8ff'; hx.beginPath(); hx.moveTo(rx, ry - 7 * u); hx.lineTo(rx - 5 * u, ry + 5 * u); hx.lineTo(rx + 5 * u, ry + 5 * u); hx.fill();
    // boss bar
    if (G.boss && G.boss.alive) {
      const w2 = 600 * u, x2 = W / 2 - w2 / 2, y2 = H - 70 * u, b = G.boss;
      hx.fillStyle = 'rgba(0,0,0,.5)'; hx.fillRect(x2 - 4, y2 - 4, w2 + 8, 26 * u);
      hx.fillStyle = '#c0392b'; hx.fillRect(x2, y2, w2 * b.hp / b.maxHp, 18 * u);
      if (b.shieldMax) { hx.fillStyle = 'rgba(110,200,255,.85)'; hx.fillRect(x2, y2, w2 * Math.max(0, b.shieldHp) / b.shieldMax, 6 * u); }
      hx.font = font(20 * u, 800); hx.textAlign = 'center'; hx.textBaseline = 'bottom'; hx.fillStyle = '#ffd24a'; hx.fillText(LV.boss, W / 2, y2 - 8 * u);
    }
    // popups
    hx.textAlign = 'center'; hx.textBaseline = 'middle';
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i]; p.t += dt; if (p.t > 1.1) { popups.splice(i, 1); continue; }
      _v1.copy(p.p).project(camera); if (_v1.z > 1) continue;
      const sx = (_v1.x * 0.5 + 0.5) * W, sy = (-_v1.y * 0.5 + 0.5) * H - p.t * 50 * u;
      hx.globalAlpha = 1 - p.t / 1.1; hx.font = font(26 * u, 900); hx.lineWidth = 4; hx.strokeStyle = 'rgba(0,0,0,.7)'; hx.strokeText(p.text, sx, sy); hx.fillStyle = p.col; hx.fillText(p.text, sx, sy); hx.globalAlpha = 1;
    }
    if (G.state === 'results' && G.endT > 1.5) G.msgT = 0;
    if (G.msgT > 0) { G.msgT -= dt; hx.globalAlpha = clamp(G.msgT * 2, 0, 1); title(G.msg, H * 0.22, 64 * u, G.msg.includes('DOWN') && !G.won ? '#ff8a7a' : '#bfe8ff'); hx.globalAlpha = 1; }
    if (input.off && input.down && G.state === 'play') { hx.font = font(28 * u, 800); hx.fillStyle = '#8fd0ff'; hx.textAlign = 'center'; hx.fillText('TAKING COVER — SHIELDS & GUN RECOVERING', W / 2, H * 0.32); }
  }
  if (G.state === 'title') {
    if (!drawLogo(H * 0.25, Math.min(W * 0.82, 1250 * u))) title('HOG RUN', H * 0.25, 140 * u);
    hx.font = font(24 * u, 700); hx.fillStyle = '#e6f4ff'; hx.textAlign = 'center'; hx.shadowColor = 'rgba(0,10,30,.8)'; hx.shadowBlur = 8; hx.fillText('TURRET GUNNER  •  FAN-MADE LIGHT GUN GAME', W / 2, H * 0.25 + 95 * u); hx.shadowBlur = 0;
    if (ADMIN) {
      const ly = H * 0.39, st = 54 * u, bh = 47 * u;
      [['lvl1', 'LEVEL 1 · RINGWORLD HILLS'], ['lvl2', 'LEVEL 2 · DESERT CANYON'], ['lvl3', 'LEVEL 3 · FROZEN PASS'], ['lvl4', 'LEVEL 4 · NIGHT SWAMP'], ['lvl5', 'LEVEL 5 · STORM COAST']].forEach(([id, txt], i) => button(id, txt, W / 2 - 230 * u, ly + i * st, 460 * u, bh, LEVEL === i + 1 ? '#ffd24a' : null));
      const ly2 = ly + 5 * st + 10 * u;
      button('party', `PARTY GRUNTS: ${G.party ? 'ON' : 'OFF'}`, W / 2 - 170 * u, ly2, 340 * u, 50 * u, G.party ? '#ffd24a' : null);
      button('credits', 'CREDITS', W / 2 - 170 * u, ly2 + 58 * u, 165 * u, 50 * u);
      button('models', CUSTOMIZED.size ? `MODELS (${CUSTOMIZED.size})` : 'MODELS', W / 2 + 5 * u, ly2 + 58 * u, 165 * u, 50 * u);
    } else {
      const ly = H * 0.44;
      button('start', camp && camp.level > 1 ? `CONTINUE · LEVEL ${camp.level}` : 'START', W / 2 - 230 * u, ly, 460 * u, 84 * u, '#ffd24a');
      button('party', `PARTY GRUNTS: ${G.party ? 'ON' : 'OFF'}`, W / 2 - 170 * u, ly + 112 * u, 340 * u, 50 * u, G.party ? '#ffd24a' : null);
      button('credits', 'CREDITS', W / 2 - 170 * u, ly + 172 * u, 340 * u, 50 * u);
      if (camp && camp.level > 1) button('newgame', 'NEW GAME (LEVEL 1)', W / 2 - 170 * u, ly + 232 * u, 340 * u, 50 * u);
    }
    hx.font = font(18 * u, 600); hx.fillStyle = 'rgba(230,244,255,.75)'; hx.fillText('SHOOT A BUTTON  •  TRIGGER OFF-SCREEN = TAKE COVER  •  A+B+TRIGGER OFF-SCREEN = MENU', W / 2, H - 40 * u);
  }
  if (G.state === 'credits') {
    hx.fillStyle = 'rgba(0,10,20,.7)'; hx.fillRect(0, 0, W, H);
    title('CREDITS', H * 0.12, 70 * u);
    const lines = [
      ['MODELS, ART & MUSIC', '#ffd24a'],
      ['"Halo Warthog" by pinto36 — CC BY 4.0', '#fff'],
      ['HALO MEGA Grunt, Ghost, Banshee, Shade, Watchtower & Vulcan Turret', '#fff'],
      ['by TimoPatton (TimotheosFraser) — CC BY-SA 4.0', '#fff'],
      ['"halo wars banished elite with energy sword" by YeeHawRussell — CC BY 4.0', '#fff'],
      ['Level 3: "Spider Robot" by muhmdhsn313, "Buster Drone" by lavadragon,', '#fff'],
      ['"Velocity 90" by f3nix, "Combat Turret" by danila_ — all CC BY 4.0', '#fff'],
      ['Thornback: "Forest Monster Beetle" by ArachnoBoy — CC BY-NC 4.0', '#fff'],
      ['The Avalanche: "Monsters 02" by LostBoyz2078 — CC BY 4.0', '#fff'],
      ['Mire Serpent: "Monster03" by LostBoyz2078 — CC BY-NC 4.0', '#fff'],
      ['The Tidefather: "Deep monstrosity" by Vasian-Digital3D — CC BY 4.0', '#fff'],
      ['Swamplers: "Swampler" by Jeepster, concept by Katarzyna Zalecka, for Ancient Beast (AncientBeast.com) — CC-BY-SA 3.0', '#fff'],
      ['All models from sketchfab.com', '#9fc4dd'],
      ['"Halo Wraith" by TechF0rge3D — CC BY 4.0;  Jackal by jameslucino117 — CC BY 4.0 (local file)', '#fff'],
      ['Sky & ground textures: Poly Haven (polyhaven.com) — CC0', '#fff'],
      ['Music (Pixabay): nickpanek, mrclaps, alec_koff, strawberry_candy, divineawakeningfrequency,', '#fff'],
      ['AtlasAudio, luis_humanoide, sergepavkinmusic, kulakovka', '#fff'],
      ['', ''],
      ['A non-commercial fan game for personal use. Halo and all related', '#9fc4dd'],
      ['names are trademarks of Microsoft. Not affiliated with or endorsed by Microsoft.', '#9fc4dd'],
    ];
    hx.textAlign = 'center'; lines.forEach(([t, c], i) => { hx.font = font(i === 0 ? 28 * u : 21 * u, i === 0 ? 900 : 600); hx.fillStyle = c; hx.fillText(t, W / 2, H * 0.24 + i * 40 * u); });
    button('back', 'BACK', W / 2 - 130 * u, H * 0.8, 260 * u, 70 * u);
  }
  if (G.state === 'continue') {
    const left = camp ? camp.cont : CONTINUES;
    hx.fillStyle = 'rgba(20,0,0,.55)'; hx.fillRect(0, 0, W, H);
    title('GUNNER DOWN', H * 0.2, 90 * u, '#ff8a7a');
    title(String(Math.max(0, Math.ceil(G.contT))), H * 0.42, 170 * u, G.contT < 3.5 ? '#ff6a5a' : '#ffd24a');
    hx.font = font(28 * u, 800); hx.fillStyle = '#e6f4ff'; hx.textAlign = 'center'; hx.fillText(`RESTART LEVEL ${LEVEL} · ${left} CONTINUE${left === 1 ? '' : 'S'} LEFT`, W / 2, H * 0.58);
    button('continue', 'CONTINUE', W / 2 - 200 * u, H * 0.64, 400 * u, 84 * u, '#ffd24a');
    button('giveup', 'GIVE UP', W / 2 - 130 * u, H * 0.8, 260 * u, 56 * u);
  }
  if (G.state === 'results' && G.endT > 1.5) {
    hx.fillStyle = 'rgba(0,10,20,.6)'; hx.fillRect(0, 0, W, H);
    title(G.won ? (!ADMIN && !LEVELS[LEVEL + 1] ? 'YOU BEAT HOG RUN!' : `LEVEL ${LEVEL} COMPLETE`) : (ADMIN ? 'GUNNER DOWN' : 'GAME OVER'), H * 0.18, 90 * u, G.won ? '#bfe8ff' : '#ff8a7a');
    const acc = G.shots ? Math.round(100 * G.hits / G.shots) : 0;
    const rows = [['SCORE', G.score.toLocaleString()], ['KILLS', G.kills], ['ACCURACY', acc + '%'], ['TIME', `${Math.floor(G.time / 60)}:${String(Math.floor(G.time % 60)).padStart(2, '0')}`]];
    if (G.won) rows.push(['HEALTH BONUS', '+' + Math.round(G.health * 20)]);
    rows.forEach(([k, v], i) => { hx.font = font(32 * u, 800); hx.textAlign = 'right'; hx.fillStyle = '#9fc4dd'; hx.fillText(k, W / 2 - 20 * u, H * 0.33 + i * 52 * u); hx.textAlign = 'left'; hx.fillStyle = '#fff'; hx.fillText(String(v), W / 2 + 20 * u, H * 0.33 + i * 52 * u); });
    if (!ADMIN) {   // campaign: only forward, or back to the title
      if (G.won && LEVELS[LEVEL + 1]) button('next', `LEVEL ${LEVEL + 1} ▶`, W / 2 - 200 * u, H * 0.72, 400 * u, 84 * u, '#ffd24a');
      else button('title', 'TITLE', W / 2 - 170 * u, H * 0.75, 340 * u, 76 * u, G.won ? '#ffd24a' : null);
    } else if (G.won && LEVELS[LEVEL + 1]) {
      button('next', 'NEXT LEVEL ▶', W / 2 - 170 * u, H * 0.7, 340 * u, 76 * u, '#ffd24a');
      button('again', 'PLAY AGAIN', W / 2 - 360 * u, H * 0.84, 340 * u, 60 * u); button('title', 'TITLE', W / 2 + 20 * u, H * 0.84, 340 * u, 60 * u);
    } else { button('again', 'PLAY AGAIN', W / 2 - 360 * u, H * 0.78, 340 * u, 76 * u); button('title', 'TITLE', W / 2 + 20 * u, H * 0.78, 340 * u, 76 * u); }
  }
  crosshair();
  if (SHOW_FPS) { hx.font = font(16 * u, 700); hx.textAlign = 'right'; hx.textBaseline = 'bottom'; hx.fillStyle = fps >= 50 ? '#7dff9a' : fps >= 30 ? '#ffd24a' : '#ff6a5a'; hx.fillText(`${fps} FPS  ${Math.round(W * RENDER_SCALE)}×${Math.round(H * RENDER_SCALE)}`, W - 14, H - 10); }
}

// ---------------------------------------------------------------- main loop
let loadP = 0, last = performance.now(), fpsN = 0, fpsT = 0, fps = 0, orbit = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000, dt = Math.min(0.05, rawDt); last = now;
  fpsN++; fpsT += rawDt; if (fpsT >= 0.5) { fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
  music.update(Math.min(rawDt, 0.1));
  if (G.state === 'loading') { drawHUD(dt, fps); return; }

  if (G.state === 'play') updatePlay(dt);
  else {
    if (G.state === 'results') { G.endT += dt; G.speed = lerp(G.speed, 0, dt); G.spin = Math.max(0, G.spin - dt); sfx.gunState(false, false); sfx.flame(false); sfx.engine(G.speed / RUN_SPEED * 0.8); sfx.ghostHum(0); for (const e of enemies) if (!e.dead) e.update(dt); for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead) enemies.splice(i, 1); }
    else { sfx.engine(0.15); sfx.gunState(false, false); sfx.ghostHum(0); }
  }
  placeVehicle(dt);
  if (G.state === 'title' || G.state === 'credits' || G.state === 'models') {
    orbit += dt * 0.15;
    vehicle.updateMatrixWorld(true);
    camera.position.set(Math.sin(orbit) * 11, 4.2, Math.cos(orbit) * 11); vehicle.localToWorld(camera.position);
    camera.lookAt(_v1.set(0, 1.8, 0).applyMatrix4(vehicle.matrixWorld));
    tSwivel.rotation.y = Math.sin(orbit * 3) * 0.6; tBody.rotation.x = -0.15;
  } else { placeCamera(dt); aimTurret(dt); }
  if (DEBUG && window.__camO) { const o = window.__camO; camera.position.set(o.p.x, o.p.y, o.p.z); camera.lookAt(o.l.x, o.l.y, o.l.z); }
  if (DEBUG && window.__tick && G.state === 'title') for (const e of enemies) if (!e.dead) { e.update(dt); }
  skyGroup.position.copy(camera.position);

  windTime.value += rawDt;
  flashI *= Math.exp(-rawDt * 10); flashLight.intensity = flashI;
  updateBlasts(dt); updateBolts(dt); updateMortars(dt); updateRockets(dt); updateBeams(dt); if (G.state === 'play') updateBurn(dt); if (LV.snow) updateWinter(dt); if (LV.swamp) updateSwamp(dt); if (LV.coast) updateLevel5(dt); if (window.__vw && window.__vw.w.userData.mixer) window.__vw.w.userData.mixer.update(dt); if (enemyShadows) updateEnemyShadows(); fx.update(dt); smoke.update(dt); updateTracers(dt); updateDebris(dt);
  shake = Math.max(0, shake - dt * 1.5); hurtFlash = Math.max(0, hurtFlash - dt * 2); shieldFlash = Math.max(0, shieldFlash - dt * 3);

  renderer.render(scene, camera);
  drawHUD(dt, fps);
  const clicked = consumeClick();
  if (clicked) {
    sfx.ui();
    if (clicked === 'start') { if (camp && camp.level === LEVEL) startRun(); else goLevel({ level: 1, score: 0, cont: CONTINUES }); }
    else if (clicked === 'newgame') goLevel({ level: 1, score: 0, cont: CONTINUES });
    else if (clicked === 'continue' && G.state === 'continue' && camp && camp.cont > 0) { camp.cont--; saveCamp(camp); startRun(); }
    else if (clicked === 'giveup' && G.state === 'continue') { G.state = 'results'; G.endT = 1.6; saveCamp(null); }
    else if (!ADMIN && clicked === 'next') goLevel({ level: LEVEL + 1, score: G.score, cont: CONTINUES });
    else if (!ADMIN && clicked === 'title') { if (!G.won || !LEVELS[LEVEL + 1]) saveCamp(null); location.href = campURL(); }
    else if (/^lvl[1-5]$/.test(clicked || '') && ADMIN) { const n = +clicked.slice(3); if (n === LEVEL) startRun(); else gotoLevel(n); }
    else if (clicked === 'again') startRun();
    else if (clicked === 'next') gotoLevel(LEVEL + 1);
    else if (clicked === 'credits') G.state = 'credits';
    else if (clicked === 'models' && ADMIN) openModels();
    else if (clicked === 'back' || clicked === 'title') { if (clicked === 'title') music.play('title'); resetRun(); G.state = 'title'; }
    else if (clicked === 'party') G.party = !G.party;
  }
  if (G.state === 'results' && G.won && !G.bonusDone && G.endT > 1.5) { G.bonusDone = true; G.score += Math.round(G.health * 20); }
  if (G.state === 'continue') { G.contT -= Math.min(rawDt, 0.1); if (G.contT <= 0) { G.state = 'results'; G.endT = 1.6; saveCamp(null); } }
  if (G.state === 'play') G.bonusDone = false;
}

function openModels() {
  G.state = 'models';
  CUSTOM.openUI({ base: BASE, builtin: BUILTIN, records: customRecs, onClose: (dirty) => { if (dirty) location.reload(); else G.state = 'title'; } });
}
(async function boot() {
  resize();
  requestAnimationFrame(frame);
  await loadTextures();
  await loadModels(p => loadP = p);
  buildWeaponModels();
  await applyCustom();
  rigBipeds(); prepWheels(); covenantFinish(); rimModels();
  buildWorld(); buildVehicle(); mountWeapons(); makeEnemyShadows(); resetRun();
  G.state = 'title'; resize(); music.play('title'); music.unlock();   // plays at once if the browser allows autoplay
  let go = false; try { go = !!sessionStorage.getItem(CAMP_KEY + '_go'); } catch (e) {}
  if (ADMIN ? Q.get('autostart') : (camp && go)) startRun();
  try { sessionStorage.removeItem(CAMP_KEY + '_go'); } catch (e) {}
  if (DEBUG) debugHooks();
})();

// test hooks for automated screenshots (?debug=1)
function debugHooks() {
  window.__hog = { ARENA, openModels, view: (name, sz, rx) => { if (sz) FROST_FIT[name].size = sz; if (rx !== undefined) FROST_FIT[name].yaw = rx; const w = creature(name); const g = new THREE.Group(); g.add(w); g.position.copy(vehicle.position).addScaledVector(vehicleFwd, 14 + (sz || 0) * 0.8); scene.add(g); g.lookAt(vehicle.position.x, g.position.y, vehicle.position.z); window.__vw = { g, w }; const u = w.userData; return Object.keys(u.act); }, L5: { storm, strike, tidefather, tentacle, sighting, trace }, L4: { swamp, swampler, serpent, wormView: (rx) => { WORM_RX = rx; const r = wormRig(); const g = new THREE.Group(); g.add(r.root); g.position.copy(vehicle.position).addScaledVector(vehicleFwd, 34); g.position.y += 0; scene.add(g); if (r.act.Swim) r.act.Swim.play(); window.__wv = { g, r }; return Object.keys(r.act); }, leaper, flarePod, launchFlare, camo },  CUSTOMIZED, W: { setWeapon, crate, WPN: () => WPN, rockets, camera }, L3: { engine, crawler, crawlers, sled, drone, fturret, iceLedge, iceTrap, crack, lakeCracks, blizzard, winter, LAKE: () => LAKE, lakeS: () => LAKE ? [LAKE[0] * STEP, LAKE[1] * STEP] : null }, wheels: (a, st) => { wheelSpin = a; steer = st; for (const w of wheels) { w.rotation.z = a; w.rotation.y = w.userData.wheel === 'front' ? st : 0; } return wheels.length; }, music_els: () => music.els(), M, fps: () => fps, sfx, cam: () => JSON.stringify({loc: vehicle.worldToLocal(camera.position.clone()).toArray().map(v=>+v.toFixed(2)), q: vehicle.quaternion.toArray().map(v=>+v.toFixed(2)), y: vehicle.position.y.toFixed(1)}), dbg: () => { const r = aimRay(); const h = trace(r); const t = r.at(Math.min(h.d,150), V()); turret.worldToLocal(t); return JSON.stringify({d:h.d.toFixed(1), g:!!h.ground, t:t.toArray().map(v=>v.toFixed(1)), yaw:tSwivel.rotation.y.toFixed(2), pit:tBody.rotation.x.toFixed(2)}); }, aimErr: () => { const a = tMuzzle.getWorldPosition(V()), b = tBarrel.getWorldPosition(V()); const d = a.clone().sub(b).normalize(); const r = aimRay(); const tgt = r.at(Math.min(150, trace(r).d), V()); return THREE.MathUtils.radToDeg(d.angleTo(tgt.sub(b).normalize())).toFixed(1); }, scr: (e) => { const v = e.obj.localToWorld(e.hits[0].o.clone()).project(camera); return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H]; }, G, input, startRun, enemies, setS: s => { G.s = s; events = events.filter(e => e.s > s); }, spawn: { jackal, wraith, shieldGrunt, cell, cells, grunt, ghost, banshee, shade, watchtower, elite, groundPoint } };
}
