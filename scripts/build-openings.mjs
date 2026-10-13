// Builds the openings data (SPEC: lichess-org/chess-openings, CC0).
//
//   node scripts/build-openings.mjs --fetch   downloads a.tsv..e.tsv into src/openings/openings.tsv, then indexes
//   node scripts/build-openings.mjs           re-indexes the committed openings.tsv
//
// Indexing writes src/openings/positions.tsv: one row per position on any named line, keyed by EPD.
// It is precomputed because replaying ~38,000 SAN moves with chess.js takes ~9 s, far too slow for the browser.
import { Chess } from 'chess.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'lichess-org/chess-openings';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceFile = join(root, 'src', 'openings', 'openings.tsv');
const indexFile = join(root, 'src', 'openings', 'positions.tsv');

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

async function fetchSource() {
  const commit = JSON.parse(await fetchText(`https://api.github.com/repos/${REPO}/commits/master`));
  const rows = [];
  for (const letter of 'abcde') {
    const text = await fetchText(`https://raw.githubusercontent.com/${REPO}/${commit.sha}/${letter}.tsv`);
    rows.push(...text.trim().split('\n').slice(1));
  }
  const header = [
    `# https://github.com/${REPO} @ ${commit.sha} (a.tsv-e.tsv), fetched ${new Date().toISOString().slice(0, 10)}.`,
    '# CC0 1.0 (public domain). Regenerate with: node scripts/build-openings.mjs --fetch',
    'eco\tname\tpgn',
  ];
  writeFileSync(sourceFile, [...header, ...rows].join('\n') + '\n');
  console.log(`build-openings: ${rows.length} openings from ${REPO}@${commit.sha.slice(0, 7)}`);
}

/** First four FEN fields. chess.js writes an en-passant square only when a capture is legal; lookups rely on that. */
const epd = (fen) => fen.split(' ').slice(0, 4).join(' ');

function buildIndex() {
  const lines = readFileSync(sourceFile, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).slice(1);
  const named = new Map();
  const onLine = new Set();
  for (const row of lines) {
    const [eco, name, pgn] = row.split('\t');
    const chess = new Chess();
    for (const san of pgn.split(' ').filter((t) => !/^\d+\.+$/.test(t))) {
      chess.move(san);
      onLine.add(epd(chess.fen()));
    }
    const key = epd(chess.fen());
    // The first row wins on a clash; the dataset has none today.
    if (named.has(key)) console.warn(`build-openings: ${eco} ${name} repeats ${named.get(key).join(' ')}`);
    else named.set(key, [eco, name]);
  }
  const rows = [...onLine].map((key) => [key, ...(named.get(key) ?? [])].join('\t'));
  writeFileSync(indexFile, rows.join('\n') + '\n');
  console.log(`build-openings: ${rows.length} book positions, ${named.size} named -> src/openings/positions.tsv`);
}

if (process.argv.includes('--fetch')) await fetchSource();
buildIndex();
