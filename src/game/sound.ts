// Short synthesized sounds, so the app ships no audio files. Sound packs are recipes of oscillator tones and
// filtered-noise knocks, played through WebAudio; the pack is chosen in Settings → Play (settings/playSettings.ts).
export type SoundKind = 'move' | 'capture' | 'castle' | 'promotion' | 'check' | 'end' | 'lowTime';
export const SOUND_KINDS: SoundKind[] = ['move', 'capture', 'castle', 'promotion', 'check', 'end', 'lowTime'];

/** One voice: an oscillator tone, or a burst of band-passed noise (a knock on wood). Times in seconds. */
export type Voice =
  | { kind: 'tone'; freq: number; start: number; dur: number; gain: number; wave: OscillatorType; attack?: number }
  | { kind: 'noise'; start: number; dur: number; gain: number; band: number; q: number };

export type SoundPackId = 'classic' | 'wood' | 'soft' | 'silent';
export type SoundPack = { id: SoundPackId; name: string; sounds: Record<SoundKind, Voice[]> };

const t = (freq: number, start: number, dur: number, gain: number, wave: OscillatorType, attack?: number): Voice => ({
  kind: 'tone',
  freq,
  start,
  dur,
  gain,
  wave,
  attack,
});
const knock = (band: number, start: number, dur: number, gain: number, q = 4): Voice => ({
  kind: 'noise',
  start,
  dur,
  gain,
  band,
  q,
});

const SILENT: Record<SoundKind, Voice[]> = {
  move: [],
  capture: [],
  castle: [],
  promotion: [],
  check: [],
  end: [],
  lowTime: [],
};

export const SOUND_PACKS: SoundPack[] = [
  {
    id: 'classic',
    name: 'Classic',
    sounds: {
      move: [t(420, 0, 0.08, 0.25, 'triangle')],
      capture: [t(260, 0, 0.12, 0.35, 'square')],
      castle: [t(420, 0, 0.07, 0.22, 'triangle'), t(500, 0.09, 0.07, 0.22, 'triangle')],
      promotion: [t(523, 0, 0.09, 0.22, 'triangle'), t(784, 0.09, 0.14, 0.22, 'triangle')],
      check: [t(660, 0, 0.1, 0.25, 'sawtooth'), t(880, 0.1, 0.12, 0.2, 'sawtooth')],
      end: [t(523, 0, 0.18, 0.25, 'sine'), t(659, 0.18, 0.18, 0.25, 'sine'), t(784, 0.36, 0.3, 0.25, 'sine')],
      lowTime: [t(1200, 0, 0.04, 0.08, 'sine')],
    },
  },
  {
    id: 'wood',
    name: 'Wood',
    sounds: {
      move: [knock(1800, 0, 0.06, 0.9), t(180, 0, 0.05, 0.25, 'sine')],
      capture: [knock(1300, 0, 0.09, 1.1, 3), t(140, 0, 0.08, 0.35, 'sine'), knock(2200, 0.03, 0.05, 0.5)],
      castle: [knock(1800, 0, 0.05, 0.8), knock(1600, 0.11, 0.06, 0.8)],
      promotion: [knock(1800, 0, 0.05, 0.8), t(660, 0.06, 0.18, 0.12, 'triangle')],
      check: [knock(2400, 0, 0.05, 0.9), knock(2400, 0.08, 0.05, 0.7)],
      end: [knock(1200, 0, 0.08, 0.9), t(392, 0.05, 0.4, 0.15, 'triangle'), t(523, 0.2, 0.45, 0.13, 'triangle')],
      lowTime: [knock(3000, 0, 0.025, 0.35, 6)],
    },
  },
  {
    id: 'soft',
    name: 'Soft',
    sounds: {
      move: [t(392, 0, 0.12, 0.12, 'sine', 0.01)],
      capture: [t(294, 0, 0.16, 0.16, 'sine', 0.01), t(220, 0.04, 0.16, 0.1, 'sine', 0.01)],
      castle: [t(392, 0, 0.1, 0.11, 'sine', 0.01), t(440, 0.1, 0.12, 0.11, 'sine', 0.01)],
      promotion: [t(440, 0, 0.12, 0.11, 'sine', 0.01), t(587, 0.1, 0.2, 0.11, 'sine', 0.01)],
      check: [t(523, 0, 0.14, 0.13, 'sine', 0.01), t(494, 0.12, 0.16, 0.11, 'sine', 0.01)],
      end: [t(392, 0, 0.3, 0.12, 'sine', 0.02), t(494, 0.2, 0.3, 0.12, 'sine', 0.02), t(587, 0.4, 0.5, 0.12, 'sine', 0.02)],
      lowTime: [t(880, 0, 0.05, 0.05, 'sine', 0.005)],
    },
  },
  { id: 'silent', name: 'Silent', sounds: SILENT },
];

export function findSoundPack(id: string | null | undefined): SoundPack {
  return SOUND_PACKS.find((p) => p.id === id) ?? SOUND_PACKS[0];
}

/** The sound for a played move (SAN plus whether it captured). */
export function soundForMove(move: { san: string; captured?: unknown }): SoundKind {
  if (/[+#]/.test(move.san)) return 'check';
  if (move.san.includes('=')) return 'promotion';
  if (move.san.startsWith('O-O')) return 'castle';
  return move.captured ? 'capture' : 'move';
}

let ctx: AudioContext | null = null;
let muted = false;
let pack: SoundPack = SOUND_PACKS[0];
let noiseBuffer: AudioBuffer | null = null;

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

export function setSoundPack(id: string): void {
  pack = findSoundPack(id);
}

function noise(ac: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.2), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

function play(ac: AudioContext, v: Voice) {
  const at = ac.currentTime + v.start;
  const g = ac.createGain();
  if (v.kind === 'tone' && v.attack) {
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(v.gain, at + v.attack);
  } else {
    g.gain.setValueAtTime(v.gain, at);
  }
  g.gain.exponentialRampToValueAtTime(0.0001, at + v.dur);
  g.connect(ac.destination);
  if (v.kind === 'tone') {
    const osc = ac.createOscillator();
    osc.type = v.wave;
    osc.frequency.value = v.freq;
    osc.connect(g);
    osc.start(at);
    osc.stop(at + v.dur);
  } else {
    const src = ac.createBufferSource();
    src.buffer = noise(ac);
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = v.band;
    filter.Q.value = v.q;
    src.connect(filter).connect(g);
    src.start(at);
    src.stop(at + v.dur);
  }
}

function playVoices(voices: Voice[]): void {
  if (voices.length === 0) return;
  try {
    ctx ??= new AudioContext();
    const ac = ctx;
    for (const v of voices) play(ac, v);
  } catch {
    // no audio support: stay silent
  }
}

export function playSound(kind: SoundKind): void {
  if (muted) return;
  playVoices(pack.sounds[kind]);
}

/** Plays a pack's sounds in a short sequence (the Settings preview), whatever the mute switch says. */
export function previewSoundPack(id: string, kinds: SoundKind[] = ['move', 'capture', 'castle', 'check', 'end']): void {
  const p = findSoundPack(id);
  let offset = 0;
  const voices: Voice[] = [];
  for (const k of kinds) {
    const vs = p.sounds[k];
    for (const v of vs) voices.push({ ...v, start: v.start + offset });
    offset += Math.max(0.25, ...vs.map((v) => v.start + v.dur)) + 0.15;
  }
  playVoices(voices);
}
