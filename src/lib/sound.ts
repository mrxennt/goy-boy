/**
 * All sounds are synthesized with the Web Audio API — no external assets,
 * nothing plays before the user has enabled sound or interacted with the page.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxEnabled = false;
let musicEnabled = false;
let volume = 0.5;

let musicTimer: number | null = null;
let musicStep = 0;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = volume * 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function configureSound(config: { sfx: boolean; music: boolean; volume: number }) {
  sfxEnabled = config.sfx;
  volume = Math.min(1, Math.max(0, config.volume));
  if (master) master.gain.value = volume * 0.5;
  if (config.music && !musicTimer) startMusic();
  if (!config.music && musicTimer) stopMusic();
}

type Tone = {
  freq: number;
  to?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
};

const RECIPES: Record<string, Tone[]> = {
  click: [{ freq: 520, to: 660, dur: 0.06, type: 'triangle', gain: 0.18 }],
  hover: [{ freq: 880, dur: 0.03, type: 'sine', gain: 0.05 }],
  start: [
    { freq: 392, dur: 0.1, type: 'triangle', gain: 0.16 },
    { freq: 587, dur: 0.12, type: 'triangle', gain: 0.16, delay: 0.09 },
    { freq: 784, dur: 0.16, type: 'triangle', gain: 0.14, delay: 0.18 },
  ],
  point: [{ freq: 740, to: 1180, dur: 0.1, type: 'square', gain: 0.1 }],
  win: [
    { freq: 523, dur: 0.12, type: 'triangle', gain: 0.16 },
    { freq: 659, dur: 0.12, type: 'triangle', gain: 0.16, delay: 0.1 },
    { freq: 784, dur: 0.12, type: 'triangle', gain: 0.16, delay: 0.2 },
    { freq: 1046, dur: 0.24, type: 'triangle', gain: 0.14, delay: 0.3 },
  ],
  lose: [
    { freq: 330, to: 196, dur: 0.28, type: 'sawtooth', gain: 0.12 },
    { freq: 196, to: 110, dur: 0.4, type: 'triangle', gain: 0.12, delay: 0.18 },
  ],
  hit: [{ freq: 180, to: 60, dur: 0.14, type: 'square', gain: 0.12 }],
  pick: [{ freq: 660, to: 990, dur: 0.08, type: 'sine', gain: 0.12 }],
  error: [{ freq: 220, to: 160, dur: 0.14, type: 'square', gain: 0.1 }],
  level: [
    { freq: 659, dur: 0.1, type: 'sine', gain: 0.14 },
    { freq: 880, dur: 0.1, type: 'sine', gain: 0.14, delay: 0.09 },
    { freq: 1108, dur: 0.22, type: 'sine', gain: 0.12, delay: 0.18 },
  ],
};

export type SfxName = keyof typeof RECIPES;

function schedule(tone: Tone) {
  const audioCtx = audio();
  if (!audioCtx || !master) return;
  const start = audioCtx.currentTime + (tone.delay ?? 0);
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = tone.type ?? 'sine';
  osc.frequency.setValueAtTime(tone.freq, start);
  if (tone.to) osc.frequency.exponentialRampToValueAtTime(Math.max(40, tone.to), start + tone.dur);
  const peak = (tone.gain ?? 0.14) * 0.9;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(start);
  osc.stop(start + tone.dur + 0.02);
}

export function playSfx(name: SfxName) {
  if (!sfxEnabled) return;
  const recipe = RECIPES[name];
  if (!recipe) return;
  recipe.forEach(schedule);
}

export const sfx = {
  play: playSfx,
  click: () => playSfx('click'),
  hover: () => playSfx('hover'),
  point: () => playSfx('point'),
  hit: () => playSfx('hit'),
  win: () => playSfx('win'),
  lose: () => playSfx('lose'),
  pick: () => playSfx('pick'),
  error: () => playSfx('error'),
  start: () => playSfx('start'),
};

/** A slow, quiet ambient pad — only runs when the user turns music on. */
function startMusic() {
  const audioCtx = audio();
  if (!audioCtx || !master) return;
  const chords = [
    [220, 277.18, 329.63],
    [196, 246.94, 293.66],
    [174.61, 220, 261.63],
    [164.81, 207.65, 246.94],
  ];
  musicStep = 0;
  const playChord = () => {
    const audioCtx2 = audio();
    if (!audioCtx2 || !master) return;
    const chord = chords[musicStep % chords.length];
    musicStep += 1;
    const now = audioCtx2.currentTime;
    chord.forEach((freq, i) => {
      const osc = audioCtx2.createOscillator();
      const gain = audioCtx2.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.035 + i * 0.005, now + 1.4);
      gain.gain.linearRampToValueAtTime(0.0001, now + 3.9);
      osc.connect(gain);
      gain.connect(master!);
      osc.start(now);
      osc.stop(now + 4);
    });
  };
  playChord();
  musicTimer = window.setInterval(playChord, 4000);
}

function stopMusic() {
  if (musicTimer) {
    window.clearInterval(musicTimer);
    musicTimer = null;
  }
}

export function isMusicPlaying() {
  return musicTimer !== null;
}

export function needsUserGesture() {
  return !ctx;
}

export function unlockAudio() {
  if (musicEnabled) audio();
}
