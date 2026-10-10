// A fetch replacement for transformers.js with two jobs:
// 1. Privacy guard (SEC-01): refuse every request that leaves our own domain.
// 2. Stitch split model files (.part0, .part1, ...) back together, see
//    scripts/fetch-models.mjs for why they are split.

type SplitManifest = Record<string, { parts: number; size: number }>;

export type PartProgress = { file: string; loaded: number; total: number };

export function createSplitAwareFetch(
  modelsPath: string, // e.g. "/spraak-agenda/models/"
  onPartProgress: (progress: PartProgress) => void,
) {
  let manifest: Promise<SplitManifest> | null = null;
  const assembled = new Map<string, Promise<Blob>>();

  const loadManifest = () =>
    (manifest ??= fetch(`${modelsPath}split-manifest.json`)
      .then((response): Promise<SplitManifest> | SplitManifest => (response.ok ? response.json() : {}))
      .catch((): SplitManifest => ({})));

  async function assemble(url: URL, file: string, entry: { parts: number; size: number }) {
    const chunks: Blob[] = [];
    let loaded = 0;
    for (let i = 0; i < entry.parts; i++) {
      const response = await fetch(`${url.pathname}.part${i}`);
      if (!response.ok) throw new Error(`Model part missing: ${file}.part${i}`);
      const chunk = await response.blob();
      chunks.push(chunk);
      loaded += chunk.size;
      onPartProgress({ file, loaded, total: entry.size });
    }
    return new Blob(chunks);
  }

  return async function splitAwareFetch(input: string | URL, init?: RequestInit) {
    const url = new URL(String(input), self.location.href);
    if (url.origin !== self.location.origin) {
      throw new Error(`Blocked request to another domain: ${url.origin}`);
    }

    if (url.pathname.startsWith(modelsPath)) {
      const file = decodeURIComponent(url.pathname.slice(modelsPath.length));
      const entry = (await loadManifest())[file];
      if (entry) {
        // Share one assembly between requests that arrive at the same time,
        // but forget it afterwards: keeping hundreds of MB in memory made
        // iOS restart the page (found with the diagnostics panel).
        if (!assembled.has(file)) {
          const promise = assemble(url, file, entry);
          promise.finally(() => assembled.delete(file)).catch(() => {});
          assembled.set(file, promise);
        }
        const blob = await assembled.get(file)!;
        return new Response(blob, {
          status: 200,
          headers: {
            "content-type": "application/octet-stream",
            "content-length": String(blob.size),
          },
        });
      }
    }

    return fetch(url, init);
  };
}
