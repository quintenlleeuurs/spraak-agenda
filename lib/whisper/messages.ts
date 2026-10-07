// Messages between the page and the Whisper worker.

export type WhisperDevice = "webgpu" | "wasm";

export type WorkerRequest =
  | { type: "load"; model: string; device: WhisperDevice }
  | { type: "transcribe"; audio: Float32Array };

export type WorkerResponse =
  | { type: "progress"; file: string; loaded: number; total: number }
  | { type: "ready"; device: WhisperDevice; loadMs: number }
  | { type: "result"; text: string; ms: number }
  | { type: "warning"; message: string }
  | { type: "error"; message: string };
