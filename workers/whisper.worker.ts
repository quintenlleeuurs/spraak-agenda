// Runs Whisper in a Web Worker so the UI stays smooth during transcription
// (VOICE-05). Everything happens on the device; no audio or text leaves it.

import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import { createSplitAwareFetch } from "@/lib/whisper/split-fetch";
import type { WorkerRequest, WorkerResponse } from "@/lib/whisper/messages";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const modelsPath = `${basePath}/models/`;

const post = (message: WorkerResponse) => self.postMessage(message);

// Only load models from our own domain (SEC-03), never from Hugging Face.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = modelsPath;
env.useBrowserCache = true; // keep models in Cache Storage for offline use (VOICE-04)
env.cacheKey = "spraak-agenda-models";
env.fetch = createSplitAwareFetch(modelsPath, ({ file, loaded, total }) =>
  post({ type: "progress", file, loaded, total }),
);
// Self-hosted ONNX Runtime files instead of the default CDN (SEC-02).
env.backends.onnx.wasm!.wasmPaths = {
  mjs: `${basePath}/ort/ort-wasm-simd-threaded.asyncify.mjs`,
  wasm: `${basePath}/ort/ort-wasm-simd-threaded.asyncify.wasm`,
};

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;

async function load(model: string, device: "webgpu" | "wasm") {
  const started = performance.now();
  transcriber = null;
  transcriber = await pipeline("automatic-speech-recognition", model, {
    device,
    dtype: { encoder_model: "q8", decoder_model_merged: "q8" },
    progress_callback: (info) => {
      if (info.status === "progress") {
        post({ type: "progress", file: info.file, loaded: info.loaded, total: info.total });
      }
    },
  });
  post({ type: "ready", device, loadMs: performance.now() - started });
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  try {
    if (message.type === "load") {
      try {
        await load(message.model, message.device);
      } catch (error) {
        // WebGPU is not available everywhere; fall back to WebAssembly.
        if (message.device !== "webgpu") throw error;
        post({ type: "warning", message: `WebGPU lukte niet, terugval op WASM: ${String(error)}` });
        await load(message.model, "wasm");
      }
    } else if (message.type === "transcribe") {
      if (!transcriber) throw new Error("Model is nog niet geladen");
      const started = performance.now();
      const output = await transcriber(message.audio, {
        language: "dutch",
        task: "transcribe",
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      const text = (Array.isArray(output) ? output[0] : output).text.trim();
      post({ type: "result", text, ms: performance.now() - started });
    }
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
