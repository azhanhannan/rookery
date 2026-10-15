import { beforeEach, describe, expect, it } from 'vitest';
import { shortcutsFor } from '../../src/components/boardKeys';
import { MARK_COLORS, markColor, mergeSquareStyles, toggleCircle } from '../../src/components/boardMarks';
import { countUpValue } from '../../src/components/countUp';
import { POLISH } from '../../src/config/tunables';
import { formatClock, isLowTime, lowTimeTickDue } from '../../src/game/clock';
import { findSoundPack, SOUND_KINDS, SOUND_PACKS, soundForMove } from '../../src/game/sound';
import {
  animationMs,
  DEFAULT_PLAY_SETTINGS,
  effectiveAnimation,
  loadPlaySettings,
  parsePlaySettings,
  reloadPlaySettings,
  savePlaySettings,
} from '../../src/settings/playSettings';

const KEY = 'rookery.playSettings';

beforeEach(() => {
  localStorage.clear();
  reloadPlaySettings();
});

describe('play settings', () => {
  it('defaults when nothing, garbage or wrong types are stored', () => {
    expect(parsePlaySettings(null)).toEqual(DEFAULT_PLAY_SETTINGS);
    expect(parsePlaySettings('not json')).toEqual(DEFAULT_PLAY_SETTINGS);
    expect(parsePlaySettings('[1,2]')).toEqual(DEFAULT_PLAY_SETTINGS);
    expect(parsePlaySettings('{"soundPack":"kazoo","animation":"warp","coordinates":"no","hideRating":1}')).toEqual(
      DEFAULT_PLAY_SETTINGS,
    );
    expect(loadPlaySettings()).toEqual(DEFAULT_PLAY_SETTINGS);
  });

  it('keeps valid fields and fills the rest', () => {
    expect(parsePlaySettings('{"soundPack":"wood","legalDots":false}')).toEqual({
      ...DEFAULT_PLAY_SETTINGS,
      soundPack: 'wood',
      legalDots: false,
    });
  });

  it('saves only what differs from the defaults, and clears storage when back to defaults', () => {
    savePlaySettings({ hideRating: true, animation: 'fast' });
    expect(loadPlaySettings().hideRating).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ hideRating: true, animation: 'fast' });
    reloadPlaySettings();
    expect(loadPlaySettings()).toMatchObject({ hideRating: true, animation: 'fast', coordinates: true });
    savePlaySettings({ hideRating: false, animation: null });
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('animation: an unset choice follows prefers-reduced-motion', () => {
    expect(effectiveAnimation(DEFAULT_PLAY_SETTINGS, true)).toBe('none');
    expect(effectiveAnimation(DEFAULT_PLAY_SETTINGS, false)).toBe('normal');
    expect(effectiveAnimation({ ...DEFAULT_PLAY_SETTINGS, animation: 'fast' }, true)).toBe('fast');
    expect(animationMs(DEFAULT_PLAY_SETTINGS, true)).toBe(0);
    expect(animationMs({ ...DEFAULT_PLAY_SETTINGS, animation: 'normal' }, true)).toBe(POLISH.animationMs.normal);
  });
});

describe('clock polish', () => {
  it('shows tenths only under the tenths threshold', () => {
    expect(formatClock(POLISH.clockTenthsMs)).toBe('0:10');
    expect(formatClock(POLISH.clockTenthsMs - 1)).toBe('0:09.9');
    expect(formatClock(15_000)).toBe('0:15');
    expect(formatClock(-5)).toBe('0:00.0');
  });

  it('turns red under the red threshold', () => {
    expect(isLowTime(POLISH.clockRedMs)).toBe(false);
    expect(isLowTime(POLISH.clockRedMs - 1)).toBe(true);
  });

  it('ticks once per second, only under the tick threshold and before zero', () => {
    expect(lowTimeTickDue(null, 9_500)).toBe(false);
    expect(lowTimeTickDue(10_050, 9_950)).toBe(true);
    expect(lowTimeTickDue(9_950, 9_850)).toBe(false);
    expect(lowTimeTickDue(9_050, 8_950)).toBe(true);
    expect(lowTimeTickDue(12_050, 11_950)).toBe(false);
    expect(lowTimeTickDue(100, 0)).toBe(false);
    expect(lowTimeTickDue(8_000, 9_000)).toBe(false);
  });
});

describe('sound packs', () => {
  it('every audible pack has a distinct sound for each kind; Silent has none', () => {
    expect(SOUND_PACKS.map((p) => p.id)).toEqual(['classic', 'wood', 'soft', 'silent']);
    for (const pack of SOUND_PACKS) {
      for (const kind of SOUND_KINDS) {
        if (pack.id === 'silent') expect(pack.sounds[kind]).toEqual([]);
        else expect(pack.sounds[kind].length, `${pack.id}.${kind}`).toBeGreaterThan(0);
      }
      if (pack.id !== 'silent') {
        const recipes = SOUND_KINDS.map((k) => JSON.stringify(pack.sounds[k]));
        expect(new Set(recipes).size, pack.id).toBe(SOUND_KINDS.length);
      }
    }
    expect(findSoundPack('nope').id).toBe('classic');
  });

  it('picks the sound for a move', () => {
    expect(soundForMove({ san: 'e4' })).toBe('move');
    expect(soundForMove({ san: 'Nxe5', captured: 'p' })).toBe('capture');
    expect(soundForMove({ san: 'O-O' })).toBe('castle');
    expect(soundForMove({ san: 'O-O-O' })).toBe('castle');
    expect(soundForMove({ san: 'e8=Q' })).toBe('promotion');
    expect(soundForMove({ san: 'Qxf7+', captured: 'p' })).toBe('check');
    expect(soundForMove({ san: 'Qxf7#', captured: 'p' })).toBe('check');
  });
});

describe('hand-drawn marks', () => {
  it('colours by modifier, Lichess style', () => {
    const m = { shiftKey: false, altKey: false, ctrlKey: false };
    expect(markColor(m)).toBe(MARK_COLORS.green);
    expect(markColor({ ...m, shiftKey: true })).toBe(MARK_COLORS.red);
    expect(markColor({ ...m, altKey: true })).toBe(MARK_COLORS.blue);
    expect(markColor({ ...m, ctrlKey: true })).toBe(MARK_COLORS.yellow);
  });

  it('a second click with the same colour removes a circle, another colour recolours it', () => {
    let c = toggleCircle({}, 'e4', 'g');
    expect(c).toEqual({ e4: 'g' });
    c = toggleCircle(c, 'e4', 'r');
    expect(c).toEqual({ e4: 'r' });
    expect(toggleCircle(c, 'e4', 'r')).toEqual({});
  });

  it('a circle layers over an existing square background', () => {
    const merged = mergeSquareStyles(
      { e4: { backgroundColor: 'y', backgroundImage: 'dot' } },
      { e4: { backgroundImage: 'ring' }, d4: { backgroundImage: 'ring' } },
    );
    expect(merged.e4).toEqual({ backgroundColor: 'y', backgroundImage: 'ring, dot' });
    expect(merged.d4).toEqual({ backgroundImage: 'ring' });
  });
});

describe('end screen and shortcuts', () => {
  it('counts up to the target and stops there', () => {
    expect(countUpValue(12, 0, 1000)).toBe(0);
    expect(countUpValue(12, 500, 1000)).toBeGreaterThan(6);
    expect(countUpValue(12, 1000, 1000)).toBe(12);
    expect(countUpValue(-8, 5000, 1000)).toBe(-8);
    expect(countUpValue(7, 10, 0)).toBe(7);
  });

  it('lists X, F and ? everywhere, move keys on Play and Review only', () => {
    for (const page of ['play', 'review', 'puzzles'] as const) {
      const keys = shortcutsFor(page).map(([k]) => k);
      expect(keys).toEqual(expect.arrayContaining(['X', 'F', '?']));
      expect(keys.includes('← →')).toBe(page !== 'puzzles');
    }
  });
});
