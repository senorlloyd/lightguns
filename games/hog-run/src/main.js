// HOG RUN — fan-made Warthog turret-gunner light gun rail shooter (personal, non-commercial use)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- settings
const Q = new URLSearchParams(location.search);
const RENDER_SCALE = parseFloat(Q.get('scale') || '0.75'); // 0.75 for the Pi, ?scale=1 on a PC
const SHOW_FPS = Q.get('fps') !== '0';
const DEBUG = Q.get('debug');
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
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const HORIZON = new THREE.Color(0xa3acbd);
scene.fog = new THREE.Fog(HORIZON, 110, 620);
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
scene.add(new THREE.HemisphereLight(0xd6ecff, 0x56603e, 1.25));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
sun.position.set(-210, 310, -150); // matches the sun in the sky photo
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
const baseH = (x, z) => (fbm(x * 0.0035 + 11, z * 0.0035 - 7) - 0.5) * 80 + (fbm(x * 0.018, z * 0.018, 3) - 0.5) * 9;

// ---------------------------------------------------------------- the track
const STEP = 2;
const ctrl = [];
for (let i = 0; i < 19; i++) ctrl.push(V(Math.sin(i * 0.52) * 110 + Math.sin(i * 1.27) * 45, 0, i * 68));
const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
const TRACK_LEN = curve.getLength();
const NS = Math.floor(TRACK_LEN / STEP);
const PP = curve.getSpacedPoints(NS);       // samples every ~2 m
let roadH = PP.map(p => baseH(p.x, p.z));
for (let pass = 0; pass < 6; pass++) {       // smooth the road profile
  roadH = roadH.map((_, i) => { let s = 0, n = 0; for (let k = -18; k <= 18; k++) { const j = clamp(i + k, 0, NS); s += roadH[j]; n++; } return s / n; });
}
PP.forEach((p, i) => p.y = roadH[i]);
function nearest(x, z) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i <= NS; i += 6) { const dx = PP[i].x - x, dz = PP[i].z - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = i; } }
  for (let i = Math.max(0, bi - 6); i <= Math.min(NS, bi + 6); i++) { const dx = PP[i].x - x, dz = PP[i].z - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = i; } }
  return [bi, Math.sqrt(bd)];
}
function groundH(x, z) {
  const [i, d] = nearest(x, z);
  const t = smooth(6, 42, d);
  return lerp(roadH[i], baseH(x, z), t) + Math.min(28, Math.max(0, d - 55) * 0.16);
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
  TEX.sky.wrapS = THREE.ClampToEdgeWrapping; TEX.sky.anisotropy = 1;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(7000, 48, 24), new THREE.MeshBasicMaterial({ map: TEX.sky, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false }));
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
  ring.renderOrder = -9; skyGroup.add(ring);

  // distant mountains (unfogged haze silhouettes)
  const mGeo = new THREE.ConeGeometry(1, 1, 5, 1); mGeo.translate(0, 0.5, 0);
  const mMat = new THREE.MeshBasicMaterial({ color: 0x7f8ea6, fog: false });
  const mtn = new THREE.InstancedMesh(mGeo, mMat, 60); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 + rand(-0.04, 0.04), r = rand(1500, 1900);
    m4.compose(V(Math.cos(a) * r, -120, Math.sin(a) * r), q.setFromAxisAngle(UP, rand(0, 6)), V(rand(260, 520), rand(180, 420), rand(260, 520)));
    mtn.setMatrixAt(i, m4); mtn.setColorAt(i, new THREE.Color(0x7f8ea6).offsetHSL(0, 0, rand(-0.06, 0.03)));
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
    blend[i * 2] = smooth(0.88, 0.7, nrm.getY(i));          // rock on steep slopes
    blend[i * 2 + 1] = smooth(13, 5, dist[i]) * 0.9;          // gravel near the road
  }
  tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tg.setAttribute('blend', new THREE.BufferAttribute(blend, 2));
  const tmat = new THREE.MeshLambertMaterial({ vertexColors: true });
  tmat.onBeforeCompile = sh => {
    sh.uniforms.grassMap = { value: TEX.grass }; sh.uniforms.rockMap = { value: TEX.rock }; sh.uniforms.roadMap = { value: TEX.road };
    sh.vertexShader = 'attribute vec2 blend; varying vec2 vBlend; varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vBlend = blend; vWP = position;');
    sh.fragmentShader = 'uniform sampler2D grassMap, rockMap, roadMap; varying vec2 vBlend; varying vec3 vWP;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      vec3 c = texture2D(grassMap, vWP.xz * 0.12).rgb * vec3(0.78, 1.08, 0.62);   // grass photo, pushed greener
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
    g.drawImage(TEX.road_img, 0, 0, s, s);
    g.fillStyle = 'rgba(50,38,26,.32)'; g.fillRect(s * 0.2, 0, s * 0.13, s); g.fillRect(s * 0.67, 0, s * 0.13, s);
    const gr = g.createLinearGradient(0, 0, s, 0); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.12, 'rgba(0,0,0,0)'); gr.addColorStop(0.88, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = gr; g.fillRect(0, 0, s, s);
  });
  roadTex.repeat.set(1, 1);
  const road = new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ map: roadTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  scene.add(road);

  // trees + rocks (instanced: one draw call each)
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
  const shadeVerts = (g, base, top, y0, y1, under = 0.55) => {   // bottom/inside darker, tips lighter, undersides darkest
    g = g.toNonIndexed(); g.computeVertexNormals();
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
  const blobParts = []; for (let i = 0; i < 5; i++) { const ig = new THREE.IcosahedronGeometry(rand(1.6, 2.3), 0); jag(ig, 0.25); ig.translate(rand(-1.3, 1.3), rand(4.2, 6.4), rand(-1.3, 1.3)); blobParts.push(ig); }
  const blobG = shadeVerts(mergeGeo(blobParts), 0x2f4f1e, 0x9cc46a, 3, 8.5, 0.7);
  const trunkG = shadeVerts(new THREE.CylinderGeometry(0.22, 0.42, 4.6, 6, 1, true).translate(0, 2.3, 0), 0x3b2a1d, 0x6a5038, 0, 4.6, 1);
  const species = [
    { g: pineG, w: 0.5, s: [0.8, 1.45] }, { g: firG, w: 0.3, s: [0.8, 1.25] }, { g: blobG, w: 0.2, s: [0.75, 1.2] },
  ];
  const N_TREES = 850;
  const sp = species.map(o => ({ ...o, mesh: new THREE.InstancedMesh(o.g, swayMat({}), N_TREES), n: 0 }));
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
    shieldHit() { nz(0.18, 4200, 1500, 0.35, 'bandpass', 3); tone(0.12, 520, 300, 0.15, 'square'); },
    hurt() { nz(0.25, 800, 120, 0.5); },
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
  const files = { title: 'title', run: 'level1', boss: 'boss', win: 'victory', lose: 'gameover' };
  const els = {}, fades = []; let cur = null, want = null, unlocked = false;
  const el = k => { if (!els[k]) { const a = new Audio('music/' + files[k] + '.mp3'); a.loop = !(k === 'win' || k === 'lose'); a.preload = 'auto'; a.volume = 0; els[k] = a; } return els[k]; };
  function start(k) {
    if (cur === k) return; const prev = cur; cur = k;
    const a = el(k); try { a.currentTime = 0; } catch (e) {}
    const p = a.play(); if (p) p.catch(() => { unlocked = false; want = k; cur = prev; });
    fades.push({ a, to: MUSIC_VOL, stop: false });
    if (prev && els[prev]) fades.push({ a: els[prev], to: 0, stop: true });
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
  const names = Object.keys(window.HOG_ASSETS); let done = 0;
  for (const n of names) {
    const g = await loader.parseAsync(b64ToBuf(window.HOG_ASSETS[n]), '');
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
const mix2 = (a, b, t) => t <= 0 ? [[a, 1]] : t >= 1 ? [[b, 1]] : [[a, 1 - t], [b, t]];
function rigBipeds() {
  // Grunt (model units: 0.86 tall, faces +Z)
  M.grunt = autoRig(M.grunt, [
    ['root', null, [0, 0, 0]], ['hips', 'root', [0, 0.26, 0]], ['spine', 'hips', [0, 0.28, 0]], ['head', 'spine', [0, 0.66, 0.05]],
    ['armL', 'spine', [-0.22, 0.58, 0]], ['armR', 'spine', [0.22, 0.58, 0]], ['legL', 'hips', [-0.13, 0.25, 0]], ['legR', 'hips', [0.13, 0.25, 0]],
  ], (v) => {
    const ax = Math.abs(v.x), side = v.x < 0 ? 'L' : 'R';
    if (v.y < 0.3 && ax < 0.31) return mix2('leg' + side, 'spine', smooth(0.2, 0.3, v.y));
    if (ax > 0.21) return mix2('spine', 'arm' + side, smooth(0.21, 0.27, ax));
    if (v.y > 0.64 && v.z > -0.06) return mix2('spine', 'head', smooth(0.64, 0.7, v.y));
    return [['spine', 1]];
  });
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
// ---- battle wear: Poly Haven 'green_metal_rust', divided by its own average color so only the
// rust pits, drip streaks and scratches remain; projected from three sides onto any model.
const rustAvg = new THREE.Vector3(1, 1, 1);
function initWear() {
  const im = TEX.rust_img, c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.drawImage(im, 0, 0, 64, 64);
  const d = g.getImageData(0, 0, 64, 64).data; let r = 0, gg = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4, lin = v => Math.pow(v / n / 255, 2.2);   // texture is sampled in linear space
  rustAvg.set(lin(r), lin(gg), lin(b));
}
function addWear(m, amt, scale) {
  if (m.userData.worn) return; m.userData.worn = true;   // materials are shared between meshes: wear once
  const prev = m.onBeforeCompile, prevKey = prev ? prev.toString() : '';
  m.onBeforeCompile = (sh, rd) => {
    if (prev) prev(sh, rd);
    sh.uniforms.rustTex = { value: TEX.rust }; sh.uniforms.rustAvg = { value: rustAvg }; sh.uniforms.wearAmt = { value: amt }; sh.uniforms.wearScale = { value: scale };
    if (!sh.vertexShader.includes('varying vec3 vOP;')) sh.vertexShader = 'varying vec3 vOP; varying vec3 vON;\n' + sh.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n vOP = transformed * vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz)); vON = objectNormal;   // after skinning, in world meters, whatever units the model uses');
    sh.fragmentShader = (sh.fragmentShader.includes('varying vec3 vOP;') ? '' : 'varying vec3 vOP; varying vec3 vON;\n') + 'uniform sampler2D rustTex; uniform vec3 rustAvg; uniform float wearAmt, wearScale;\n' +
      sh.fragmentShader.replace('#include <roughnessmap_fragment>', `
        vec3 wb = pow(abs(normalize(vON)), vec3(4.0)); wb /= (wb.x + wb.y + wb.z);
        vec3 wt = texture2D(rustTex, vOP.zy * wearScale).rgb * wb.x + texture2D(rustTex, vOP.xz * wearScale).rgb * wb.y + texture2D(rustTex, vOP.xy * wearScale).rgb * wb.z;
        vec3 wr = clamp(wt / rustAvg, 0.0, 2.4);
        float dev = clamp(length(wr - 1.0) * 0.8, 0.0, 1.0);
        diffuseColor.rgb *= mix(vec3(1.0), wr, wearAmt);
        #include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + dev * 0.55 * wearAmt, 0.0, 1.0);
        #ifdef USE_METALNESSMAP
        #endif`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor *= 1.0 - dev * 0.6 * wearAmt;');
  };
  m.customProgramCacheKey = () => 'wear' + amt + '|' + prevKey;
}
function wearModels() {
  initWear();
  const apply = (root, amt, scale, test) => root.traverse(n => { if (!n.isMesh) return; const mats = Array.isArray(n.material) ? n.material : [n.material];
    for (const m of mats) if (m.isMeshStandardMaterial && !m.transparent && (!test || test(m))) addWear(m, amt, scale); });
  apply(M.warthog, 0.75, 0.55);                                        // scales are per meter
  apply(M.turret, 0.85, 1.1);
  for (const k of ['ghost', 'banshee', 'shade', 'watchtower']) {
    apply(M[k], 0.9, 0.6, m => /metl_|rubr_/.test(m.name));            // bare metal: full wear
    apply(M[k], 0.4, 0.6, m => /COV_/.test(m.name));                   // alien alloy: light scuffs
  }
}
function covenantFinish() {
  covTex = makeCovTex();
  for (const k of ['shade', 'ghost', 'banshee', 'watchtower']) {
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
    if (!quiet) sfx.plasma();
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
      const A = _v2.copy(vehicle.position).addScaledVector(vehicleFwd, 4.6).addScaledVector(trackSide(G.s, _v3), this.atkSide);
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
      if (this.mode === 'slash') {
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
    if (this.mode === 'windup' && Math.random() < 0.6) fx.spawn(this.obj.getObjectByName('swordTip').getWorldPosition(_v1), V(rand(-1, 1), rand(0, 2), rand(-1, 1)), 0.3, 0.8, 0.1, C(0xff5a8a), 1, 1);
  };
  e.die = function () { burst(_v1.copy(this.pos).add(V(0, 1.5, 0)), 40, 8, 1, 1, 3, COL.blue, 1, 2); sfx.boom(1.6); sfx.eliteDie(); win(); };
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
      e.damage(999, 0, e.pos.clone());
    }
    for (const bo of bolts) if (bo.p.distanceTo(b.p) < CELL_R) bo.life = 0;
  }
  for (const e of enemies) if (e.kind === 'cell' && e.alive && e.blastT !== undefined) { e.blastT -= dt; if (e.blastT <= 0) e.damage(99, 0, e.pos.clone()); }
}

// ---------------------------------------------------------------- spawn script (by distance along the track)
const L = TRACK_LEN;
const ARENA = L - 70;
function script() {
  const gS = (sOff, side, n, spread = 7) => { for (let i = 0; i < n; i++) grunt(groundPoint(G.s + sOff + rand(-spread, spread), side + rand(-spread, spread) * 0.8)); };
  const A = ARENA / 1000; // encounters are laid out on a 0..1000 scale, stretched to the track
  return [
    { s: 25, f: () => say('HANG ON, GUNNER!') },
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
    { s: 960, f: () => { say('BLADEMASTER'); music.play('boss'); elite(groundPoint(ARENA + 24, 0)); cells(ARENA - G.s + 20, -11, 1); cells(ARENA - G.s + 28, 12, 1); } },
  ].map(ev => ({ s: ev.s * A, f: ev.f }));
}
let events = [];
function say(t, d = 2) { G.msg = t; G.msgT = d; }

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
  if (G.health <= 0 && G.state === 'play') { G.health = 0; G.won = false; G.state = 'results'; G.endT = 0; say('GUNNER DOWN', 3); music.play('lose'); }
}
function win() { G.won = true; music.play('win'); setTimeout(() => { if (G.state === 'play') { G.state = 'results'; G.endT = 0; } }, 2500); say('BLADEMASTER DOWN!', 3); }

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
  if (hit.e) { G.hits++; hit.e.damage(1, hit.idx, end); burst(end, 4, 7, 0.25, 0.5, 0.1, hit.e.shieldHp > 0 ? COL.blue : COL.spark, 1, 3); }
  else if (hit.bolt) { hit.bolt.life = 0; G.score += 50; popups.push({ p: end.clone(), t: 0, text: '+50', col: '#8fd0ff' }); burst(end, 10, 6, 0.3, 1, 0.2, hit.bolt.color, 1, 3); sfx.boltZip(); }
  else if (hit.ground) { burst(end, 3, 3, 0.5, 0.8, 2.2, COL.dust, 0.7, 2, 3, smoke); if (Math.random() < 0.4) burst(end, 3, 5, 0.2, 0.3, 0.1, COL.spark, 1, 2, 10); }
  if (G.heat >= 1) { G.heat = 1; G.overheated = true; sfx.overheat(); say('OVERHEAT', 1); sfx.taunt(0.4, G.time); }
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
  slashFx.length = 0; for (const e of enemies) scene.remove(e.obj); enemies.length = 0; bolts.length = 0; popups.length = 0; pendingBlasts.length = 0; cellHinted = false;
  Object.assign(G, { s: 0, speed: 0, score: 0, kills: 0, shots: 0, hits: 0, time: 0, shield: SHIELD_MAX, health: HEALTH_MAX, sinceHit: 99, heat: 0, overheated: false, spin: 0, combo: 0, comboT: 0, boss: null, won: false, msg: '', msgT: 0 });
  events = script();
}
function startRun() { resetRun(); sfx.resetTaunts(); G.state = 'play'; music.play('run'); G.snap = true; G.camInit = false; sfx.ui(); }

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
  _v3.copy(CAM_OFF); vehicle.localToWorld(_v3); _v3.y += vBody.position.y * 0.4;
  if (G.camInit) camera.position.lerp(_v3, Math.min(1, dt * 10)); else { camera.position.copy(_v3); G.camInit = true; }
  // look ahead, drifting slightly toward where the gunner aims
  _v1.set((0.5 - input.x) * 9, 0.2 - (input.y - 0.5) * 5, 30); vehicle.localToWorld(_v1);
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
}

function updatePlay(dt) {
  G.time += dt;
  // speed: ease off when lots of enemies are up, stop for the boss
  const alive = enemies.filter(e => e.alive && e.kind !== 'watchtower' && e.kind !== 'cell').length;
  let target = RUN_SPEED * (alive > 6 ? 0.65 : alive > 3 ? 0.82 : 1);
  if (G.s > ARENA - 25) target = 0;
  G.speed = lerp(G.speed, target, dt * (target === 0 ? 0.8 : 1.5));
  G.s = Math.min(ARENA, G.s + G.speed * dt);
  sfx.engine(0.25 + 0.75 * G.speed / RUN_SPEED);
  while (events.length && G.s >= events[0].s) events.shift().f();

  // gun
  const canFire = input.down && !input.off && !G.overheated;
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
    if (e.alive && e.kind !== 'banshee' && _v1.copy(e.pos).sub(vehicle.position).dot(vehicleFwd) < -10) { e.alive = false; e.remove(); }
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
      const k = rr / 120; hx.fillStyle = e.kind === 'elite' ? '#ffd24a' : e.kind === 'cell' ? '#4fe8ff' : '#ff4a3a';
      hx.beginPath(); hx.arc(rx + s * k, ry - f * k, (e.kind === 'grunt' || e.kind === 'cell' ? 3.5 : 6) * u, 0, 7); hx.fill();
    }
    hx.fillStyle = '#bfe8ff'; hx.beginPath(); hx.moveTo(rx, ry - 7 * u); hx.lineTo(rx - 5 * u, ry + 5 * u); hx.lineTo(rx + 5 * u, ry + 5 * u); hx.fill();
    // boss bar
    if (G.boss && G.boss.alive) {
      const w2 = 600 * u, x2 = W / 2 - w2 / 2, y2 = H - 70 * u, b = G.boss;
      hx.fillStyle = 'rgba(0,0,0,.5)'; hx.fillRect(x2 - 4, y2 - 4, w2 + 8, 26 * u);
      hx.fillStyle = '#c0392b'; hx.fillRect(x2, y2, w2 * b.hp / b.maxHp, 18 * u);
      hx.fillStyle = 'rgba(110,200,255,.85)'; hx.fillRect(x2, y2, w2 * Math.max(0, b.shieldHp) / b.shieldMax, 6 * u);
      hx.font = font(20 * u, 800); hx.textAlign = 'center'; hx.textBaseline = 'bottom'; hx.fillStyle = '#ffd24a'; hx.fillText('BLADEMASTER', W / 2, y2 - 8 * u);
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
    button('start', 'START', W / 2 - 170 * u, H * 0.55, 340 * u, 80 * u);
    button('party', `PARTY GRUNTS: ${G.party ? 'ON' : 'OFF'}`, W / 2 - 170 * u, H * 0.55 + 100 * u, 340 * u, 60 * u, G.party ? '#ffd24a' : null);
    button('credits', 'CREDITS', W / 2 - 170 * u, H * 0.55 + 180 * u, 340 * u, 60 * u);
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
      ['All models from sketchfab.com', '#9fc4dd'],
      ['Sky & ground textures: Poly Haven (polyhaven.com) — CC0', '#fff'],
      ['Music (Pixabay): divineawakeningfrequency, AtlasAudio, luis_humanoide, sergepavkinmusic, kulakovka', '#fff'],
      ['', ''],
      ['A non-commercial fan game for personal use. Halo and all related', '#9fc4dd'],
      ['names are trademarks of Microsoft. Not affiliated with or endorsed by Microsoft.', '#9fc4dd'],
    ];
    hx.textAlign = 'center'; lines.forEach(([t, c], i) => { hx.font = font(i === 0 ? 28 * u : 21 * u, i === 0 ? 900 : 600); hx.fillStyle = c; hx.fillText(t, W / 2, H * 0.24 + i * 40 * u); });
    button('back', 'BACK', W / 2 - 130 * u, H * 0.8, 260 * u, 70 * u);
  }
  if (G.state === 'results' && G.endT > 1.5) {
    hx.fillStyle = 'rgba(0,10,20,.6)'; hx.fillRect(0, 0, W, H);
    title(G.won ? 'RUN COMPLETE' : 'GUNNER DOWN', H * 0.18, 90 * u, G.won ? '#bfe8ff' : '#ff8a7a');
    const acc = G.shots ? Math.round(100 * G.hits / G.shots) : 0;
    const rows = [['SCORE', G.score.toLocaleString()], ['KILLS', G.kills], ['ACCURACY', acc + '%'], ['TIME', `${Math.floor(G.time / 60)}:${String(Math.floor(G.time % 60)).padStart(2, '0')}`]];
    if (G.won) rows.push(['HEALTH BONUS', '+' + Math.round(G.health * 20)]);
    rows.forEach(([k, v], i) => { hx.font = font(32 * u, 800); hx.textAlign = 'right'; hx.fillStyle = '#9fc4dd'; hx.fillText(k, W / 2 - 20 * u, H * 0.33 + i * 52 * u); hx.textAlign = 'left'; hx.fillStyle = '#fff'; hx.fillText(String(v), W / 2 + 20 * u, H * 0.33 + i * 52 * u); });
    button('again', 'PLAY AGAIN', W / 2 - 360 * u, H * 0.78, 340 * u, 76 * u);
    button('title', 'TITLE', W / 2 + 20 * u, H * 0.78, 340 * u, 76 * u);
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
    if (G.state === 'results') { G.endT += dt; G.speed = lerp(G.speed, 0, dt); G.spin = Math.max(0, G.spin - dt); sfx.gunState(false, false); sfx.engine(G.speed / RUN_SPEED * 0.8); sfx.ghostHum(0); for (const e of enemies) if (!e.dead) e.update(dt); for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead) enemies.splice(i, 1); }
    else { sfx.engine(0.15); sfx.gunState(false, false); sfx.ghostHum(0); }
  }
  placeVehicle(dt);
  if (G.state === 'title' || G.state === 'credits') {
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
  updateBlasts(dt); updateBolts(dt); fx.update(dt); smoke.update(dt); updateTracers(dt); updateDebris(dt);
  shake = Math.max(0, shake - dt * 1.5); hurtFlash = Math.max(0, hurtFlash - dt * 2); shieldFlash = Math.max(0, shieldFlash - dt * 3);

  renderer.render(scene, camera);
  drawHUD(dt, fps);
  const clicked = consumeClick();
  if (clicked) {
    sfx.ui();
    if (clicked === 'start' || clicked === 'again') startRun();
    else if (clicked === 'credits') G.state = 'credits';
    else if (clicked === 'back' || clicked === 'title') { if (clicked === 'title') music.play('title'); resetRun(); G.state = 'title'; }
    else if (clicked === 'party') G.party = !G.party;
  }
  if (G.state === 'results' && G.won && !G.bonusDone && G.endT > 1.5) { G.bonusDone = true; G.score += Math.round(G.health * 20); }
  if (G.state === 'play') G.bonusDone = false;
}

(async function boot() {
  resize();
  requestAnimationFrame(frame);
  await loadTextures();
  await loadModels(p => loadP = p);
  rigBipeds(); prepWheels(); covenantFinish(); wearModels();
  buildWorld(); buildVehicle(); resetRun();
  G.state = 'title'; resize(); music.play('title'); music.unlock();   // plays at once if the browser allows autoplay
  if (DEBUG) debugHooks();
})();

// test hooks for automated screenshots (?debug=1)
function debugHooks() {
  window.__hog = { wheels: (a, st) => { wheelSpin = a; steer = st; for (const w of wheels) { w.rotation.z = a; w.rotation.y = w.userData.wheel === 'front' ? st : 0; } return wheels.length; }, music_els: () => music.els(), M, fps: () => fps, sfx, cam: () => JSON.stringify({loc: vehicle.worldToLocal(camera.position.clone()).toArray().map(v=>+v.toFixed(2)), q: vehicle.quaternion.toArray().map(v=>+v.toFixed(2)), y: vehicle.position.y.toFixed(1)}), dbg: () => { const r = aimRay(); const h = trace(r); const t = r.at(Math.min(h.d,150), V()); turret.worldToLocal(t); return JSON.stringify({d:h.d.toFixed(1), g:!!h.ground, t:t.toArray().map(v=>v.toFixed(1)), yaw:tSwivel.rotation.y.toFixed(2), pit:tBody.rotation.x.toFixed(2)}); }, aimErr: () => { const a = tMuzzle.getWorldPosition(V()), b = tBarrel.getWorldPosition(V()); const d = a.clone().sub(b).normalize(); const r = aimRay(); const tgt = r.at(Math.min(150, trace(r).d), V()); return THREE.MathUtils.radToDeg(d.angleTo(tgt.sub(b).normalize())).toFixed(1); }, scr: (e) => { const v = e.obj.localToWorld(e.hits[0].o.clone()).project(camera); return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H]; }, G, input, startRun, enemies, setS: s => { G.s = s; events = events.filter(e => e.s > s); }, spawn: { cell, cells, grunt, ghost, banshee, shade, watchtower, elite, groundPoint } };
}
