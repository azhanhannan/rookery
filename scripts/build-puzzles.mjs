// Builds the puzzle set (Lichess puzzle database, CC0) into public/puzzles/puzzles.json.
//
//   node scripts/build-puzzles.mjs            downloads lichess_db_puzzle.csv.zst (~300 MB), caching it in .data/
//   node scripts/build-puzzles.mjs --cached   reuses .data/lichess_db_puzzle.csv.zst from an earlier run
//
// Streams: download -> zstd -> lines, so the CSV (~1 GB unpacked) is never held in memory.
// Keeps only well-tested puzzles (PUZZLES in src/config/tunables.ts), then reservoir-samples PUZZLES.perBucket
// per 100-point rating bucket with a fixed seed: the same input file always gives the same puzzles.
// Each sampled puzzle is replayed with chess.js first; one that fails is skipped.
import { Chess } from 'chess.js';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { PassThrough, Readable, Transform } from 'node:stream';
import { finished } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createZstdDecompress, gzipSync } from 'node:zlib';
// Node 24 strips the types itself, so the tunables are read from the one place they live.
import { PUZZLES } from '../src/config/tunables.ts';

const URL_ = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';
const SEED = 20261014;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, '.data');
const cacheFile = join(cacheDir, 'lichess_db_puzzle.csv.zst');
const metaFile = join(cacheDir, 'lichess_db_puzzle.meta.json');
const outFile = join(root, 'public', 'puzzles', 'puzzles.json');

/** mulberry32: small seeded PRNG, [0, 1). */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The compressed stream and the file's Last-Modified date (YYYY-MM-DD). */
async function openSource() {
  if (process.argv.includes('--cached')) {
    if (!existsSync(cacheFile)) throw new Error(`--cached: ${cacheFile} not found; run once without --cached`);
    const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : {};
    console.log(`build-puzzles: reading cached ${cacheFile} (${(statSync(cacheFile).size / 1e6).toFixed(0)} MB)`);
    return { stream: createReadStream(cacheFile), lastModified: meta.lastModified ?? 'unknown' };
  }
  const res = await fetch(URL_);
  if (!res.ok || !res.body) throw new Error(`${URL_}: HTTP ${res.status}`);
  const header = res.headers.get('last-modified');
  const lastModified = header ? new Date(header).toISOString().slice(0, 10) : 'unknown';
  console.log(`build-puzzles: downloading ${URL_} (${(Number(res.headers.get('content-length')) / 1e6).toFixed(0)} MB, Last-Modified ${lastModified})`);
  // Tee: one copy to the cache file (renamed into place only once complete), one to the parser.
  mkdirSync(cacheDir, { recursive: true });
  const part = `${cacheFile}.part`;
  const body = Readable.fromWeb(res.body);
  const toParser = new PassThrough();
  const toFile = createWriteStream(part);
  body.pipe(toParser);
  body.pipe(toFile);
  finished(toFile).then(() => {
    renameSync(part, cacheFile);
    writeFileSync(metaFile, JSON.stringify({ url: URL_, lastModified }) + '\n');
  });
  return { stream: toParser, lastModified, cached: finished(toFile) };
}

/**
 * The file is pzstd-style: every zstd frame is preceded by a skippable frame (magic 0x184D2A5?) whose 4-byte
 * payload is that frame's compressed size. Node's zstd stream rejects skippable frames, so drop them here and
 * pass the real frames through. A real frame with no size in front means the layout is unknown: pass the rest.
 */
function stripSkippableFrames() {
  let pending = Buffer.alloc(0);
  let pass = 0; // bytes of the current real frame still to pass through
  let passAll = false;
  return new Transform({
    transform(chunk, _enc, done) {
      if (passAll) return done(null, chunk);
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      const out = [];
      for (;;) {
        if (pass > 0) {
          const n = Math.min(pass, pending.length);
          if (n === 0) break;
          out.push(pending.subarray(0, n));
          pending = pending.subarray(n);
          pass -= n;
          continue;
        }
        if (pending.length < 8) break;
        const magic = pending.readUInt32LE(0);
        if ((magic & 0xfffffff0) !== 0x184d2a50) {
          passAll = true;
          out.push(pending);
          pending = Buffer.alloc(0);
          break;
        }
        const size = pending.readUInt32LE(4);
        if (pending.length < 8 + size) break;
        if (size === 4) pass = pending.readUInt32LE(8);
        pending = pending.subarray(8 + size);
      }
      done(null, out.length ? Buffer.concat(out) : undefined);
    },
    flush(done) {
      done(null, pending.length && (passAll || pass > 0) ? pending : undefined);
    },
  });
}

/** Replays the moves; false when any is illegal or the line doesn't end on the solver's move. */
function valid(fen, moves) {
  if (moves.length < 2 || moves.length % 2 !== 0) return false;
  try {
    const chess = new Chess(fen);
    for (const uci of moves) {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    }
    return true;
  } catch {
    return false;
  }
}

const started = Date.now();
const { stream, lastModified, cached } = await openSource();
const rng = seeded(SEED);
/** bucket -> { seen, items } */
const buckets = new Map();
let rows = 0;
let eligible = 0;
let invalid = 0;
let header = null;

const lines = createInterface({ input: stream.pipe(stripSkippableFrames()).pipe(createZstdDecompress()), crlfDelay: Infinity });
for await (const line of lines) {
  if (!line) continue;
  const cols = line.split(',');
  if (!header) {
    header = Object.fromEntries(cols.map((c, i) => [c, i]));
    for (const c of ['PuzzleId', 'FEN', 'Moves', 'Rating', 'RatingDeviation', 'Popularity', 'NbPlays', 'Themes'])
      if (!(c in header)) throw new Error(`build-puzzles: column ${c} missing from the CSV header`);
    continue;
  }
  rows++;
  if (rows % 1_000_000 === 0) console.log(`build-puzzles: ${rows / 1e6}M rows, ${eligible} eligible`);
  const rating = Number(cols[header.Rating]);
  if (!(rating >= PUZZLES.minRating && rating < PUZZLES.maxRating)) continue;
  if (Number(cols[header.Popularity]) < PUZZLES.minPopularity) continue;
  if (Number(cols[header.NbPlays]) < PUZZLES.minPlays) continue;
  if (Number(cols[header.RatingDeviation]) > PUZZLES.maxRd) continue;
  eligible++;

  const key = Math.floor(rating / 100) * 100;
  let bucket = buckets.get(key);
  if (!bucket) buckets.set(key, (bucket = { seen: 0, items: [] }));
  // Reservoir sampling (Algorithm R). Validation only runs for rows about to enter the reservoir; an invalid
  // row is un-counted as if it had been filtered out.
  bucket.seen++;
  const slot = bucket.items.length < PUZZLES.perBucket ? bucket.items.length : Math.floor(rng() * bucket.seen);
  if (slot >= PUZZLES.perBucket) continue;
  const fen = cols[header.FEN];
  const moves = cols[header.Moves].split(' ');
  if (!valid(fen, moves)) {
    invalid++;
    bucket.seen--;
    continue;
  }
  const themes = cols[header.Themes] ? cols[header.Themes].split(' ') : [];
  bucket.items[slot] = { id: cols[header.PuzzleId], fen, moves, rating, themes };
}
if (cached) await cached;

const puzzles = [...buckets.values()]
  .flatMap((b) => b.items)
  .sort((a, b) => a.rating - b.rating || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const set = {
  source: `Lichess puzzle database (https://database.lichess.org/#puzzles, CC0 1.0), lichess_db_puzzle.csv.zst Last-Modified ${lastModified}`,
  builtAt: new Date().toISOString(),
  puzzles,
};
mkdirSync(dirname(outFile), { recursive: true });
const json = JSON.stringify(set);
writeFileSync(outFile, json);

console.log(`build-puzzles: ${rows} rows, ${eligible} eligible, ${invalid} failed replay, ${puzzles.length} kept`);
for (const key of [...buckets.keys()].sort((a, b) => a - b)) {
  const b = buckets.get(key);
  console.log(`  ${key}-${key + 99}: ${b.items.length} of ${b.seen}`);
}
console.log(
  `build-puzzles: ${outFile} ${(json.length / 1024).toFixed(0)} KB, gzipped ${(gzipSync(json).length / 1024).toFixed(0)} KB, ${((Date.now() - started) / 1000).toFixed(1)} s`,
);
