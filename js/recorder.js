// Thin wrapper around MediaRecorder with per-browser codec detection.
// Chrome/Firefox record WebM/Opus, Safari records MP4/AAC.

const CANDIDATE_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  return CANDIDATE_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

/** Why recording can't work here, or null if it can. */
export function recorderUnsupportedReason() {
  if (!window.isSecureContext) {
    return "The microphone only works on a secure address. Open the app at http://localhost:8765.";
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    return "This browser can't record audio. Try a current Chrome, Edge or Firefox.";
  }
  return null;
}

export function micErrorMessage(err) {
  switch (err?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Microphone access is blocked. Allow it in the site settings (the icon left of the address bar), then try again.";
    case "NotFoundError":
      return "No microphone was found. Plug one in and try again.";
    case "NotReadableError":
      return "The microphone is busy in another app. Close it there and try again.";
    default:
      return `Couldn't start recording: ${err?.message ?? err}`;
  }
}

/** Starts recording. Resolves to a controller once the mic is open. */
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickMimeType();
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const startedAt = Date.now();
  const release = () => stream.getTracks().forEach((t) => t.stop());
  rec.start(1000);

  return {
    startedAt,
    stop() {
      return new Promise((resolve) => {
        rec.onstop = () => {
          release();
          const type = rec.mimeType || mimeType || "audio/webm";
          resolve({ blob: new Blob(chunks, { type }), mimeType: type, durationMs: Date.now() - startedAt });
        };
        rec.stop();
      });
    },
    cancel() {
      try {
        if (rec.state !== "inactive") rec.stop();
      } catch {
        /* already stopped */
      }
      release();
    },
  };
}
