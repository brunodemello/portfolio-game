// World layout: one horizontal axis where position is time.

import { T } from './i18n.js';
// Units: the view is always VIEW_H units tall; painted art is 6 px per unit.

export const VIEW_H = 180;
export const GROUND = 154; // feet line (middle of the sidewalk)
export const START_X = 150;
export const MIN_X = 70;
export const MAX_X = 5430;

// Chapters of the career. The scenery, time of day and Bruno's look change with each one.
// detail >= 3 turns on scene lighting (golden hour and night).
export const ERAS = [
  { id: 'c1', from: 0, detail: 2 },
  { id: 'c2', from: 760, detail: 2 },
  { id: 'c3', from: 1640, detail: 2 },
  { id: 'c4', from: 3150, detail: 3 },
  { id: 'c5', from: 3820, detail: 4 },
];
ERAS.forEach((era, i) => {
  era.index = i;
  [era.name, era.spec] = T.chapters[i];
  era.to = i + 1 < ERAS.length ? ERAS[i + 1].from : Infinity;
});

export function eraIndexAt(x) {
  let index = 0;
  for (const era of ERAS) if (x >= era.from) index = era.index;
  return index;
}

// Followers join when Bruno starts leading the team.
export function followerCountAt(x) {
  if (x >= 4080) return 5;
  if (x >= 3380) return 3;
  return 0;
}

const YEAR_KEYS = [[0, 2013], [760, 2015], [1640, 2018], [2360, 2019], [2820, 2021], [3150, 2024], [3820, 2026]];

export function yearAt(x) {
  if (x >= 5100) return T.today;
  for (let i = YEAR_KEYS.length - 1; i >= 0; i--) {
    const [kx, year] = YEAR_KEYS[i];
    if (x < kx) continue;
    const next = YEAR_KEYS[i + 1];
    if (!next) return String(year);
    const t = (x - kx) / (next[0] - kx);
    return String(Math.floor(year + t * (next[1] - year)));
  }
  return '2013';
}

// Day cycle across the career: dawn at university, night neon in the AI era.
const SKY_KEYS = [
  { x: 0, top: '#3d3c78', horizon: '#f7a77c' },
  { x: 600, top: '#5c8fd8', horizon: '#f8d9ab' },
  { x: 1300, top: '#4c9ae6', horizon: '#c2e4f5' },
  { x: 2200, top: '#2f7ed8', horizon: '#a2d4f2' },
  { x: 3150, top: '#4d6fb2', horizon: '#ffc57c' },
  { x: 3550, top: '#5a4b8f', horizon: '#ff965a' },
  { x: 3820, top: '#262051', horizon: '#c9587a' },
  { x: 4250, top: '#0b0e2c', horizon: '#33286a' },
  { x: 99999, top: '#0b0e2c', horizon: '#33286a' },
];

export function skyAt(x) {
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    const a = SKY_KEYS[i];
    const b = SKY_KEYS[i + 1];
    if (x < b.x) {
      const t = Math.max(0, (x - a.x) / (b.x - a.x));
      return { top: mixHex(a.top, b.top, t), horizon: mixHex(a.horizon, b.horizon, t) };
    }
  }
  return SKY_KEYS[SKY_KEYS.length - 1];
}

// 0 during the day, 1 in full night.
export function nightAt(x) {
  return clamp((x - 3600) / 600, 0, 1);
}

// Sun height in units (smaller = higher). Rises over the early career, sets at the golden hour.
export function sunAt(x) {
  if (x < 2200) return 128 - (x / 2200) * 98;
  return 30 + ((x - 2200) / 1500) * 130;
}

// How built-up the skyline is: small campus town in 2013, metropolis in 2026.
export function growthAt(x) {
  return clamp(x / 4300, 0, 1);
}

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgbToHex([r, g, b]) {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(ca.map((v, i) => Math.round(v + (cb[i] - v) * t)));
}
