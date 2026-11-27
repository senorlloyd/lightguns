// ---------------------------------------------------------------- custom model slots
// Swap any enemy model for a .glb of your choice from the MODELS screen on the title menu.
// Files are kept in the browser's IndexedDB (nothing is uploaded anywhere), and each one is
// auto-fitted to the slot: rotated, scaled to the built-in model's size, centred and grounded.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const SLOTS = [
  { id: 'grunt', label: 'GRUNT', kind: 'biped', note: 'Small biped. Auto-rigged for walking.' },
  { id: 'elite', label: 'LEVEL 1 BOSS', kind: 'biped', note: 'Tall biped. Auto-rigged; the left hand swings the sword attack.' },
  { id: 'jackal', label: 'JACKAL', kind: 'biped', note: 'Shield biped. Uses its own skeleton if it has a Mixamo rig, otherwise auto-rigged.' },
  { id: 'ghost', label: 'GHOST', kind: 'vehicle', note: 'Hover bike. Front should point along the arrow.' },
  { id: 'banshee', label: 'BANSHEE', kind: 'vehicle', note: 'Flyer. Front should point along the arrow.' },
  { id: 'shade', label: 'SHADE TURRET', kind: 'prop', note: 'Stationary turret.' },
  { id: 'watchtower', label: 'WATCHTOWER', kind: 'prop', note: 'Tower; two gunners stand on top.' },
  { id: 'turret_gauss', label: 'GAUSS TURRET', kind: 'vehicle', note: 'Warthog turret. Barrel should point along the arrow; it aims as one piece.' },
  { id: 'turret_rockets', label: 'ROCKET TURRET', kind: 'vehicle', note: 'Warthog turret. Barrel should point along the arrow; it aims as one piece.' },
  { id: 'turret_flame', label: 'FLAME TURRET', kind: 'vehicle', note: 'Warthog turret. Nozzle should point along the arrow; it aims as one piece.' },
];
// sizes used when a slot has no built-in model to measure (model units, before the game's own scaling)
const FALLBACK_H = { jackal: 1.4 };

// ---------------------------------------------------------------- storage (IndexedDB)
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('hogrun', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('models');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction('models', mode); const s = t.objectStore('models'); const out = fn(s); t.oncomplete = () => res(out.result); t.onerror = () => rej(t.error); });
}
export async function loadAll() {
  try {
    const d = await db();
    return await new Promise((res) => {
      const out = {}; const t = d.transaction('models', 'readonly'); const c = t.objectStore('models').openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } else res(out); };
      c.onerror = () => res({});
    });
  } catch (e) { console.warn('custom models unavailable', e); return {}; }
}
export const saveSlot = (id, rec) => tx('readwrite', s => s.put(rec, id));
export const clearSlot = (id) => tx('readwrite', s => s.delete(id));

// ---------------------------------------------------------------- fitting
const loader = new GLTFLoader();
export async function parse(buf) { const g = await loader.parseAsync(buf.slice(0), ''); return g; }

// Freeze skinned meshes in their rest pose so they can be re-rigged like any static model.
function bakeSkins(root) {
  root.updateMatrixWorld(true);
  const list = []; root.traverse(o => { if (o.isSkinnedMesh) list.push(o); });
  for (const sm of list) {
    sm.skeleton.pose(); sm.updateMatrixWorld(true);
    const g = sm.geometry.clone(), P = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); sm.applyBoneTransform(i, v); P.setXYZ(i, v.x, v.y, v.z); }
    g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight'); g.computeVertexNormals();   // positions stay in the mesh's own space
    const m = new THREE.Mesh(g, sm.material); m.name = sm.name;
    m.position.copy(sm.position); m.quaternion.copy(sm.quaternion); m.scale.copy(sm.scale);
    sm.parent.add(m); sm.parent.remove(sm);
  }
  const bones = []; root.traverse(o => { if (o.isBone) bones.push(o); });
  return bones.length;
}

export function hasMixamo(root) { let n = 0; root.traverse(o => { if (o.isBone && /(LeftUpLeg|RightUpLeg|Hips)$/.test(o.name.replace(/_\d+$/, ''))) n++; }); return n >= 3; }

export function boxOf(obj) { obj.updateMatrixWorld(true); return new THREE.Box3().setFromObject(obj, true); }

// target: the built-in model's box (or null). rec: { rot, tilt, scale }.
// keepSkin: leave skeletons alone (Mixamo jackal); otherwise skinned parts are frozen.
export function fit(scene, slot, target, rec, keepSkin) {
  if (!keepSkin) bakeSkins(scene);
  const inner = new THREE.Group(); inner.add(scene);
  inner.rotation.order = 'YXZ'; inner.rotation.set((rec.tilt || 0) * Math.PI / 2, (rec.rot || 0) * Math.PI / 2, 0);
  const b = boxOf(inner), size = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
  let s = 1, ty = 0, tx = 0, tz = 0;
  if (target) {
    const ts = target.getSize(new THREE.Vector3()), tc = target.getCenter(new THREE.Vector3());
    // bipeds and props match height; vehicles match their longest side
    s = slot.kind === 'vehicle' ? Math.max(ts.x, ts.z) / Math.max(size.x, size.z, 1e-6) : ts.y / Math.max(size.y, 1e-6);
    ty = target.min.y; tx = tc.x; tz = tc.z;
  } else s = (FALLBACK_H[slot.id] || 1) / Math.max(size.y, 1e-6);
  s *= rec.scale || 1;
  const outer = new THREE.Group(); outer.name = 'custom_' + slot.id; outer.userData.custom = true;
  inner.position.set(-c.x, -b.min.y, -c.z);
  const scaler = new THREE.Group(); scaler.scale.setScalar(s); scaler.position.set(tx, ty, tz); scaler.add(inner);
  outer.add(scaler); outer.updateMatrixWorld(true);
  outer.traverse(o => { if (o.isMesh) { o.castShadow = false; if (o.isSkinnedMesh) o.frustumCulled = false; } });
  return outer;
}

// ---------------------------------------------------------------- generic auto-rig joints from the shape itself
// Returns joints (for autoRig) and a vertex classifier, measured from the fitted model's vertices.
export function measureBiped(obj) {
  obj.updateMatrixWorld(true);
  const pts = []; const v = new THREE.Vector3();
  obj.traverse(m => { if (!m.isMesh) return; const P = m.geometry.attributes.position; const step = Math.max(1, Math.floor(P.count / 6000));
    for (let i = 0; i < P.count; i += step) pts.push(v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld).clone()); });
  const b = new THREE.Box3().setFromPoints(pts); const H = b.max.y - b.min.y, y0 = b.min.y;
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  const band = (lo, hi) => pts.filter(p => p.y >= y0 + lo * H && p.y < y0 + hi * H);
  const pct = (arr, q) => { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  // crotch: lowest height where something sits on the centre line
  let crotch = 0.45;
  for (let f = 0.08; f < 0.7; f += 0.02) {
    const bb = band(f, f + 0.02); const legHalf = pct(bb.map(p => Math.abs(p.x - cx)), 0.9) || 0.1 * H;
    if (bb.some(p => Math.abs(p.x - cx) < legHalf * 0.12)) { crotch = f; break; }
  }
  const legBand = band(crotch * 0.3, crotch * 0.8);
  const hipHalf = Math.max(0.05 * H, pct(legBand.map(p => Math.abs(p.x - cx)), 0.92));
  const shY = Math.max(crotch + 0.18, 0.74), shHalf = hipHalf * 1.3;
  const C = (x, y, z = 0) => [cx + x, y0 + y * H, cz + z];
  const joints = [
    ['root', null, [cx, y0, cz]], ['hips', 'root', C(0, crotch)], ['spine', 'hips', C(0, crotch + 0.04)], ['head', 'spine', C(0, 0.84)],
    ['armL', 'spine', C(-shHalf, shY)], ['armR', 'spine', C(shHalf, shY)],
    ['legL', 'hips', C(-hipHalf * 0.5, crotch)], ['legR', 'hips', C(hipHalf * 0.5, crotch)],
    ['shinL', 'legL', C(-hipHalf * 0.55, crotch * 0.52)], ['shinR', 'legR', C(hipHalf * 0.55, crotch * 0.52)],
  ];
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const mix2 = (a, b, t) => t <= 0 ? [[a, 1]] : t >= 1 ? [[b, 1]] : [[a, 1 - t], [b, t]];
  const classify = (p) => {
    const dx = p.x - cx, ax = Math.abs(dx), f = (p.y - y0) / H, side = dx < 0 ? 'L' : 'R';
    if (ax > shHalf * 0.82 && f > crotch + 0.04) return mix2('spine', 'arm' + side, sm(shHalf * 0.82, shHalf * 1.05, ax));
    if (f < crotch + 0.05) {
      const leg = mix2('leg' + side, 'spine', sm(crotch - 0.03, crotch + 0.05, f));
      if (f < crotch * 0.62) return mix2('shin' + side, 'leg' + side, sm(crotch * 0.42, crotch * 0.62, f));
      return leg;
    }
    if (f > 0.8) return mix2('spine', 'head', sm(0.8, 0.86, f));
    return [['spine', 1]];
  };
  // left hand = the arm point farthest from the shoulder
  const shL = new THREE.Vector3(...joints[4][2]); let hand = shL.clone(), best = 0;
  for (const p of pts) if (p.x - cx < -shHalf * 0.9) { const d = p.distanceTo(shL); if (d > best) { best = d; hand = p; } }
  return { joints, classify, H, hand, shL, cx, cz, y0 };
}

// ---------------------------------------------------------------- MODELS screen (DOM overlay with its own preview)
// base: { slotId: Box3 of the built-in model }, builtin: { slotId: Object3D }, records: stored slot records.
export function openUI({ base, builtin, records, onClose }) {
  const css = `#hogModels{position:fixed;inset:0;z-index:50;background:rgba(6,10,18,.94);color:#e8f2ff;font:16px/1.35 system-ui,sans-serif;display:flex;gap:18px;padding:22px;box-sizing:border-box}
#hogModels h2{margin:0 0 10px;font-size:22px;letter-spacing:.08em;color:#8fd0ff}
#hogModels .list{width:300px;display:flex;flex-direction:column;gap:8px;overflow:auto}
#hogModels .slot{padding:10px 12px;border:2px solid #2a3b55;border-radius:8px;cursor:pointer;background:#101a2a}
#hogModels .slot.on{border-color:#ffd24a;background:#1b2536}
#hogModels .slot b{display:block;letter-spacing:.06em}
#hogModels .slot span{font-size:13px;color:#9fb4cc;word-break:break-all}
#hogModels .slot span.c{color:#7dffb0}
#hogModels .main{flex:1;display:flex;flex-direction:column;gap:10px;min-width:0}
#hogModels .view{position:relative;flex:1;min-height:0;border:2px solid #2a3b55;border-radius:8px;overflow:hidden;background:#0c1422}
#hogModels .view canvas{position:static!important;inset:auto!important;width:100%!important;height:100%!important;display:block;transform:none!important}
#hogModels .legend{position:absolute;left:10px;top:8px;font-size:13px;color:#9fb4cc}
#hogModels .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
#hogModels button{font:600 15px system-ui,sans-serif;letter-spacing:.05em;padding:10px 16px;border-radius:8px;border:2px solid #3d5a80;background:#16243a;color:#e8f2ff;cursor:pointer}
#hogModels button:hover{border-color:#8fd0ff}
#hogModels button.gold{border-color:#ffd24a;color:#ffd24a}
#hogModels button:disabled{opacity:.4;cursor:default}
#hogModels .msg{min-height:20px;color:#ffd24a;font-size:14px}
#hogModels .note{color:#9fb4cc;font-size:14px}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const el = document.createElement('div'); el.id = 'hogModels';
  el.innerHTML = `<div class="list"><h2>MODELS</h2></div>
  <div class="main"><div class="view"><div class="legend">Blue outline: built-in size &nbsp;·&nbsp; Yellow arrow: front (the way it faces you)</div></div>
  <div class="note"></div>
  <div class="row"><button data-a="load" class="gold">LOAD .GLB…</button><button data-a="rot">TURN 90°</button><button data-a="tilt">STAND UPRIGHT</button>
  <button data-a="smaller">SMALLER</button><button data-a="bigger">BIGGER</button><button data-a="reset">USE BUILT-IN</button><span style="flex:1"></span><button data-a="done" class="gold">DONE</button></div>
  <div class="msg"></div></div><input type="file" accept=".glb,model/gltf-binary" style="display:none">`;
  document.body.appendChild(el);
  const list = el.querySelector('.list'), view = el.querySelector('.view'), note = el.querySelector('.note'), msg = el.querySelector('.msg'), file = el.querySelector('input');
  let cur = SLOTS[0].id, dirty = false, alive = true, shown = null, buf = null;
  const recs = Object.assign({}, records);

  // preview scene
  const r = new THREE.WebGLRenderer({ antialias: true }); r.setPixelRatio(Math.min(devicePixelRatio, 1.5)); r.outputColorSpace = THREE.SRGBColorSpace; view.appendChild(r.domElement);
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xdfefff, 0x404858, 2.2)); const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(3, 6, 4); sc.add(dl);
  const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 500);
  const grid = new THREE.GridHelper(10, 20, 0x35507a, 0x1e2c44); sc.add(grid);
  const outline = new THREE.Box3Helper(new THREE.Box3(), 0x5fb4ff); sc.add(outline);
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 1, 0xffd24a); sc.add(arrow);
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x5fb4ff, transparent: true, opacity: 0.12, depthWrite: false });

  const label = (id) => { const rc = recs[id]; return rc ? `<span class="c">${rc.name}</span>` : '<span>Built-in</span>'; };
  function drawList() {
    list.querySelectorAll('.slot').forEach(n => n.remove());
    for (const s of SLOTS) { const d = document.createElement('div'); d.className = 'slot' + (s.id === cur ? ' on' : ''); d.innerHTML = `<b>${s.label}</b>${label(s.id)}`; d.onclick = () => { cur = s.id; buf = null; drawList(); show(); }; list.appendChild(d); }
  }
  async function show() {
    const slot = SLOTS.find(s => s.id === cur); note.textContent = slot.note; msg.textContent = '';
    if (shown) { sc.remove(shown); shown = null; }
    const tb = base[cur] || null, rc = recs[cur];
    // built-in silhouette for size comparison
    const parts = new THREE.Group();
    if (builtin[cur]) { const b = builtin[cur].clone(true); b.traverse(o => { if (o.isMesh) o.material = ghostMat; }); parts.add(b); }
    try {
      if (rc) { if (!buf) buf = rc.buf; const g = await parse(buf); parts.add(fit(g.scene, slot, tb, rc, cur === 'jackal' && hasMixamo(g.scene))); }
    } catch (e) { msg.textContent = 'Could not read that file: ' + e.message; }
    if (!alive || cur !== slot.id) return;
    shown = parts; sc.add(parts);
    const bb = boxOf(parts); if (bb.isEmpty()) bb.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2, 1));
    outline.box.copy(tb || bb); const sz = bb.getSize(new THREE.Vector3()), R = Math.max(sz.x, sz.y, sz.z);
    grid.scale.setScalar(R / 4); arrow.position.set(bb.getCenter(new THREE.Vector3()).x, bb.min.y + 0.02 * R, bb.max.z + 0.05 * R); arrow.setLength(R * 0.45, R * 0.12, R * 0.07);
    view.dataset.r = R; view.dataset.cy = (bb.min.y + bb.max.y) / 2;
    el.querySelectorAll('[data-a=rot],[data-a=tilt],[data-a=smaller],[data-a=bigger],[data-a=reset]').forEach(b => b.disabled = !rc);
  }
  async function store() { dirty = true; try { await saveSlot(cur, recs[cur]); } catch (e) { msg.textContent = 'Could not save: ' + e.message; } drawList(); show(); }
  file.onchange = async () => {
    const f = file.files[0]; file.value = ''; if (!f) return;
    msg.textContent = 'Loading ' + f.name + '…';
    try { const b = await f.arrayBuffer(); await parse(b); buf = b; recs[cur] = { name: f.name, buf: b, rot: 0, tilt: 0, scale: 1 }; await store(); msg.textContent = f.name + ' loaded. Turn it until it faces the yellow arrow.'; }
    catch (e) { msg.textContent = 'That file did not load as a .glb model (' + e.message + ').'; }
  };
  el.querySelector('.row').onclick = async (ev) => {
    const a = ev.target.dataset && ev.target.dataset.a; if (!a) return; const rc = recs[cur];
    if (a === 'load') file.click();
    else if (a === 'done') close();
    else if (!rc) return;
    else if (a === 'rot') { rc.rot = ((rc.rot || 0) + 1) % 4; await store(); }
    else if (a === 'tilt') { rc.tilt = ((rc.tilt || 0) + 1) % 4; await store(); }
    else if (a === 'smaller' || a === 'bigger') { rc.scale = Math.max(0.2, Math.min(5, (rc.scale || 1) * (a === 'bigger' ? 1.1 : 1 / 1.1))); await store(); }
    else if (a === 'reset') { delete recs[cur]; buf = null; dirty = true; try { await clearSlot(cur); } catch (e) { } drawList(); show(); }
  };
  function close() { alive = false; r.dispose(); el.remove(); st.remove(); onClose(dirty); }
  let ang = 0.6, last = performance.now();
  (function loop(now) {
    if (!alive) return; const dt = Math.min(0.1, (now - last) / 1000); last = now; ang += dt * 0.35;
    const w = view.clientWidth, h = view.clientHeight; if (r.domElement.width !== Math.floor(w * r.getPixelRatio())) { r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    const R = +view.dataset.r || 2, cy = +view.dataset.cy || 1;
    cam.position.set(Math.sin(ang) * R * 2.2, cy + R * 0.6, Math.cos(ang) * R * 2.2); cam.lookAt(0, cy, 0); r.render(sc, cam);
    requestAnimationFrame(loop);
  })(last);
  drawList(); show();
}
