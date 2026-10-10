// Messages between the page and the Whisper worker.

export type WhisperDevice = "webgpu" | "wasm";

/** Compression per model part, e.g. { encoder_model: "fp16", decoder_model_merged: "q4" }. */
export type WhisperDtype = Record<string, "fp32" | "fp16" | "q8" | "q4">;

export type WorkerRequest =
  | { type: "load"; model: string; device: WhisperDevice; dtype: WhisperDtype }
  | { type: "transcribe"; audio: Float32Array };

export type WorkerResponse =
  | { type: "progress"; file: string; loaded: number; total: number }
  | { type: "ready"; device: WhisperDevice; loadMs: number }
  | { type: "result"; text: string; ms: number }
  | { type: "warning"; message: string }
  | { type: "log"; message: string } // diagnostics only, never contains transcripts
  | { type: "error"; message: string };
