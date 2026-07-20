"use client";

import { memo, useCallback, useRef, useState } from "react";
import { InlineSpinner } from "@/components/inline-spinner";
import { PauseIcon, PlayIcon } from "@/components/icons";
import { useVoicePlayer } from "@/hooks/useVoicePlayer";
import type { AttachmentMeta } from "@/lib/fileCrypto";
import { formatDurationMs } from "@/lib/messageContent";
import {
  AttachmentDecryptError,
  getDecryptedAudioUrl,
  peekDecryptedAudioUrl,
  retryDecryptedAudioUrl,
} from "@/lib/attachmentCache";
import {
  pauseVoice,
  playVoice,
  seekVoice,
} from "@/lib/voicePlayer";

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "download-failed" }
  | { kind: "decrypt-failed" }
  | { kind: "playback-failed" };

export const VoiceMessageBubble = memo(function VoiceMessageBubble({
  meta,
  isMine,
  isPending,
}: {
  meta: AttachmentMeta;
  isMine: boolean;
  isPending?: boolean;
}) {
  const path = meta.path;
  const player = useVoicePlayer();
  const trackRef = useRef<HTMLDivElement>(null);
  const [fetchState, setFetchState] = useState<FetchState>({ kind: "idle" });
  const [audioUrl, setAudioUrl] = useState<string | null>(() =>
    path ? (peekDecryptedAudioUrl(path) ?? null) : null,
  );

  const isActive = Boolean(path && player.activePath === path);
  const isPlaying = isActive && player.isPlaying;
  const isLoading = fetchState.kind === "loading";

  const durationSec =
    isActive && player.duration > 0
      ? player.duration
      : (meta.durationMs ?? 0) / 1000;

  const progress =
    isActive && durationSec > 0 ? player.currentTime / durationSec : 0;

  const timeLabelMs =
    isPlaying || (isActive && player.currentTime > 0)
      ? Math.max(0, (durationSec - player.currentTime) * 1000)
      : (meta.durationMs ?? 0);

  const ensureUrl = useCallback(async (): Promise<string | null> => {
    if (!path) return null;
    if (audioUrl) return audioUrl;
    const cached = peekDecryptedAudioUrl(path);
    if (cached) {
      setAudioUrl(cached);
      return cached;
    }
    setFetchState({ kind: "loading" });
    try {
      const url = await getDecryptedAudioUrl(meta);
      setAudioUrl(url);
      setFetchState({ kind: "idle" });
      return url;
    } catch (err) {
      if (err instanceof AttachmentDecryptError) {
        setFetchState({ kind: "decrypt-failed" });
      } else {
        setFetchState({ kind: "download-failed" });
      }
      return null;
    }
  }, [audioUrl, meta, path]);

  const handlePlayPause = useCallback(async () => {
    if (isPending || !path || fetchState.kind === "decrypt-failed") return;

    if (isPlaying) {
      pauseVoice();
      return;
    }

    if (fetchState.kind === "playback-failed") {
      setFetchState({ kind: "idle" });
    }

    const url = audioUrl ?? (await ensureUrl());
    if (!url) return;

    try {
      await playVoice(path, url);
      setFetchState({ kind: "idle" });
    } catch {
      setFetchState({ kind: "playback-failed" });
    }
  }, [
    isPending,
    path,
    fetchState.kind,
    isPlaying,
    audioUrl,
    ensureUrl,
  ]);

  const handleRetry = useCallback(() => {
    if (!path) return;
    setFetchState({ kind: "loading" });
    void retryDecryptedAudioUrl(meta)
      .then((url) => {
        setAudioUrl(url);
        setFetchState({ kind: "idle" });
      })
      .catch((err) => {
        setFetchState({
          kind:
            err instanceof AttachmentDecryptError
              ? "decrypt-failed"
              : "download-failed",
        });
      });
  }, [meta, path]);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      if (!path || !isActive) return;
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = (clientX - rect.left) / rect.width;
      seekVoice(ratio);
    },
    [isActive, path],
  );

  if (isPending || !path) {
    return (
      <div
        className={`flex min-w-[200px] items-center gap-[var(--sp-3)] px-3 py-2.5 opacity-60`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            isMine ? "bg-white/20 text-white" : "bg-[var(--accent)] text-white"
          }`}
        >
          <PlayIcon className="h-4 w-4 translate-x-[1px]" />
        </span>
        <div className="h-1.5 min-w-0 flex-1 rounded-full bg-black/10" />
        {meta.durationMs ? (
          <span
            className={`shrink-0 text-[length:var(--text-caption)] tabular-nums ${
              isMine ? "text-white/80" : "text-[var(--text-secondary)]"
            }`}
          >
            {formatDurationMs(meta.durationMs)}
          </span>
        ) : null}
        <InlineSpinner
          className={`h-4 w-4 shrink-0 ${isMine ? "text-white" : "text-[var(--text-primary)]"}`}
        />
      </div>
    );
  }

  if (fetchState.kind === "decrypt-failed") {
    return (
      <div className="min-w-[200px] px-3 py-2.5 text-[length:var(--text-caption)] font-medium">
        <span className={isMine ? "text-white/90" : "text-[var(--text-secondary)]"}>
          Couldn&apos;t decrypt
        </span>
      </div>
    );
  }

  if (fetchState.kind === "playback-failed") {
    return (
      <div className="flex min-w-[200px] items-center gap-[var(--sp-3)] px-3 py-2.5">
        <button
          type="button"
          aria-label="Retry playback"
          onClick={() => void handlePlayPause()}
          className={`pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            isMine ? "bg-white/20 text-white" : "bg-[var(--accent)] text-white"
          }`}
        >
          <PlayIcon className="h-4 w-4 translate-x-[1px]" />
        </button>
        <span
          className={`flex-1 text-[length:var(--text-caption)] ${
            isMine ? "text-white/90" : "text-[var(--text-secondary)]"
          }`}
        >
          Can&apos;t play on this device
        </span>
      </div>
    );
  }

  return (
    <div className="relative flex min-w-[200px] max-w-[260px] items-center gap-[var(--sp-2)] px-3 py-2.5">
      <button
        type="button"
        aria-label={isPlaying ? "Pause voice message" : "Play voice message"}
        disabled={isLoading}
        onClick={() => void handlePlayPause()}
        className={`pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:opacity-60 ${
          isMine
            ? "bg-white text-[var(--accent)]"
            : "bg-[var(--accent)] text-white"
        }`}
      >
        {isLoading ? (
          <InlineSpinner className="h-4 w-4" />
        ) : isPlaying ? (
          <PauseIcon className="h-4 w-4" />
        ) : (
          <PlayIcon className="h-4 w-4 translate-x-[1px]" />
        )}
      </button>

      <div
        ref={trackRef}
        role="slider"
        aria-label="Playback progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        tabIndex={0}
        className={`relative h-1.5 min-w-0 flex-1 cursor-pointer rounded-full ${
          isMine ? "bg-white/25" : "bg-[var(--divider)]"
        }`}
        onPointerDown={(e) => {
          if (!isActive && !audioUrl) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          void (async () => {
            const url = audioUrl ?? (await ensureUrl());
            if (!url || !path) return;
            if (!isActive) {
              try {
                await playVoice(path, url);
              } catch {
                setFetchState({ kind: "playback-failed" });
                return;
              }
            }
            seekFromClientX(e.clientX);
          })();
        }}
        onPointerMove={(e) => {
          if (e.buttons !== 1 || !isActive) return;
          seekFromClientX(e.clientX);
        }}
      >
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${
            isMine ? "bg-white" : "bg-[var(--accent)]"
          }`}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      <span
        className={`w-10 shrink-0 text-right text-[length:var(--text-caption)] tabular-nums ${
          isMine ? "text-white/90" : "text-[var(--text-secondary)]"
        }`}
      >
        {formatDurationMs(timeLabelMs)}
      </span>

      {fetchState.kind === "download-failed" ? (
        <button
          type="button"
          onClick={handleRetry}
          className="pressable absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/30 text-[length:var(--text-caption)] font-medium text-white"
        >
          Tap to retry
        </button>
      ) : null}
    </div>
  );
});
