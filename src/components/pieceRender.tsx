import { defaultPieces } from 'react-chessboard';
import { PIECE_KEYS, pieceUrl, type PieceSet } from '../settings/pieceSet';

type PieceRenderObject = typeof defaultPieces;

/** react-chessboard piece renderers for `set`: the built-in SVGs, or the set's image files. */
export function piecesFor(set: PieceSet): PieceRenderObject {
  if (!set.dir) return defaultPieces;
  return Object.fromEntries(
    PIECE_KEYS.map((key) => [
      key,
      (props?: { svgStyle?: React.CSSProperties }) => (
        <img
          src={pieceUrl(set, key)!}
          alt=""
          // The board handles dragging; a native image drag would fight it.
          draggable={false}
          style={{ width: '100%', height: '100%', userSelect: 'none', ...props?.svgStyle }}
        />
      ),
    ]),
  );
}
