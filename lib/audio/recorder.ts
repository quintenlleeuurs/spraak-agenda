// Microphone recording and conversion to what Whisper expects:
// 16 kHz, mono, Float32 samples between -1 and 1.

export const WHISPER_SAMPLE_RATE = 16000;

export type Recording = { stop: () => Promise<Blob> };

export async function startRecording(): Promise<Recording> {
  // Asks for microphone permission the first time (SEC-15).
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => chunks.push(event.data);
  recorder.start();

  return {
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop()); // turn the mic off
          resolve(new Blob(chunks, { type: recorder.mimeType }));
        };
        recorder.stop();
      }),
  };
}

export async function toWhisperAudio(blob: Blob): Promise<Float32Array> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    // Let the browser resample to 16 kHz mono via an offline render.
    const length = Math.ceil(decoded.duration * WHISPER_SAMPLE_RATE);
    const offline = new OfflineAudioContext(1, length, WHISPER_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  } finally {
    await context.close();
  }
}
