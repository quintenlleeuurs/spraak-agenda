"use client";

// Phase 0 test screen: record → Whisper on the device → show text,
// plus timing per run so we can compare models and devices.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { startRecording, toWhisperAudio, WHISPER_SAMPLE_RATE, type Recording } from "@/lib/audio/recorder";
import type { WhisperDevice, WorkerRequest, WorkerResponse } from "@/lib/whisper/messages";

const MODELS = [
  { id: "onnx-community/whisper-small", label: "whisper-small (±250 MB, nauwkeuriger)" },
  { id: "onnx-community/whisper-base", label: "whisper-base (±77 MB, sneller)" },
];
const MAX_RECORDING_SECONDS = 180; // VOICE-02

type Status = "idle" | "loading" | "ready" | "recording" | "processing";
type Run = { model: string; device: WhisperDevice; audioSec: number; processSec: number; text: string };

export default function FeasibilityTest() {
  const workerRef = useRef<Worker | null>(null);
  const recordingRef = useRef<Recording | null>(null);
  const pendingRef = useRef<{ audioSec: number } | null>(null);
  const activeRef = useRef<{ model: string; device: WhisperDevice }>({ model: "", device: "wasm" });

  const [model, setModel] = useState(MODELS[0].id);
  // WebGPU can only be detected in the browser, not during the static build.
  const webgpuAvailable = useSyncExternalStore(
    () => () => {},
    () => "gpu" in navigator,
    () => false,
  );
  const [chosenDevice, setDevice] = useState<WhisperDevice | null>(null);
  const device = chosenDevice ?? (webgpuAvailable ? "webgpu" : "wasm");
  const [status, setStatus] = useState<Status>("idle");
  const [loaded, setLoaded] = useState<{ device: WhisperDevice; model: string; loadSec: number } | null>(null);
  const [progress, setProgress] = useState<Record<string, { loaded: number; total: number }>>({});
  const [seconds, setSeconds] = useState(0);
  const [runs, setRuns] = useState<Run[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL("../workers/whisper.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      if (data.type === "progress") {
        setProgress((previous) => ({ ...previous, [data.file]: { loaded: data.loaded, total: data.total } }));
      } else if (data.type === "ready") {
        // The worker may have fallen back from WebGPU to WASM.
        activeRef.current.device = data.device;
        setLoaded({ ...activeRef.current, loadSec: data.loadMs / 1000 });
        setStatus("ready");
      } else if (data.type === "result") {
        const audioSec = pendingRef.current?.audioSec ?? 0;
        setRuns((previous) => [
          { ...activeRef.current, audioSec, processSec: data.ms / 1000, text: data.text },
          ...previous,
        ]);
        setStatus("ready");
      } else if (data.type === "warning") {
        setMessage(data.message);
      } else if (data.type === "error") {
        setMessage(`Fout: ${data.message}`);
        setStatus((previous) => (previous === "processing" ? "ready" : "idle"));
      }
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  // Recording timer with automatic stop at the maximum duration.
  useEffect(() => {
    if (status !== "recording") return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status === "recording" && seconds >= MAX_RECORDING_SECONDS) void stop();
  });

  const send = (request: WorkerRequest, transfer: Transferable[] = []) =>
    workerRef.current?.postMessage(request, transfer);

  function loadModel() {
    setMessage(null);
    setProgress({});
    setStatus("loading");
    activeRef.current = { model: model.split("/")[1], device };
    setLoaded(null);
    send({ type: "load", model, device });
  }

  async function start() {
    setMessage(null);
    try {
      recordingRef.current = await startRecording();
      setSeconds(0);
      setStatus("recording");
    } catch (error) {
      setMessage(`Microfoon niet beschikbaar: ${String(error)}`);
    }
  }

  async function stop() {
    const recording = recordingRef.current;
    if (!recording) return;
    recordingRef.current = null;
    setStatus("processing");
    try {
      const audio = await toWhisperAudio(await recording.stop());
      pendingRef.current = { audioSec: audio.length / WHISPER_SAMPLE_RATE };
      send({ type: "transcribe", audio }, [audio.buffer]);
    } catch (error) {
      setMessage(`Audio kon niet worden omgezet: ${String(error)}`);
      setStatus("ready");
    }
  }

  const files = Object.entries(progress);
  const totalLoaded = files.reduce((sum, [, p]) => sum + p.loaded, 0);
  const totalSize = files.reduce((sum, [, p]) => sum + p.total, 0);

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-5 py-8">
      <header>
        <p className="text-sm font-light uppercase tracking-widest opacity-60">Fase 0 · Haalbaarheidstest</p>
        <h1 className="text-3xl font-light">Spraak naar tekst</h1>
        <p className="mt-2 text-sm opacity-70">
          Alles gebeurt op dit toestel. Je stem en de tekst verlaten de telefoon niet.
        </p>
      </header>

      <section className="flex flex-col gap-3 rounded-3xl border border-black/10 p-5 dark:border-white/10">
        <h2 className="font-medium">1. Model kiezen en laden</h2>
        <label className="flex flex-col gap-1 text-sm">
          Model
          <select
            className="rounded-xl border border-black/10 bg-transparent p-2 dark:border-white/20"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={status === "loading" || status === "recording" || status === "processing"}
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Rekenmethode
          <select
            className="rounded-xl border border-black/10 bg-transparent p-2 dark:border-white/20"
            value={device}
            onChange={(e) => setDevice(e.target.value as WhisperDevice)}
            disabled={status === "loading" || status === "recording" || status === "processing"}
          >
            <option value="webgpu" disabled={!webgpuAvailable}>
              WebGPU (grafische chip){webgpuAvailable ? "" : " niet beschikbaar"}
            </option>
            <option value="wasm">WebAssembly (processor)</option>
          </select>
        </label>
        <button
          className="rounded-2xl bg-todo px-4 py-3 font-medium text-white disabled:opacity-40"
          onClick={loadModel}
          disabled={status === "loading" || status === "recording" || status === "processing"}
        >
          {status === "loading" ? "Bezig met laden…" : "Model laden"}
        </button>
        {status === "loading" && totalSize > 0 && (
          <p className="text-sm opacity-70">
            {(totalLoaded / 1e6).toFixed(0)} / {(totalSize / 1e6).toFixed(0)} MB. De eerste keer via wifi; daarna
            staat het model op je telefoon.
          </p>
        )}
        {loaded && status !== "loading" && (
          <p className="text-sm opacity-70">
            Geladen: {loaded.model} via {loaded.device === "webgpu" ? "WebGPU" : "WebAssembly"} in{" "}
            {loaded.loadSec.toFixed(1)} s
          </p>
        )}
      </section>

      <section className="flex flex-col items-center gap-3 rounded-3xl border border-black/10 p-5 dark:border-white/10">
        <h2 className="self-start font-medium">2. Inspreken</h2>
        <button
          className={`h-24 w-24 rounded-full text-white shadow-lg transition-transform active:scale-95 disabled:opacity-40 ${
            status === "recording" ? "animate-pulse bg-appointment" : "bg-appointment/80"
          }`}
          onClick={status === "recording" ? stop : start}
          disabled={status !== "ready" && status !== "recording"}
          aria-label={status === "recording" ? "Stop opname" : "Start opname"}
        >
          {status === "recording" ? "Stop" : "Opnemen"}
        </button>
        <p className="text-sm opacity-70">
          {status === "recording" && `Opname loopt: ${seconds} s (max ${MAX_RECORDING_SECONDS} s)`}
          {status === "processing" && "Luisteren…"}
          {status === "ready" && "Tik om te beginnen"}
          {(status === "idle" || status === "loading") && "Laad eerst een model"}
        </p>
      </section>

      {message && <p className="rounded-2xl bg-idea/20 p-4 text-sm">{message}</p>}

      {runs.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-medium">3. Resultaten</h2>
          {runs.map((run, i) => (
            <article key={runs.length - i} className="rounded-3xl border border-black/10 p-5 dark:border-white/10">
              {/* AI output is always rendered as plain text (SEC-16). */}
              <p className="whitespace-pre-wrap">{run.text || "(geen tekst herkend)"}</p>
              <p className="mt-3 text-xs opacity-60">
                {run.model} · {run.device === "webgpu" ? "WebGPU" : "WASM"} · audio {run.audioSec.toFixed(1)} s ·
                verwerking {run.processSec.toFixed(1)} s
              </p>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
