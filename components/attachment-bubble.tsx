"use client";

import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { InlineSpinner } from "@/components/inline-spinner";
import { PhotoIcon } from "@/components/icons";
import { PhotoViewer } from "@/components/photo-viewer";
import type { AttachmentMeta } from "@/lib/fileCrypto";
import { attachmentDisplaySize } from "@/lib/messageContent";
import {
  AttachmentDecryptError,
  getDecryptedImageUrl,
  peekDecryptedImageUrl,
  retryDecryptedImageUrl,
} from "@/lib/attachmentCache";

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; url: string }
  | { kind: "download-failed" }
  | { kind: "decrypt-failed" };

function ReservedBox({
  meta,
  isMine,
  children,
  onRetry,
}: {
  meta: AttachmentMeta;
  isMine: boolean;
  children: ReactNode;
  onRetry?: () => void;
}) {
  const { width, height } = attachmentDisplaySize(meta.w ?? 200, meta.h ?? 200);

  return (
    <div
      className={`relative overflow-hidden ${
        isMine
          ? "bg-[var(--accent)] text-white"
          : "bg-[var(--surface-elevated)] text-[var(--text-secondary)]"
      }`}
      style={{ width, height, minWidth: width, minHeight: height }}
    >
      {children}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="pressable absolute inset-0 flex flex-col items-center justify-center gap-[var(--sp-1)] bg-black/20 px-[var(--sp-2)] text-center"
        >
          <PhotoIcon className="h-6 w-6 shrink-0 opacity-80" />
          <span className="text-[length:var(--text-caption)] font-medium">
            Tap to retry
          </span>
        </button>
      ) : null}
    </div>
  );
}

export const AttachmentBubble = memo(function AttachmentBubble({
  meta,
  isMine,
  localPreviewUrl,
  isPending,
  failed,
}: {
  meta: AttachmentMeta;
  isMine: boolean;
  localPreviewUrl?: string;
  isPending?: boolean;
  failed?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>(() => {
    if (!meta.path) return { kind: "idle" };
    const cached = peekDecryptedImageUrl(meta.path);
    return cached ? { kind: "loaded", url: cached } : { kind: "idle" };
  });
  const [viewerOpen, setViewerOpen] = useState(false);
  const [imageVisible, setImageVisible] = useState(
    () =>
      Boolean(localPreviewUrl) ||
      Boolean(meta.path && peekDecryptedImageUrl(meta.path)),
  );

  const displayUrl = localPreviewUrl ?? (loadState.kind === "loaded" ? loadState.url : null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setNearViewport(true);
        }
      },
      { rootMargin: "600px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const metaPath = meta.path;

  const fetchRemote = useCallback(
    (retry = false) => {
      if (localPreviewUrl || !metaPath) return;

      setLoadState({ kind: "loading" });
      setImageVisible(false);

      const request = retry
        ? retryDecryptedImageUrl(meta)
        : getDecryptedImageUrl(meta);

      void request
        .then((url) => {
          setLoadState({ kind: "loaded", url });
        })
        .catch((err) => {
          if (err instanceof AttachmentDecryptError) {
            setLoadState({ kind: "decrypt-failed" });
          } else {
            setLoadState({ kind: "download-failed" });
          }
        });
    },
    [localPreviewUrl, meta, metaPath],
  );

  useEffect(() => {
    if (!nearViewport || localPreviewUrl || !metaPath) return;
    if (
      loadState.kind === "loaded" ||
      loadState.kind === "decrypt-failed" ||
      loadState.kind === "download-failed" ||
      loadState.kind === "loading"
    ) {
      return;
    }
    fetchRemote(false);
  }, [nearViewport, localPreviewUrl, metaPath, loadState.kind, fetchRemote]);

  const handleRetry = useCallback(() => {
    fetchRemote(true);
  }, [fetchRemote]);

  const handleOpenViewer = useCallback(() => {
    if (displayUrl && !isPending && !failed) {
      setViewerOpen(true);
    }
  }, [displayUrl, isPending, failed]);

  const { width, height } = attachmentDisplaySize(meta.w ?? 200, meta.h ?? 200);

  if (loadState.kind === "decrypt-failed" && !localPreviewUrl) {
    return (
      <div ref={rootRef}>
        <ReservedBox meta={meta} isMine={isMine}>
          <div className="flex h-full w-full flex-col items-center justify-center gap-[var(--sp-2)] px-[var(--sp-2)] text-center">
            <PhotoIcon className="h-6 w-6 shrink-0 opacity-80" />
            <span className="text-[length:var(--text-caption)] font-medium">
              Couldn&apos;t decrypt photo
            </span>
          </div>
        </ReservedBox>
      </div>
    );
  }

  const showSpinner =
    !localPreviewUrl &&
    (loadState.kind === "loading" ||
      loadState.kind === "idle" ||
      (isPending && !displayUrl));

  return (
    <div ref={rootRef}>
      <div
        className="relative overflow-hidden"
        style={{ width, height, minWidth: width, minHeight: height }}
      >
        {displayUrl ? (
          <div
            className={`relative h-full w-full ${isPending ? "opacity-60" : failed ? "opacity-50" : ""}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayUrl}
              alt=""
              width={width}
              height={height}
              onLoad={() => setImageVisible(true)}
              className={`photo-reveal block h-full w-full object-cover ${
                imageVisible || localPreviewUrl ? "is-visible" : ""
              }`}
            />
            {isPending ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                <InlineSpinner
                  className={`h-5 w-5 ${isMine ? "text-white" : "text-[var(--text-primary)]"}`}
                />
              </div>
            ) : null}
            {!isPending && !failed && imageVisible ? (
              <button
                type="button"
                aria-label="View photo fullscreen"
                onClick={handleOpenViewer}
                className="absolute inset-0"
              />
            ) : null}
          </div>
        ) : (
          <ReservedBox
            meta={meta}
            isMine={isMine}
            onRetry={
              loadState.kind === "download-failed" ? handleRetry : undefined
            }
          >
            {showSpinner ? (
              <div className="flex h-full w-full items-center justify-center">
                <InlineSpinner
                  className={`h-5 w-5 ${isMine ? "text-white" : "text-[var(--text-primary)]"}`}
                />
              </div>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-[var(--sp-2)]">
                <PhotoIcon className="h-6 w-6 shrink-0 opacity-80" />
                <span className="text-[length:var(--text-secondary-size)] font-medium">
                  Photo
                </span>
              </div>
            )}
          </ReservedBox>
        )}
      </div>
      {viewerOpen && displayUrl ? (
        <PhotoViewer src={displayUrl} onClose={() => setViewerOpen(false)} />
      ) : null}
    </div>
  );
});
