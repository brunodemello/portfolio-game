// Painted, generated art. Loads art/web/assets.json and the WebP files next to it.
// The first chapter loads up front; the rest streams in chapter order, two files at a
// time, and anything the camera needs before its turn jumps the queue.

const version = new URL(import.meta.url).search;
const base = new URL('../art/web/', import.meta.url);

const images = new Map();
const requested = new Set();
let meta = { pxPerUnit: 6, assets: {} };

const CHAPTERS = [
  ['bg-town-far', 'bg-town-mid', 'ground-campus', 'bld-unesp', 'bruno-2013-student-idle', 'bruno-2013-student-walk', 'bruno-2013-student-run', 'bruno-2013-student-jump', 'prop-jacaranda', 'prop-ipe', 'prop-tree-round', 'prop-lamp-classic', 'prop-bench', 'prop-bush', 'prop-bush-flowers'],
  ['bruno-2015-junior-idle', 'bruno-2015-junior-walk', 'bruno-2015-junior-run', 'bruno-2015-junior-jump', 'bld-jrcom', 'bld-i9', 'bruno-2017-i9-idle', 'bruno-2017-i9-walk', 'bruno-2017-i9-run', 'bruno-2017-i9-jump'],
  ['bg-city-far', 'bg-city-mid', 'ground-city', 'bld-mktnow', 'bruno-2018-dev-idle', 'bruno-2018-dev-walk', 'bruno-2018-dev-run', 'bruno-2018-dev-jump', 'prop-palm', 'bld-airport', 'prop-plane', 'bld-email', 'prop-envelope', 'bld-busstop', 'prop-bus'],
  ['bg-metro-far', 'bg-metro-mid', 'bld-techlead', 'bruno-2024-lead-idle', 'bruno-2024-lead-walk', 'bruno-2024-lead-run', 'bruno-2024-lead-jump', 'team', 'prop-planter-tree', 'prop-lamp-modern'],
  ['bg-night-far', 'bg-night-mid', 'ground-night', 'bruno-2026-idle', 'bruno-2026-walk', 'bruno-2026-run', 'bruno-2026-jump', 'bld-dept', 'prop-neon-tree', 'prop-lamp-neon', 'bld-labs', 'bld-office'],
];

function load(name) {
  if (requested.has(name)) return Promise.resolve();
  requested.add(name);
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      images.set(name, image);
      resolve();
    };
    image.onerror = () => resolve();
    image.src = new URL(`${name}.webp${version}`, base).href;
  });
}

export async function loadArt() {
  try {
    const res = await fetch(new URL(`assets.json${version}`, base));
    meta = await res.json();
  } catch {
    return;
  }
  await Promise.all(CHAPTERS[0].map(load));
  // Unlisted assets (like the retired char-* sheets) only load if something asks for them.
  const queue = CHAPTERS.slice(1).flat();
  const worker = async () => {
    while (queue.length) await load(queue.shift());
  };
  worker();
  worker();
}

// Returns the image if ready; otherwise asks for it right away and returns null.
export function img(name) {
  const image = images.get(name);
  if (!image && meta.assets[name]) load(name);
  return image || null;
}

export function info(name) {
  return meta.assets[name] || null;
}
