// Generative chiptune, one mood per chapter. A bass line, an arpeggio over the
// chords and a soft hi-hat, scheduled slightly ahead with the Web Audio clock.
// Starts only when the visitor turns sound on.

const CHAPTERS = [
  // Faculdade: calm morning, warm triangle waves.
  { bpm: 84, key: 53, wave: 'triangle', lead: 'triangle', chords: 'major', pattern: [0, 1, 2, 1, 2, 3, 2, 1] },
  // Primeiros passos: upbeat and bright.
  { bpm: 100, key: 55, wave: 'square', lead: 'square', chords: 'major', pattern: [0, 2, 1, 2, 3, 2, 1, 2] },
  // Agência: busy, a little funky.
  { bpm: 108, key: 57, wave: 'square', lead: 'sawtooth', chords: 'minor', pattern: [0, 2, 3, 2, 1, 2, 3, 1] },
  // Liderança: golden hour, slower and wide.
  { bpm: 88, key: 51, wave: 'triangle', lead: 'sine', chords: 'major', pattern: [0, 1, 2, 3, 2, 1, 2, 3] },
  // Era da IA: synthwave at night.
  { bpm: 96, key: 57, wave: 'sawtooth', lead: 'sawtooth', chords: 'minor', pattern: [0, 2, 3, 2, 0, 3, 2, 1] },
];

// I–V–vi–IV and i–VI–III–VII, as semitones from the key.
const PROGRESSIONS = {
  major: [[0, 4, 7, 12], [7, 11, 14, 19], [9, 12, 16, 21], [5, 9, 12, 17]],
  minor: [[0, 3, 7, 12], [8, 12, 15, 20], [3, 7, 10, 15], [10, 14, 17, 22]],
};

let ac = null;
let master = null;
let noise = null;
let timer = null;
let chapter = 0;
let step = 0;
let nextTime = 0;

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);

function note(midi, at, dur, type, vol, filter = 0) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq(midi), at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(vol, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  let node = osc;
  if (filter) {
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = filter;
    osc.connect(lp);
    node = lp;
  }
  node.connect(gain).connect(master);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

function hat(at, vol) {
  const src = ac.createBufferSource();
  src.buffer = noise;
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(vol, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  src.connect(hp).connect(gain).connect(master);
  src.start(at);
  src.stop(at + 0.06);
}

// Eighth-note steps; 8 per bar, 4 bars per loop.
function schedule() {
  while (nextTime < ac.currentTime + 0.15) {
    const c = CHAPTERS[chapter];
    const eighth = 60 / c.bpm / 2;
    const bar = Math.floor(step / 8) % 4;
    const beat = step % 8;
    const chord = PROGRESSIONS[c.chords][bar];
    const filter = c.lead === 'sawtooth' ? 1800 : 0;
    note(c.key + 12 + chord[c.pattern[beat]], nextTime, eighth * 0.9, c.lead, 0.05, filter);
    if (beat % 4 === 0) note(c.key - 12 + chord[0], nextTime, eighth * 3.6, c.wave, 0.07, c.wave === 'sawtooth' ? 600 : 0);
    if (beat % 2 === 1) hat(nextTime, 0.025);
    if (chapter === 4 && beat === 0) {
      // Synth pad for the night chapter.
      chord.slice(0, 3).forEach((n) => note(c.key + n, nextTime, eighth * 7.5, 'sawtooth', 0.018, 900));
    }
    nextTime += eighth;
    step++;
  }
}

export function startMusic(context) {
  ac = context;
  if (!master) {
    master = ac.createGain();
    master.gain.value = 0;
    master.connect(ac.destination);
    noise = ac.createBuffer(1, ac.sampleRate * 0.1, ac.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  master.gain.cancelScheduledValues(ac.currentTime);
  master.gain.setTargetAtTime(0.5, ac.currentTime, 0.4);
  if (!timer) {
    nextTime = ac.currentTime + 0.1;
    timer = setInterval(schedule, 40);
  }
}

export function stopMusic() {
  if (!ac || !master) return;
  master.gain.setTargetAtTime(0, ac.currentTime, 0.2);
  clearInterval(timer);
  timer = null;
}

// Switch the mood at the next bar so the change lands on the beat.
export function setChapter(index) {
  if (index === chapter) return;
  chapter = index;
  step = Math.ceil(step / 8) * 8;
}
