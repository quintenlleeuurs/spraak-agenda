// Copies the ONNX Runtime WebAssembly files from node_modules into public/ort.
// Without this, transformers.js downloads them from a CDN (jsdelivr), which
// the CSP forbids (SEC-02). Runs automatically before `dev` and `build`.

import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const source = join(process.cwd(), "node_modules", "onnxruntime-web", "dist");
const target = join(process.cwd(), "public", "ort");
const files = ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"];

await mkdir(target, { recursive: true });
for (const file of files) {
  await copyFile(join(source, file), join(target, file));
}
console.log(`Copied ${files.length} ONNX Runtime files to public/ort`);
