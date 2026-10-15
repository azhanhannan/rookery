import { render } from '@testing-library/react';
import { defaultPieces } from 'react-chessboard';
import { beforeEach, describe, expect, it } from 'vitest';
import { piecesFor } from '../../src/components/pieceRender';
import { findPieceSet, loadPieceSet, PIECE_KEYS, PIECE_SETS, savePieceSet } from '../../src/settings/pieceSet';

beforeEach(() => {
  localStorage.clear();
  savePieceSet('classic');
});

describe('piece sets', () => {
  it('unique ids; only Classic uses the built-in pieces; unknown ids fall back to it', () => {
    expect(new Set(PIECE_SETS.map((s) => s.id)).size).toBe(PIECE_SETS.length);
    expect(PIECE_SETS.filter((s) => !s.dir).map((s) => s.id)).toEqual(['classic']);
    expect(findPieceSet('nope').id).toBe('classic');
  });

  it('saving remembers the set; Classic clears the stored choice', () => {
    savePieceSet('merida');
    expect(loadPieceSet()).toBe('merida');
    expect(localStorage.getItem('rookery.pieceSet')).toBe('merida');
    savePieceSet('classic');
    expect(localStorage.getItem('rookery.pieceSet')).toBeNull();
  });

  it('renders Classic with the board library pieces and other sets as non-draggable images', () => {
    expect(piecesFor(findPieceSet('classic'))).toBe(defaultPieces);
    const pieces = piecesFor(findPieceSet('fantasy'));
    expect(Object.keys(pieces).sort()).toEqual([...PIECE_KEYS].sort());
    const { container } = render(pieces.bQ({ svgStyle: { opacity: 0.5 } }));
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/pieces/fantasy/bQ.svg');
    expect(img.getAttribute('draggable')).toBe('false');
    expect(img.style.opacity).toBe('0.5');
  });
});
