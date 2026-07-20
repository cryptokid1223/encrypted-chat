export const MIN_RECORD_MS = 1000;
export const MAX_RECORD_MS = 3 * 60 * 1000;
export const RECORD_TIMESLICE_MS = 250;

const MIME_CANDIDATES = [
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
] as const;

/** First MediaRecorder mime supported on this device (iPhone → audio/mp4, desktop → often webm). */
export function pickAudioMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") {
    return null;
  }
  for (const mime of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return null;
}

export function releaseMediaStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}
