// Everything drawn in HTML on top of the canvas: billboards, timeline, inventory,
// era badge, door prompts and the two panels. Text stays real text.

import { ERAS, MAX_X, eraIndexAt } from './world.js';
import { T } from './i18n.js';

const $ = (sel) => document.querySelector(sel);

const ACHIEVEMENTS = T.achievements;
const GROUP_NAMES = T.groups;

// Copies a value (the e-mail) and confirms on the button; falls back to a hidden textarea
// where the clipboard API is blocked. Inside a modal dialog the textarea must live in it.
async function copyFrom(button) {
  const text = button.dataset.copy;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = el('textarea');
    area.value = text;
    (button.closest('dialog') || document.body).append(area);
    area.select();
    try {
      document.execCommand('copy');
    } catch {
      // Nothing else to try: the address is still written on screen.
    }
    area.remove();
  }
  button.dataset.label ||= button.textContent;
  button.textContent = T.emailCopied;
  button.classList.add('copied');
  clearTimeout(button.copyTimer);
  button.copyTimer = setTimeout(() => {
    button.textContent = button.dataset.label;
    button.classList.remove('copied');
  }, 1800);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function readStations() {
  return [...document.querySelectorAll('#text-version .station')].map((node) => ({
    id: node.dataset.id,
    x: Number(node.dataset.x),
    label: node.dataset.label || '',
    secret: node.hasAttribute('data-secret'),
    kicker: node.querySelector('.kicker')?.textContent.trim() || '',
    title: node.querySelector('h2').textContent.trim(),
    role: node.querySelector('.role')?.textContent.trim() || '',
    body: [...node.querySelectorAll('.body')].map((p) => p.textContent.trim()).join('\n\n'),
    steps: [...node.querySelectorAll('.steps li')].map((li) => li.textContent.trim()),
    // Optional world position where each step lights up (otherwise the Jr.com stars logic).
    stepsFrom: (node.querySelector('.steps')?.dataset.from || '').split(',').filter(Boolean).map(Number),
    board: [...node.querySelectorAll('.board li')].map((li) => [...li.children].map((c) => c.textContent.trim())),
    links: [...node.querySelectorAll('a.case')].map((a) => [a.getAttribute('href'), a.textContent.trim()]),
    shots: [...node.querySelectorAll('.shots img')].map((im) => [im.getAttribute('src'), im.getAttribute('alt')]),
    skills: (node.dataset.skills || '').split('|').filter(Boolean),
  }));
}

export class Hud {
  constructor(stations, handlers) {
    this.stations = stations;
    this.handlers = handlers;
    this.layer = $('#billboards');
    this.boards = new Map();
    this.openId = null;
    this.collectedCount = 0;
    this.year = '';
    this.panelOpen = null;
    this.docked = matchMedia('(max-width: 720px), (max-height: 520px)');
    // Skills first: the ending card's character sheet needs the list.
    this.readSkills();
    this.buildBillboards();
    this.buildTimeline();
    this.buildWheel();
    this.bindPanels();
    $('#sound').addEventListener('click', () => {
      const on = $('#sound').getAttribute('aria-pressed') !== 'true';
      $('#sound').setAttribute('aria-pressed', String(on));
      $('#sound span').textContent = on ? 'ON' : 'OFF';
      handlers.onSound(on);
    });
    $('#start').addEventListener('click', () => handlers.onStart(false));
    $('#continue').addEventListener('click', () => handlers.onStart(true));
    $('#watch').addEventListener('click', () => handlers.onWatch());
    $('#watch-stop').addEventListener('click', () => handlers.onWatchStop());
    $('#nudge-close').addEventListener('click', () => this.nudge(false));
    for (const button of document.querySelectorAll('[data-copy]')) button.addEventListener('click', () => copyFrom(button));
    try {
      if (sessionStorage.getItem('bdm-seen')) $('#title-screen').classList.add('quick');
      sessionStorage.setItem('bdm-seen', '1');
    } catch {
      // Storage blocked: just play the full intro.
    }
    for (const button of document.querySelectorAll('#door-prompts .door-prompt')) {
      button.addEventListener('click', () => handlers.onDoor(button.dataset.door));
    }
  }

  // ---------- billboards ----------

  buildBillboards() {
    for (const st of this.stations) {
      const era = ERAS[eraIndexAt(st.x)];
      const root = el('div', `bb bb--${era.id}${st.secret ? ' bb--secret' : ''}`);
      root.dataset.id = st.id;
      const screen = el('div', 'bb-screen');
      screen.append(el('p', 'bb-kicker', st.kicker), el('h3', 'bb-title', st.title));
      if (st.role) screen.append(el('p', 'bb-role', st.role));
      let steps = null;
      if (st.steps.length) {
        steps = el('ol', 'bb-steps');
        st.steps.forEach((s) => steps.append(el('li', '', s)));
        screen.append(steps);
      }
      let board = null;
      if (st.board.length) {
        board = el('ul', 'bb-board');
        for (const row of st.board) {
          const li = el('li');
          row.forEach((cell) => li.append(el('span', '', cell)));
          board.append(li);
        }
        screen.append(board);
      }
      const more = el('div', 'bb-more');
      if (st.shots.length) {
        const shots = el('div', 'bb-shots');
        for (const [src, alt] of st.shots) {
          const im = el('img');
          im.loading = 'lazy';
          im.src = src;
          im.alt = alt;
          shots.append(im);
        }
        more.append(shots);
      }
      const body = el('p', 'bb-body');
      more.append(body);
      if (st.skills.length) {
        const skills = el('ul', 'bb-skills');
        st.skills.forEach((s) => skills.append(el('li', '', s)));
        more.append(skills);
      }
      if (st.links.length) {
        const links = el('div', 'bb-links');
        for (const [href, text] of st.links) {
          const a = el('a', 'bb-link', st.links.length > 1 ? `${text} →` : T.readCase);
          a.href = href;
          links.append(a);
        }
        more.append(links);
      }
      if (st.id === 'office') more.append(this.endingCard());
      screen.append(more);
      root.append(screen, el('div', 'bb-post'));
      this.layer.append(root);
      this.boards.set(st.id, { st, era, root, body, steps, board, typed: 0, width: 0, shown: false, open: false });
    }
  }

  // The end of the road: a compact character sheet (class, facts, one bar per skill group),
  // the score, the two doors as buttons and a quiet row of extras.
  endingCard() {
    const card = el('div', 'bb-ending');
    const sheet = el('div', 'sheet');
    const portrait = el('div', 'sheet-portrait');
    const face = el('img');
    face.src = new URL('../art/web/bruno-2026-idle.webp', import.meta.url).href;
    face.alt = '';
    portrait.append(face);
    const head = el('div', 'sheet-head');
    head.append(el('b', 'bb-level', T.endLevel(11, T.classes.head)), el('p', 'sheet-facts', T.sheetFacts.join(' · ')));
    sheet.append(portrait, head);
    const attrs = el('ul', 'sheet-attrs');
    for (const group of Object.keys(GROUP_NAMES)) {
      const total = this.skillList.filter((s) => s.group === group).length;
      if (!total) continue;
      const li = el('li');
      li.dataset.group = group;
      const bar = el('span', 'sheet-bar');
      bar.append(el('i'));
      li.append(el('span', 'sheet-name', T.groupsShort[group]), bar);
      attrs.append(li);
    }
    const total = this.stations.reduce((n, st) => n + st.skills.length, 0);
    const stats = el('p', 'bb-stats');
    stats.append(el('b', 'bb-count', '0'), `/${total} ${T.endStats[0]} · `, el('b', 'bb-achv', '0'), `/${Object.keys(ACHIEVEMENTS).length} ${T.endStats[1]}`);
    const doors = el('div', 'bb-actions');
    const jobs = el('button', 'bb-btn primary', T.endJobs);
    jobs.dataset.panel = 'vagas';
    const projects = el('button', 'bb-btn primary', T.endProjects);
    projects.dataset.panel = 'projetos';
    doors.append(jobs, projects);
    const extras = el('div', 'bb-extras');
    const mail = el('button', '', T.copyEmail);
    mail.dataset.copy = 'contact@brunodemello.dev';
    const wheel = el('button', 'bb-wheel', T.endWheel);
    const replay = el('button', '', T.endReplay);
    replay.addEventListener('click', () => this.handlers.onReplay());
    const share = el('button', '', T.endShare);
    share.addEventListener('click', async () => {
      const url = location.href.split('?')[0];
      try {
        if (navigator.share) await navigator.share({ title: document.title, url });
        else {
          await navigator.clipboard.writeText(url);
          share.textContent = T.copied;
        }
      } catch {
        // Share sheet dismissed or clipboard blocked: nothing to do.
      }
    });
    [jobs, projects, mail, wheel, replay, share].forEach((b) => (b.type = 'button'));
    extras.append(mail, wheel, replay, share);
    card.append(sheet, attrs, stats, doors, extras);
    return card;
  }

  // Attribute bars on the character sheet, one per skill group.
  updateSheet() {
    for (const li of document.querySelectorAll('.sheet-attrs li')) {
      const all = this.skillList.filter((s) => s.group === li.dataset.group);
      const got = all.filter((s) => this.unlocked.has(s.name)).length;
      li.querySelector('i').style.transform = `scaleX(${(got / all.length).toFixed(3)})`;
      li.title = `${GROUP_NAMES[li.dataset.group]} · ${got}/${all.length}`;
    }
  }

  // Called every frame with the player's situation.
  updateBillboards(view, dt, reduced) {
    const docked = this.docked.matches;
    this.layer.classList.toggle('docked', docked);
    for (const b of this.boards.values()) {
      const near = view.near.has(b.st.id);
      const open = this.openId === b.st.id;
      if (near !== b.shown) {
        b.shown = near;
        b.root.classList.toggle('is-near', near);
      }
      if (open !== b.open) {
        b.open = open;
        b.root.classList.toggle('is-open', open);
        if (open) {
          b.typed = reduced ? b.st.body.length : 0;
          b.body.textContent = b.st.body.slice(0, b.typed);
          if (b.board) this.flipBoard(b.board, reduced);
        }
        b.width = 0;
      }
      if (open && b.typed < b.st.body.length) {
        b.typed = Math.min(b.st.body.length, b.typed + dt * 90);
        b.body.textContent = b.st.body.slice(0, Math.floor(b.typed));
        b.body.classList.toggle('typing', b.typed < b.st.body.length);
      }
      if (b.steps) {
        [...b.steps.children].forEach((li, i) => {
          const on = b.st.stepsFrom.length ? view.x >= b.st.stepsFrom[i] : i <= view.jrStep;
          li.classList.toggle('on', on);
          li.classList.toggle('now', b.st.stepsFrom.length > 0 && on && !(view.x >= b.st.stepsFrom[i + 1]));
        });
      }
      if (!near) continue;
      if (docked) {
        b.root.style.transform = '';
        continue;
      }
      if (!b.width) b.width = b.root.offsetWidth;
      const center = (b.st.x - view.camX) * view.unitCss;
      const left = Math.max(10, Math.min(view.cssWidth - b.width - 10, center - b.width / 2));
      b.root.style.transform = `translate3d(${Math.round(left)}px,0,0)`;
      b.root.style.setProperty('--post', `${Math.round(center - left)}px`);
    }
  }

  // Split-flap board: letters spin through random glyphs before settling.
  flipBoard(board, reduced) {
    if (reduced) return;
    const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (const span of board.querySelectorAll('span')) {
      const final = span.dataset.final || span.textContent;
      span.dataset.final = final;
      let frame = 0;
      const tick = () => {
        frame++;
        span.textContent = final.split('').map((c, i) => (c === ' ' || frame > 6 + i * 2 ? c : glyphs[Math.floor(Math.random() * glyphs.length)])).join('');
        if (frame <= 6 + final.length * 2) setTimeout(tick, 45);
      };
      tick();
    }
  }

  boardRect(id) {
    const b = this.boards.get(id);
    return b ? b.root.querySelector('.bb-screen').getBoundingClientRect() : null;
  }

  // ---------- skills: collection effect ----------

  // Every skill of a milestone bursts out of its billboard, arcs to the orb leaving a
  // sparkle trail, and lands with a pulse; a toast sums up the haul.
  collectGroup(st, chapterId, reduced, onEach) {
    const from = this.boardRect(st.id);
    const skills = st.skills;
    skills.forEach((skill, i) => {
      setTimeout(() => this.flySkill(skill, chapterId, from, i, skills.length, reduced, onEach), 200 + i * 170);
    });
    setTimeout(() => this.toast(`+${skills.length} skills`, st.title, chapterId), 200 + skills.length * 170 + 700);
  }

  flySkill(skill, chapterId, from, i, total, reduced, onLand) {
    const orb = $('#skill-orb').getBoundingClientRect();
    const tx = orb.left + orb.width / 2;
    const ty = orb.top + orb.height / 2;
    const start = from && from.width
      ? { x: from.left + from.width * ((i + 0.5) / total), y: from.bottom - 20 }
      : { x: innerWidth / 2, y: innerHeight / 2 };
    const chip = el('span', `chip chip--${chapterId} chip-fly`, skill);
    document.body.append(chip);
    const land = () => {
      chip.remove();
      this.landSkill(skill, chapterId);
      onLand?.();
    };
    if (reduced) return land();

    // Quadratic arc: up and out first, then down into the orb.
    const cx = (start.x + tx) / 2 + (i % 2 ? 60 : -60);
    const cy = Math.min(start.y, ty) - 160 - i * 12;
    const point = (t) => ({
      x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * cx + t ** 2 * tx,
      y: (1 - t) ** 2 * start.y + 2 * (1 - t) * t * cy + t ** 2 * ty,
    });
    const frames = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      const p = point(t);
      const pop = t < 0.18 ? 0.4 + t * 5 : t > 0.85 ? 1.3 - (t - 0.85) * 5 : 1.3;
      frames.push({ transform: `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${pop}) rotate(${(1 - t) * (i % 2 ? 14 : -14)}deg)`, opacity: t > 0.95 ? 0 : 1 });
    }
    const duration = 1000;
    const anim = chip.animate(frames, { duration, easing: 'cubic-bezier(.45,.05,.4,1)' });
    // Sparkle trail sampled along the same arc.
    const born = performance.now();
    const trail = () => {
      const t = (performance.now() - born) / duration;
      if (t >= 1) return;
      const p = point(Math.min(1, t * 1.02));
      const spark = el('i', `spark spark--${chapterId}`);
      spark.style.transform = `translate(${p.x + (Math.random() - 0.5) * 18}px, ${p.y + (Math.random() - 0.5) * 18}px)`;
      document.body.append(spark);
      setTimeout(() => spark.remove(), 650);
      requestAnimationFrame(trail);
    };
    requestAnimationFrame(trail);
    anim.onfinish = land;
  }

  // Skills earned while flying past on the timeline: no flight, no pop.
  collectQuiet(st, chapterId) {
    st.skills.forEach((skill) => this.landSkill(skill, chapterId, true));
  }

  landSkill(skill, chapterId, quiet = false) {
    this.unlocked.add(skill);
    this.collectedCount++;
    const count = $('#skill-count');
    count.textContent = String(this.collectedCount);
    for (const c of document.querySelectorAll('.bb-count')) c.textContent = String(this.collectedCount);
    this.updateSheet();
    if (this.collectedCount === this.skillList.length) this.achieve('collector');
    const orb = $('#skill-orb');
    orb.style.setProperty('--p', `${(this.collectedCount / this.skillList.length) * 360}deg`);
    orb.dataset.chapter = chapterId;
    orb.classList.remove('hit');
    void orb.offsetWidth;
    orb.classList.add('hit');
    if (!quiet) {
      const pop = el('span', `skill-pop chip chip--${chapterId}`, `+ ${skill}`);
      $('#skill-pops').append(pop);
      while ($('#skill-pops').children.length > 3) $('#skill-pops').firstElementChild.remove();
      setTimeout(() => pop.remove(), 1500);
    }
    this.wheelNodes.get(skill)?.classList.remove('locked');
  }

  // Toasts queue up so several milestones collected at once never overlap.
  toast(title, subtitle, chapterId) {
    const now = performance.now();
    const at = Math.max(now, this.toastFree || 0);
    this.toastFree = at + 1800;
    setTimeout(() => {
      const node = el('div', `skill-toast chip--${chapterId}`);
      node.append(el('b', '', title), el('span', '', subtitle));
      $('#app').append(node);
      setTimeout(() => node.remove(), 2600);
    }, at - now);
  }

  // ---------- saved progress ----------

  offerContinue() {
    $('#continue').hidden = false;
    $('#continue').textContent = T.continueGame;
    $('#start').textContent = T.newGame;
    $('.title-card').classList.add('has-save');
  }

  restoreAchievements(list) {
    this.achieved = new Set(list.filter((id) => ACHIEVEMENTS[id]));
    for (const c of document.querySelectorAll('.bb-achv')) c.textContent = String(this.achieved.size);
  }

  // ---------- achievements ----------

  achieve(id) {
    this.achieved ||= new Set();
    if (this.achieved.has(id) || !ACHIEVEMENTS[id]) return;
    this.achieved.add(id);
    for (const c of document.querySelectorAll('.bb-achv')) c.textContent = String(this.achieved.size);
    const [title, desc] = ACHIEVEMENTS[id];
    const now = performance.now();
    const at = Math.max(now, this.achvFree || 0);
    this.achvFree = at + 2200;
    setTimeout(() => {
      const node = el('div', 'achievement');
      const text = el('div', 'achievement-text');
      text.append(el('small', '', `${T.achievement} ${this.achieved.size}/${Object.keys(ACHIEVEMENTS).length}`), el('b', '', title), el('span', '', desc));
      node.append(el('span', 'achievement-icon', '★'), text);
      $('#app').append(node);
      this.handlers.onAchievement?.();
      setTimeout(() => node.remove(), 3400);
    }, at - now);
  }

  // ---------- skills: wheel ----------

  readSkills() {
    const info = new Map();
    for (const li of document.querySelectorAll('#skills-data li')) {
      info.set(li.dataset.skill, {
        name: li.dataset.skill,
        code: li.dataset.code,
        group: li.dataset.group,
        desc: li.textContent.replace(li.dataset.skill, '').trim(),
      });
    }
    // Wheel order follows the career; each skill remembers where it was earned.
    this.skillList = [];
    for (const st of this.stations) {
      for (const name of st.skills) {
        const meta = info.get(name) || { name, code: name.slice(0, 3).toUpperCase(), group: 'fund', desc: '' };
        this.skillList.push({ ...meta, station: st, chapter: ERAS[eraIndexAt(st.x)] });
      }
    }
    this.unlocked = new Set();
    this.wheelNodes = new Map();
  }

  buildWheel() {
    const ring = $('#wheel-ring');
    const step = 360 / this.skillList.length;
    this.skillList.forEach((s, i) => {
      const node = el('button', `wheel-node locked group-${s.group}`);
      node.type = 'button';
      node.style.setProperty('--a', `${i * step}deg`);
      node.style.setProperty('--i', String(i));
      node.append(el('span', 'wheel-code', s.code), el('span', 'wheel-label', s.name));
      node.setAttribute('aria-label', s.name);
      node.addEventListener('click', () => this.selectSkill(i));
      ring.append(node);
      this.wheelNodes.set(s.name, node);
    });
    this.wheelIndex = 0;
    this.wheelTurn = 0;
    const dialog = $('#skill-wheel');
    $('#skill-orb').addEventListener('click', () => this.openWheel());
    for (const b of document.querySelectorAll('.bb-wheel')) b.addEventListener('click', () => this.openWheel());
    dialog.querySelector('[data-close-wheel]').addEventListener('click', () => dialog.close());
    $('#wheel-prev').addEventListener('click', () => this.selectSkill(this.wheelIndex - 1));
    $('#wheel-next').addEventListener('click', () => this.selectSkill(this.wheelIndex + 1));
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'ArrowUp') this.selectSkill(this.wheelIndex - 1);
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'ArrowDown') this.selectSkill(this.wheelIndex + 1);
      else return;
      e.preventDefault();
    });
    let wheelAcc = 0;
    dialog.addEventListener('wheel', (e) => {
      e.preventDefault();
      wheelAcc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(wheelAcc) < 40) return;
      this.selectSkill(this.wheelIndex + Math.sign(wheelAcc));
      wheelAcc = 0;
    }, { passive: false });
    let swipe = null;
    dialog.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') swipe = e.clientX;
    });
    dialog.addEventListener('pointerup', (e) => {
      if (swipe === null) return;
      const dx = e.clientX - swipe;
      if (Math.abs(dx) > 30) this.selectSkill(this.wheelIndex - Math.sign(dx));
      swipe = null;
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => {
      dialog.classList.remove('spun');
      this.panelOpen = null;
      this.handlers.onPanelClosed();
    });
    window.addEventListener('keydown', (e) => {
      if ((e.key === 'k' || e.key === 'K') && !this.panelOpen && !e.target.closest?.('input, textarea')) this.openWheel();
    });
  }

  openWheel() {
    const dialog = $('#skill-wheel');
    if (dialog.open) return;
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    this.panelOpen = 'wheel';
    // Start on the most recent skill earned.
    const last = [...this.skillList.keys()].filter((i) => this.unlocked.has(this.skillList[i].name)).pop();
    this.selectSkill(last ?? 0, true);
    dialog.showModal();
    requestAnimationFrame(() => dialog.classList.add('spun'));
    this.achieve('wheel');
    this.handlers.onWheel?.();
  }

  // Rotates the ring so skill i sits at the top, taking the shortest way around.
  selectSkill(i, instant = false) {
    const n = this.skillList.length;
    const target = ((i % n) + n) % n;
    let delta = target - this.wheelIndex;
    if (delta > n / 2) delta -= n;
    if (delta < -n / 2) delta += n;
    this.wheelTurn += delta;
    this.wheelIndex = target;
    const ring = $('#wheel-ring');
    ring.classList.toggle('instant', instant);
    ring.style.setProperty('--rot', `${-this.wheelTurn * (360 / n)}deg`);
    this.wheelNodes.forEach((node) => node.classList.remove('selected', 'near'));
    for (let k = -2; k <= 2; k++) {
      const s = this.skillList[(target + k + n) % n];
      this.wheelNodes.get(s.name).classList.add(k === 0 ? 'selected' : 'near');
    }
    const s = this.skillList[target];
    const open = this.unlocked.has(s.name);
    const center = $('#skill-wheel .wheel-center');
    center.className = `wheel-center group-${s.group}${open ? '' : ' is-locked'}`;
    center.classList.remove('swap');
    void center.offsetWidth;
    center.classList.add('swap');
    $('#wheel-group').textContent = GROUP_NAMES[s.group] || '';
    $('#wheel-name').textContent = open ? s.name : '???';
    $('#wheel-desc').textContent = open ? s.desc : T.locked;
    $('#wheel-origin').textContent = open
      ? `${T.earnedAt}: ${s.station.kicker} · ${s.station.title}`
      : T.appearsIn(s.chapter.index + 1, s.chapter.name);
    $('#wheel-progress').textContent = `${this.unlocked.size}/${n}`;
    if (!instant) this.handlers.onWheelTick?.();
  }

  // ---------- timeline, year, era ----------

  buildTimeline() {
    const stops = $('#timeline-stops');
    for (const st of this.stations) {
      if (!st.label) continue;
      const b = el('button', 'stop', st.label);
      b.type = 'button';
      b.style.left = `${(st.x / MAX_X) * 100}%`;
      b.dataset.id = st.id;
      b.addEventListener('click', () => this.handlers.onTravelTo(st.x));
      stops.append(b);
    }
  }

  updateTimeline(x, currentId) {
    $('#timeline-fill').style.transform = `scaleX(${Math.max(0, Math.min(1, x / MAX_X))})`;
    for (const b of document.querySelectorAll('#timeline-stops .stop')) b.classList.toggle('current', b.dataset.id === currentId);
  }

  setYear(year) {
    if (year === this.year) return;
    this.year = year;
    const node = $('#year');
    node.textContent = year;
    $('#year-prefix').hidden = year === T.today;
    node.classList.remove('tick');
    void node.offsetWidth;
    node.classList.add('tick');
  }

  setEra(era, animate) {
    document.documentElement.dataset.era = era.id;
    $('#era-name').textContent = era.name;
    if (!this.className) $('#era-spec').textContent = era.spec;
    if (!animate) return;
    const badge = $('#era-badge');
    badge.classList.remove('upgrade');
    void badge.offsetWidth;
    badge.classList.add('upgrade');
  }

  // HUD level and the XP bar toward the next one.
  setLevel(level, progress) {
    if (this.level !== level) {
      this.level = level;
      const node = $('#level');
      node.textContent = String(level);
      $('#level-label').textContent = T.levelShort;
      node.classList.remove('tick');
      void node.offsetWidth;
      node.classList.add('tick');
    }
    $('#level-fill').style.transform = `scaleX(${progress.toFixed(3)})`;
  }

  // The big level-up card shown at the reveal.
  // Class-change card: "NEW CLASS! · Senior Developer → Tech Lead · LEVEL 9 · chapter".
  levelUpCard({ level, name, fromClass, toClass, skills, id }) {
    $('#levelup')?.remove();
    const card = el('div', `levelup chip--${id}`);
    card.id = 'levelup';
    const stars = el('div', 'levelup-stars', '★ ★ ★');
    card.append(el('small', 'levelup-kicker', T.newClass), stars);
    if (fromClass && fromClass !== toClass) card.append(el('span', 'levelup-from', fromClass));
    card.append(el('b', 'levelup-title', toClass));
    card.append(el('span', 'levelup-role', `${T.level} ${level} · ${name}`));
    if (skills) card.append(el('em', 'levelup-skills', T.skillsIn(skills)));
    $('#app').append(card);
    setTimeout(() => card.remove(), 3200);
  }

  // Current class, shown under the chapter name.
  setClass(name) {
    if (this.className === name) return;
    this.className = name;
    $('#era-spec').textContent = name;
  }

  // Team size next to the level; hidden until the first dev joins.
  setTeam(n) {
    if (this.team === n) return;
    this.team = n;
    const node = $('#team');
    $('.hud-team').hidden = n === 0;
    node.textContent = String(n);
    node.classList.remove('tick');
    void node.offsetWidth;
    node.classList.add('tick');
  }

  // "+1 on the team" floating up from a dev as they join.
  teamPop(cssX, cssY, chapterId) {
    const pop = el('div', `lvpop team chip--${chapterId}`);
    pop.append(el('b', '', '+1'), el('small', '', T.teamPop));
    pop.style.left = `${Math.round(cssX)}px`;
    pop.style.top = `${Math.round(cssY)}px`;
    $('#app').append(pop);
    setTimeout(() => pop.remove(), 1600);
  }

  // A billboard counts as read once its text has finished typing.
  boardRead(id) {
    const b = this.boards.get(id);
    return Boolean(b && b.open && b.typed >= b.st.body.length);
  }

  // "+1 LV" floating up from Bruno's head.
  levelPop(level, cssX, cssY, chapterId) {
    const pop = el('div', `lvpop chip--${chapterId}`);
    pop.append(el('b', '', `+1 ${T.levelShort}`), el('small', '', `${T.level} ${level}`));
    pop.style.left = `${Math.round(cssX)}px`;
    pop.style.top = `${Math.round(cssY)}px`;
    $('#app').append(pop);
    setTimeout(() => pop.remove(), 1600);
  }

  banner(text, subtitle, eraId) {
    const node = $('#era-banner');
    node.hidden = false;
    node.className = `era-banner era-banner--${eraId}`;
    node.replaceChildren(el('small', '', text), el('b', '', subtitle));
    void node.offsetWidth;
    node.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      node.hidden = true;
    }, 1900);
  }

  flash() {
    const node = $('#flash');
    node.classList.remove('on');
    void node.offsetWidth;
    node.classList.add('on');
  }

  // ---------- doors, panels, title, hint ----------

  // At the office, both doors show a button over them; the nearest one is highlighted.
  doorPrompts(state) {
    const wrap = $('#door-prompts');
    wrap.hidden = !state;
    if (!state) return;
    for (const button of wrap.querySelectorAll('.door-prompt')) {
      const pos = state.positions[button.dataset.door];
      // Keep both buttons on screen even when the office is wider than a phone.
      button.style.left = `${Math.round(Math.max(64, Math.min(innerWidth - 64, pos.x)))}px`;
      button.style.top = `${Math.round(pos.y)}px`;
      button.classList.toggle('near', state.near === button.dataset.door);
    }
  }

  bindPanels() {
    for (const button of document.querySelectorAll('[data-panel]')) {
      button.addEventListener('click', () => this.handlers.onPanel(button.dataset.panel));
    }
    for (const dialog of document.querySelectorAll('dialog.panel')) {
      dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.close();
      });
      dialog.addEventListener('close', () => {
        this.panelOpen = null;
        this.handlers.onPanelClosed();
      });
    }
  }

  openPanel(id) {
    const dialog = document.getElementById(`panel-${id}`);
    if (!dialog || dialog.open) return;
    for (const d of document.querySelectorAll('dialog.panel[open]')) d.close();
    this.panelOpen = id;
    this.nudge(false);
    dialog.showModal();
  }

  hideTitle() {
    const title = $('#title-screen');
    title.classList.add('leaving');
    setTimeout(() => {
      title.hidden = true;
    }, 700);
  }

  // Watch mode: the bar that says so and hands control back.
  watching(on) {
    $('#watch-bar').hidden = !on;
  }

  // "Enjoying it? Talk to me now": shown once, hides by itself.
  nudge(show) {
    const node = $('#nudge');
    clearTimeout(this.nudgeTimer);
    node.hidden = !show;
    if (show) this.nudgeTimer = setTimeout(() => (node.hidden = true), 14000);
  }

  hint(show) {
    $('#hint').hidden = !show;
  }
}
