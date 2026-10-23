// Tiny synth for sound effects (music lives in music.js). The waveform changes by chapter:
// square waves early on, softer tones later.

import { startMusic, stopMusic } from './music.js';

const WAVE = ['square', 'square', 'triangle', 'sine', 'sawtooth'];
let ac = null;
let enabled = false;

export function setSound(on) {
  enabled = on;
  if (on && !ac) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) ac = new Ctx();
  }
  if (ac && ac.state === 'suspended') ac.resume();
  if (!ac) return;
  if (on) startMusic(ac);
  else stopMusic();
}

function tone(freq, start, dur, type, vol, slideTo = 0) {
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function sfx(name, eraIndex = 0) {
  if (!enabled || !ac) return;
  const type = WAVE[eraIndex] || 'square';
  const vol = type === 'square' ? 0.05 : 0.08;
  switch (name) {
    case 'start':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.12, type, vol));
      break;
    case 'jump':
      tone(330, 0, 0.16, type, vol, 660);
      break;
    case 'collect':
      tone(988, 0, 0.07, type, vol);
      tone(1319, 0.07, 0.16, type, vol);
      break;
    case 'upgrade':
      [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.07, 0.14, type, vol));
      tone(1568, 0.45, 0.4, type, vol * 0.8);
      break;
    case 'rewind':
      tone(660, 0, 0.18, type, vol * 0.7, 330);
      break;
    case 'door':
      tone(196, 0, 0.12, 'triangle', 0.08);
      tone(294, 0.1, 0.18, 'triangle', 0.08);
      break;
    case 'join':
      tone(784, 0, 0.08, type, vol);
      tone(988, 0.08, 0.08, type, vol);
      break;
    case 'charge':
      // Rising sweep while the level-up charges.
      tone(220, 0, 1.4, type, vol * 0.8, 880);
      tone(330, 0.2, 1.2, 'triangle', 0.04, 1320);
      break;
    case 'levelup':
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.06, 0.18, type, vol));
      [1047, 1319, 1568].forEach((f) => tone(f, 0.34, 0.9, 'triangle', 0.05));
      break;
    case 'tick':
      tone(1200, 0, 0.04, 'triangle', 0.05);
      break;
    case 'secret':
      [440, 554, 659, 880].forEach((f, i) => tone(f, i * 0.12, 0.3, 'sine', 0.07));
      break;
    default:
      break;
  }
}
