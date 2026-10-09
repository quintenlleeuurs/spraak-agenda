// Runs after `next build`: writes out/sw.js, the Service Worker that makes the
// app work offline (TEC-07, VOICE-04). It lists every file of the app so the
// phone can store them on the first visit.
//
// Not in the list: the AI models in /models (hundreds of MB). Those are stored
// separately by the Whisper worker when a model is first loaded.

import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const OUT = join(process.cwd(), "out");
const BASE_PATH = "/spraak-agenda";

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => (entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)])),
  );
  return files.flat();
}

function shouldCache(path) {
  if (path.startsWith("models/")) return false; // stored by the Whisper worker
  if (path === "sw.js") return false; // the worker itself
  if (path === ".nojekyll" || path.endsWith(".map")) return false; // only for GitHub / developers
  // The bundler also emits an unused copy of the ONNX Runtime (we load ours from /ort).
  if (path.startsWith("_next/static/media/") && path.endsWith(".wasm")) return false;
  return true;
}

const files = (await listFiles(OUT)).map((file) => relative(OUT, file).split(sep).join("/")).filter(shouldCache);

// URLs as the browser requests them; "index.html" files are requested as their folder.
const urls = files.map((file) => `${BASE_PATH}/${file.replace(/(^|\/)index\.html$/, "$1")}`).sort();

// The version changes whenever any file changes, so phones fetch the new app.
const hash = createHash("sha256");
for (const file of files.sort()) hash.update(file).update(await readFile(join(OUT, file)));
const version = hash.digest("hex").slice(0, 12);

const template = await readFile(join(process.cwd(), "scripts", "sw-template.js"), "utf8");
const sw = template
  .replaceAll("__VERSION__", version)
  .replaceAll("__BASE_PATH__", BASE_PATH)
  .replaceAll("__URLS__", JSON.stringify(urls, null, 2));
await writeFile(join(OUT, "sw.js"), sw);

const totalBytes = (await Promise.all(files.map((file) => stat(join(OUT, file))))).reduce((sum, s) => sum + s.size, 0);
console.log(`sw.js: ${urls.length} files (${(totalBytes / 1e6).toFixed(1)} MB), version ${version}`);
