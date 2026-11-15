const fs = require('fs');
const FILE = require('path').join(__dirname, '..', 'games', 'bank-job', 'index.html');   // run: node tools/bank-job-levelgen.js  (or: node tools/bank-job-levelgen.js 9,12 to redo only levels 9 and 12)
const html = fs.readFileSync(FILE, 'utf8');
const phys = html.split('/*PHYSICS-START*/')[1].split('/*PHYSICS-END*/')[0];
const P = new Function(phys + '; return { simulate, buildSegs, bumperPos, ARENA, PR, TR, BR, MUZZLE };')();
const { simulate, buildSegs, ARENA: A } = P;
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const sw = [0, 45, 90, 135];

/* geometry + puzzle requirements; locks are placed by the search below */
const SPECS = [
 { name:'First Deposit', tip:'Point anywhere. The bullet flies from the gun toward your crosshair. Hit every lock with ONE shot.',
   gun:[160,560], legs:[0], extra:3, minW:3, maxTot:40 },
 { name:'Bank Shot', tip:'Steel walls bounce the bullet. The dotted line shows where it hits first.',
   gun:[150,560], boxes:[[560,330,150,360]], legs:[1], extra:2, minW:1.5, maxTot:14 },
 { name:'Double Up', tip:'Two locks, one bullet.',
   gun:[130,390], boxes:[[520,250,90,280]], legs:[1,2], extra:2, minW:1.2, maxTot:10 },
 { name:'Corner Pocket', tip:'Corners are your friend.',
   gun:[640,620], boxes:[[300,230,130,130],[850,230,130,130]], legs:[1,2,3], extra:2, minW:1.0, maxTot:8 },
 { name:'Hall of Mirrors', tip:'Mirrors bounce the bullet too. Use them to get around the wall.',
   gun:[130,600], boxes:[[620,92,40,380]], mirrors:[{x:420,y:250,len:150,a:[45]},{x:900,y:560,len:150,a:[-30]}], legs:[1,2], need:['mirror'], extra:2, minW:1.0, maxTot:8 },
 { name:'Red Means Dead', tip:'RED surfaces swallow the bullet. Keep it on the steel.',
   gun:[110,390], deadEdges:'TB', boxes:[[600,300,80,180]], mirrors:[{x:380,y:200,len:140,a:[20]},{x:900,y:560,len:140,a:[-25]}], deadBoxes:[[360,520,120,60]], legs:[1,2,3], extra:2, minW:0.9, maxTot:8 },
 { name:'Wormhole', tip:'PORTALS: in one, out the other, still flying the same direction.',
   gun:[130,600], boxes:[[620,92,40,598]], portals:[[330,210,960,560]], legs:[1,2], need:['portal'], extra:2, minW:1.0, maxTot:8 },
 { name:'Pinball Vault', tip:'Bumpers kick the bullet off at an angle.',
   gun:[120,630], bumpers:[{x:470,y:300,r:44},{x:820,y:470,r:44},{x:660,y:200,r:30},{x:1020,y:260,r:36}], legs:[1,2,3], need:['bump'], extra:2, minW:0.8, maxTot:8 },
 { name:'Swivel', tip:'SWIVEL MIRROR: point at it and press A (right-click) to turn it. Then take the shot.',
   gun:[170,600], boxes:[[40,420,330,30],[470,420,30,270]], mirrors:[{x:600,y:300,len:130,a:sw}], legs:[1,2], need:['mirror'], rotate:true, extra:2, minW:1.0, maxTot:10 },
 { name:'Night Shift', tip:'That bumper is moving. Time your shot.',
   gun:[120,390], boxes:[[380,92,40,170],[380,520,40,170]], bumpers:[{x:700,y:390,r:46,move:[0,190,3.4]}], legs:[1,2], need:['mbump'], extra:2, minW:0.6, maxTot:12, moving:true },
 { name:'Zig Zag', tip:'Watch the bounce counter. The bullet runs out of steam.',
   gun:[110,630], boxes:[[300,92,40,400],[600,290,40,400],[900,92,40,400]], legs:[1,2,3,4], extra:1, minW:0.6, maxTot:6 },
 { name:'Portal Maze', tip:'Two pairs of portals. Match the colors.',
   gun:[110,620], deadEdges:'L', portals:[[260,190,1110,600],[700,600,1100,190]], deadBoxes:[[480,92,40,320],[820,370,40,320]], legs:[1,2,3], need:['portal'], extra:2, minW:0.7, maxTot:8 },
 { name:'Double Swivel', tip:'Two swivel mirrors. Set them both, then shoot.',
   gun:[640,630], boxes:[[600,220,80,200]], mirrors:[{x:330,y:300,len:140,a:sw},{x:950,y:300,len:140,a:sw}], legs:[1,2,3], need:['mirror'], rotate:true, extra:2, minW:0.7, maxTot:8 },
 { name:'Rush Hour', tip:'Two moving bumpers. Patience pays.',
   gun:[110,390], bumpers:[{x:460,y:390,r:42,move:[0,200,2.9]},{x:840,y:390,r:42,move:[0,-200,3.6]}], legs:[1,2,3], need:['mbump'], extra:2, minW:0.5, maxTot:12, moving:true },
 { name:'Long Con', tip:'Everything you have learned, all at once.',
   gun:[110,600], deadEdges:'B', boxes:[[560,92,40,250]], portals:[[300,200,1060,520]], mirrors:[{x:800,y:230,len:140,a:[60]}], bumpers:[{x:430,y:470,r:38}], legs:[1,2,3,4,5], extra:2, minW:0.5, maxTot:6 },
 { name:'The Big Score', tip:'The main vault. Good luck.',
   gun:[640,640], deadEdges:'T', boxes:[[200,250,60,200],[1020,250,60,200]], deadBoxes:[[560,92,160,60]], portals:[[160,160,1120,160]], mirrors:[{x:420,y:470,len:140,a:sw},{x:860,y:470,len:140,a:sw}], bumpers:[{x:640,y:300,r:40}], legs:[1,2,3,4,5], need:['mirror'], rotate:true, extra:2, minW:0.5, maxTot:6 },
];

function legsOf(res){
  const L = [];
  for (let k = 0; k < res.pts.length - 1; k++){ const a = res.pts[k], b = res.pts[k+1]; if (b.jump) continue; L.push({ ax:a.x, ay:a.y, bx:b.x, by:b.y, ev:b.ev, bi:b.bi, len:Math.hypot(b.x-a.x, b.y-a.y) }); }
  return L;
}
function segDist(px, py, s){ const ex = s[2]-s[0], ey = s[3]-s[1], l2 = ex*ex+ey*ey, u = Math.max(0, Math.min(1, ((px-s[0])*ex + (py-s[1])*ey) / l2)); return Math.hypot(px - s[0] - ex*u, py - s[1] - ey*u); }
function windows(lv, t0, ms, step){
  step = step || 0.05; const n = Math.round(360 / step), ok = new Uint8Array(n);
  for (let i = 0; i < n; i++) ok[i] = simulate(lv, i * step * Math.PI / 180, t0, ms).ok ? 1 : 0;
  const tot = ok.reduce((a, b) => a + b, 0) * step;
  return { ok, step, tot, widthAt(deg){ let i = Math.round((((deg % 360) + 360) % 360) / step) % n; if (!ok[i]) return 0; let c = 1; for (let k = i+1; ok[k % n] && c < n; k++) c++; for (let k = i-1; ok[(k+n) % n] && c < n; k--) c++; return c * step; } };
}
function screenReach(gun, ang){ // how far the crosshair can be from the gun in this direction (aim precision)
  const dx = Math.cos(ang), dy = Math.sin(ang); let t = 1e9;
  if (dx > 1e-6) t = Math.min(t, (1280 - gun[0]) / dx); if (dx < -1e-6) t = Math.min(t, -gun[0] / dx);
  if (dy > 1e-6) t = Math.min(t, (720 - gun[1]) / dy); if (dy < -1e-6) t = Math.min(t, -gun[1] / dy);
  return t;
}
function placeOK(spec, segs, x, y, placed, ms){
  if (x < A.L + 48 || x > A.R - 48 || y < A.T + 48 || y > A.B - 48) return false;
  for (const S of segs) if (segDist(x, y, S.s) < 44) return false;
  if (Math.hypot(x - spec.gun[0], y - spec.gun[1]) < 110) return false;
  for (const p of placed) if (Math.hypot(x - p[0], y - p[1]) < 85) return false;
  for (const p of spec.portals || []) for (let e = 0; e < 2; e++) if (Math.hypot(x - p[e*2], y - p[e*2+1]) < 64) return false;
  for (const b of spec.bumpers || []){
    if (b.move){ if (segDist(x, y, [b.x - b.move[0], b.y - b.move[1], b.x + b.move[0], b.y + b.move[1]]) < b.r + 44) return false; }
    else if (Math.hypot(x - b.x, y - b.y) < b.r + 44) return false;
  }
  for (const m of spec.mirrors || []) if (m.a.length > 1 && Math.hypot(x - m.x, y - m.y) < m.len / 2 + 44) return false;
  return true;
}
function visible(spec, ms, x, y){
  const a = Math.atan2(y - spec.gun[1], x - spec.gun[0]), r = simulate(spec, a, 0, ms, true), p = r.pts[1];
  return Math.hypot(p.x - spec.gun[0], p.y - spec.gun[1]) > Math.hypot(x - spec.gun[0], y - spec.gun[1]) - P.TR;
}
function gen(spec, idx){
  const why = {}; const R = k => (why[k] = (why[k]||0) + 1);
  const nm = (spec.mirrors || []).length, maxLeg = Math.max(...spec.legs), cands = [];
  for (let trial = 0; trial < 500000 && cands.length < 10; trial++){
    const ang = rnd() * Math.PI * 2;
    if (screenReach(spec.gun, ang) < 320){ R('reach'); continue; }
    const ms = (spec.mirrors || []).map(m => m.a.length > 1 ? Math.floor(rnd() * m.a.length) : 0);
    if (spec.rotate && ms.every(s => s === 0)) continue;
    const probe = Object.assign({}, spec, { targets:[], bounces:30 });
    const res = simulate(probe, ang, 0, ms), L = legsOf(res);
    if (L.length <= maxLeg){ R('short'); continue; }
    const used = L.slice(0, maxLeg);
    if (used.some(l => l.ev === 'dead' || l.ev === 'spent' || l.ev === 'range')){ R('dead'); continue; }
    if ((spec.need || []).some(n => !used.some(l => n === 'mbump' ? (l.ev === 'bump' && spec.bumpers[l.bi].move) : l.ev === n))){ R('need'); continue; }
    const segs = buildSegs(spec, ms), targets = []; let bad = false;
    for (const leg of spec.legs){
      const l = L[leg]; if (l.len < 150){ bad = true; break; }
      let ok = false;
      for (let k = 0; k < 12 && !ok; k++){
        const f = 0.22 + rnd() * 0.56, x = l.ax + (l.bx - l.ax) * f, y = l.ay + (l.by - l.ay) * f;
        if (!placeOK(spec, segs, x, y, targets, ms)) continue;
        targets.push([Math.round(x), Math.round(y)]); ok = true;
      }
      if (!ok){ bad = true; break; }
    }
    if (bad){ R('place'); continue; }
    if (spec.legs.some(l => l > 0) && targets.every(t => visible(spec, ms, t[0], t[1]))){ R('allvis'); continue; }
    const bouncesUsed = used.filter(l => l.ev !== 'portal').length;
    const lv = Object.assign({}, spec, { targets, bounces: bouncesUsed + spec.extra });
    const deg = ang * 180 / Math.PI;
    if (!simulate(lv, ang, 0, ms).ok){ R('resim'); continue; }
    const Wn = windows(lv, 0, ms, 0.1), w = Wn.widthAt(deg);
    if (w < spec.minW){ R('narrow'); continue; } if (Wn.tot > spec.maxTot){ R('easy'); continue; }
    if (spec.rotate && nm){ const W0 = windows(lv, 0, ms.map(() => 0), 0.1); if (W0.tot > 0){ R('norotate'); continue; } }
    let phaseFrac = 1;
    if (spec.moving){ const per = Math.max(...spec.bumpers.filter(b => b.move).map(b => b.move[2])); let c = 0; const N = 48; for (let k = 0; k < N; k++) if (simulate(lv, ang, k / N * per * 3, ms).ok) c++; phaseFrac = c / N; if (phaseFrac < 0.1){ R('timing'); continue; } }
    let spread = 1e9; for (let a = 0; a < targets.length; a++) for (let b = a + 1; b < targets.length; b++) spread = Math.min(spread, Math.hypot(targets[a][0]-targets[b][0], targets[a][1]-targets[b][1]));
    if (targets.length < 2) spread = 300;
    const score = Math.min(spread, 400) / 400 + Math.min(w, 3) / 3 - Math.abs(Wn.tot - w) * 0.05 + (spec.moving ? phaseFrac : 0) + rnd() * 0.2;
    cands.push({ lv, deg, w, tot:Wn.tot, ms, score, phaseFrac, trial });
  }
  if (!cands.length){ console.log('FAILED', idx + 1, spec.name, JSON.stringify(why)); return null; }
  cands.sort((a, b) => b.score - a.score);
  const c = cands[0];
  console.log(String(idx + 1).padStart(2), spec.name.padEnd(16), 'win', c.w.toFixed(2) + '°', 'total', c.tot.toFixed(2) + '°', 'bounces', c.lv.bounces, spec.moving ? 'timing ' + (c.phaseFrac * 100).toFixed(0) + '%' : '', 'cands', cands.length);
  const out = {}; for (const k of ['name','tip','gun','deadEdges','walls','boxes','dead','deadBoxes','mirrors','portals','bumpers']) if (spec[k] !== undefined) out[k] = spec[k];
  out.targets = c.lv.targets; out.bounces = c.lv.bounces; out.sol = { a: +c.deg.toFixed(2), ms: c.ms };
  return out;
}
/* Usage: node tools/bank-job-levelgen.js 9,12   -> rebuild only levels 9 and 12 (others are kept from bank-job-levels.json)
          node tools/bank-job-levelgen.js all    -> rebuild every level (layouts will change)
   Edit SPECS above to change a level's walls/mirrors/portals/bumpers, then rebuild that level. */
const arg = process.argv[2] || '';
const only = arg === 'all' ? null : arg.split(',').filter(Boolean).map(Number);
const prev = (() => { try { return JSON.parse(fs.readFileSync(require('path').join(__dirname, 'bank-job-levels.json'), 'utf8')); } catch (e) { return []; } })();
const out = SPECS.map((s, i) => { if (only && !only.includes(i + 1) && prev[i]) return prev[i]; seed = 1000 + i * 77; return gen(s, i); });
fs.writeFileSync(require('path').join(__dirname, 'bank-job-levels.json'), JSON.stringify(out));
if (out.every(Boolean)){
  const body = 'const LEVELS = [\n' + out.map(l => '  ' + JSON.stringify(l)).join(',\n') + '\n];\n';
  const h = fs.readFileSync(FILE, 'utf8').replace(/\/\*LEVELS-START\*\/[\s\S]*?\/\*LEVELS-END\*\//, '/*LEVELS-START*/\n' + body + '/*LEVELS-END*/');
  fs.writeFileSync(FILE, h); console.log('wrote', out.length, 'levels');
}
