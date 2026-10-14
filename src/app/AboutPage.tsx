import { APP_NAME } from '../config/tunables';

// SPEC "Licensing and legal": credit Stockfish by name, link its exact source, list other libraries.
const LIBRARIES = [
  { name: 'chess.js', url: 'https://github.com/jhlywa/chess.js', license: 'BSD-2-Clause' },
  { name: 'react-chessboard', url: 'https://github.com/Clariity/react-chessboard', license: 'MIT' },
  { name: 'React', url: 'https://github.com/facebook/react', license: 'MIT' },
  { name: 'Zustand', url: 'https://github.com/pmndrs/zustand', license: 'MIT' },
  { name: 'Tailwind CSS', url: 'https://github.com/tailwindlabs/tailwindcss', license: 'MIT' },
  { name: 'Vite', url: 'https://github.com/vitejs/vite', license: 'MIT' },
  { name: 'ONNX Runtime Web 1.30.0 (runs the Maia model)', url: 'https://github.com/microsoft/onnxruntime', license: 'MIT' },
  { name: 'Recharts', url: 'https://github.com/recharts/recharts', license: 'MIT' },
  { name: 'lichess-org/chess-openings (opening names)', url: 'https://github.com/lichess-org/chess-openings', license: 'CC0-1.0' },
  { name: 'Lichess puzzle database (puzzles)', url: 'https://database.lichess.org/#puzzles', license: 'CC0-1.0' },
];

export function AboutPage() {
  const link = 'text-accent underline underline-offset-2';
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 leading-relaxed">
      <h1 className="mb-3 text-xl font-semibold">About {APP_NAME}</h1>

      <h2 className="mt-5 mb-1 font-semibold">Chess engine</h2>
      <p>
        Bots and evaluations use <strong>Stockfish 19</strong>, a free chess engine by the Stockfish developers,
        compiled to WebAssembly by the stockfish.js project (version 19.0.1, lite single-threaded build).
        Stockfish is not part of {APP_NAME}: it runs as a separate program in your browser and is licensed under the{' '}
        <a className={link} href="/stockfish/COPYING">GNU General Public License v3</a>.
      </p>
      <ul className="mt-2 list-disc pl-6">
        <li>
          Source: <a className={link} href="https://github.com/official-stockfish/Stockfish">official-stockfish/Stockfish</a>
        </li>
        <li>
          WebAssembly build: <a className={link} href="https://github.com/nmrugg/stockfish.js/tree/v19.0.1">nmrugg/stockfish.js v19.0.1</a>
        </li>
      </ul>

      <h2 className="mt-5 mb-1 font-semibold">Human-like bots</h2>
      <p>
        Human-like bots use <strong>Maia-3</strong> by the Computational Social Science Lab (CSSLab), University of
        Toronto, run unmodified in your browser. Like Stockfish it is a separate program, not part of {APP_NAME}, and is
        licensed under the <a className={link} href="/maia/LICENSE-AGPL-3.0.txt">GNU Affero General Public License v3</a>.
      </p>
      <ul className="mt-2 list-disc pl-6">
        <li>
          Source: <a className={link} href="https://github.com/CSSLab/maia3">CSSLab/maia3</a>; model file from{' '}
          <a className={link} href="https://github.com/CSSLab/maia-platform-frontend">CSSLab/maia-platform-frontend</a>
        </li>
        <li>
          Paper: Monroe, Eilender, Chalmers, Tang, Anderson, "Chessformer: A Unified Architecture for Chess Modeling",
          ICLR 2026 (<a className={link} href="https://arxiv.org/abs/2605.19091">arXiv 2605.19091</a>)
        </li>
        <li>
          More at <a className={link} href="https://maiachess.com">maiachess.com</a>
        </li>
      </ul>

      <h2 className="mt-5 mb-1 font-semibold">Open-source libraries</h2>
      <ul className="list-disc pl-6">
        {LIBRARIES.map((l) => (
          <li key={l.name}>
            <a className={link} href={l.url}>{l.name}</a> — {l.license}
          </li>
        ))}
      </ul>
    </div>
  );
}
