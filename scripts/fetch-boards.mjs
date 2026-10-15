// Downloads the textured board images from the Lichess repository (pinned commit) into public/boards/.
// Committed, so this only runs when adding or updating one: node scripts/fetch-boards.mjs
// Licence: AGPLv3+ (the lila authors and pirouetti); see public/boards/LICENSE-NOTE.md.
import { mkdirSync, writeFileSync } from 'node:fs';

const LILA = 'https://raw.githubusercontent.com/lichess-org/lila/ad760137cf9941cadd93126433695d6933209b0a/public/images/board';
export const BOARDS = ['wood', 'wood2', 'wood3', 'wood4', 'maple', 'maple2', 'marble', 'blue-marble', 'leather', 'metal', 'olive', 'canvas2', 'green-plastic'];

mkdirSync('public/boards', { recursive: true });
for (const id of BOARDS) {
  const res = await fetch(`${LILA}/${id}.${id === 'green-plastic' ? 'png' : 'jpg'}`);
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(`public/boards/${id}.${id === 'green-plastic' ? 'png' : 'jpg'}`, buf);
  console.log(`${id}: ${buf.length} bytes`);
}
