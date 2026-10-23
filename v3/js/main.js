// Game loop: input -> player/camera update -> rendering -> HTML overlay.

import { ERAS, VIEW_H, GROUND, START_X, MIN_X, MAX_X, eraIndexAt, followerCountAt, yearAt, clamp, hash } from './world.js';
import { Painter } from './raster.js';
import { LOOKS, STAGE_BY_ERA, followerLook, getSprite } from './character.js';
import { drawSkyLayer, drawBackground, drawForeground, DOOR_OFFSETS, doorRects } from './scenery.js';
import { Effects } from './fx.js';
import { setSound, sfx } from './audio.js';
import { setChapter } from './music.js';
import { createInput } from './input.js';
import { Hud, readStations } from './hud.js';
import { loadArt, img } from './art.js';
import { T } from './i18n.js';

loadArt();
document.fonts?.load('16px "Press Start 2P"');

// Painted sprite sheets: 8 cells (idle, 6 walk frames, jump), 42.67 units per cell, feet at 40.
// Bruno's look by career phase, drawn from his photos: an 8-frame walk and an idle pose each.
// 2017 (i9) is a change of look inside chapter 2, so phases don't map 1:1 to chapters.
const PHASES = [
  { key: '2013-student', from: 0 },
  { key: '2015-junior', from: 760 },
  { key: '2017-i9', from: 1300 },
  { key: '2018-dev', from: 1640 },
  { key: '2024-lead', from: 3150 },
  { key: '2026', from: 3820 },
];
const phaseAt = (x) => PHASES.reduce((found, p, i) => (x >= p.from ? i : found), 0);
const BRUNO_STRIDE = 34; // units per full 8-frame walk cycle
const RUN_STRIDE = 62; // units per full 8-frame run cycle
// Jump art plays once with the height baked into the frames (seconds per frame).
const JUMP_FRAMES = [0.15, 0.13, 0.18, 0.13, 0.2];
const JUMP_TIME = JUMP_FRAMES.reduce((a, b) => a + b, 0);
// Bruno is drawn at door height of the painted buildings (~21 units tall).
const CHAR_SCALE = 0.62;
const CELL_UNITS = (256 / 6) * CHAR_SCALE;

const WALK = 72;
const RUN = 150;
const JUMP_V = 100;
const GRAVITY = 330;
const STRIDE = 22; // units per full walk cycle

const app = document.getElementById('app');
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');

const stations = readStations();
const byId = Object.fromEntries(stations.map((s) => [s.id, s]));
const world = {
  stations, byId,
  lights: [], screenLights: [],
  doors: { vagas: 0, projetos: 0 },
  doorTarget: { vagas: 0, projetos: 0 },
  doorHint: null, labsLit: 0, jrStep: 0,
};


const fx = new Effects();
const player = {
  x: START_X, vx: 0, jumpY: 0, vy: 0, facing: 1, phase: 0,
  stillTime: 0, auto: null, autoMax: RUN, arrived: false, era: 0,
};
const trail = [];
const followers = [];
const collected = new Set();

let started = false;
let time = 0;
let camX = START_X - 110;
let W = 0;
let H = 0;
let dpr = 1;
let unit = 1;
let shake = 0;
let lastFrame = performance.now();
let travelled = 0;
let hintTimer = 0;
let followerCount = 0;
let evolveGlow = 0;

const hud = new Hud(stations, {
  onStart: (resume) => start(resume),
  onReplay: () => replay(),
  onSound: (on) => {
    setSound(on);
    setChapter(player.era);
  },
  onTravelTo: (x) => {
    hud.achieve('timeline');
    travelTo(x, 420);
  },
  onPanel: (id) => openPanel(id),
  onPanelClosed: () => {
    world.doorTarget.vagas = 0;
    world.doorTarget.projetos = 0;
  },
  onDoor: (id) => enterDoor(id),
  onWheel: () => {
    input.left = false;
    input.right = false;
    player.auto = null;
    sfx('door');
  },
  onWheelTick: () => sfx('tick'),
  onAchievement: () => {
    sfx('secret');
    writeSave();
  },
});
hud.setEra(ERAS[0], false);

const input = createInput(app, {
  blocked: () => Boolean(hud.panelOpen),
  onEscape: () => {},
  onActivity: () => {
    if (!started) start();
    player.auto = null;
  },
  onUp: () => {
    if (!started) return start();
    if (world.doorHint) enterDoor(world.doorHint);
    else jump();
  },
  onJump: () => {
    if (!started) return start();
    jump();
  },
  onEnter: () => {
    if (!started) return start();
    if (world.doorHint) enterDoor(world.doorHint);
  },
  onTravel: (deltaPx) => {
    if (!started) start();
    travelBy(deltaPx * 0.42, 260);
  },
  onDrag: (deltaCss) => {
    if (!started) start();
    travelBy((deltaCss / (unit / dpr)) * 1.4, 300);
  },
  onKonami: () => {
    jump();
    fx.burst(player.x, GROUND - 30, { count: 60, colors: ['#ff4fd8', '#3cf2ff', '#ffd84a', '#8dff8a'], speed: 90, life: 1.6, gravity: 90, up: 40 });
    hud.banner(T.cheat, 'OLD SCHOOL', ERAS[player.era].id);
    hud.achieve('konami');
    sfx('secret');
  },
});

// Progress survives a reload: milestones collected, achievements and position.
const SAVE_KEY = 'bdm-portfolio-game';
const saved = readSave();
let saveTimer = 0;

function readSave() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    return data && Array.isArray(data.stations) && data.stations.length ? data : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ stations: [...collected], achievements: [...(hud.achieved || [])], x: Math.round(player.x) }));
  } catch {
    // Storage unavailable (private mode): progress just isn't kept.
  }
}

function restore(data) {
  hud.restoreAchievements(data.achievements || []);
  for (const id of data.stations) {
    const st = byId[id];
    if (!st || collected.has(id)) continue;
    collected.add(id);
    hud.collectQuiet(st, ERAS[eraIndexAt(st.x)].id);
  }
  player.x = clamp(Number(data.x) || START_X, MIN_X, MAX_X);
  camX = player.x - 120;
  trail.length = 0;
  player.era = eraIndexAt(player.x);
  hud.setEra(ERAS[player.era], false);
  setChapter(player.era);
  world.celebrated = (data.achievements || []).includes('end');
}

if (saved) hud.offerContinue();
// Also save when the visitor leaves or switches tabs.
addEventListener('pagehide', () => started && writeSave());
document.addEventListener('visibilitychange', () => document.hidden && started && writeSave());

// resume: pick up a saved journey when there is one (the "new journey" button passes false).
function start(resume = true) {
  if (started) return;
  started = true;
  if (resume && saved) restore(saved);
  else {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // Ignore blocked storage.
    }
  }
  hud.hideTitle();
  hud.hint(true);
  sfx('start', 0);
}

// Fireworks over the office the first time Bruno gets there.
function celebrate() {
  world.celebrated = true;
  const office = byId.office;
  hud.banner(T.endBanner[0], T.endBanner[1], ERAS[ERAS.length - 1].id);
  sfx('upgrade', ERAS.length - 1);
  for (let i = 0; i < 6; i++) {
    setTimeout(() => {
      fx.burst(office.x + (Math.random() - 0.5) * 240, 30 + Math.random() * 40, {
        count: 46, colors: ['#ffd84a', '#ff4fd8', '#3cf2ff', '#ffffff', '#8dff8a'], speed: 60, life: 1.7, gravity: 26,
      });
    }, i * 380);
  }
}

function replay() {
  player.x = START_X;
  player.auto = null;
  player.vx = 0;
  camX = START_X - 120;
  trail.length = 0;
  hud.flash();
}

function jump() {
  if (player.jumpY > 0 || player.vy > 0 || player.jumpAnim != null) return;
  player.vy = JUMP_V;
  // With the jump art loaded, its five frames carry the motion (physics still drives the team).
  if (img(`bruno-${PHASES[phaseAt(player.x)].key}-jump`)) player.jumpAnim = 0;
  sfx('jump', player.era);
}

function travelBy(units, maxSpeed) {
  const from = player.auto ?? player.x;
  player.auto = clamp(from + units, MIN_X, MAX_X);
  player.autoMax = maxSpeed;
}

function travelTo(x, maxSpeed) {
  if (!started) start();
  player.auto = clamp(x - 18, MIN_X, MAX_X);
  player.autoMax = maxSpeed;
}

function openPanel(id) {
  hud.openPanel(id);
  input.left = false;
  input.right = false;
  player.auto = null;
}

function enterDoor(id) {
  world.doorTarget[id] = 1;
  sfx('door');
  setTimeout(() => openPanel(id), reducedQuery.matches ? 0 : 380);
}

// ---------- update ----------

function update(dt) {
  const reduced = reducedQuery.matches;
  // During a chapter level-up the world runs in slow motion until the reveal.
  if (levelUp) {
    levelUp.t += dt;
    if (!levelUp.revealed && levelUp.t >= levelUp.reveal) revealLevelUp();
    if (levelUp.t >= levelUp.dur) levelUp = null;
    else if (levelUp.kind === 'chapter' && !levelUp.revealed) dt *= 0.2;
  }
  time += dt;

  let dir = 0;
  if (started && !hud.panelOpen) dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let target = 0;
  if (dir) {
    target = dir * (input.run ? RUN : WALK);
    player.auto = null;
  } else if (player.auto !== null) {
    const d = player.auto - player.x;
    if (Math.abs(d) < 1.2) {
      player.auto = null;
      player.arrived = true;
    } else {
      target = Math.sign(d) * Math.min(player.autoMax, Math.max(40, Math.abs(d) * 2.4));
    }
  }
  const accel = target === 0 ? 650 : 480;
  player.vx += clamp(target - player.vx, -accel * dt, accel * dt);
  const prevX = player.x;
  player.x = clamp(player.x + player.vx * dt, MIN_X, MAX_X);
  if (player.x === MIN_X || player.x === MAX_X) player.vx = 0;
  const moved = player.x - prevX;
  travelled += Math.abs(moved);
  if (Math.abs(player.vx) > 2) player.facing = Math.sign(player.vx);
  player.phase = (player.phase + Math.abs(moved) / BRUNO_STRIDE) % 1;
  player.runPhase = ((player.runPhase || 0) + Math.abs(moved) / RUN_STRIDE) % 1;
  if (player.jumpAnim !== null && player.jumpAnim !== undefined) {
    player.jumpAnim += dt;
    if (player.jumpAnim >= JUMP_TIME) player.jumpAnim = null;
  }

  if (player.jumpY > 0 || player.vy > 0) {
    player.vy -= GRAVITY * dt;
    player.jumpY = Math.max(0, player.jumpY + player.vy * dt);
    if (player.jumpY === 0) {
      player.vy = 0;
      player.land = 1;
    }
  }

  if (Math.abs(player.vx) < 3) player.stillTime += dt;
  else {
    player.stillTime = 0;
    if (dir) player.arrived = false;
  }

  // Party trail: one point per unit walked, followers read it at fixed distances.
  if (!trail.length || Math.abs(player.x - trail[0].x) >= 1) {
    trail.unshift({ x: player.x, facing: player.facing });
    if (trail.length > 140) trail.pop();
  }
  updateFollowers(dt);

  const era = eraIndexAt(player.x);
  const phase = phaseAt(player.x);
  const prevLook = player.look ?? phase;
  if (era !== player.era) changeEra(era, reduced, prevLook, phase);
  else if (phase > prevLook) changeLook(prevLook, phase, reduced);
  player.look = phase;

  // Camera with a little lookahead in the walking direction.
  const Wu = W / unit;
  const look = clamp(player.vx * 0.35, -Wu * 0.12, Wu * 0.12);
  const camTarget = clamp(player.x - Wu * 0.38 + look, 0, MAX_X + 160 - Wu);
  camX += (camTarget - camX) * (1 - Math.exp(-dt * (reduced ? 12 : 5)));

  updateWorldState(dt);
  fx.update(dt);
  shake = Math.max(0, shake - dt * 3);
  evolveGlow = Math.max(0, evolveGlow - dt * 1.4);
  saveTimer += dt;
  if (started && saveTimer > 2) {
    saveTimer = 0;
    writeSave();
  }
  player.land = Math.max(0, (player.land || 0) - dt * 5);

  if (started && hintTimer >= 0) {
    hintTimer += dt;
    // Gone once the visitor moves, reads a first billboard, or after a few seconds.
    if (travelled > 160 || hintTimer > 7 || openId) {
      hud.hint(false);
      hintTimer = -1;
    }
  }
}

function updateFollowers(dt) {
  const count = followerCountAt(player.x);
  if (count > followerCount) {
    for (let i = followerCount; i < count; i++) {
      const point = trail[Math.min(trail.length - 1, (i + 1) * 11)] || { x: player.x };
      followers[i] = { x: point.x, phase: 0, facing: 1, jumpY: 0, vy: 0, jumpAt: 0 };
      fx.burst(point.x, GROUND - 10, { count: 18, colors: ['#ffffff', '#ffd84a', '#3cf2ff'], speed: 35, life: 0.7 });
    }
    sfx('join', player.era);
  } else if (count < followerCount) {
    for (let i = count; i < followerCount; i++) {
      if (followers[i]) fx.burst(followers[i].x, GROUND - 10, { count: 12, colors: ['#cfcfcf', '#ffffff'], speed: 25, life: 0.5, gravity: -20 });
    }
    followers.length = count;
  }
  followerCount = count;

  for (let i = 0; i < followers.length; i++) {
    const f = followers[i];
    const point = trail[Math.min(trail.length - 1, (i + 1) * 11)];
    if (!point) continue;
    const moved = point.x - f.x;
    f.x = point.x;
    f.phase = (f.phase + Math.abs(moved) / (STRIDE * 0.86)) % 1;
    f.walking = Math.abs(moved) > 0.05;
    if (Math.abs(moved) > 0.05) f.facing = Math.sign(moved);
    // Followers repeat the leader's jumps with a delay.
    if (f.jumpAt && time >= f.jumpAt) {
      f.vy = JUMP_V * 0.9;
      f.jumpAt = 0;
    }
    if (f.jumpY > 0 || f.vy > 0) {
      f.vy -= GRAVITY * dt;
      f.jumpY = Math.max(0, f.jumpY + f.vy * dt);
      if (f.jumpY === 0) f.vy = 0;
    }
  }
  if (player.vy > JUMP_V * 0.95) followers.forEach((f, i) => (f.jumpAt = time + 0.12 * (i + 1)));
}

function changeEra(index, reduced, fromLook, toLook) {
  const up = index > player.era;
  player.era = index;
  const era = ERAS[index];
  hud.setEra(era, up);
  setChapter(index);
  if (!up) {
    hud.banner(`◀◀ ${T.chapter} ${index + 1}`, era.name, era.id);
    sfx('rewind', index);
    return;
  }
  // Flying past on the timeline or with reduced motion: a quick card, no slow motion.
  if (reduced || fastTravel()) {
    hud.levelUpCard(chapterCard(index));
    evolveGlow = 1;
    sfx('upgrade', index);
    return;
  }
  startLevelUp('chapter', fromLook, toLook, index);
}

// A new outfit inside the same chapter (2017, i9): a short version of the sequence.
function changeLook(fromLook, toLook, reduced) {
  if (reduced || fastTravel()) {
    evolveGlow = 1;
    sfx('join', player.era);
    return;
  }
  startLevelUp('look', fromLook, toLook, player.era);
}

// ---------- level-up sequence ----------
// Charge (slow motion, zoom, light beam, particles spiralling in, Bruno flickering between
// the old and the new look as white silhouettes), then the reveal (flash, shockwave, card).

let levelUp = null;

function startLevelUp(kind, fromLook, toLook, chapterIndex) {
  const chapter = kind === 'chapter';
  levelUp = {
    kind, fromLook, toLook, chapterIndex, t: 0, revealed: false,
    reveal: chapter ? 1.5 : 0.75,
    dur: chapter ? 2.6 : 1.3,
  };
  sfx('charge', chapterIndex);
}

function revealLevelUp() {
  levelUp.revealed = true;
  levelUp.revealAt = levelUp.t;
  const chapter = levelUp.kind === 'chapter';
  hud.flash();
  shake = chapter ? 0.7 : 0.3;
  evolveGlow = 1;
  fx.burst(player.x, GROUND - 12, { count: chapter ? 70 : 34, colors: ['#ffffff', '#ffe14a', '#7ff6ff', '#ff9ad8'], speed: chapter ? 90 : 55, life: 1.2, gravity: 22, up: 30 });
  sfx(chapter ? 'levelup' : 'upgrade', levelUp.chapterIndex);
  if (chapter) hud.levelUpCard(chapterCard(levelUp.chapterIndex));
  else hud.banner(T.newLook, `${stations.find((st) => st.id === 'i9')?.kicker || ''} · i9`, ERAS[player.era].id);
}

// Card content: the chapter's first milestone (years and role) and how many skills it holds.
function chapterCard(index) {
  const era = ERAS[index];
  const inChapter = stations.filter((st) => eraIndexAt(st.x) === index);
  const first = inChapter[0];
  return {
    level: index + 1,
    name: era.name,
    years: first?.kicker || '',
    role: first ? `${first.title}${first.role ? ' · ' + first.role : ''}` : era.spec,
    skills: inChapter.reduce((n, st) => n + st.skills.length, 0),
    id: era.id,
  };
}

// 0 -> 1 -> 0 envelope for the camera zoom and the darkening.
function levelUpFocus() {
  if (!levelUp) return 0;
  const { t, reveal, dur } = levelUp;
  const k = levelUp.kind === 'chapter' ? 1 : 0.5;
  if (t < 0.45) return k * ease(t / 0.45);
  if (t < reveal + 0.35) return k;
  return k * (1 - ease(Math.min(1, (t - reveal - 0.35) / Math.max(0.1, dur - reveal - 0.35))));
}

function ease(x) {
  return x * x * (3 - 2 * x);
}

// Darkening and the beam of light, drawn behind Bruno.
function drawLevelUpBack(P) {
  const focus = levelUpFocus();
  if (!focus) return;
  const c = P.ctx;
  c.save();
  c.fillStyle = `rgba(6,4,18,${0.5 * focus})`;
  c.fillRect(-W, -H, W * 3, H * 3);
  if (!levelUp.revealed) {
    const px = P.X(player.x);
    const beamW = 26 * P.s * (0.6 + 0.4 * Math.sin(time * 18));
    const g = c.createLinearGradient(px - beamW, 0, px + beamW, 0);
    g.addColorStop(0, 'rgba(255,240,190,0)');
    g.addColorStop(0.5, `rgba(255,240,190,${0.55 * focus})`);
    g.addColorStop(1, 'rgba(255,240,190,0)');
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = g;
    c.fillRect(px - beamW, -H, beamW * 2, P.Y(GROUND) + H);
  }
  c.restore();
}

// Particles spiralling into Bruno before the reveal; a shockwave ring after it.
function drawLevelUpFront(P) {
  if (!levelUp) return;
  const c = P.ctx;
  const cy = GROUND - 11;
  if (!levelUp.revealed) {
    const p = Math.min(1, levelUp.t / levelUp.reveal);
    const colors = ['#ffffff', '#ffe14a', '#7ff6ff', '#ff9ad8'];
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2 + levelUp.t * (3 + p * 6);
      const r = (1 - p) * 42 + 4 + (i % 3) * 2;
      P.rect(player.x + Math.cos(angle) * r, cy + Math.sin(angle) * r * 0.6, 1.4, 1.4, colors[i % 4]);
    }
    return;
  }
  const since = levelUp.t - levelUp.revealAt;
  if (since > 0.9) return;
  const r = since * 140;
  c.save();
  c.globalAlpha = 1 - since / 0.9;
  c.strokeStyle = '#fff6c4';
  c.lineWidth = Math.max(2, 1.6 * P.s);
  c.beginPath();
  c.ellipse(P.X(player.x), P.Y(GROUND), r * P.s, r * P.s * 0.22, 0, 0, Math.PI * 2);
  c.stroke();
  c.restore();
}

// Which look to show and whether as a white silhouette while charging.
function levelUpLook() {
  if (!levelUp || levelUp.revealed) return null;
  const p = levelUp.t / levelUp.reveal;
  if (p < 0.12) return { look: levelUp.fromLook, white: false };
  const period = 0.28 - p * 0.24;
  const toggle = Math.floor(levelUp.t / period) % 2 === 1;
  return { look: toggle ? levelUp.toLook : levelUp.fromLook, white: true };
}

// White silhouettes of sprite sheets, cached per image.
const whiteCache = new Map();
function whiteOf(image) {
  let canvas = whiteCache.get(image);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const c = canvas.getContext('2d');
    c.drawImage(image, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, canvas.width, canvas.height);
    whiteCache.set(image, canvas);
  }
  return canvas;
}


function updateWorldState(dt) {
  const jr = byId.jrcom;
  world.jrStep = player.x < jr.x - 30 ? 0 : player.x < jr.x + 30 ? 1 : 2;

  const labs = byId.labs;
  const nearLabs = Math.abs(player.x - labs.x) < 70;
  world.labsNear = Math.abs(player.x - labs.x) < 160;
  const before = world.labsLit;
  if (nearLabs && player.stillTime > 0.7) world.labsLit = Math.min(1, world.labsLit + dt * 1.1);
  else world.labsLit = Math.max(0, world.labsLit - dt * 0.5);
  if (before < 0.6 && world.labsLit >= 0.6) {
    hud.achieve('secret');
    fx.burst(labs.x - 12, 100, { count: 30, colors: ['#ff4fd8', '#ffffff'], speed: 40, life: 0.9, gravity: 10 });
  }

  // In front of the office, ↑/Enter opens the nearest door.
  const office = byId.office;
  world.atOffice = Math.abs(player.x - office.x) < 130;
  if (world.atOffice) hud.achieve('end');
  if (world.atOffice && !world.celebrated) celebrate();
  if (travelled > 40) hud.achieve('start');
  world.doorHint = null;
  if (world.atOffice) world.doorHint = player.x < office.x ? 'vagas' : 'projetos';
  for (const id of Object.keys(DOOR_OFFSETS)) {
    world.doors[id] += clamp(world.doorTarget[id] - world.doors[id], -dt * 4, dt * 4);
  }

  // Skills are collected the first time Bruno walks past each milestone.
  for (const st of stations) {
    if (collected.has(st.id) || !st.skills.length) continue;
    // Collected when its billboard opens, or at the latest when Bruno walks past it.
    if (player.x < st.x - 20 && openId !== st.id) continue;
    if (st.secret && world.labsLit < 0.6) continue;
    collected.add(st.id);
    const index = eraIndexAt(st.x);
    // Flying past on the timeline: collect quietly and sum it up once at the end.
    if (fastTravel()) {
      hud.collectQuiet(st, ERAS[index].id);
      batchSkills += st.skills.length;
      writeSave();
      continue;
    }
    hud.collectGroup(st, ERAS[index].id, reducedQuery.matches, () => sfx('collect', index));
    writeSave();
    fx.burst(player.x, GROUND - 24, { count: 22, colors: ['#ffe14a', '#ffffff', '#ffb0f0'], speed: 40, life: 0.8, gravity: 30, up: 20 });
  }
  if (batchSkills && !fastTravel()) {
    hud.toast(`+${batchSkills} skills`, T.onTheWay, ERAS[player.era].id);
    sfx('collect', player.era);
    batchSkills = 0;
  }
}

// ---------- billboards ----------

let openId = null;
let batchSkills = 0;
const fastTravel = () => (player.auto !== null && player.autoMax >= 400) || Math.abs(player.vx) > 220;
const readBoards = new Set();

function updateOverlay(dt) {
  const near = new Set();
  let best = null;
  let bestDist = Infinity;
  for (const st of stations) {
    if (st.secret && world.labsLit < 0.6) continue;
    const d = Math.abs(player.x - st.x);
    if (d < 175 && started) near.add(st.id);
    if (d < bestDist) {
      bestDist = d;
      best = st;
    }
  }
  if (openId && (!near.has(openId) || Math.abs(player.x - byId[openId].x) > 150)) openId = null;
  if (started && best && near.has(best.id) && bestDist < 120 && (player.stillTime > 0.45 || player.arrived)) openId = best.id;
  // The last billboard opens as soon as Bruno reaches the office.
  if (started && world.atOffice) openId = 'office';
  if (openId && !byId[openId].secret) {
    readBoards.add(openId);
    if (readBoards.size === stations.filter((s) => !s.secret).length) hud.achieve('reader');
  }
  hud.openId = openId;

  const cssWidth = W / dpr;
  hud.updateBillboards({ near, camX, unitCss: unit / dpr, cssWidth, jrStep: world.jrStep }, dt, reducedQuery.matches);

  let current = null;
  for (const st of stations) if (st.label && player.x >= st.x - 60) current = st.id;
  hud.updateTimeline(player.x, current);
  hud.setYear(yearAt(player.x));
  const era = ERAS[player.era];
  const end = Number.isFinite(era.to) ? era.to : MAX_X;
  hud.setLevel(player.era + 1, clamp((player.x - era.from) / (end - era.from), 0, 1));

  if (world.atOffice && !hud.panelOpen) {
    const k = unit / dpr;
    const positions = {};
    for (const [id, dx] of Object.entries(DOOR_OFFSETS)) positions[id] = { x: (byId.office.x + dx - camX) * k, y: (112 + skyUnits) * k };
    hud.doorPrompts({ positions, near: world.doorHint });
  } else {
    hud.doorPrompts(null);
  }
}

// ---------- rendering ----------

// Portrait screens keep at least MIN_VIEW_W units of street visible;
// the leftover height becomes sky above the scene (skyUnits).
const MIN_VIEW_W = 150;
// The sky is drawn on a coarse layer (this many units per sky pixel) to match the pixel art.
const SKY_PIXEL = 1 / 3;
let skyUnits = 0;

const skyCanvas = document.createElement('canvas');
const skyPainter = new Painter(skyCanvas.getContext('2d'));
const scenePainter = new Painter(ctx);

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.round(canvas.clientWidth * dpr);
  H = Math.round(canvas.clientHeight * dpr);
  canvas.width = W;
  canvas.height = H;
  const refH = Math.min(H, (W * VIEW_H) / MIN_VIEW_W);
  unit = refH / VIEW_H;
  // Most of the extra height goes to sky; the rest extends the street under the controls.
  skyUnits = (H / unit - VIEW_H) * 0.72;
}

// Scene style for the chapter on screen: lighting turns on from the golden hour on.
function chapterAt(x) {
  return ERAS[eraIndexAt(x)];
}

// People going about their day on the sidewalk, a little behind Bruno.
// Stateless: each walker loops inside its own stretch of street.
function drawPedestrians(P, team) {
  const Wu = W / unit;
  const span = 340;
  for (let k = Math.floor((camX - 60) / span); k <= Math.ceil((camX + Wu + 60) / span); k++) {
    if (hash(k * 4.1) < 0.4) continue;
    const dir = hash(k + 2) < 0.5 ? 1 : -1;
    const speed = 9 + hash(k + 3) * 7;
    const travel = (((time * speed * dir + hash(k + 4) * span) % span) + span) % span;
    const x = k * span + travel;
    const pose = { walk: 1, phase: ((time * speed) / (STRIDE * 0.8) + hash(k)) % 1, jump: false };
    drawSheet(P, team, Math.floor(hash(k + 1) * 5), pose, x, 2.2, dir, 0.78);
  }
}

function drawActors(P) {
  const team = img('team');
  if (team && started) drawPedestrians(P, team);
  for (let i = followers.length - 1; i >= 0; i--) {
    const f = followers[i];
    const pose = { walk: f.walking ? 1 : 0, phase: f.phase, jump: f.jumpY > 0, breath: Math.floor(time * 1.6 + i) % 2, blink: (time + i) % 4.1 < 0.13 };
    if (team) drawSheet(P, team, i, pose, f.x, f.jumpY, f.facing, 0.88);
    else drawSprite(P, `f${i}`, followerLook(i), pose, chapterAt(f.x), f.x, f.jumpY, f.facing, 0.86 * CHAR_SCALE);
  }

  const stage = eraIndexAt(player.x);
  const walk = Math.min(1, Math.abs(player.vx) / WALK);
  const pose = { walk: walk > 0.08 ? Math.max(0.6, walk) : 0, phase: player.phase, jump: player.jumpY > 0, breath: Math.floor(time * 1.6) % 2, blink: time % 3.7 < 0.13, speed: Math.abs(player.vx) / WALK, land: player.land };
  const override = levelUpLook();
  const phase = PHASES[override ? override.look : phaseAt(player.x)].key;
  let walkSheet = img(`bruno-${phase}-walk`);
  let idle = img(`bruno-${phase}-idle`);
  if (override?.white && walkSheet && idle) {
    walkSheet = whiteOf(walkSheet);
    idle = whiteOf(idle);
  }
  if (walkSheet && idle) drawBruno(P, phase, walkSheet, idle, pose, player.x, player.jumpY, player.facing, Boolean(override?.white));
  else drawSprite(P, STAGE_BY_ERA[stage], LOOKS[STAGE_BY_ERA[stage]], pose, ERAS[stage], player.x, player.jumpY, player.facing, CHAR_SCALE);

  // Level-up glow while the new look settles in.
  if (evolveGlow > 0) {
    const c = P.ctx;
    c.save();
    c.globalAlpha = evolveGlow * 0.3;
    c.globalCompositeOperation = 'lighter';
    P.ellipse(player.x, GROUND - 11 - player.jumpY, 10 + (1 - evolveGlow) * 7, 14 + (1 - evolveGlow) * 7, '#fff2c4');
    c.restore();
  }
}

// Draws one sprite frame with a little life on top of the painted frames:
// a bob per step, a lean when running, breathing when idle and a squash on landing.
// Bruno: walking uses the 8-frame sheet (it already carries its own bob), standing uses
// the idle pose, and until the jump art exists the "up" frame doubles as the jump.
// Bruno: idle pose standing, 8-frame walk, 8-frame run at speed, 5-frame jump played once.
// The new art already carries its own bob and jump height, so none is added on top.
function drawBruno(P, phase, walkSheet, idle, pose, x, jumpY, facing, white = false) {
  // While flickering white, run/jump art isn't silhouetted: stick to walk and idle.
  const jumpSheet = white ? null : img(`bruno-${phase}-jump`);
  if (player.jumpAnim != null && jumpSheet) {
    let t = player.jumpAnim;
    let frame = 0;
    while (frame < JUMP_FRAMES.length - 1 && t >= JUMP_FRAMES[frame]) t -= JUMP_FRAMES[frame++];
    const cw = jumpSheet.width / 5;
    drawFrame(P, jumpSheet, [frame * cw, 0, cw, jumpSheet.height], { ...pose, jump: true, land: 0 }, x, 0, facing, 1, 0, false, 300, [1, 0.8, 0.55, 0.8, 1][frame]);
    return;
  }
  const runSheet = white ? null : img(`bruno-${phase}-run`);
  const walking = !pose.jump && pose.walk > 0.05;
  if (walking && runSheet && (pose.speed || 0) > 1.25) {
    const cw = runSheet.width / 8;
    drawFrame(P, runSheet, [(Math.floor(player.runPhase * 8) % 8) * cw, 0, cw, runSheet.height], pose, x, jumpY, facing, 1, 0, false, 300);
    return;
  }
  const cell = walkSheet.height;
  if (pose.jump) drawFrame(P, walkSheet, [3 * cell, 0, cell, cell], pose, x, jumpY, facing, 1, 0, false);
  else if (walking) drawFrame(P, walkSheet, [(Math.floor(pose.phase * 8) % 8) * cell, 0, cell, cell], pose, x, jumpY, facing, 1, 0, false);
  else drawFrame(P, idle, [0, 0, idle.width, idle.height], pose, x, jumpY, facing, 1, 0, false);
}

function drawSheet(P, sheet, row, pose, x, jumpY, facing, scale) {
  const cell = sheet.width / 8;
  const walking = !pose.jump && pose.walk > 0.05;
  const frame = pose.jump ? 7 : walking ? 1 + (Math.floor(pose.phase * 6) % 6) : 0;
  drawFrame(P, sheet, [frame * cell, row * cell, cell, cell], pose, x, jumpY, facing, scale, row, true);
}

// feetPx: where the feet sit inside the cell, in source pixels (240 in 256-px cells,
// 300 in the 320-px run/jump cells). Cells are drawn at 6 source px per unit.
function drawFrame(P, sheet, crop, pose, x, jumpY, facing, scale, row, addBob, feetPx = 240, shadow = 1) {
  P.ellipse(x, GROUND + 0.4, 4.6 * scale * shadow * (1 - Math.min(0.6, jumpY / 30)), 1.1, 'rgba(0,0,0,0.3)');
  const walking = !pose.jump && pose.walk > 0.05;
  const k = (CELL_UNITS / 256) * scale;
  const w = crop[2] * k;
  const h = crop[3] * k;
  const bob = walking && addBob ? -Math.abs(Math.sin(pose.phase * Math.PI * 2)) * 0.7 * scale : 0;
  const feetY = GROUND - jumpY + bob;
  const lean = walking ? Math.min(1, Math.max(0, (pose.speed || 0) - 1)) * 0.07 : 0;
  const breathe = walking || pose.jump ? 0 : Math.sin(time * 2.4 + row) * 0.012;
  const squash = pose.land || 0;
  const sx = 1 + squash * 0.1;
  const sy = 1 - squash * 0.1 + breathe;
  const c = P.ctx;
  const px = P.X(x);
  const py = P.Y(feetY);
  c.save();
  c.translate(px, py);
  if (facing < 0) c.scale(-1, 1);
  c.rotate(lean);
  c.scale(sx, sy);
  c.translate(-px, -py);
  P.image(sheet, x - w / 2, feetY - feetPx * k, w, h, crop);
  c.restore();
}

function drawSprite(P, key, look, pose, era, x, jumpY, facing, scale) {
  P.ellipse(x, GROUND + 0.6, 6 * scale * (1 - Math.min(0.6, jumpY / 40)), 1.4, 'rgba(0,0,0,0.28)');
  const sprite = getSprite(key, look, pose, P.s, era, scale);
  const px = P.X(x);
  const py = P.Y(GROUND - jumpY);
  const c = P.ctx;
  c.imageSmoothingEnabled = false;
  if (facing >= 0) {
    c.drawImage(sprite.canvas, px - sprite.ox, py - sprite.oy);
  } else {
    c.save();
    c.translate(px, 0);
    c.scale(-1, 1);
    c.drawImage(sprite.canvas, -sprite.ox, py - sprite.oy);
    c.restore();
  }
}

function render() {
  const Wu = W / unit;
  const shakeX = shake > 0 ? (Math.random() - 0.5) * shake * 8 * dpr : 0;
  const shakeY = shake > 0 ? (Math.random() - 0.5) * shake * 5 * dpr : 0;
  const cx = camX + Wu / 2;
  const chapter = chapterAt(cx);
  // Lights switch on ahead of the golden-hour chapter and fade in (see drawLighting).
  const look = { ...chapter, detail: cx > LIGHT_FROM ? Math.max(3, chapter.detail) : chapter.detail };
  // Level-up zoom around Bruno.
  const zoom = 1 + 0.18 * levelUpFocus();
  const fx0 = (player.x - camX) * unit;
  const fy0 = (GROUND - 12 + skyUnits) * unit;
  const ox = fx0 * (1 - zoom) + shakeX;
  const oy = fy0 * (1 - zoom) + shakeY;
  world.lights = [];
  world.screenLights = [];

  // Sky on its coarse pixel layer, then enlarged without filtering.
  const skyPx = Math.max(1, Math.round(unit * SKY_PIXEL));
  const sw = Math.ceil(W / skyPx) + 1;
  const sh = Math.ceil(H / skyPx);
  if (skyCanvas.width !== sw || skyCanvas.height !== sh) {
    skyCanvas.width = sw;
    skyCanvas.height = sh;
  }
  skyPainter.begin(unit / skyPx, camX, sw, sh, skyUnits);
  drawSkyLayer(skyPainter, look, time, world);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.setTransform(zoom, 0, 0, zoom, ox, oy);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(skyCanvas, 0, 0, sw, sh, 0, 0, sw * skyPx, sh * skyPx);

  // The painted world at full resolution.
  const P = scenePainter;
  P.begin(unit, camX, W, H, skyUnits);
  drawBackground(P, look, time, world);
  P.par = 1;
  drawLevelUpBack(P);
  drawActors(P);
  drawLevelUpFront(P);
  fx.draw(P);
  drawForeground(P, look, time, world);

  drawLighting(cx);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawSpeedLines();
}

// Golden hour and night: glows from lamps, windows and neon, plus a soft vignette.
// Golden-hour and night lighting grow with the position instead of switching per chapter.
const LIGHT_FROM = 2950;
const LIGHT_TO = 3350;

function drawLighting(cx) {
  const k = clamp((cx - LIGHT_FROM) / (LIGHT_TO - LIGHT_FROM), 0, 1);
  if (k <= 0) return;
  const night = clamp((cx - 3600) / 500, 0, 1);
  ctx.globalCompositeOperation = 'lighter';
  for (const l of world.lights) drawGlow((l.x - camX) * unit, (l.y + skyUnits) * unit, l.r * unit, l.color, l.a * 0.8 * k);
  for (const l of world.screenLights) drawGlow(l.x * W, (l.y + skyUnits) * unit, l.r * unit, l.color, l.a * k);
  ctx.globalCompositeOperation = 'source-over';
  const vignette = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.4, W / 2, H * 0.55, Math.max(W, H) * 0.85);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  const r = Math.round(40 - 35 * night);
  const g = Math.round(10 - 10 * night);
  const b = Math.round(25 * night);
  vignette.addColorStop(1, `rgba(${r},${g},${b},${(0.25 + 0.2 * night) * k})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(-W, -H, W * 3, H * 3);
}

function drawGlow(x, y, r, color, a) {
  if (a <= 0.01 || x < -r || x > W + r) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${color},${a})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function drawSpeedLines() {
  const speed = Math.abs(player.vx);
  if (speed < 190 || reducedQuery.matches) return;
  const k = Math.min(1, (speed - 190) / 200);
  ctx.fillStyle = `rgba(255,255,255,${0.25 * k})`;
  for (let i = 0; i < 18; i++) {
    const y = ((i * 53 + time * 900) % H);
    const len = (60 + (i % 4) * 40) * dpr;
    const x = ((i * 137 - time * 2400 * Math.sign(player.vx)) % (W + len) + W + len) % (W + len) - len;
    ctx.fillRect(x, y, len, Math.max(1, dpr));
  }
}

// ---------- loop ----------

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  update(dt);
  render();
  updateOverlay(dt);
  requestAnimationFrame(frame);
}

// Clicking or tapping a painted office door opens it.
canvas.addEventListener('click', (e) => {
  if (!started || hud.panelOpen) return;
  const x = camX + (e.clientX * dpr) / unit;
  const y = (e.clientY * dpr) / unit - skyUnits;
  for (const [id, r] of Object.entries(doorRects(byId.office.x))) {
    if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) enterDoor(id);
  }
});

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);

// Debug/QA hook: lets automated checks jump around the world.
window.__game = { player, world, save: () => writeSave(), travelTo: (x) => travelTo(x, 2000), teleport: (x) => { player.x = x; camX = x - 120; } };
