"use client";

import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { InlineSpinner } from "@/components/inline-spinner";
import { PhotoIcon, PlayIcon, VideoIcon } from "@/components/icons";
import { PhotoViewer } from "@/components/photo-viewer";
import { VoiceMessageBubble } from "@/components/voice-message-bubble";
import type { AttachmentMeta } from "@/lib/fileCrypto";
import { attachmentDisplaySize, formatDurationMs } from "@/lib/messageContent";
import {
  AttachmentDecryptError,
  getDecryptedImageUrl,
  getDecryptedThumbUrl,
  getDecryptedVideoUrl,
  peekDecryptedImageUrl,
  retryDecryptedImageUrl,
  retryDecryptedVideoUrl,
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
          ? "bg-[var(--bubble-out)] text-white"
          : "bg-[var(--surface)] text-[var(--text-secondary)]"
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

function DurationBadge({ durationMs }: { durationMs?: number }) {
  if (!durationMs) return null;
  return (
    <span className="absolute bottom-[var(--sp-1)] right-[var(--sp-1)] rounded-[6px] bg-black/60 px-[6px] py-[2px] text-[length:var(--text-caption)] font-medium text-white">
      {formatDurationMs(durationMs)}
    </span>
  );
}

function PlayOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white">
        <PlayIcon className="h-5 w-5 translate-x-[1px]" />
      </span>
    </div>
  );
}

const ImageAttachmentContent = memo(function ImageAttachmentContent({
  meta,
  isMine,
  localPreviewUrl,
  isPending,
  failed,
  cacheScope,
}: {
  meta: AttachmentMeta;
  isMine: boolean;
  localPreviewUrl?: string;
  isPending?: boolean;
  failed?: boolean;
  cacheScope?: string;
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

  const displayUrl =
    localPreviewUrl ?? (loadState.kind === "loaded" ? loadState.url : null);
  const metaPath = meta.path;

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setNearViewport(true);
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fetchRemote = useCallback(
    (retry = false) => {
      if (localPreviewUrl || !metaPath) return;
      setLoadState({ kind: "loading" });
      setImageVisible(false);
      const request = retry
        ? retryDecryptedImageUrl(meta, cacheScope)
        : getDecryptedImageUrl(meta, cacheScope);
      void request
        .then((url) => setLoadState({ kind: "loaded", url }))
        .catch((err) => {
          setLoadState({
            kind:
              err instanceof AttachmentDecryptError
                ? "decrypt-failed"
                : "download-failed",
          });
        });
    },
    [localPreviewUrl, meta, metaPath, cacheScope],
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

  const handleRetry = useCallback(() => fetchRemote(true), [fetchRemote]);
  const handleOpenViewer = useCallback(() => {
    if (displayUrl && !isPending && !failed) setViewerOpen(true);
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
        <PhotoViewer kind="image" src={displayUrl} onClose={() => setViewerOpen(false)} />
      ) : null}
    </div>
  );
});

const VideoAttachmentContent = memo(function VideoAttachmentContent({
  meta,
  isMine,
  localPreviewUrl,
  isPending,
  failed,
  cacheScope,
}: {
  meta: AttachmentMeta;
  isMine: boolean;
  localPreviewUrl?: string;
  isPending?: boolean;
  failed?: boolean;
  cacheScope?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const thumbPath = meta.thumb?.path ?? null;
  const [thumbState, setThumbState] = useState<LoadState>(() => {
    if (localPreviewUrl) return { kind: "loaded", url: localPreviewUrl };
    if (!thumbPath) return { kind: "idle" };
    const cached = peekDecryptedImageUrl(thumbPath);
    return cached ? { kind: "loaded", url: cached } : { kind: "idle" };
  });
  const [videoState, setVideoState] = useState<
    "idle" | "loading" | "download-failed" | "decrypt-failed"
  >("idle");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [thumbVisible, setThumbVisible] = useState(
    () =>
      Boolean(localPreviewUrl) ||
      Boolean(thumbPath && peekDecryptedImageUrl(thumbPath)),
  );

  const thumbUrl =
    localPreviewUrl ?? (thumbState.kind === "loaded" ? thumbState.url : null);
  const { width, height } = attachmentDisplaySize(meta.w ?? 200, meta.h ?? 200);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setNearViewport(true);
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fetchThumb = useCallback(
    (retry = false) => {
      if (localPreviewUrl || !meta.thumb) return;
      setThumbState({ kind: "loading" });
      setThumbVisible(false);
      const request = retry
        ? getDecryptedThumbUrl(meta, cacheScope).then((url) => {
            if (!url) throw new Error("No thumbnail");
            return url;
          })
        : getDecryptedThumbUrl(meta, cacheScope).then((url) => {
            if (!url) throw new Error("No thumbnail");
            return url;
          });
      void request
        .then((url) => setThumbState({ kind: "loaded", url }))
        .catch(() => setThumbState({ kind: "download-failed" }));
    },
    [localPreviewUrl, meta, cacheScope],
  );

  useEffect(() => {
    if (!nearViewport || localPreviewUrl || !meta.thumb) return;
    if (
      thumbState.kind === "loaded" ||
      thumbState.kind === "download-failed" ||
      thumbState.kind === "loading"
    ) {
      return;
    }
    fetchThumb(false);
  }, [nearViewport, localPreviewUrl, meta.thumb, thumbState.kind, fetchThumb]);

  const handlePlay = useCallback(() => {
    if (isPending || failed || videoState === "loading") return;

    setVideoState("loading");
    void getDecryptedVideoUrl(meta, cacheScope)
      .then((url) => {
        setVideoUrl(url);
        setViewerOpen(true);
        setVideoState("idle");
      })
      .catch((err) => {
        setVideoState(
          err instanceof AttachmentDecryptError
            ? "decrypt-failed"
            : "download-failed",
        );
      });
  }, [meta, isPending, failed, videoState]);

  const handleRetryVideo = useCallback(() => {
    setVideoState("loading");
    void retryDecryptedVideoUrl(meta, cacheScope)
      .then((url) => {
        setVideoUrl(url);
        setViewerOpen(true);
        setVideoState("idle");
      })
      .catch((err) => {
        setVideoState(
          err instanceof AttachmentDecryptError
            ? "decrypt-failed"
            : "download-failed",
        );
      });
  }, [meta]);

  if (videoState === "decrypt-failed") {
    return (
      <div ref={rootRef}>
        <div
          className={`relative overflow-hidden ${
            isMine ? "bg-[var(--bubble-out)]" : "bg-[var(--surface)]"
          }`}
          style={{ width, height, minWidth: width, minHeight: height }}
        >
          <div className="flex h-full w-full flex-col items-center justify-center gap-[var(--sp-2)] px-[var(--sp-2)] text-center text-[var(--text-secondary)]">
            <VideoIcon className="h-6 w-6 shrink-0 opacity-80" />
            <span className="text-[length:var(--text-caption)] font-medium">
              Couldn&apos;t decrypt video
            </span>
          </div>
        </div>
      </div>
    );
  }

  const showThumbSpinner =
    !localPreviewUrl &&
    meta.thumb &&
    (thumbState.kind === "loading" || thumbState.kind === "idle");

  return (
    <div ref={rootRef}>
      <div
        className="relative overflow-hidden"
        style={{ width, height, minWidth: width, minHeight: height }}
      >
        {thumbUrl ? (
          <div
            className={`relative h-full w-full bg-black ${isPending ? "opacity-60" : failed ? "opacity-50" : ""}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbUrl}
              alt=""
              width={width}
              height={height}
              onLoad={() => setThumbVisible(true)}
              className={`photo-reveal block h-full w-full object-cover ${
                thumbVisible ? "is-visible" : ""
              }`}
            />
            <PlayOverlay />
            <DurationBadge durationMs={meta.durationMs} />
            {isPending || videoState === "loading" ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <InlineSpinner className="h-5 w-5 text-white" />
              </div>
            ) : null}
            {!isPending && !failed ? (
              <button
                type="button"
                aria-label="Play video"
                onClick={handlePlay}
                className="absolute inset-0"
              />
            ) : null}
          </div>
        ) : (
          <div
            className={`relative flex h-full w-full flex-col items-center justify-center gap-[var(--sp-2)] bg-[#1A1816] ${
              isMine ? "text-white" : "text-[var(--text-secondary)]"
            } ${isPending ? "opacity-60" : failed ? "opacity-50" : ""}`}
            style={{ width, height, minWidth: width, minHeight: height }}
          >
            <VideoIcon className="h-7 w-7 shrink-0 opacity-80" />
            <PlayOverlay />
            <DurationBadge durationMs={meta.durationMs} />
            {showThumbSpinner || isPending || videoState === "loading" ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <InlineSpinner
                  className={`h-5 w-5 ${isMine ? "text-white" : "text-[var(--text-primary)]"}`}
                />
              </div>
            ) : null}
            {!isPending && !failed ? (
              <button
                type="button"
                aria-label="Play video"
                onClick={handlePlay}
                className="absolute inset-0"
              />
            ) : null}
          </div>
        )}
        {videoState === "download-failed" ? (
          <button
            type="button"
            onClick={handleRetryVideo}
            className="pressable absolute inset-0 flex flex-col items-center justify-center gap-[var(--sp-1)] bg-black/40 px-[var(--sp-2)] text-center"
          >
            <VideoIcon className="h-6 w-6 shrink-0 text-white opacity-90" />
            <span className="text-[length:var(--text-caption)] font-medium text-white">
              Tap to retry
            </span>
          </button>
        ) : null}
      </div>
      {viewerOpen && videoUrl ? (
        <PhotoViewer
          kind="video"
          src={videoUrl}
          onClose={() => {
            setViewerOpen(false);
          }}
        />
      ) : null}
    </div>
  );
});

export const AttachmentBubble = memo(function AttachmentBubble({
  meta,
  isMine,
  localPreviewUrl,
  isPending,
  failed,
  cacheScope,
}: {
  meta: AttachmentMeta;
  isMine: boolean;
  localPreviewUrl?: string;
  isPending?: boolean;
  failed?: boolean;
  cacheScope?: string;
}) {
  if (meta.kind === "audio") {
    return (
      <VoiceMessageBubble meta={meta} isMine={isMine} isPending={isPending} />
    );
  }

  if (meta.kind === "video") {
    return (
      <VideoAttachmentContent
        meta={meta}
        isMine={isMine}
        localPreviewUrl={localPreviewUrl}
        isPending={isPending}
        failed={failed}
        cacheScope={cacheScope}
      />
    );
  }

  return (
    <ImageAttachmentContent
      meta={meta}
      isMine={isMine}
      localPreviewUrl={localPreviewUrl}
      isPending={isPending}
      failed={failed}
      cacheScope={cacheScope}
    />
  );
});
