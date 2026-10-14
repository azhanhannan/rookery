// Diagram convention: outlined glyphs for White, solid for Black (reads better than coloured fills at this size).
const GLYPH: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

/** A small, static picture of a position (thumbnails). `orientation` = the side shown at the bottom. */
export function MiniBoard({ fen, orientation = 'w', size = 64 }: { fen: string; orientation?: 'w' | 'b'; size?: number }) {
  const rows = fen.split(' ')[0].split('/');
  const squares: { light: boolean; piece: string | null }[] = [];
  for (let r = 0; r < 8; r++) {
    let file = 0;
    for (const c of rows[r] ?? '') {
      if (c >= '1' && c <= '8') {
        for (let i = 0; i < Number(c); i++) squares.push({ light: (r + file++) % 2 === 0, piece: null });
      } else squares.push({ light: (r + file++) % 2 === 0, piece: c });
    }
  }
  if (orientation === 'b') squares.reverse();
  return (
    <div
      className="grid shrink-0 grid-cols-8 overflow-hidden rounded"
      style={{ width: size, height: size }}
      aria-hidden
      data-testid="mini-board"
    >
      {squares.map((s, i) => (
        <div
          key={i}
          className="flex items-center justify-center leading-none"
          style={{
            backgroundColor: s.light ? 'var(--board-light)' : 'var(--board-dark)',
            fontSize: (size / 8) * 1.15,
          }}
        >
          {s.piece && <span style={{ color: '#111' }}>{GLYPH[s.piece]}</span>}
        </div>
      ))}
    </div>
  );
}
