// How SAN is shown in move lists: piece letters (Nf3) or figurines (♘f3). Pure; the setting lives in
// Settings → Play (settings/playSettings.ts).

export type PieceSymbols = 'letters' | 'figurines';
export const PIECE_SYMBOLS: { id: PieceSymbols; name: string }[] = [
  { id: 'letters', name: 'Letters (Nf3)' },
  { id: 'figurines', name: 'Figurines (♘f3)' },
];

const FIGURINE: Record<string, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' };

/**
 * `san` in the chosen symbols. In SAN only pieces are capital letters (files are lower case, castling is
 * "O-O"), so every K/Q/R/B/N becomes its figurine, promotions included: "e8=Q+" → "e8=♕+".
 */
export function formatSan(san: string, symbols: PieceSymbols): string {
  return symbols === 'figurines' ? san.replace(/[KQRBN]/g, (c) => FIGURINE[c]) : san;
}
