// Keyboard, wheel, touch drag and on-screen buttons all end up in one place:
// held directions for walking, or a distance to travel for scroll-like input.

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

export function createInput(target, handlers) {
  const state = { left: false, right: false, run: false };
  let konami = 0;

  const isControl = (el) => el && el.closest && el.closest('button, a, input, textarea, select, dialog');

  window.addEventListener('keydown', (e) => {
    if (handlers.blocked()) {
      if (e.key === 'Escape') handlers.onEscape();
      return;
    }
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    konami = key === KONAMI[konami] ? konami + 1 : key === KONAMI[0] ? 1 : 0;
    if (konami === KONAMI.length) {
      konami = 0;
      handlers.onKonami();
    }
    if (key === 'Shift') state.run = true;
    if (key === 'ArrowLeft' || key === 'a') {
      state.left = true;
      handlers.onActivity();
      e.preventDefault();
    } else if (key === 'ArrowRight' || key === 'd') {
      state.right = true;
      handlers.onActivity();
      e.preventDefault();
    } else if (key === 'ArrowUp' || key === 'w') {
      if (!e.repeat) handlers.onUp();
      e.preventDefault();
    } else if (key === ' ') {
      if (isControl(e.target)) return;
      if (!e.repeat) handlers.onJump();
      e.preventDefault();
    } else if (key === 'Enter') {
      if (isControl(e.target)) return;
      handlers.onEnter();
    } else if (key === 'ArrowDown' || key === 's') {
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === 'Shift') state.run = false;
    if (key === 'ArrowLeft' || key === 'a') state.left = false;
    if (key === 'ArrowRight' || key === 'd') state.right = false;
  });

  window.addEventListener('blur', () => {
    state.left = false;
    state.right = false;
    state.run = false;
  });

  window.addEventListener('wheel', (e) => {
    if (handlers.blocked() || e.target.closest('dialog')) return;
    e.preventDefault();
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * scale;
    handlers.onTravel(delta);
  }, { passive: false });

  // Touch/pen drag on the scene: finger left or up = walk forward, like scrolling a page.
  let drag = null;
  target.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || isControl(e.target) || handlers.blocked()) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  target.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    handlers.onDrag(-(dx + dy));
  });
  const end = (e) => {
    if (drag && e.pointerId === drag.id) drag = null;
  };
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);

  // On-screen buttons (mobile).
  for (const button of document.querySelectorAll('[data-hold]')) {
    const dir = button.dataset.hold;
    const set = (v) => (e) => {
      e.preventDefault();
      state[dir] = v;
      if (v) handlers.onActivity();
    };
    button.addEventListener('pointerdown', set(true));
    button.addEventListener('pointerup', set(false));
    button.addEventListener('pointerleave', set(false));
    button.addEventListener('pointercancel', set(false));
    button.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  for (const button of document.querySelectorAll('[data-tap="jump"]')) {
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handlers.onUp();
    });
  }

  return state;
}
