"use client";

// Troubleshooting panel: shows the log, the Service Worker state and the
// storage on this phone. Temporary aid for testing; nothing leaves the device.

import { useEffect, useState, useSyncExternalStore } from "react";
import { getEmptyLog, getLog, logStep, restoreLog, subscribeLog } from "@/lib/diagnostics/log";

async function describeEnvironment() {
  // A previous log in this session means the page started again without the
  // app being closed: iOS restarted it (often because memory ran out).
  const previous = restoreLog();
  if (previous) logStep(`⚠️ Pagina is opnieuw opgestart. Laatste stap vóór de herstart: "${previous.text}"`);
  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  logStep(`Pagina geladen (${navigation?.type ?? "onbekend"})`);

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  logStep(`Geopend ${standalone ? "vanaf beginscherm" : "in Safari/browser"} · ${navigator.onLine ? "online" : "offline"}`);

  if (!("serviceWorker" in navigator)) {
    logStep("Service Worker: niet ondersteund");
  } else {
    const registration = await navigator.serviceWorker.getRegistration();
    const state = registration?.active?.state ?? "geen actieve";
    logStep(`Service Worker: ${state}, regelt deze pagina: ${navigator.serviceWorker.controller ? "ja" : "nee"}`);
    const watch = (worker: ServiceWorker | null | undefined, label: string) =>
      worker?.addEventListener("statechange", () => logStep(`Service Worker (${label}): ${worker.state}`));
    watch(registration?.installing, "installeren");
    registration?.addEventListener("updatefound", () => watch(registration.installing, "nieuwe versie"));
  }

  if ("caches" in window) {
    const keys = await caches.keys();
    logStep(`Opgeslagen: ${keys.length ? keys.join(", ") : "niets"}`);
  }
  if (navigator.storage?.estimate) {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    logStep(`Opslag gebruikt: ${(usage / 1e6).toFixed(0)} MB van ${(quota / 1e6).toFixed(0)} MB`);
  }
}

/** Removes the Service Worker and all stored app files and models, then reloads. */
async function resetApp() {
  const registrations = await navigator.serviceWorker?.getRegistrations?.();
  await Promise.all((registrations ?? []).map((registration) => registration.unregister()));
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
  sessionStorage.clear();
  location.reload();
}

export default function Diagnostics() {
  const log = useSyncExternalStore(subscribeLog, getLog, getEmptyLog);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onError = (event: ErrorEvent) => logStep(`Fout op pagina: ${event.message}`);
    const onRejection = (event: PromiseRejectionEvent) => logStep(`Fout (async): ${String(event.reason)}`);
    const onVisibility = () => logStep(`Pagina ${document.visibilityState === "hidden" ? "verborgen" : "weer zichtbaar"}`);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    document.addEventListener("visibilitychange", onVisibility);
    void describeEnvironment().catch((error) => logStep(`Diagnose mislukt: ${String(error)}`));
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  async function copyLog() {
    await navigator.clipboard.writeText(log.map((entry) => `${entry.time} ${entry.text}`).join("\n"));
    setCopied(true);
  }

  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-black/10 p-5 text-xs dark:border-white/10">
      <h2 className="text-base font-medium">Diagnose</h2>
      <ol className="flex flex-col gap-1 font-mono">
        {log.map((entry, i) => (
          <li key={i}>
            <span className="opacity-50">{entry.time}</span> {entry.text}
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        <button className="rounded-xl border border-current/20 px-3 py-2" onClick={copyLog}>
          {copied ? "Gekopieerd" : "Kopieer log"}
        </button>
        <button className="rounded-xl border border-current/20 px-3 py-2" onClick={resetApp}>
          Alles wissen en herladen
        </button>
      </div>
    </section>
  );
}
