// Downloads the extra piece sets from the Lichess repository (pinned commit) into public/pieces/<set>/.
// The files are committed, so this only runs when adding or updating a set: node scripts/fetch-pieces.mjs
// Licences: public/pieces/LICENSE-NOTE.md (each set's terms differ; all allow redistribution).
import { mkdirSync, writeFileSync } from 'node:fs';

const LILA = 'https://raw.githubusercontent.com/lichess-org/lila/ad760137cf9941cadd93126433695d6933209b0a/public/piece';
/** Folder name here -> folder name in lila. */
const SETS = {
  merida: 'merida',
  chessnut: 'chessnut',
  fantasy: 'fantasy',
  celtic: 'celtic',
  spatial: 'spatial',
  papercut: 'papercut',
  shapes: 'shapes',
};
const PIECES = ['P', 'N', 'B', 'R', 'Q', 'K'].flatMap((p) => [`w${p}`, `b${p}`]);

for (const [id, lila] of Object.entries(SETS)) {
  mkdirSync(`public/pieces/${id}`, { recursive: true });
  for (const piece of PIECES) {
    const res = await fetch(`${LILA}/${lila}/${piece}.svg`);
    if (!res.ok) throw new Error(`${lila}/${piece}.svg: HTTP ${res.status}`);
    const svg = await res.text();
    if (!svg.includes('<svg')) throw new Error(`${lila}/${piece}.svg is not an SVG`);
    writeFileSync(`public/pieces/${id}/${piece}.svg`, svg);
  }
  console.log(`${id}: ${PIECES.length} pieces`);
}
