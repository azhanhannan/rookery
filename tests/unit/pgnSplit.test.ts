import { describe, expect, it } from 'vitest';
import { pgnHeaders, splitPgn } from '../../src/game/pgnSplit';

const A = '[Event "A"]\n[White "Ana"]\n[Black "Ben"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0';
const B = '[Event "B"]\n[White "Ben"]\n[Black "Ana"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1';

describe('splitPgn', () => {
  it('splits games separated by blank lines', () => {
    expect(splitPgn(`${A}\n\n\n${B}\n`)).toEqual([A, B]);
  });

  it('splits games with no blank line between them', () => {
    expect(splitPgn(`${A}\n${B}`)).toEqual([A, B]);
  });

  it('keeps one game whole: blank lines inside, CRLF, BOM', () => {
    const crlf = '﻿[Event "A"]\r\n[Result "*"]\r\n\r\n1. e4 e5\r\n\r\n2. Nf3 *\r\n';
    const games = splitPgn(crlf);
    expect(games).toHaveLength(1);
    expect(games[0]).toContain('2. Nf3 *');
  });

  it('ignores brackets inside comments, also a comment spanning lines that starts a line with "["', () => {
    const g1 = '[Event "A"]\n\n1. e4 { [%clk 0:03:00] } e5 {a comment\n[not a tag "x"]\nstill comment } 2. Nf3 1-0';
    const g2 = '[Event "B"]\n\n1. d4 ; trailing [comment "x"]\nd5 0-1';
    const games = splitPgn(`${g1}\n\n${g2}`);
    expect(games).toHaveLength(2);
    expect(games[0]).toContain('[not a tag "x"]');
    expect(games[1]).toContain('d5 0-1');
  });

  it('handles a missing result: the next tag section starts the next game', () => {
    const noResult = '[Event "A"]\n\n1. e4 e5 2. Nf3';
    expect(splitPgn(`${noResult}\n${B}`)).toEqual([noResult, B]);
  });

  it('splits movetext-only games after a result, even on one line', () => {
    expect(splitPgn('1. e4 e5 1-0 1. d4 d5 0-1\n1. c4 *')).toEqual(['1. e4 e5 1-0', '1. d4 d5 0-1', '1. c4 *']);
  });

  it('skips %-escaped lines and returns nothing for blank input', () => {
    expect(splitPgn('% exported by X\n' + A)).toEqual([A]);
    expect(splitPgn('\n  \n')).toEqual([]);
  });
});

describe('pgnHeaders', () => {
  it('reads tag pairs with escaped quotes', () => {
    expect(pgnHeaders('[White "Ana \\"The Rook\\""]\n[Date "2026.10.14"]\n\n1. e4 *')).toEqual({
      White: 'Ana "The Rook"',
      Date: '2026.10.14',
    });
  });
});
