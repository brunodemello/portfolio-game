// Crisp pixel drawing in world units. Every shape is snapped to the era's pixel grid,
// so the same scene description gets chunkier or finer depending on the resolution.

const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111101101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101101111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010',
  8: '111101111101111', 9: '111101111001110',
  '.': '000000000000010', '-': '000000111000000', ':': '000010000010000', '/': '001001010100100',
  '!': '010010010000010', '?': '110001010000010', '&': '010101010101011', '+': '000010111010000',
  '>': '100010001010100', ' ': '000000000000000',
};

export class Painter {
  constructor(ctx) {
    this.ctx = ctx;
    this.par = 1;
  }

  // oy: extra units of sky above the scene (tall/portrait screens).
  begin(s, camX, w, h, oy = 0) {
    this.s = s;
    this.camX = camX;
    this.w = w;
    this.h = h;
    this.oy = oy;
    this.par = 1;
  }

  // World units -> pixel on this era's canvas.
  X(x) {
    return Math.round((x - this.camX * this.par) * this.s);
  }

  Y(y) {
    return Math.round((y + this.oy) * this.s);
  }

  visible(x, width) {
    const left = (x - this.camX * this.par) * this.s;
    return left + width * this.s >= -4 && left <= this.w + 4;
  }

  rect(x, y, w, h, color) {
    const x0 = this.X(x);
    const x1 = this.X(x + w);
    if (x1 < 0 || x0 > this.w) return;
    const y0 = this.Y(y);
    const y1 = this.Y(y + h);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
  }

  // One-pixel-wide rect regardless of resolution (outlines, sparkles).
  dot(x, y, color, size = 1) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(this.X(x), this.Y(y), size, size);
  }

  ellipse(cx, cy, rx, ry, color) {
    const s = this.s;
    const pcx = (cx - this.camX * this.par) * s;
    const prx = rx * s;
    if (pcx + prx < 0 || pcx - prx > this.w) return;
    const pcy = (cy + this.oy) * s;
    const pry = Math.max(0.5, ry * s);
    const ctx = this.ctx;
    ctx.fillStyle = color;
    for (let py = Math.round(pcy - pry); py < Math.round(pcy + pry); py++) {
      const dy = (py + 0.5 - pcy) / pry;
      const k = 1 - dy * dy;
      if (k <= 0) continue;
      const half = prx * Math.sqrt(k);
      const a = Math.round(pcx - half);
      const b = Math.round(pcx + half);
      if (b > a) ctx.fillRect(a, py, b - a, 1);
    }
  }

  // Triangle with a flat base: roofs, mountains, tree crowns.
  roof(left, right, baseY, apexX, apexY, color) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    const y0 = this.Y(apexY);
    const y1 = this.Y(baseY);
    for (let py = y0; py < y1; py++) {
      const t = (py - y0 + 0.5) / Math.max(1, y1 - y0);
      const a = this.X(apexX + (left - apexX) * t);
      const b = this.X(apexX + (right - apexX) * t);
      if (b > a) ctx.fillRect(a, py, b - a, 1);
    }
  }

  // Bitmap text. size = how many era pixels per font pixel.
  text(str, x, y, color, size = 1, align = 'center') {
    const chars = str.toUpperCase().split('');
    const width = chars.length * 4 * size - size;
    let px = this.X(x);
    if (align === 'center') px -= Math.round(width / 2);
    else if (align === 'right') px -= width;
    const py = this.Y(y);
    this.ctx.fillStyle = color;
    for (const ch of chars) {
      const glyph = FONT[ch] || FONT[' '];
      for (let i = 0; i < 15; i++) {
        if (glyph[i] === '1') this.ctx.fillRect(px + (i % 3) * size, py + Math.floor(i / 3) * size, size, size);
      }
      px += 4 * size;
    }
  }

  // Painted image placed in world units (left/top corner, size). Optional source crop.
  image(img, x, y, w, h, crop = null) {
    const x0 = this.X(x);
    const x1 = this.X(x + w);
    if (x1 < 0 || x0 > this.w) return;
    const y0 = this.Y(y);
    const y1 = this.Y(y + h);
    const c = this.ctx;
    // Pixel art: keep pixels crisp when enlarging, filter only when shrinking.
    const srcW = crop ? crop[2] : img.width;
    c.imageSmoothingEnabled = x1 - x0 < srcW;
    c.imageSmoothingQuality = 'high';
    if (crop) c.drawImage(img, crop[0], crop[1], crop[2], crop[3], x0, y0, x1 - x0, y1 - y0);
    else c.drawImage(img, x0, y0, x1 - x0, y1 - y0);
  }

  // Sign lettering with a real pixel font, fitted inside a rectangle given in world units.
  label(str, x, y, w, h, color, font = '"Press Start 2P"') {
    const c = this.ctx;
    const pw = w * this.s;
    let size = Math.max(4, h * this.s * 0.55);
    c.font = `${size}px ${font}`;
    const measured = c.measureText(str).width;
    if (measured > pw * 0.86) {
      size *= (pw * 0.86) / measured;
      c.font = `${size}px ${font}`;
    }
    c.fillStyle = color;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(str, this.X(x + w / 2), this.Y(y + h / 2) + size * 0.06);
  }

  // Font size that keeps a label about `units` tall at any resolution.
  fontSize(units) {
    return Math.max(1, Math.round((units * this.s) / 5));
  }
}
