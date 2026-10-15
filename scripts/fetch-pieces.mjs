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
  rhosgfx: 'rhosgfx',
  'kiwen-suwi': 'kiwen-suwi',
  totoy: 'totoy',
  firi: 'firi',
  mpchess: 'mpchess',
  pixel: 'pixel',
  letter: 'letter',
  pirouetti: 'pirouetti',
};
const PIECES = ['P', 'N', 'B', 'R', 'Q', 'K'].flatMap((p) => [`w${p}`, `b${p}`]);

const only = process.argv.slice(2);
for (const [id, lila] of Object.entries(SETS)) {
  if (only.length && !only.includes(id)) continue;
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
