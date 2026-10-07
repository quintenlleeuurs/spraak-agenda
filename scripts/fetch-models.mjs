// Downloads the Whisper model files into public/models so the app can serve
// them from its own domain (SEC-03). Runs on the laptop or in GitHub Actions,
// never on the user's phone, and only downloads public model files.
//
// Files larger than maxPartBytes are split into parts (.part0, .part1, ...)
// because of GitHub file size limits. split-manifest.json tells the app which
// files to stitch back together (see lib/whisper/split-fetch.ts).
//
// Usage: npm run models

import { createWriteStream } from "node:fs";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const config = JSON.parse(await readFile(new URL("../config/models.json", import.meta.url), "utf8"));
const modelsDir = join(process.cwd(), "public", "models");
const manifestPath = join(modelsDir, "split-manifest.json");

const manifest = await readFile(manifestPath, "utf8").then(JSON.parse).catch(() => ({}));

async function exists(path) {
  return stat(path).then(() => true, () => false);
}

async function download(url, target) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  await mkdir(dirname(target), { recursive: true });
  // Write to a temporary file first so an interrupted download is never
  // mistaken for a complete file on the next run.
  const temporary = `${target}.download`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
  await rename(temporary, target);
}

async function split(path, maxPartBytes) {
  const { size } = await stat(path);
  const parts = Math.ceil(size / maxPartBytes);
  const handle = await open(path, "r");
  try {
    for (let i = 0; i < parts; i++) {
      const length = Math.min(maxPartBytes, size - i * maxPartBytes);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, i * maxPartBytes);
      await writeFile(`${path}.part${i}`, buffer);
    }
  } finally {
    await handle.close();
  }
  await rm(path);
  return { parts, size };
}

for (const [name, repo] of Object.entries(config.models)) {
  for (const file of config.files) {
    const key = `${repo}/${file}`;
    const target = join(modelsDir, repo, file);

    if (manifest[key] || (await exists(target))) {
      console.log(`✓ ${key} (already present)`);
      continue;
    }

    const url = config.source.replace("{model}", name).replace("{file}", file);
    console.log(`↓ ${key}`);
    await download(url, target);

    const { size } = await stat(target);
    if (size > config.maxPartBytes) {
      manifest[key] = await split(target, config.maxPartBytes);
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
      console.log(`  split into ${manifest[key].parts} parts`);
    }
  }
}

await mkdir(modelsDir, { recursive: true });
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("Models ready in public/models");
