// Short-lived particles in world units: sparkles, poofs, confetti.
// They are painted into each era's canvas, so they get pixelated like everything else.

export class Effects {
  constructor() {
    this.parts = [];
  }

  burst(x, y, { count = 16, colors = ['#ffffff'], speed = 40, life = 0.8, gravity = 60, size = 1.6, up = 0 } = {}) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.parts.push({
        x, y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v - up,
        life: life * (0.6 + Math.random() * 0.6),
        age: 0,
        gravity,
        size: size * (0.7 + Math.random() * 0.6),
        color: colors[i % colors.length],
      });
    }
  }

  update(dt) {
    for (const p of this.parts) {
      p.age += dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.parts = this.parts.filter((p) => p.age < p.life);
  }

  draw(P) {
    for (const p of this.parts) {
      const k = 1 - p.age / p.life;
      const size = Math.max(0.6, p.size * (0.4 + k * 0.6));
      P.rect(p.x - size / 2, p.y - size / 2, size, size, p.color);
    }
  }
}
