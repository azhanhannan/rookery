// Short synthesized tones, so the app ships no audio files.
export type SoundKind = 'move' | 'capture' | 'check' | 'end';

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(value: boolean): void {
  muted = value;
}

function tone(ac: AudioContext, freq: number, start: number, duration: number, gain: number, type: OscillatorType) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, ac.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + duration);
}

export function playSound(kind: SoundKind): void {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    const ac = ctx;
    switch (kind) {
      case 'move':
        tone(ac, 420, 0, 0.08, 0.25, 'triangle');
        break;
      case 'capture':
        tone(ac, 260, 0, 0.12, 0.35, 'square');
        break;
      case 'check':
        tone(ac, 660, 0, 0.1, 0.25, 'sawtooth');
        tone(ac, 880, 0.1, 0.12, 0.2, 'sawtooth');
        break;
      case 'end':
        tone(ac, 523, 0, 0.18, 0.25, 'sine');
        tone(ac, 659, 0.18, 0.18, 0.25, 'sine');
        tone(ac, 784, 0.36, 0.3, 0.25, 'sine');
        break;
    }
  } catch {
    // no audio support: stay silent
  }
}
