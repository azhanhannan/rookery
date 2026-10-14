# Maia-3 model (human-like bots)

`maia3_simplified.onnx` is **Maia-3** (simplified ONNX export) by the CSSLab at the University of Toronto,
unmodified. It is not committed: `scripts/fetch-maia.mjs` downloads it (run by `npm run dev` / `npm run build`)
and checks its hash.

- File: `maia3_simplified.onnx`, 45,683,686 bytes
- sha256: `405bf76c15727dad8728b352c06a8f3c1b80fb2760e8d666b32485c63d75b856`
- Downloaded from: https://raw.githubusercontent.com/CSSLab/maia-platform-frontend/main/public/maia3/maia3_simplified.onnx
  (the maiachess.com frontend, https://github.com/CSSLab/maia-platform-frontend, GPL-3.0; checked at commit
  `a6e52f5c811ee18863cb2f0e81f2433a5b9905de`)
- Model and inference code: https://github.com/CSSLab/maia3 (checked at commit `1e13597c42d4858b7cfd7cfdae01e297263364b2`),
  weights also at https://huggingface.co/collections/MaiaChess/maia3
- Licence: **GNU Affero General Public License v3.0** (AGPL-3.0); full text in `LICENSE-AGPL-3.0.txt` next to this file.
- Website: https://maiachess.com

The app runs the model unmodified with ONNX Runtime Web (MIT, https://github.com/microsoft/onnxruntime) in a separate
Web Worker (`src/maia/maia.worker.ts`); the runtime's `.wasm`/`.mjs` in `public/ort/` are copied from the
`onnxruntime-web` npm package by the same script.

## Citation

```bibtex
@inproceedings{monroe2026chessformer,
  title={Chessformer: A Unified Architecture for Chess Modeling},
  author={Daniel Monroe and George Eilender and Philip Chalmers and Zhenwei Tang and Ashton Anderson},
  booktitle={The Fourteenth International Conference on Learning Representations},
  year={2026},
  url={https://openreview.net/forum?id=2ltBRzEHyd}
}
```

Paper: https://arxiv.org/abs/2605.19091
