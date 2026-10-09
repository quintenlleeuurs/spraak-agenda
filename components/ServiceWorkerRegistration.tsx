"use client";

// Registers the Service Worker (scripts/sw-template.js) so the app works
// offline. Only in the published app: during development it would keep
// serving old files.

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` }).catch(() => {
      // Not fatal: the app still works online.
    });
  }, []);
  return null;
}
