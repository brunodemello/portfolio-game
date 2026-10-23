// The street, described in world units. Painted art (art.js) does the heavy lifting;
// code adds what must change over time: sky and day cycle, lettering, lights, doors,
// moving vehicles and particles. Each era then rasterizes and reduces it.

import { GROUND, skyAt, nightAt, sunAt, hash, mixHex } from './world.js';
import { img, info } from './art.js';
import { T } from './i18n.js';

const BASE = GROUND - 4; // where buildings and props touch the ground
const TILE_TOP = GROUND - 8;

const BUILDING = {
  unesp: 'bld-unesp', jrcom: 'bld-jrcom', i9: 'bld-i9', mktnow: 'bld-mktnow', tristar: 'bld-airport',
  email: 'bld-email', techlead: 'bld-techlead', dept: 'bld-dept', urbes: 'bld-busstop', labs: 'bld-labs', office: 'bld-office',
};

// Half widths keep street props away from the buildings.
const HALF = { personal: 82, unesp: 134, jrcom: 78, i9: 58, mktnow: 104, tristar: 128, email: 72, techlead: 88, dept: 114, urbes: 52, labs: 64, office: 154 };

// Door centers of bld-office relative to the station, from the art manifest.
export const DOOR_OFFSETS = { vagas: -53.5, projetos: 54 };

// Office door rectangles in world units (for clicks/taps on the painted doors).
export function doorRects(officeX) {
  return { vagas: rect('bld-office', 'doors', officeX, 0), projetos: rect('bld-office', 'doors', officeX, 1) };
}

// Background sets along the career, cross-faded where they meet.
const BACKDROPS = [
  { name: 'town', until: 1640 },
  { name: 'city', until: 3150 },
  { name: 'metro', until: 3820 },
  { name: 'night', until: Infinity },
];

// Sky, sun, moon, stars and clouds: drawn on a coarse pixel layer so they match the art.
export function drawSkyLayer(P, era, t, world) {
  const Wu = P.w / P.s;
  const cx = P.camX + Wu / 2;
  const sky = skyAt(cx);
  const night = nightAt(cx);
  P.par = 0;
  drawSky(P, sky, night, t);
  drawSun(P, era, cx, sky, night, world);
  P.par = 0.1;
  drawClouds(P, era, sky, night, t);
  P.par = 1;
}

// Everything painted: backdrops, ground, props, buildings and their live details.
export function drawBackground(P, era, t, world) {
  const Wu = P.w / P.s;
  const cx = P.camX + Wu / 2;

  drawBackdrops(P, cx);

  P.par = 1;
  drawGround(P);
  drawProps(P, era, t, world);
  for (const st of world.stations) {
    const half = HALF[st.id] || 80;
    if (!P.visible(st.x - half - 40, half * 2 + 80)) continue;
    drawBuilding(P, st);
    OVERLAYS[st.id]?.(P, era, st.x, t, world);
  }
  drawAmbient(P, era, t, world);
}

export function drawForeground(P, era, t, world) {
  P.par = 1;
  const urbes = world.byId.urbes;
  if (urbes) drawBus(P, era, urbes.x, t, world);
  drawWeather(P, t);
  drawNearLayer(P, t);
}

// ---------- depth: a blurred layer passing right in front of the camera ----------

const darkCache = new Map();

// Dark, slightly colored silhouette of a prop, used out of focus in the foreground.
function silhouette(name, tint) {
  const key = name + tint;
  if (darkCache.has(key)) return darkCache.get(key);
  const image = img(name);
  if (!image) return null;
  const c = document.createElement('canvas');
  c.width = image.width;
  c.height = image.height;
  const g = c.getContext('2d');
  g.drawImage(image, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = tint;
  g.globalAlpha = 0.88;
  g.fillRect(0, 0, c.width, c.height);
  darkCache.set(key, c);
  return c;
}

function drawNearLayer(P) {
  const Wu = P.w / P.s;
  const cx = P.camX + Wu / 2;
  const tint = cx < 1640 ? '#14261a' : cx < 3150 ? '#16241c' : cx < 3820 ? '#2a1a14' : '#070a1a';
  P.par = 1.45;
  const c = P.ctx;
  c.save();
  if ('filter' in c) c.filter = `blur(${Math.max(1, P.s * 0.5)}px)`;
  const [a, b] = layerRange(P, 210, 120);
  for (let k = a; k <= b; k++) {
    if (hash(k * 2.3) < 0.45) continue;
    const name = hash(k + 1) < 0.5 ? 'prop-bush' : 'prop-bush-flowers';
    const shape = silhouette(name, tint);
    if (!shape) continue;
    // Anchored to the bottom edge of the screen, tall enough to frame the street
    // but never reaching Bruno's feet.
    const bottom = P.h / P.s - P.oy;
    const w = 54 + hash(k + 2) * 30;
    const h = w * 0.6;
    P.image(shape, k * 210 + hash(k) * 90, Math.max(GROUND + 4, bottom - h * 0.55), w, h);
  }
  c.restore();
  P.par = 1;
}

// ---------- weather by chapter ----------

function drawWeather(P, t) {
  const Wu = P.w / P.s;
  const left = P.camX;
  const c = P.ctx;
  // Jacaranda petals drifting down in the university and first-job chapters.
  if (left < 1700) {
    // They fall from treetop height only, tumbling: a petal shape that turns
    // between its wide side and its edge, with a darker tip.
    for (let i = 0; i < 14; i++) {
      const fall = 96 + ((hash(i + 2) * 200 + t * (5 + hash(i + 3) * 4)) % 58);
      const x = left + ((hash(i) * 997 + t * (7 + hash(i + 1) * 6)) % (Wu + 40)) - 20 + Math.sin(t * 1.3 + i) * 5;
      if (x > 1700) continue;
      const turn = Math.sin(t * 2.6 + i * 1.7);
      const w = 1.2 + Math.abs(turn) * 1.6;
      const light = i % 3 ? '#c993ee' : '#e9d0ff';
      P.rect(x, fall, w, 1.3, light);
      P.rect(turn > 0 ? x + w - 0.7 : x, fall + 0.3, 0.7, 0.8, '#9a62c9');
    }
  }
  // A few leaves crossing the agency years.
  if (left > 1500 && left < 3200) {
    for (let i = 0; i < 7; i++) {
      const x = left + ((hash(i + 40) * 700 + t * (22 + hash(i) * 10)) % (Wu + 60)) - 30;
      const y = 40 + ((hash(i + 41) * 90 + t * 9) % 110) + Math.sin(t * 2 + i) * 5;
      if (x < 1640 || x > 3150) continue;
      P.rect(x, y, 2, 1.2, i % 2 ? '#7fb24a' : '#d9b44a');
      P.rect(x + 0.6, y - 0.6, 0.8, 0.6, '#5f8a35');
    }
  }
  // Neon rain in the AI era: thin diagonal streaks, a few catching the light.
  if (left + Wu > 3820) {
    c.save();
    c.lineWidth = Math.max(1, P.s * 0.18);
    for (let i = 0; i < 90; i++) {
      const x = left + hash(i) * (Wu + 30);
      if (x < 3820) continue;
      const y = (hash(i + 7) * 200 + t * (150 + hash(i + 3) * 60)) % 200 - 10;
      c.strokeStyle = i % 9 === 0 ? 'rgba(255,120,230,0.45)' : i % 4 === 0 ? 'rgba(120,240,255,0.45)' : 'rgba(190,210,255,0.22)';
      c.beginPath();
      c.moveTo(P.X(x), P.Y(y));
      c.lineTo(P.X(x - 2.2), P.Y(y + 9));
      c.stroke();
    }
    c.restore();
  }
}

// ---------- sky ----------

function drawSky(P, sky, night, t) {
  const ctx = P.ctx;
  const rows = P.Y(GROUND - 8);
  for (let py = 0; py < rows; py++) {
    const k = py / rows;
    ctx.fillStyle = mixHex(sky.top, sky.horizon, k * k);
    ctx.fillRect(0, py, P.w, 1);
  }
  ctx.fillStyle = sky.horizon;
  ctx.fillRect(0, rows, P.w, P.h - rows);

  if (night > 0.05) {
    for (let i = 0; i < 90; i++) {
      const twinkle = 0.5 + 0.5 * Math.sin(t * (1.5 + hash(i + 7) * 2) + i);
      if (twinkle * night < 0.3) continue;
      ctx.fillStyle = hash(i + 3) > 0.8 ? '#ffe6b0' : '#e8f0ff';
      ctx.fillRect(Math.floor(hash(i) * P.w), Math.floor(hash(i + 50) * rows * 0.75), 1, 1);
    }
  }
}

function drawSun(P, era, cx, sky, night, world) {
  const Wu = P.w / P.s;
  const c = P.ctx;
  const y = sunAt(cx);
  if (y < GROUND) {
    const high = Math.max(0, Math.min(1, (128 - y) / 98));
    const color = mixHex('#ff9a52', '#fff3c4', high);
    const x = Wu * 0.74;
    glow(P, x, y, 46, color, 0.45 + (1 - high) * 0.2);
    P.ellipse(x, y, 10, 10, color);
    if (era.detail >= 3) world.screenLights.push({ x: x / Wu, y, r: 90, color: '255,190,110', a: 0.35 * (1 - night) });
  }
  if (night > 0.3) {
    const x = Wu * 0.24;
    glow(P, x, 30, 30, '#cfd8ff', 0.3 * night);
    P.ellipse(x, 30, 8, 8, '#f3efd9');
    P.ellipse(x - 2, 28, 1.8, 1.8, '#d8d2b6');
    P.ellipse(x + 3, 32, 1.4, 1.4, '#d8d2b6');
    if (era.detail >= 3) world.screenLights.push({ x: x / Wu, y: 30, r: 60, color: '170,190,255', a: 0.25 * night });
  }
  c.globalAlpha = 1;
}

// Soft round glow (sun, moon) that fades smoothly into the sky.
function glow(P, x, y, r, color, alpha) {
  const c = P.ctx;
  const px = P.X(x);
  const py = P.Y(y);
  const pr = r * P.s;
  const g = c.createRadialGradient(px, py, 0, px, py, pr);
  const [cr, cg, cb] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  g.addColorStop(0, `rgba(${cr},${cg},${cb},${alpha})`);
  g.addColorStop(0.35, `rgba(${cr},${cg},${cb},${alpha * 0.45})`);
  g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  c.fillStyle = g;
  c.fillRect(px - pr, py - pr, pr * 2, pr * 2);
}

function layerRange(P, spacing, pad = 60) {
  const Wu = P.w / P.s;
  const left = P.camX * P.par - pad;
  return [Math.floor(left / spacing), Math.ceil((left + Wu + pad * 2) / spacing)];
}

function drawClouds(P, era, sky, night, t) {
  if (night > 0.45) return;
  const [a, b] = layerRange(P, 170, 140);
  const body = mixHex('#ffffff', sky.horizon, 0.18 + night * 0.6);
  const shade = mixHex(body, sky.top, 0.3);
  const light = mixHex(body, '#ffffff', 0.6);
  for (let k = a; k <= b; k++) {
    if (hash(k * 1.7) < 0.4) continue;
    const x = k * 170 + hash(k) * 80 + ((t * 2.5) % 170);
    const y = 18 + hash(k + 3) * 34;
    const w = 12 + hash(k + 4) * 12;
    // A row of puffs of varying size makes an irregular top edge.
    const puffs = [];
    const n = 4 + Math.floor(hash(k + 6) * 3);
    for (let i = 0; i < n; i++) {
      const px = x - w + (i / (n - 1)) * w * 2;
      const r = w * (0.35 + 0.4 * Math.sin((i / (n - 1)) * Math.PI) + hash(k * 9 + i) * 0.15);
      puffs.push([px, y - r * 0.55, r]);
    }
    P.ellipse(x, y + 2, w * 1.35, w * 0.32, shade);
    for (const [px, py, r] of puffs) P.ellipse(px, py + 1.4, r, r * 0.8, shade);
    for (const [px, py, r] of puffs) P.ellipse(px, py, r, r * 0.8, body);
    P.rect(x - w, y - 1, w * 2, 2.4, body);
    for (const [px, py, r] of puffs) P.ellipse(px - r * 0.25, py - r * 0.3, r * 0.45, r * 0.32, light);
  }
}

// ---------- painted backdrops and ground ----------

function drawBackdrops(P, cx) {
  // Never show two skylines on top of each other: the old one fades out before the
  // border, the new one fades in after it (for a moment only the sky shows).
  const fade = 130;
  const index = BACKDROPS.findIndex((b) => cx < b.until);
  const layers = [];
  const next = BACKDROPS[index].until;
  const prev = index > 0 ? BACKDROPS[index - 1].until : -Infinity;
  if (cx > next - fade) layers.push([index, (next - cx) / fade]);
  else if (cx < prev + fade) layers.push([index, (cx - prev) / fade]);
  else layers.push([index, 1]);
  for (const [layer, par, bottom] of [['far', 0.22, GROUND - 14], ['mid', 0.48, GROUND - 5]]) {
    P.par = par;
    for (const [i, alpha] of layers) {
      const image = img(`bg-${BACKDROPS[i].name}-${layer}`);
      if (!image || alpha <= 0.01) continue;
      P.ctx.globalAlpha = Math.min(1, alpha);
      const w = 640;
      const h = 100;
      // Sink the skyline a little while it fades, so the change reads as movement.
      const drop = (1 - Math.min(1, alpha)) * 14;
      const [a, b] = layerRange(P, w, 0);
      for (let k = a; k <= b; k++) P.image(image, k * w, bottom - h + drop, w + 0.5, h);
      P.ctx.globalAlpha = 1;
    }
  }
  P.par = 1;
}

function groundFor(x) {
  if (x < 1640) return 'ground-campus';
  if (x < 3820) return 'ground-city';
  return 'ground-night';
}

function drawGround(P) {
  const w = 256;
  const h = 36;
  const [a, b] = layerRange(P, w, 0);
  for (let k = a; k <= b; k++) {
    const x = k * w;
    const name = groundFor(x + w / 2);
    P.rect(x, TILE_TOP + h - 2, w + 1, 400, name === 'ground-night' ? '#0b0e1c' : '#3d3e45');
    const tile = img(name);
    if (tile) P.image(tile, x, TILE_TOP, w + 0.5, h);
    else P.rect(x, TILE_TOP, w + 1, h, '#d8ccb4');
  }
}

// ---------- props between buildings ----------

const PROPS = {
  'prop-jacaranda': [50, 55], 'prop-ipe': [50, 55], 'prop-palm': [40, 60], 'prop-tree-round': [40, 50],
  'prop-planter-tree': [30, 40], 'prop-neon-tree': [30, 40], 'prop-lamp-classic': [10, 40], 'prop-lamp-modern': [10, 40],
  'prop-lamp-neon': [10, 40], 'prop-bench': [30, 15], 'prop-bush': [25, 15], 'prop-bush-flowers': [25, 15],
};

const ZONE_PROPS = [
  { until: 1640, trees: ['prop-jacaranda', 'prop-ipe', 'prop-tree-round', 'prop-jacaranda'], lamp: 'prop-lamp-classic' },
  { until: 3150, trees: ['prop-palm', 'prop-tree-round', 'prop-palm'], lamp: 'prop-lamp-classic' },
  { until: 3820, trees: ['prop-planter-tree', 'prop-tree-round'], lamp: 'prop-lamp-modern' },
  { until: Infinity, trees: ['prop-neon-tree'], lamp: 'prop-lamp-neon' },
];

function nearStation(world, x, margin) {
  for (const st of world.stations) {
    if (Math.abs(x - st.x) < (HALF[st.id] || 80) + margin) return true;
  }
  return false;
}

function prop(P, name, x) {
  const image = img(name);
  if (!image) return;
  const [w, h] = PROPS[name];
  P.image(image, x - w / 2, BASE - h, w, h);
}

function drawProps(P, era, t, world) {
  const [a, b] = layerRange(P, 64, 40);
  for (let k = a; k <= b; k++) {
    const x = k * 64 + hash(k) * 18;
    if (x < 20) continue;
    const zone = ZONE_PROPS.find((z) => x < z.until);
    const r = hash(k + 0.37);
    if (k % 3 === 0) {
      if (nearStation(world, x, 6)) continue;
      prop(P, zone.lamp, x);
      const lit = nightAt(x) > 0.15 || zone.until > 3150;
      if (era.detail >= 3 && lit) {
        const neon = zone.lamp === 'prop-lamp-neon';
        world.lights.push({ x, y: BASE - 37, r: 36, color: neon ? '80,240,255' : '255,206,130', a: neon ? 0.5 : 0.45 });
      }
    } else if (r < 0.55) {
      if (nearStation(world, x, 24)) continue;
      prop(P, zone.trees[Math.floor(hash(k + 2) * zone.trees.length)], x);
    } else if (r < 0.75) {
      if (nearStation(world, x, 12)) continue;
      prop(P, hash(k + 5) > 0.5 && zone.until <= 3150 ? 'prop-bush-flowers' : 'prop-bush', x);
    } else if (r < 0.86) {
      if (nearStation(world, x, 16)) continue;
      prop(P, 'prop-bench', x);
    }
  }
}

// ---------- buildings and their live details ----------

function drawBuilding(P, st) {
  const name = BUILDING[st.id];
  const image = img(name);
  const meta = info(name);
  if (!image || !meta) return;
  P.image(image, st.x - meta.w / 2, BASE - meta.h, meta.w, meta.h);
}

// Rectangle from the manifest, converted to world coordinates.
function rect(name, key, x, i = 0) {
  const meta = info(name);
  const r = meta && (Array.isArray(meta[key]) ? meta[key][i] : meta[key]);
  return r ? { x: x + r.x, y: BASE + r.y, w: r.w, h: r.h } : null;
}

function sign(P, name, x, text, color, i = 0) {
  const r = rect(name, 'signs', x, i);
  if (r) P.label(text, r.x, r.y, r.w, r.h, color);
  return r;
}

// Five-point pixel star, about 5 units wide.
function star(P, cx, cy, color) {
  P.rect(cx - 0.6, cy - 2.6, 1.2, 1.4, color);
  P.rect(cx - 2.6, cy - 1.2, 5.2, 1.4, color);
  P.rect(cx - 1.6, cy + 0.2, 3.2, 1.2, color);
  P.rect(cx - 2.2, cy + 1.4, 1.4, 1.2, color);
  P.rect(cx + 0.8, cy + 1.4, 1.4, 1.2, color);
}

// Product screenshots shown on the personal-project totems (the same images as the cases).
const SCREENS = { careeros: '/assets/careeros-demo.jpg', cleardesk: '/assets/cleardesk-pipeline.jpg' };
const screenImages = {};
function screen(name) {
  if (!screenImages[name]) {
    screenImages[name] = new Image();
    screenImages[name].src = SCREENS[name];
  }
  const im = screenImages[name];
  return im.complete && im.naturalWidth ? im : null;
}

const OVERLAYS = {
  // Two digital totems showing CareerOS and ClearDesk.
  personal(P, era, x, t, world) {
    [['careeros', 'CAREEROS', -34], ['cleardesk', 'CLEARDESK', 34]].forEach(([name, label, dx], i) => {
      const cx = x + dx;
      const w = 50;
      const h = 32;
      const top = BASE - 58;
      P.rect(cx - 2, top + h, 4, BASE - top - h, '#1b1f33');
      P.rect(cx - 9, BASE - 3, 18, 3, '#1b1f33');
      P.rect(cx - w / 2 - 2.5, top - 2.5, w + 5, h + 5, '#141826');
      P.rect(cx - w / 2 - 2.5, top - 2.5, w + 5, 0.9, i ? '#ff4fd8' : '#3cf2ff');
      const im = screen(name);
      if (im) P.image(im, cx - w / 2, top, w, h);
      else P.rect(cx - w / 2, top, w, h, '#22284a');
      // A slow scanline sweeping the screen.
      const sweep = (t * 12 + i * 20) % h;
      P.ctx.save();
      P.ctx.globalAlpha = 0.18;
      P.rect(cx - w / 2, top + sweep, w, 2, '#ffffff');
      P.ctx.restore();
      P.rect(cx - 15, top + h + 3.5, 30, 5.5, '#141826');
      P.label(label, cx - 15, top + h + 3.5, 30, 5.5, i ? '#ff8fe6' : '#7ff6ff');
      if (era.detail >= 3) world.lights.push({ x: cx, y: top + h / 2, r: 50, color: i ? '255,79,216' : '60,242,255', a: 0.35 });
    });
  },

  unesp(P, era, x) {
    sign(P, 'bld-unesp', x, 'UNESP', '#1f3f8f');
  },

  jrcom(P, era, x, t, world) {
    sign(P, 'bld-jrcom', x, 'JR.COM', '#ffffff');
    // Plaque above the sign with three stars: trainee, director, president.
    const r = rect('bld-jrcom', 'signs', x);
    if (!r) return;
    const cx = r.x + r.w / 2;
    P.rect(cx - 13, r.y - 9, 26, 7.4, '#1f3a63');
    for (let i = 0; i < 3; i++) star(P, cx - 8 + i * 8, r.y - 5.3, i <= world.jrStep ? '#ffd84a' : '#4a5a78');
  },

  i9(P, era, x) {
    sign(P, 'bld-i9', x, 'i9', '#1b1b1b');
  },

  mktnow(P, era, x, t, world) {
    sign(P, 'bld-mktnow', x, 'MKTNOW', '#ffffff');
    if (era.detail >= 3) world.lights.push({ x, y: BASE - 40, r: 70, color: '255,200,120', a: 0.3 });
  },

  tristar(P, era, x, t) {
    sign(P, 'bld-airport', x, T.signs.airport, '#ffffff');
    const plane = img('prop-plane');
    const p = (t % 10) / 10;
    if (plane && p < 0.9) {
      const px = x - 260 + p * 560;
      const py = 120 - p * p * 105;
      P.image(plane, px - 35, py - 12.5, 70, 25);
    }
    const meta = info('bld-airport');
    if (meta && Math.floor(t * 2) % 2 === 0) P.rect(x + meta.w / 2 - 33, BASE - meta.h + 2, 2, 2, '#ff4040');
  },

  email(P, era, x) {
    const r = rect('bld-email', 'frame', x);
    const env = img('prop-envelope');
    if (!r || !env) return;
    const h = r.h * 0.8;
    const w = h * 1.5;
    P.image(env, r.x + r.w / 2 - w / 2, r.y + (r.h - h) / 2, w, h);
  },

  techlead(P, era, x, t, world) {
    sign(P, 'bld-techlead', x, 'MKTNOW', '#4a2e08');
    if (era.detail >= 3) {
      const r = rect('bld-techlead', 'signs', x);
      if (r) world.lights.push({ x, y: r.y + r.h / 2, r: 46, color: '255,210,122', a: 0.4 });
      world.lights.push({ x, y: BASE - 10, r: 60, color: '255,200,120', a: 0.45 });
    }
  },

  dept(P, era, x, t, world) {
    sign(P, 'bld-dept', x, 'MKTNOW DEV', '#ff8fe6');
    const meta = info('bld-dept');
    if (!meta) return;
    const top = BASE - meta.h;
    const float = Math.sin(t * 1.6) * 1.5;
    const ctx = P.ctx;
    ctx.save();
    ctx.globalAlpha = 0.2;
    P.roof(x - 20, x + 20, top + 2, x, top - 26 + float, '#3cf2ff');
    ctx.restore();
    if (hash(Math.floor(t * 12)) > 0.06) P.label('IA', x - 16, top - 30 + float, 32, 16, '#7ff6ff');
    if (era.detail >= 3) {
      world.lights.push({ x, y: top - 22 + float, r: 60, color: '60,242,255', a: 0.55 });
      world.lights.push({ x: x - meta.w / 2, y: BASE - 50, r: 40, color: '255,79,216', a: 0.25 });
      world.lights.push({ x: x + meta.w / 2, y: BASE - 50, r: 40, color: '60,242,255', a: 0.25 });
      world.lights.push({ x, y: BASE - 14, r: 50, color: '60,242,255', a: 0.4 });
    }
  },

  urbes(P, era, x, t, world) {
    P.rect(x + 40, BASE - 44, 1.6, 44, '#6c7280');
    P.rect(x + 31, BASE - 54, 20, 10, '#2f7fb5');
    P.label('URBES', x + 31, BASE - 54, 20, 10, '#ffffff');
    if (era.detail >= 3) world.lights.push({ x: x - 20, y: BASE - 20, r: 30, color: '255,230,170', a: 0.4 });
  },

  labs(P, era, x, t, world) {
    const lit = world.labsLit;
    const w = rect('bld-labs', 'window', x);
    if (w) {
      const colors = ['#ff6fae', '#6fd6ff', '#ffd36f', '#8dff8a'];
      for (let i = 0; i < 4; i++) {
        const rx = w.x + 2 + ((t * 7 + i * 13) % Math.max(1, w.w - 6));
        P.rect(rx, w.y + w.h - 6, 3.4, 5, colors[i]);
        P.rect(rx + 0.4, w.y + w.h - 9.4, 2.6, 2.6, '#dfe7ff');
        P.rect(rx + 1.8, w.y + w.h - 8.6, 0.8, 0.8, '#141826');
      }
    }
    const on = lit >= 1 || hash(Math.floor(t * 18)) < lit;
    // Close but not discovered: the sign sputters and a "?" bubble invites you to wait.
    const tease = !on && world.labsNear && hash(Math.floor(t * 7)) < 0.3;
    const r = sign(P, 'bld-labs', x, 'LABS', on ? '#ff5fdc' : tease ? '#9a3f88' : '#3a2a44');
    const door = rect('bld-labs', 'doors', x);
    if (world.labsNear && lit < 0.6 && door) {
      const bob = Math.sin(t * 4) * 1.2;
      const bx = door.x + door.w / 2;
      const by = door.y - 12 + bob;
      P.ellipse(bx, by, 6, 5, '#ffffff');
      P.roof(bx - 2, bx + 2, by + 7, bx - 2, by + 3, '#ffffff');
      P.label('?', bx - 4, by - 4, 8, 8, '#9a3f88');
    }
    if (era.detail >= 3 && on && r) world.lights.push({ x: r.x + r.w / 2, y: r.y + r.h / 2, r: 44, color: '255,79,216', a: 0.55 * Math.max(0.4, lit) });
  },

  office(P, era, x, t, world) {
    sign(P, 'bld-office', x, 'BRUNO DE MELLO', '#3b2414', 0);
    const ids = ['vagas', 'projetos'];
    ids.forEach((id, i) => {
      const s = sign(P, 'bld-office', x, T.signs[id], '#ffd27a', i + 1);
      const d = rect('bld-office', 'doors', x, i);
      if (!d) return;
      const open = world.doors[id];
      if (open > 0.01) {
        P.rect(d.x + 1, d.y + 1, (d.w - 2) * open, d.h - 2, '#ffe2a0');
        P.rect(d.x + 1 + (d.w - 2) * open, d.y + 1, Math.max(0.5, (d.w - 2) * 0.12 * (1 - open)), d.h - 2, '#3b2414');
      }
      if (era.detail >= 3) world.lights.push({ x: d.x + d.w / 2, y: d.y + d.h * 0.6, r: 26 + open * 34, color: '255,214,140', a: 0.25 + open * 0.45 });
      if (world.doorHint === id && s) {
        const bob = Math.sin(t * 6) * 1.5;
        const cx = s.x + s.w / 2;
        P.roof(cx - 4, cx + 4, s.y - 4 + bob, cx, s.y - 0.5 + bob, '#ffd27a');
        P.rect(cx - 1.6, s.y - 9 + bob, 3.2, 5, '#ffd27a');
      }
    });
    if (era.detail >= 3) world.lights.push({ x, y: BASE - 60, r: 90, color: '255,190,110', a: 0.3 });
  },
};

function drawBus(P, era, sx, t, world) {
  const bus = img('prop-bus');
  if (!bus) return;
  const p = (t % 12) / 12;
  const bx = sx - 360 + p * 720;
  if (!P.visible(bx - 50, 100)) return;
  P.image(bus, bx - 50, GROUND + 24 - 40, 100, 40);
  if (era.detail >= 3) world.lights.push({ x: bx + 52, y: GROUND + 10, r: 40, color: '255,240,190', a: 0.5 });
}

// Stateless ambient particles: positions are pure functions of time.
function drawAmbient(P, era, t, world) {
  const Wu = P.w / P.s;
  const left = P.camX;
  const email = world.byId.email;
  const env = img('prop-envelope');
  if (email && env && P.visible(email.x - 170, 340)) {
    for (let i = 0; i < 10; i++) {
      const x = email.x - 160 + ((i * 41 + t * 16) % 320);
      const y = 140 - ((i * 29 + t * 22) % 116);
      P.image(env, x + Math.sin(t * 2 + i) * 2, y, 7, 4.7);
    }
  }
  if (era.detail >= 3 && left > 2900 && left < 4000) {
    for (let i = 0; i < 30; i++) {
      const x = left + ((hash(i) * 700 + t * 4) % Wu);
      const y = 40 + ((hash(i + 1) * 120 + Math.sin(t + i) * 6) % 110);
      P.rect(x, y, 0.8, 0.8, '#ffe2a0');
    }
  }
  if (left > 3500) {
    for (let i = 0; i < 40; i++) {
      const x = left + hash(i) * Wu;
      const y = 150 - ((hash(i + 1) * 150 + t * (8 + hash(i + 2) * 10)) % 150);
      if (x > 3820) P.rect(x, y, 0.9, 0.9, i % 2 ? '#3cf2ff' : '#ff4fd8');
    }
  }
}
