// Procedural pixel sprites. The character is described once in world units and rasterized
// per era, so the same pose becomes a 16-pixel Game Boy hero or a 50-pixel shaded one.

export const LOOKS = {
  student: {
    skin: '#f1c49c', skinShade: '#d39a70', hair: '#3b2418', hairHi: '#6a4630',
    shirt: '#efe8d4', shirtShade: '#c7ba9c', pants: '#41639a', pantsShade: '#2c4570',
    shoe: '#f6f6f6', shoeShade: '#bdbdbd', pack: '#8a2433', packShade: '#5c1521', hairStyle: 'messy',
  },
  junior: {
    skin: '#f1c49c', skinShade: '#d39a70', hair: '#3b2418', hairHi: '#6a4630',
    shirt: '#cc6a40', shirtShade: '#9b4828', pants: '#41639a', pantsShade: '#2c4570',
    shoe: '#f6f6f6', shoeShade: '#bdbdbd', pack: '#6f7d3c', packShade: '#4c5728', hairStyle: 'short',
  },
  dev: {
    skin: '#efc29a', skinShade: '#d0976d', hair: '#33200f', hairHi: '#5e3d26',
    shirt: '#21416a', shirtShade: '#152b48', pants: '#3c4a5e', pantsShade: '#283242',
    shoe: '#e9e4da', shoeShade: '#a9a294', pack: '#2f3440', packShade: '#1d2029', hairStyle: 'short',
    beard: true, watch: true,
  },
  lead: {
    skin: '#efc29a', skinShade: '#d0976d', hair: '#33200f', hairHi: '#5e3d26',
    shirt: '#4e5d72', shirtShade: '#36414f', tee: '#efece4', pants: '#2f3846', pantsShade: '#20262f',
    shoe: '#efe9dc', shoeShade: '#a9a294', hairStyle: 'short', beard: true, watch: true, lanyard: true, headset: true,
  },
  ai: {
    skin: '#efc29a', skinShade: '#d0976d', hair: '#33200f', hairHi: '#5e3d26',
    shirt: '#262c42', shirtShade: '#171b2a', pants: '#1f2433', pantsShade: '#151821',
    shoe: '#f2f2f2', shoeShade: '#9aa0b0', hairStyle: 'short', beard: true, hood: true, neon: '#3cf2ff',
  },
};

export const STAGE_BY_ERA = ['student', 'junior', 'dev', 'lead', 'ai'];

export const STAGE_LABEL = {
  student: 'Calouro · camiseta clara e mochila bordô',
  junior: 'Empresa júnior · camiseta terracota',
  dev: 'Dev Sênior · polo marinho, barba e relógio',
  lead: 'Tech Lead · crachá e headset',
  ai: 'Era da IA · moletom com detalhes neon',
};

const FOLLOWER_LOOKS = [
  ['#8d5a3b', '#151515', '#2e8b6e', 'bun'],
  ['#f0c8a0', '#7a4a22', '#b0455a', 'short'],
  ['#c68a5e', '#222222', '#5b6fd6', 'long'],
  ['#e8b48a', '#c9a24a', '#e0a030', 'messy'],
  ['#6b4330', '#1a1a1a', '#7a52b0', 'short'],
].map(([skin, hair, shirt, hairStyle]) => ({
  skin, skinShade: shade(skin, 0.82), hair, hairHi: shade(hair, 1.4), shirt, shirtShade: shade(shirt, 0.72),
  pants: '#2d3442', pantsShade: '#1e232d', shoe: '#e8e8e8', shoeShade: '#a0a0a0', hairStyle,
}));

export function followerLook(i) {
  return FOLLOWER_LOOKS[i % FOLLOWER_LOOKS.length];
}

function shade(hex, f) {
  const v = parseInt(hex.slice(1), 16);
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => Math.max(0, Math.min(255, Math.round(x * f))));
  return '#' + ((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1);
}

const cache = new Map();

// pose: { walk: 0..1, phase: 0..1, jump: bool, breath: 0|1, blink: bool }
export function poseKey(pose) {
  if (pose.jump) return 'j';
  if (pose.walk > 0.05) return 'w' + Math.floor(pose.phase * 8) % 8;
  return 'i' + pose.breath + (pose.blink ? 'b' : '');
}

export function getSprite(lookKey, look, pose, s, era, scale = 1) {
  const key = `${lookKey}|${era.id}|${(s * scale).toFixed(3)}|${poseKey(pose)}`;
  let sprite = cache.get(key);
  if (!sprite) {
    sprite = buildSprite(look, pose, s * scale, era);
    cache.set(key, sprite);
    if (cache.size > 900) cache.delete(cache.keys().next().value);
  }
  return sprite;
}

function buildSprite(look, pose, s, era) {
  const detail = era.detail;
  const W = Math.ceil(30 * s) + 6;
  const H = Math.ceil(38 * s) + 6;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const ox = Math.floor(W / 2);
  const oy = H - 3;

  const R = (x, y, w, h, c) => {
    const x0 = Math.round(ox + x * s);
    const x1 = Math.round(ox + (x + w) * s);
    const y0 = Math.round(oy + y * s);
    const y1 = Math.round(oy + (y + h) * s);
    ctx.fillStyle = c;
    ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
  };
  const E = (cx, cy, rx, ry, c, maxY = Infinity) => {
    const pcx = ox + cx * s;
    const pcy = oy + cy * s;
    const prx = rx * s;
    const pry = ry * s;
    const limit = oy + maxY * s;
    ctx.fillStyle = c;
    for (let py = Math.round(pcy - pry); py < Math.round(pcy + pry); py++) {
      if (py >= limit) break;
      const dy = (py + 0.5 - pcy) / pry;
      const k = 1 - dy * dy;
      if (k <= 0) continue;
      const half = prx * Math.sqrt(k);
      const a = Math.round(pcx - half);
      const b = Math.round(pcx + half);
      if (b > a) ctx.fillRect(a, py, b - a, 1);
    }
  };

  // Gait: legs swing in opposite phase, body is highest when the legs pass each other.
  const ph = pose.phase * Math.PI * 2;
  const a = pose.walk;
  let legF = Math.sin(ph) * 3.2 * a;
  let legB = -legF;
  let liftF = Math.max(0, Math.cos(ph)) * 1.8 * a;
  let liftB = Math.max(0, -Math.cos(ph)) * 1.8 * a;
  let bob = -(1 - Math.abs(Math.sin(ph))) * 0.8 * a - (pose.breath ? 0.35 : 0);
  let armF = -legF * 0.75;
  let armB = -legB * 0.75;
  if (pose.jump) {
    legF = 2.2; liftF = 3.6; legB = -1.4; liftB = 1.4; bob = -1; armF = 0; armB = 0;
  }
  const hipY = -10 + bob;

  // Back leg and arm sit in shadow.
  R(-1 + legB - 1.6, hipY, 3.2, -hipY - 1.8 - liftB, look.pantsShade);
  R(-1 + legB - 1.8, -2.2 - liftB, 4.4, 2.2, look.shoeShade);
  if (!pose.jump) {
    R(-1.6 + armB, -19.4 + bob, 2.6, 8, look.shirtShade);
    R(-1.6 + armB, -11.6 + bob, 2.6, 1.8, look.skinShade);
  }
  if (look.pack) {
    R(-7.4, -19.6 + bob, 3.8, 9.2, look.pack);
    if (detail >= 1) R(-7.4, -19.6 + bob, 3.8, 2.4, look.packShade);
    if (detail >= 2) R(-7.4, -13.4 + bob, 3.8, 0.8, look.packShade);
  }
  if (look.hood) R(-4.8, -21.8 + bob, 4.4, 3, look.shirtShade);

  // Torso.
  R(-3.9, -20 + bob, 7.8, 10.6, look.shirt);
  if (detail >= 1) R(-3.9, -20 + bob, 1.6, 10.6, look.shirtShade);
  R(-3.9, -10.6 + bob, 7.8, 1.2, look.pantsShade);
  if (look.tee) R(0.8, -20 + bob, 2.2, 9.4, look.tee);
  if (look.lanyard && detail >= 1) {
    R(1.5, -20 + bob, 0.7, 5.4, '#e9b44c');
    R(0.9, -15 + bob, 2, 2.6, '#ffffff');
  }
  if (look.pack) R(-1.4, -19.8 + bob, 1.2, 6.4, look.packShade);
  if (look.neon) {
    R(-3.9, -11.8 + bob, 7.8, 0.9, look.neon);
    if (detail >= 2) R(2.4, -19.6 + bob, 0.6, 3.4, look.neon);
  }
  if (detail >= 2 && !look.tee && !look.neon) R(0.6, -20 + bob, 3.2, 1, look.shirtShade);

  // Front leg.
  R(1 + legF - 1.6, hipY, 3.2, -hipY - 1.8 - liftF, look.pants);
  R(1 + legF - 1.8, -2.2 - liftF, 4.8, 2.2, look.shoe);
  if (detail >= 2) R(1 + legF - 1.8, -0.7 - liftF, 4.8, 0.7, look.shoeShade);

  // Head and hair.
  E(0.8, -25.6 + bob, 5.8, 5.6, look.skin);
  if (detail >= 2) E(-0.6, -24.6 + bob, 3.2, 3.6, look.skinShade, -21 + bob);
  E(0.8, -25.6 + bob, 5.8, 5.6, look.skin, -24 + bob);
  E(0.5, -26.4 + bob, 6.3, 5.2, look.hair, -27.1 + bob);
  R(-5.7, -29.4 + bob, 4.6, 6.8, look.hair);
  R(1.2, -29 + bob, 5.6, 1.9, look.hair);
  if (look.hairStyle === 'messy') {
    R(-2.4, -32.2 + bob, 1.6, 1.6, look.hair);
    R(0.8, -32.6 + bob, 1.6, 1.8, look.hair);
    R(3.6, -31.6 + bob, 1.6, 1.4, look.hair);
  } else if (look.hairStyle === 'bun') {
    E(-4.4, -31 + bob, 2.4, 2.2, look.hair);
  } else if (look.hairStyle === 'long') {
    R(-6, -27 + bob, 3.6, 9, look.hair);
  }
  if (detail >= 3) R(-1.2, -31 + bob, 3.6, 0.9, look.hairHi);
  R(-1.6, -25.8 + bob, 1.8, 2.4, look.skinShade);

  // Face.
  R(3.7, -26.4 + bob, 1.1, pose.blink ? 0.5 : 2, '#22150e');
  if (detail >= 2) R(3, -28.1 + bob, 2.6, 0.7, look.hair);
  if (look.beard) {
    R(0.2, -23.4 + bob, 6.2, 2.8, look.hair);
    R(-0.6, -26 + bob, 1.3, 3, look.hair);
    if (detail >= 2) R(3.6, -22.6 + bob, 1.6, 0.6, look.skinShade);
  } else if (detail >= 2) {
    R(4.4, -22.2 + bob, 1.3, 0.6, look.skinShade);
    if (detail >= 3) R(3.4, -23.8 + bob, 1.4, 0.8, '#efa58c');
  }
  if (look.headset) R(-1.2, -21.2 + bob, 6.6, 1.2, '#1c1c22');

  // Front arm.
  if (pose.jump) {
    R(0.8, -27.6 + bob, 2.6, 8, look.shirt);
    R(0.8, -29.2 + bob, 2.6, 1.8, look.skin);
  } else {
    R(0.6 + armF, -19.4 + bob, 2.6, 8, look.shirt);
    R(0.6 + armF, -11.6 + bob, 2.6, 1.8, look.skin);
    if (look.watch && detail >= 1) R(0.6 + armF, -12.4 + bob, 2.6, 0.8, '#d8d8d8');
  }

  finish(ctx, W, H, era);
  return { canvas, ox, oy };
}

// Outline (every era) and rim light (modern eras) as pixel passes over the sprite.
function finish(ctx, W, H, era) {
  const image = ctx.getImageData(0, 0, W, H);
  const d = image.data;
  const alpha = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) alpha[i] = d[i * 4 + 3] > 127 ? 1 : 0;

  if (era.detail >= 3) {
    const rim = era.id === 'ai' ? [60, 242, 255] : [255, 210, 122];
    const fromLeft = era.id === 'ai';
    for (let y = 0; y < H; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (!alpha[i]) continue;
        const edge = fromLeft ? !alpha[i - 1] : !alpha[i + 1];
        if (!edge) continue;
        const p = i * 4;
        d[p] = Math.round(d[p] * 0.45 + rim[0] * 0.55);
        d[p + 1] = Math.round(d[p + 1] * 0.45 + rim[1] * 0.55);
        d[p + 2] = Math.round(d[p + 2] * 0.45 + rim[2] * 0.55);
      }
    }
  }

  const outline = era.id === 'ai' ? [10, 12, 30] : [27, 22, 38];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const p = i * 4;
      if (alpha[i]) {
        d[p + 3] = 255;
        continue;
      }
      d[p + 3] = 0;
      const near = (x > 0 && alpha[i - 1]) || (x < W - 1 && alpha[i + 1]) || (y > 0 && alpha[i - W]) || (y < H - 1 && alpha[i + W]);
      if (near) {
        d[p] = outline[0];
        d[p + 1] = outline[1];
        d[p + 2] = outline[2];
        d[p + 3] = 255;
      }
    }
  }
  ctx.putImageData(image, 0, 0);
}
