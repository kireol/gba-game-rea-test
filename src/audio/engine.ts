import type { GameStatus, SfxName } from '../engine/types.js';
import type { AudioPrefs } from '../gameplay/persistence.js';

/**
 * Sound is synthesised, not sampled.
 *
 * Every sound in the game is generated at run time from an oscillator or a
 * noise-buffer voice plus an envelope, so the shipped bundle contains no audio
 * data — and nothing here imitates the reference game's melodies or sound effects
 * (see `docs/asset-provenance.md`, which also lists the note material as original).
 *
 * The engine is inert until the browser allows audio: an `AudioContext` cannot be
 * created before a user gesture, so `unlock()` is called from the first input and
 * every entry point no-ops while the context is missing. That keeps a headless or
 * audio-less environment working instead of throwing.
 */

export interface AudioEngine {
  /** Called from the first real user gesture; creates/resumes the context. */
  unlock(): void;
  sfx(name: SfxName): void;
  /** Music follows the run: only 'playing' has the loop running. */
  setStatus(status: GameStatus): void;
  prefs(next: AudioPrefs): void;
  dispose(): void;
  /** True once the context exists and is running. */
  readonly live: boolean;
}

/** Original note material: a four-chord loop, as MIDI numbers (A2 F2 C3 G2). */
const CHORD_ROOTS = [45, 41, 48, 43];
const MINOR = [0, 3, 7, 12];
const MAJOR = [0, 4, 7, 12];
/** Which of the four chords is minor: i, VI, III, VII in a natural minor. */
const MINOR_CHORD = [true, false, false, false];
const STEPS_PER_BAR = 16;
/** Sixteenth notes at 150 BPM. */
const STEP_SECONDS = 0.1;
const LOOKAHEAD = 0.35;

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

interface ToneOpts {
  readonly type: OscillatorType;
  readonly from: number;
  readonly to?: number;
  readonly seconds: number;
  readonly gain: number;
  readonly at?: number;
  readonly attack?: number;
}

interface NoiseOpts {
  readonly seconds: number;
  readonly gain: number;
  readonly at?: number;
  readonly from: number;
  readonly to?: number;
  readonly q?: number;
}

export const createAudioEngine = (initial: AudioPrefs): AudioEngine => {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let musicBus: GainNode | null = null;
  let sfxBus: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let prefs: AudioPrefs = initial;
  let status: GameStatus = 'ready';
  let timer: ReturnType<typeof setInterval> | null = null;
  let step = 0;
  let nextTime = 0;
  const lastAt = new Map<SfxName, number>();

  const applyGains = (): void => {
    if (!ctx || !master || !musicBus || !sfxBus) return;
    const now = ctx.currentTime;
    const target = prefs.muted ? 0 : prefs.master;
    master.gain.setTargetAtTime(target, now, 0.02);
    musicBus.gain.setTargetAtTime(prefs.music, now, 0.05);
    sfxBus.gain.setTargetAtTime(prefs.sfx, now, 0.01);
  };

  const open = (): AudioContext | null => {
    if (ctx) return ctx;
    const Ctor: typeof AudioContext | undefined =
      typeof window !== 'undefined'
        ? (window.AudioContext ??
           (window as unknown as { webkitAudioContext?: typeof AudioContext })
             .webkitAudioContext)
        : undefined;
    if (!Ctor) return null;
    try {
      const made = new Ctor();
      const bus = made.createGain();
      const tone = made.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 12000;
      bus.gain.value = prefs.muted ? 0 : prefs.master;
      const music = made.createGain();
      music.gain.value = prefs.music;
      const sfx = made.createGain();
      sfx.gain.value = prefs.sfx;
      music.connect(bus);
      sfx.connect(bus);
      bus.connect(tone);
      tone.connect(made.destination);
      ctx = made;
      master = bus;
      musicBus = music;
      sfxBus = sfx;
      return made;
    } catch {
      return null;
    }
  };

  const tone = (opts: ToneOpts): void => {
    if (!ctx || !sfxBus) return;
    const at = opts.at ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type;
    osc.frequency.setValueAtTime(Math.max(20, opts.from), at);
    if (opts.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), at + opts.seconds);
    }
    const attack = opts.attack ?? 0.004;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + opts.seconds);
    osc.connect(gain);
    gain.connect(sfxBus);
    osc.start(at);
    osc.stop(at + opts.seconds + 0.02);
  };

  const noise = (opts: NoiseOpts): void => {
    if (!ctx || !sfxBus) return;
    if (!noiseBuffer) {
      const frames = Math.floor(ctx.sampleRate * 0.5);
      noiseBuffer = ctx.createBuffer(1, frames, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      let seed = 0x9e3779b9;
      for (let i = 0; i < frames; i += 1) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        data[i] = (seed / 0xffffffff) * 2 - 1;
      }
    }
    const at = opts.at ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = opts.q ?? 1.2;
    filter.frequency.setValueAtTime(opts.from, at);
    const sweep = Math.max(40, opts.to ?? opts.from);
    filter.frequency.exponentialRampToValueAtTime(sweep, at + opts.seconds);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(opts.gain, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + opts.seconds);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBus);
    src.start(at);
    src.stop(at + opts.seconds + 0.02);
  };

  const play = (name: SfxName): void => {
    if (!ctx) return;
    const now = ctx.currentTime;
    const recent = lastAt.get(name);
    // The move/rotate sounds can arrive several times per frame during auto-shift;
    // 30 ms of dedupe keeps them from stacking into a buzz.
    if (recent !== undefined && now - recent < 0.03) return;
    lastAt.set(name, now);
    switch (name) {
      case 'move':
        tone({ type: 'square', from: 420, seconds: 0.03, gain: 0.05 });
        break;
      case 'rotate':
        tone({ type: 'square', from: 620, to: 760, seconds: 0.05, gain: 0.06 });
        break;
      case 'rotate-fail':
        tone({ type: 'square', from: 190, to: 150, seconds: 0.06, gain: 0.05 });
        break;
      case 'lock':
        tone({ type: 'square', from: 300, to: 220, seconds: 0.06, gain: 0.09 });
        noise({ seconds: 0.05, gain: 0.05, from: 1400, to: 500 });
        break;
      case 'hard-drop':
        tone({ type: 'square', from: 240, to: 90, seconds: 0.1, gain: 0.12 });
        noise({ seconds: 0.09, gain: 0.1, from: 900, to: 120, q: 0.8 });
        break;
      case 'clear':
        [0, 1, 2].forEach((i) =>
          tone({
            type: 'triangle',
            from: hz(72 + i * 4),
            seconds: 0.12,
            gain: 0.09,
            at: now + i * 0.045,
          }),
        );
        break;
      case 'clear-big':
        [0, 1, 2, 3, 4].forEach((i) =>
          tone({
            type: 'triangle',
            from: hz(72 + i * 3),
            seconds: 0.16,
            gain: 0.1,
            at: now + i * 0.05,
          }),
        );
        noise({ seconds: 0.25, gain: 0.06, from: 3000, to: 700, q: 0.7 });
        break;
      case 'level-up':
        [0, 4, 7, 12].forEach((s, i) =>
          tone({
            type: 'square',
            from: hz(69 + s),
            seconds: 0.14,
            gain: 0.08,
            at: now + i * 0.06,
          }),
        );
        break;
      case 'hold':
        tone({ type: 'triangle', from: 520, to: 700, seconds: 0.08, gain: 0.07 });
        break;
      case 'garbage':
        tone({ type: 'sawtooth', from: 120, to: 70, seconds: 0.22, gain: 0.09 });
        noise({ seconds: 0.18, gain: 0.05, from: 500, to: 200 });
        break;
      case 'spawn':
        tone({ type: 'sine', from: 880, to: 1320, seconds: 0.05, gain: 0.03 });
        break;
      case 'menu-move':
        tone({ type: 'square', from: 520, seconds: 0.03, gain: 0.05 });
        break;
      case 'menu-confirm':
        [0, 7].forEach((s, i) =>
          tone({
            type: 'square',
            from: hz(74 + s),
            seconds: 0.1,
            gain: 0.07,
            at: now + i * 0.06,
          }),
        );
        break;
      case 'menu-back':
        tone({ type: 'square', from: 330, to: 220, seconds: 0.08, gain: 0.06 });
        break;
      case 'win':
        [0, 4, 7, 12, 16, 19].forEach((s, i) =>
          tone({
            type: 'triangle',
            from: hz(69 + s),
            seconds: 0.3,
            gain: 0.1,
            at: now + i * 0.1,
          }),
        );
        break;
      case 'lose':
        [0, -2, -4, -7].forEach((s, i) =>
          tone({
            type: 'sawtooth',
            from: hz(57 + s),
            seconds: 0.32,
            gain: 0.08,
            at: now + i * 0.13,
          }),
        );
        break;
      case 'mute':
        tone({ type: 'sine', from: 700, to: 300, seconds: 0.12, gain: 0.06 });
        break;
    }
  };

  const scheduleStep = (index: number, at: number): void => {
    if (!ctx || !musicBus) return;
    const chord = Math.floor(index / STEPS_PER_BAR) % CHORD_ROOTS.length;
    const root = CHORD_ROOTS[chord] ?? CHORD_ROOTS[0] ?? 45;
    const tones = (MINOR_CHORD[chord] ?? true) ? MINOR : MAJOR;
    const inBar = index % STEPS_PER_BAR;
    const voice = (midi: number, seconds: number, gain: number, type: OscillatorType): void => {
      const osc = ctx?.createOscillator();
      const env = ctx?.createGain();
      if (!ctx || !osc || !env || !musicBus) return;
      osc.type = type;
      osc.frequency.value = hz(midi);
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(gain, at + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
      osc.connect(env);
      env.connect(musicBus);
      osc.start(at);
      osc.stop(at + seconds + 0.02);
    };
    // Bass on every second eighth.
    if (inBar % 4 === 0) voice(root, 0.22, 0.12, 'triangle');
    if (inBar % 16 === 12) voice(root + 12, 0.12, 0.06, 'triangle');
    // Sixteenth arpeggio, one octave up, every other step.
    if (inBar % 2 === 0) {
      const tone2 = tones[(inBar / 2) % tones.length] ?? 0;
      voice(root + 24 + tone2, 0.09, 0.035, 'square');
    }
    // A held third an octave above ties the bar together.
    if (inBar === 0) voice(root + 12 + (tones[1] ?? 0), 1.2, 0.03, 'sine');
  };

  const stopMusic = (): void => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    if (musicBus && ctx) musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  };

  const startMusic = (): void => {
    const made = open();
    if (!made || !musicBus) return;
    if (timer !== null) return;
    if (made.state === 'suspended') void made.resume();
    nextTime = made.currentTime + 0.1;
    timer = setInterval(() => {
      const live = ctx;
      if (!live) return;
      while (nextTime < live.currentTime + LOOKAHEAD) {
        scheduleStep(step, nextTime);
        nextTime += STEP_SECONDS;
        step = (step + 1) % (STEPS_PER_BAR * CHORD_ROOTS.length);
      }
    }, 120);
    musicBus.gain.setTargetAtTime(prefs.muted ? 0 : prefs.music, made.currentTime, 0.1);
  };

  return {
    unlock(): void {
      const made = open();
      if (made && made.state === 'suspended') void made.resume();
      applyGains();
      if (status === 'playing') startMusic();
    },
    sfx(name: SfxName): void {
      if (prefs.muted) return;
      play(name);
    },
    setStatus(next: GameStatus): void {
      status = next;
      if (next === 'playing') {
        if (ctx) startMusic();
      } else {
        stopMusic();
      }
    },
    prefs(next: AudioPrefs): void {
      const wasMuted = prefs.muted;
      prefs = next;
      applyGains();
      if (wasMuted && !next.muted && status === 'playing') startMusic();
      if (!wasMuted && next.muted) stopMusic();
    },
    dispose(): void {
      stopMusic();
      const made = ctx;
      ctx = null;
      master = null;
      musicBus = null;
      sfxBus = null;
      if (made) void made.close().catch(() => undefined);
    },
    get live(): boolean {
      return ctx !== null && ctx.state === 'running';
    },
  };
};
