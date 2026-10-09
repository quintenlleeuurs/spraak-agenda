// Web App Manifest: tells the iPhone how the app looks once it is added to
// the home screen ("Zet op beginscherm"). Next.js turns this into
// /spraak-agenda/manifest.webmanifest during the build.

import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Spraak-agenda",
    short_name: "Agenda",
    description: "Spreek je afspraken in. Alles blijft op je telefoon.",
    lang: "nl",
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone", // no Safari address bar
    background_color: "#111214",
    theme_color: "#111214",
    icons: [
      { src: `${base}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${base}/icons/icon-512.png`, sizes: "512x512", type: "image/png" },
    ],
  };
}
