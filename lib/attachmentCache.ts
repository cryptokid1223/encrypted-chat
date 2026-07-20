import { decryptFile, type AttachmentMeta } from "@/lib/fileCrypto";
import { stopVoicePlayback } from "@/lib/voicePlayer";
import { createClient } from "@/lib/supabase/client";

const IMAGE_MAX_ENTRIES = 40;
const VIDEO_MAX_ENTRIES = 5;

export class AttachmentDownloadError extends Error {
  constructor(message = "Could not download attachment") {
    super(message);
    this.name = "AttachmentDownloadError";
  }
}

export class AttachmentDecryptError extends Error {
  constructor(message = "Couldn't decrypt attachment") {
    super(message);
    this.name = "AttachmentDecryptError";
  }
}

export type AttachmentBlobRef = {
  path: string;
  key: string;
  nonce: string;
  mime: string;
};

type CacheEntry =
  | { status: "pending"; promise: Promise<string> }
  | { status: "resolved"; url: string }
  | { status: "failed"; kind: "download" | "decrypt" };

type CacheKind = "image" | "video";

const imageCache = new Map<string, CacheEntry>();
const imageLru: string[] = [];
const videoCache = new Map<string, CacheEntry>();
const videoLru: string[] = [];

function cacheFor(kind: CacheKind): {
  cache: Map<string, CacheEntry>;
  lru: string[];
  max: number;
} {
  if (kind === "video") {
    return { cache: videoCache, lru: videoLru, max: VIDEO_MAX_ENTRIES };
  }
  return { cache: imageCache, lru: imageLru, max: IMAGE_MAX_ENTRIES };
}

function touch(kind: CacheKind, path: string): void {
  const { lru } = cacheFor(kind);
  const idx = lru.indexOf(path);
  if (idx >= 0) {
    lru.splice(idx, 1);
  }
  lru.push(path);
}

function removeFromLru(kind: CacheKind, path: string): void {
  const { lru } = cacheFor(kind);
  const idx = lru.indexOf(path);
  if (idx >= 0) {
    lru.splice(idx, 1);
  }
}

function evictIfNeeded(kind: CacheKind): void {
  const { cache, lru, max } = cacheFor(kind);
  while (lru.length > max) {
    const oldest = lru.shift();
    if (!oldest) break;
    const entry = cache.get(oldest);
    if (entry?.status === "resolved") {
      URL.revokeObjectURL(entry.url);
    }
    cache.delete(oldest);
  }
}

async function fetchAndDecrypt(ref: AttachmentBlobRef): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from("attachments")
    .download(ref.path);

  if (error || !data) {
    throw new AttachmentDownloadError(
      error?.message ?? "Could not download attachment",
    );
  }

  const ciphertext = new Uint8Array(await data.arrayBuffer());

  let plainBytes: Uint8Array;
  try {
    plainBytes = await decryptFile(ciphertext, ref.key, ref.nonce);
  } catch {
    throw new AttachmentDecryptError();
  }

  const blob = new Blob([plainBytes.slice()], { type: ref.mime });
  return URL.createObjectURL(blob);
}

function beginFetch(
  ref: AttachmentBlobRef,
  kind: CacheKind,
): Promise<string> {
  const { cache } = cacheFor(kind);
  const path = ref.path;
  const promise = fetchAndDecrypt(ref).then(
    (url) => {
      cache.set(path, { status: "resolved", url });
      touch(kind, path);
      evictIfNeeded(kind);
      return url;
    },
    (err) => {
      const failedKind =
        err instanceof AttachmentDecryptError ? "decrypt" : "download";
      cache.set(path, { status: "failed", kind: failedKind });
      throw err;
    },
  );

  cache.set(path, { status: "pending", promise });
  touch(kind, path);
  return promise;
}

function peekUrl(kind: CacheKind, path: string): string | undefined {
  const entry = cacheFor(kind).cache.get(path);
  return entry?.status === "resolved" ? entry.url : undefined;
}

function getDecryptedBlobUrl(
  ref: AttachmentBlobRef,
  kind: CacheKind,
): Promise<string> {
  const path = ref.path;
  if (!path) {
    throw new AttachmentDownloadError("Missing attachment path");
  }

  const { cache } = cacheFor(kind);
  const existing = cache.get(path);
  if (existing?.status === "resolved") {
    touch(kind, path);
    return Promise.resolve(existing.url);
  }
  if (existing?.status === "pending") {
    return existing.promise;
  }
  if (existing?.status === "failed") {
    if (existing.kind === "decrypt") {
      return Promise.reject(new AttachmentDecryptError());
    }
    return Promise.reject(new AttachmentDownloadError());
  }

  return beginFetch(ref, kind);
}

function retryDecryptedBlobUrl(
  ref: AttachmentBlobRef,
  kind: CacheKind,
): Promise<string> {
  const path = ref.path;
  const existing = cacheFor(kind).cache.get(path);
  if (existing?.status === "failed" && existing.kind === "decrypt") {
    return Promise.reject(new AttachmentDecryptError());
  }
  cacheFor(kind).cache.delete(path);
  removeFromLru(kind, path);
  return getDecryptedBlobUrl(ref, kind);
}

function metaToRef(meta: AttachmentMeta): AttachmentBlobRef {
  return {
    path: meta.path,
    key: meta.key,
    nonce: meta.nonce,
    mime: meta.mime,
  };
}

/** Returns a cached image/thumbnail blob URL synchronously, if available. */
export function peekDecryptedImageUrl(path: string): string | undefined {
  return peekUrl("image", path);
}

/** Returns a cached video blob URL synchronously, if available. */
export function peekDecryptedVideoUrl(path: string): string | undefined {
  return peekUrl("video", path);
}

/**
 * Returns a blob object URL for a decrypted image attachment or thumbnail.
 * Concurrent requests for the same path share one in-flight promise.
 */
export async function getDecryptedImageUrl(
  meta: AttachmentMeta,
): Promise<string> {
  return getDecryptedBlobUrl(metaToRef(meta), "image");
}

/** Returns a blob object URL for a decrypted video attachment. */
export async function getDecryptedVideoUrl(
  meta: AttachmentMeta,
): Promise<string> {
  return getDecryptedBlobUrl(metaToRef(meta), "video");
}

/** Returns a blob object URL for a decrypted audio attachment (image LRU cache). */
export async function getDecryptedAudioUrl(
  meta: AttachmentMeta,
): Promise<string> {
  return getDecryptedBlobUrl(metaToRef(meta), "image");
}

/** Returns a cached audio blob URL synchronously, if available. */
export function peekDecryptedAudioUrl(path: string): string | undefined {
  return peekUrl("image", path);
}

/** Returns a blob object URL for an encrypted video thumbnail, if present. */
export async function getDecryptedThumbUrl(
  meta: AttachmentMeta,
): Promise<string | null> {
  if (!meta.thumb) return null;
  return getDecryptedBlobUrl(
    {
      path: meta.thumb.path,
      key: meta.thumb.key,
      nonce: meta.thumb.nonce,
      mime: "image/jpeg",
    },
    "image",
  );
}

/** Clears a failed image/thumbnail entry and retries fetch + decrypt. */
export function retryDecryptedImageUrl(
  meta: AttachmentMeta,
): Promise<string> {
  return retryDecryptedBlobUrl(metaToRef(meta), "image");
}

/** Clears a failed video entry and retries fetch + decrypt. */
export function retryDecryptedVideoUrl(
  meta: AttachmentMeta,
): Promise<string> {
  return retryDecryptedBlobUrl(metaToRef(meta), "video");
}

/** Clears a failed audio entry and retries fetch + decrypt. */
export function retryDecryptedAudioUrl(
  meta: AttachmentMeta,
): Promise<string> {
  return retryDecryptedBlobUrl(metaToRef(meta), "image");
}

/** Revoke all cached blob URLs — call on logout. */
export function revokeAllAttachmentUrls(): void {
  stopVoicePlayback();
  for (const entry of imageCache.values()) {
    if (entry.status === "resolved") {
      URL.revokeObjectURL(entry.url);
    }
  }
  for (const entry of videoCache.values()) {
    if (entry.status === "resolved") {
      URL.revokeObjectURL(entry.url);
    }
  }
  imageCache.clear();
  videoCache.clear();
  imageLru.length = 0;
  videoLru.length = 0;
}
