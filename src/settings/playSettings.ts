// Play settings (Settings → Play): sound pack, animation speed, board display toggles, hidden ratings.
// Saved per device as one JSON value, like the board theme and piece set.
import { useSyncExternalStore } from 'react';
import { POLISH } from '../config/tunables';
import { setSoundPack, SOUND_PACKS, type SoundPackId } from '../game/sound';

export type AnimationSpeed = keyof typeof POLISH.animationMs;
export const ANIMATION_SPEEDS: { id: AnimationSpeed; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'fast', name: 'Fast' },
  { id: 'normal', name: 'Normal' },
];

export type PlaySettings = {
  soundPack: SoundPackId;
  /** null = never chosen: None under prefers-reduced-motion, otherwise Normal. */
  animation: AnimationSpeed | null;
  coordinates: boolean;
  legalDots: boolean;
  lastMove: boolean;
  hideRating: boolean;
};

export const DEFAULT_PLAY_SETTINGS: PlaySettings = {
  soundPack: 'classic',
  animation: null,
  coordinates: true,
  legalDots: true,
  lastMove: true,
  hideRating: false,
};

const KEY = 'rookery.playSettings';

/** A stored value → settings; anything missing or malformed falls back to its default. */
export function parsePlaySettings(raw: string | null): PlaySettings {
  let v: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) v = parsed as Record<string, unknown>;
  } catch {
    // corrupt value: defaults
  }
  const d = DEFAULT_PLAY_SETTINGS;
  const bool = (k: keyof PlaySettings, def: boolean) => (typeof v[k] === 'boolean' ? (v[k] as boolean) : def);
  return {
    soundPack: SOUND_PACKS.some((p) => p.id === v.soundPack) ? (v.soundPack as SoundPackId) : d.soundPack,
    animation: ANIMATION_SPEEDS.some((s) => s.id === v.animation) ? (v.animation as AnimationSpeed) : null,
    coordinates: bool('coordinates', d.coordinates),
    legalDots: bool('legalDots', d.legalDots),
    lastMove: bool('lastMove', d.lastMove),
    hideRating: bool('hideRating', d.hideRating),
  };
}

function read(): PlaySettings {
  try {
    return parsePlaySettings(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_PLAY_SETTINGS;
  }
}

let current = read();
setSoundPack(current.soundPack);
const listeners = new Set<() => void>();

export function loadPlaySettings(): PlaySettings {
  return current;
}

export function savePlaySettings(patch: Partial<PlaySettings>): void {
  current = parsePlaySettings(JSON.stringify({ ...current, ...patch }));
  setSoundPack(current.soundPack);
  try {
    const changed = Object.fromEntries(
      Object.entries(current).filter(([k, val]) => DEFAULT_PLAY_SETTINGS[k as keyof PlaySettings] !== val),
    );
    if (Object.keys(changed).length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(changed));
  } catch {
    // Storage blocked: the choice still holds until the page is reloaded.
  }
  listeners.forEach((l) => l());
}

/** Re-reads storage (tests, or another tab's change). */
export function reloadPlaySettings(): void {
  current = read();
  setSoundPack(current.soundPack);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** The animation speed in effect: the chosen one, or the reduced-motion-aware default. */
export function effectiveAnimation(s: PlaySettings, reducedMotion: boolean): AnimationSpeed {
  return s.animation ?? (reducedMotion ? 'none' : 'normal');
}

/** Board move animation in ms for these settings. */
export function animationMs(s: PlaySettings, reducedMotion = prefersReducedMotion()): number {
  return POLISH.animationMs[effectiveAnimation(s, reducedMotion)];
}

/** The play settings; components re-render when they change. */
export function usePlaySettings(): PlaySettings {
  return useSyncExternalStore(subscribe, loadPlaySettings, loadPlaySettings);
}
