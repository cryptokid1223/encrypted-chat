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
