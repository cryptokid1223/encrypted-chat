const MAX_EDGE = 2048;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const JPEG_QUALITY = 0.82;
const JPEG_QUALITY_FALLBACK = 0.6;

export class ImageTooLargeError extends Error {
  constructor() {
    super("This image is too large.");
    this.name = "ImageTooLargeError";
  }
}

export type ProcessedImage = {
  bytes: Uint8Array;
  mime: "image/jpeg";
  w: number;
  h: number;
};

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not encode image."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

async function loadViaImage(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number; cleanup: () => void }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not load image."));
      el.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

async function loadImageSource(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number; cleanup: () => void }> {
  if (typeof createImageBitmap !== "undefined") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall through to Image + object URL (older WebViews).
    }
  }
  return loadViaImage(file);
}

export async function processImageForSend(file: File): Promise<ProcessedImage> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageTooLargeError();
  }

  const { source, width, height, cleanup } = await loadImageSource(file);

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not process image.");
    }

    // Canvas drawing bakes in EXIF orientation and strips EXIF metadata (including GPS).
    ctx.drawImage(source, 0, 0, w, h);

    let blob = await canvasToBlob(canvas, JPEG_QUALITY);
    if (blob.size > MAX_OUTPUT_BYTES) {
      blob = await canvasToBlob(canvas, JPEG_QUALITY_FALLBACK);
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { bytes, mime: "image/jpeg", w, h };
  } finally {
    cleanup();
  }
}

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const THUMB_MAX_EDGE = 640;
const THUMB_JPEG_QUALITY = 0.7;
const THUMB_SEEK_SEC = 0.1;
const VIDEO_METADATA_TIMEOUT_MS = 30_000;
const VIDEO_SEEK_TIMEOUT_MS = 10_000;

export class VideoTooLargeError extends Error {
  constructor() {
    super("Videos must be under 50MB.");
    this.name = "VideoTooLargeError";
  }
}

export class VideoUnsupportedError extends Error {
  constructor() {
    super("This video can't be sent.");
    this.name = "VideoUnsupportedError";
  }
}

export type ProcessedVideo = {
  bytes: Uint8Array;
  mime: string;
  w: number;
  h: number;
  durationMs: number;
  thumbBytes: Uint8Array | null;
};

async function captureVideoThumbnail(
  video: HTMLVideoElement,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const seekTo =
    video.duration > THUMB_SEEK_SEC * 2
      ? THUMB_SEEK_SEC
      : Math.max(0, video.duration / 2);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Seek timeout")), VIDEO_SEEK_TIMEOUT_MS);
    video.onseeked = () => {
      clearTimeout(timeout);
      resolve();
    };
    video.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("Seek failed"));
    };
    video.currentTime = seekTo;
  });

  const scale = Math.min(1, THUMB_MAX_EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not capture thumbnail.");
  }

  ctx.drawImage(video, 0, 0, w, h);
  const blob = await canvasToBlob(canvas, THUMB_JPEG_QUALITY);
  return new Uint8Array(await blob.arrayBuffer());
}

export async function processVideoForSend(file: File): Promise<ProcessedVideo> {
  if (file.size > MAX_VIDEO_BYTES) {
    throw new VideoTooLargeError();
  }

  if (!file.type.startsWith("video/")) {
    throw new VideoUnsupportedError();
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    const { w, h, durationMs } = await new Promise<{
      w: number;
      h: number;
      durationMs: number;
    }>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new VideoUnsupportedError()),
        VIDEO_METADATA_TIMEOUT_MS,
      );
      video.onloadedmetadata = () => {
        clearTimeout(timeout);
        if (
          !video.videoWidth ||
          !video.videoHeight ||
          !Number.isFinite(video.duration) ||
          video.duration <= 0
        ) {
          reject(new VideoUnsupportedError());
          return;
        }
        resolve({
          w: video.videoWidth,
          h: video.videoHeight,
          durationMs: Math.round(video.duration * 1000),
        });
      };
      video.onerror = () => {
        clearTimeout(timeout);
        reject(new VideoUnsupportedError());
      };
    });

    let thumbBytes: Uint8Array | null = null;
    try {
      thumbBytes = await captureVideoThumbnail(video, w, h);
    } catch {
      // Some codecs in WKWebView cannot render a frame — send without thumbnail.
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    return {
      bytes,
      mime: file.type || "video/mp4",
      w,
      h,
      durationMs,
      thumbBytes,
    };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
