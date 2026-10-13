import type { MoveLabel } from '../review/types';

/**
 * One glyph and colour per label. The glyph is white on the colour, so the badge reads the same on light
 * and dark surfaces, and the glyph alone tells labels apart for viewers who can't rely on colour.
 */
export const LABEL_STYLE: Record<MoveLabel, { color: string; glyph: string }> = {
  Brilliant: { color: '#1b9e9a', glyph: '!!' },
  Great: { color: '#4a7fc9', glyph: '!' },
  Best: { color: '#4f9a2c', glyph: '★' },
  Excellent: { color: '#7aa83c', glyph: '✓' },
  Good: { color: '#8a9a6e', glyph: '+' },
  Book: { color: '#a07d55', glyph: '≡' },
  Inaccuracy: { color: '#d9a21b', glyph: '?!' },
  Mistake: { color: '#e0742a', glyph: '?' },
  Miss: { color: '#d4557a', glyph: '×' },
  Blunder: { color: '#c7362b', glyph: '??' },
};
