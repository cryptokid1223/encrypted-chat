import { decryptFile, type AttachmentMeta } from "@/lib/fileCrypto";
import { createClient } from "@/lib/supabase/client";

const MAX_ENTRIES = 40;

export class AttachmentDownloadError extends Error {
  constructor(message = "Could not download photo") {
    super(message);
    this.name = "AttachmentDownloadError";
  }
}

export class AttachmentDecryptError extends Error {
  constructor(message = "Couldn't decrypt photo") {
    super(message);
    this.name = "AttachmentDecryptError";
  }
}

type CacheEntry =
  | { status: "pending"; promise: Promise<string> }
  | { status: "resolved"; url: string }
  | { status: "failed"; kind: "download" | "decrypt" };

const cache = new Map<string, CacheEntry>();
const lruOrder: string[] = [];

function touch(path: string): void {
  const idx = lruOrder.indexOf(path);
  if (idx >= 0) {
    lruOrder.splice(idx, 1);
  }
  lruOrder.push(path);
}

function removeFromLru(path: string): void {
  const idx = lruOrder.indexOf(path);
  if (idx >= 0) {
    lruOrder.splice(idx, 1);
  }
}

function evictIfNeeded(): void {
  while (lruOrder.length > MAX_ENTRIES) {
    const oldest = lruOrder.shift();
    if (!oldest) break;
    const entry = cache.get(oldest);
    if (entry?.status === "resolved") {
      URL.revokeObjectURL(entry.url);
    }
    cache.delete(oldest);
  }
}

async function fetchAndDecrypt(meta: AttachmentMeta): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from("attachments")
    .download(meta.path);

  if (error || !data) {
    throw new AttachmentDownloadError(error?.message ?? "Could not download photo");
  }

  const ciphertext = new Uint8Array(await data.arrayBuffer());

  let plainBytes: Uint8Array;
  try {
    plainBytes = await decryptFile(ciphertext, meta.key, meta.nonce);
  } catch {
    throw new AttachmentDecryptError();
  }

  const blob = new Blob([plainBytes.slice()], { type: meta.mime });
  return URL.createObjectURL(blob);
}

function beginFetch(meta: AttachmentMeta): Promise<string> {
  const path = meta.path;
  const promise = fetchAndDecrypt(meta).then(
    (url) => {
      cache.set(path, { status: "resolved", url });
      touch(path);
      evictIfNeeded();
      return url;
    },
    (err) => {
      const kind =
        err instanceof AttachmentDecryptError ? "decrypt" : "download";
      cache.set(path, { status: "failed", kind });
      throw err;
    },
  );

  cache.set(path, { status: "pending", promise });
  touch(path);
  return promise;
}

/** Returns a cached blob URL synchronously, if available. */
export function peekDecryptedImageUrl(path: string): string | undefined {
  const entry = cache.get(path);
  return entry?.status === "resolved" ? entry.url : undefined;
}

/**
 * Returns a blob object URL for the decrypted attachment image.
 * Concurrent requests for the same path share one in-flight promise.
 */
export async function getDecryptedImageUrl(
  meta: AttachmentMeta,
): Promise<string> {
  const path = meta.path;
  if (!path) {
    throw new AttachmentDownloadError("Missing attachment path");
  }

  const existing = cache.get(path);
  if (existing?.status === "resolved") {
    touch(path);
    return existing.url;
  }
  if (existing?.status === "pending") {
    return existing.promise;
  }
  if (existing?.status === "failed") {
    if (existing.kind === "decrypt") {
      throw new AttachmentDecryptError();
    }
    throw new AttachmentDownloadError();
  }

  return beginFetch(meta);
}

/** Clears a failed download entry and retries fetch + decrypt. */
export function retryDecryptedImageUrl(meta: AttachmentMeta): Promise<string> {
  const path = meta.path;
  const existing = cache.get(path);
  if (existing?.status === "failed" && existing.kind === "decrypt") {
    throw new AttachmentDecryptError();
  }
  cache.delete(path);
  removeFromLru(path);
  return getDecryptedImageUrl(meta);
}

/** Revoke all cached blob URLs — call on logout. */
export function revokeAllAttachmentUrls(): void {
  for (const entry of cache.values()) {
    if (entry.status === "resolved") {
      URL.revokeObjectURL(entry.url);
    }
  }
  cache.clear();
  lruOrder.length = 0;
}
