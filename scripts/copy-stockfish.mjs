// Copies the Stockfish worker build from node_modules into public/stockfish, where Vite serves it
// as a separate file (GPL-3.0: never bundled into app code; see SPEC "Licensing and legal").
// The .js/.wasm are generated (gitignored); COPYING and SOURCE.md are committed, so they are only
// written when missing.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'node_modules', 'stockfish');
const outDir = join(root, 'public', 'stockfish');
const files = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'];

const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
mkdirSync(outDir, { recursive: true });

for (const file of files) copyFileSync(join(pkgDir, 'bin', file), join(outDir, file));

if (!existsSync(join(outDir, 'COPYING'))) copyFileSync(join(pkgDir, 'Copying.txt'), join(outDir, 'COPYING'));

if (!existsSync(join(outDir, 'SOURCE.md'))) {
  writeFileSync(
    join(outDir, 'SOURCE.md'),
    `# Stockfish engine files

\`stockfish-19-lite-single.js\` and \`stockfish-19-lite-single.wasm\` are **Stockfish 19**
(lite, single-threaded WebAssembly build) from **stockfish.js ${version}**, unmodified, as published
in the \`stockfish\` npm package.

They are licensed under the GNU General Public License v3.0; the full text is in \`COPYING\`.
This app talks to them only through UCI messages to a Web Worker; they are not part of the app bundle.

Corresponding source:

- Stockfish: https://github.com/official-stockfish/Stockfish (Stockfish 19)
- stockfish.js (WASM build): https://github.com/nmrugg/stockfish.js (v${version}, https://github.com/nmrugg/stockfish.js/releases/tag/v${version})
`,
  );
}

console.log(`copy-stockfish: ${files.join(', ')} -> public/stockfish (stockfish.js ${version})`);
