// Human-like bots (Maia): puts the Maia-3 model in public/maia and the onnxruntime-web WASM runtime in
// public/ort, where Vite serves them as plain files (both gitignored; see public/maia/LICENSE-NOTE.md).
// Never fails: offline or on a bad download it warns and leaves Maia unavailable, so `npm run dev` still starts.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_NAME = 'maia3_simplified.onnx';
const MODEL_URL = `https://raw.githubusercontent.com/CSSLab/maia-platform-frontend/main/public/maia3/${MODEL_NAME}`;
const MODEL_SHA256 = '405bf76c15727dad8728b352c06a8f3c1b80fb2760e8d666b32485c63d75b856';
const MODEL_BYTES = 45_683_686;
/** A local copy to use instead of downloading (set MAIA_MODEL_PATH); checked against the sha256 like a download. */
const LOCAL_COPIES = [process.env.MAIA_MODEL_PATH].filter(Boolean);

const modelDir = join(root, 'public', 'maia');
const modelPath = join(modelDir, MODEL_NAME);
const ortDir = join(root, 'public', 'ort');
const ORT_FILES = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const intact = (path) => existsSync(path) && sha256(readFileSync(path)) === MODEL_SHA256;

function copyRuntime() {
  const pkgDir = join(root, 'node_modules', 'onnxruntime-web');
  const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  mkdirSync(ortDir, { recursive: true });
  for (const file of ORT_FILES) copyFileSync(join(pkgDir, 'dist', file), join(ortDir, file));
  console.log(`fetch-maia: ${ORT_FILES.join(', ')} -> public/ort (onnxruntime-web ${version})`);
}

async function ensureModel() {
  mkdirSync(modelDir, { recursive: true });
  if (intact(modelPath)) return 'present';
  const local = LOCAL_COPIES.find((p) => intact(p));
  if (local) {
    copyFileSync(local, modelPath);
    return `copied from ${local}`;
  }
  console.log(`fetch-maia: downloading ${MODEL_NAME} (${(MODEL_BYTES / 1e6).toFixed(0)} MB)...`);
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${MODEL_URL}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha256(buf);
  if (got !== MODEL_SHA256) throw new Error(`sha256 mismatch: got ${got}, want ${MODEL_SHA256}`);
  // Write then rename, so an interrupted run never leaves a half-written model behind.
  const tmp = `${modelPath}.part`;
  writeFileSync(tmp, buf);
  renameSync(tmp, modelPath);
  return 'downloaded';
}

try {
  copyRuntime();
} catch (err) {
  console.warn(`fetch-maia: WARNING could not copy the onnxruntime-web runtime (${err.message}); human-like bots unavailable.`);
}
try {
  const how = await ensureModel();
  console.log(`fetch-maia: public/maia/${MODEL_NAME} ok (${how})`);
} catch (err) {
  rmSync(`${modelPath}.part`, { force: true });
  console.warn(`fetch-maia: WARNING ${err.message}; human-like bots unavailable until \`node scripts/fetch-maia.mjs\` succeeds.`);
}
