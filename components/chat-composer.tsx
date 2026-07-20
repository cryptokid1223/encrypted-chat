"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  getAiAssistConsented,
  getAiAssistEnabled,
  setAiAssistConsented,
} from "@/components/ai-assist-prefs";
import { ArrowUpIcon, CloseIcon, PlusIcon, MicIcon, SparkleIcon } from "@/components/icons";
import { RewriteToneSheet } from "@/components/rewrite-tone-sheet";
import { SettingsConfirmDialog } from "@/components/settings-ui";
import { formatDurationMs } from "@/lib/messageContent";
import {
  MAX_RECORD_MS,
  MIN_RECORD_MS,
  pickAudioMimeType,
  RECORD_TIMESLICE_MS,
  releaseMediaStream,
} from "@/lib/voiceRecording";

export type VoiceRecordingPayload = {
  bytes: Uint8Array;
  mime: string;
  durationMs: number;
};

const UNDO_MS = 8000;

export function ChatComposer({
  onSend,
  onFileSelected,
  onPhotoSelected,
  onVoiceSend,
  disabled,
  attachDisabled,
  attachError,
}: {
  onSend: (text: string) => void;
  onFileSelected?: (file: File) => void;
  /** @deprecated Use onFileSelected */
  onPhotoSelected?: (file: File) => void;
  onVoiceSend?: (payload: VoiceRecordingPayload) => void;
  disabled?: boolean;
  attachDisabled?: boolean;
  attachError?: string | null;
}) {
  const handleFile = onFileSelected ?? onPhotoSelected;
  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [showMaxLabel, setShowMaxLabel] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const [assistEnabled, setAssistEnabled] = useState(true);
  const [consentOpen, setConsentOpen] = useState(false);
  const [toneSheetOpen, setToneSheetOpen] = useState(false);
  const [undoOriginal, setUndoOriginal] = useState<string | null>(null);

  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>("audio/mp4");
  const startTimeRef = useRef(0);
  const maxTriggeredRef = useRef(false);
  const finishingRef = useRef(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    setAssistEnabled(getAiAssistEnabled());

    function onStorage(e: StorageEvent) {
      if (e.key === "ai_assist_enabled") {
        setAssistEnabled(getAiAssistEnabled());
      }
    }
    function onAssistPref() {
      setAssistEnabled(getAiAssistEnabled());
    }

    window.addEventListener("storage", onStorage);
    window.addEventListener("ai-assist-pref-changed", onAssistPref);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("ai-assist-pref-changed", onAssistPref);
    };
  }, []);

  const clearUndo = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndoOriginal(null);
  }, []);

  const showUndo = useCallback(
    (original: string) => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setUndoOriginal(original);
      undoTimerRef.current = setTimeout(() => {
        setUndoOriginal(null);
        undoTimerRef.current = null;
      }, UNDO_MS);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const canSend = useMemo(() => draft.trim().length > 0, [draft]);
  const inlineError = attachError ?? permissionError;
  const showAssistButton =
    assistEnabled &&
    draft.length >= 1 &&
    !recording &&
    !attachDisabled;

  const finishRecording = useCallback(
    async (send: boolean) => {
      if (finishingRef.current) return;
      finishingRef.current = true;

      const recorder = recorderRef.current;
      const stream = streamRef.current;
      const mime = mimeRef.current;

      if (recorder && recorder.state !== "inactive") {
        await new Promise<void>((resolve) => {
          recorder.addEventListener("stop", () => resolve(), { once: true });
          recorder.stop();
        });
      }

      releaseMediaStream(stream);
      streamRef.current = null;
      recorderRef.current = null;
      setRecording(false);
      setShowMaxLabel(false);

      const durationMs = Math.max(0, Date.now() - startTimeRef.current);
      const chunks = chunksRef.current;
      chunksRef.current = [];
      finishingRef.current = false;
      maxTriggeredRef.current = false;

      if (!send) {
        return;
      }

      if (durationMs < MIN_RECORD_MS) {
        return;
      }

      const blob = new Blob(chunks, { type: mime });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      onVoiceSend?.({ bytes, mime, durationMs });
    },
    [onVoiceSend],
  );

  const startRecording = useCallback(async () => {
    if (disabled || attachDisabled || recording) return;

    setPermissionError(null);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPermissionError("Recording isn't supported on this device.");
      return;
    }

    const mime = pickAudioMimeType();
    if (!mime) {
      setPermissionError("Recording isn't supported on this device.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mimeRef.current = mime;

      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorderRef.current = recorder;
      recorder.start(RECORD_TIMESLICE_MS);

      startTimeRef.current = Date.now();
      setElapsedMs(0);
      setRecording(true);
    } catch {
      releaseMediaStream(streamRef.current);
      streamRef.current = null;
      setPermissionError("Microphone access is needed to record voice messages.");
    }
  }, [disabled, attachDisabled, recording]);

  useEffect(() => {
    if (!recording) return;

    const tick = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setElapsedMs(elapsed);

      if (elapsed >= MAX_RECORD_MS && !maxTriggeredRef.current) {
        maxTriggeredRef.current = true;
        setShowMaxLabel(true);
        clearInterval(tick);
        window.setTimeout(() => {
          void finishRecording(true);
        }, 700);
      }
    }, 100);

    return () => clearInterval(tick);
  }, [recording, finishRecording]);

  useEffect(() => {
    return () => {
      releaseMediaStream(streamRef.current);
      streamRef.current = null;
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          // Ignore on unmount.
        }
      }
      recorderRef.current = null;
    };
  }, []);

  function focusInputEnd() {
    const el = textInputRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }

  function handleAssistTap() {
    if (!getAiAssistConsented()) {
      setConsentOpen(true);
      return;
    }
    setToneSheetOpen(true);
  }

  function handleConsentContinue() {
    setAiAssistConsented(true);
    setConsentOpen(false);
    setToneSheetOpen(true);
  }

  function handleRewritten(rewritten: string, originalSent: string) {
    if (draftRef.current !== originalSent) {
      setToneSheetOpen(false);
      return;
    }
    setDraft(rewritten);
    setToneSheetOpen(false);
    showUndo(originalSent);
    requestAnimationFrame(() => focusInputEnd());
  }

  function handleUndo() {
    if (undoOriginal === null) return;
    setDraft(undoOriginal);
    clearUndo();
    requestAnimationFrame(() => focusInputEnd());
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (disabled) return;
        const text = draft.trim();
        if (!text) return;
        clearUndo();
        setDraft("");
        onSend(text);
      }}
      className="composer-bar shrink-0 border-t border-[var(--divider)] bg-[var(--bg)]"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col px-[var(--sp-3)] py-[var(--sp-2)]">
        {inlineError ? (
          <p
            className="mb-[var(--sp-1)] text-[length:var(--text-caption)] text-[var(--destructive)]"
            role="alert"
          >
            {inlineError}
          </p>
        ) : null}
        {undoOriginal !== null && !recording ? (
          <div className="mb-[var(--sp-1)] flex justify-center">
            <button
              type="button"
              onClick={handleUndo}
              className="pressable flex min-h-11 items-center rounded-full bg-[var(--surface-elevated)] px-[var(--sp-4)] text-[length:var(--text-caption)] font-medium text-[var(--text-primary)]"
            >
              Undo rewrite
            </button>
          </div>
        ) : null}
        {recording ? (
          <div className="flex items-center gap-[var(--sp-2)]">
            <button
              type="button"
              aria-label="Cancel recording"
              onClick={() => void finishRecording(false)}
              className="pressable flex h-11 w-11 shrink-0 items-center justify-center text-[var(--text-secondary)]"
            >
              <CloseIcon className="h-6 w-6" />
            </button>
            <div className="flex min-h-10 flex-1 items-center justify-center gap-[var(--sp-2)] rounded-[var(--radius-input)] border border-[var(--divider)] bg-[var(--surface)] px-[var(--sp-3)] py-[var(--sp-2)]">
              <span
                className="record-pulse h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--destructive)]"
                aria-hidden
              />
              <span className="text-[length:var(--text-body)] font-medium tabular-nums text-[var(--text-primary)]">
                {showMaxLabel
                  ? "3:00 max"
                  : formatDurationMs(elapsedMs)}
              </span>
            </div>
            <button
              type="button"
              aria-label="Send voice message"
              onClick={() => void finishRecording(true)}
              className="pressable flex h-11 w-11 shrink-0 items-center justify-center"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                <ArrowUpIcon className="h-[18px] w-[18px]" />
              </span>
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-[var(--sp-2)]">
            <input
              ref={fileInputRef}
              id={inputId}
              type="file"
              accept="image/*,video/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file && handleFile) {
                  handleFile(file);
                }
              }}
            />
            <button
              type="button"
              disabled={attachDisabled}
              aria-label="Attach photo or video"
              onClick={() => fileInputRef.current?.click()}
              className="pressable flex h-11 w-11 shrink-0 items-center justify-center text-[var(--text-secondary)] disabled:opacity-40"
            >
              <PlusIcon className="h-9 w-9" strokeWidth={1.75} />
            </button>
            {showAssistButton ? (
              <button
                type="button"
                aria-label="Message assistant"
                onClick={handleAssistTap}
                className="pressable flex h-11 w-11 shrink-0 items-center justify-center text-[var(--text-secondary)]"
              >
                <SparkleIcon className="h-5 w-5" />
              </button>
            ) : null}
            <input
              ref={textInputRef}
              value={draft}
              onChange={(e) => {
                clearUndo();
                setDraft(e.target.value);
              }}
              placeholder="Message"
              autoComplete="off"
              className="min-h-10 flex-1 rounded-[var(--radius-input)] border border-[var(--divider)] bg-[var(--surface)] px-[var(--sp-4)] py-[var(--sp-2)] text-[length:var(--text-body)] leading-[1.35] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none"
            />
            {canSend ? (
              <button
                type="submit"
                disabled={disabled}
                aria-label="Send"
                className="pressable flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-40"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                  <ArrowUpIcon className="h-[18px] w-[18px]" />
                </span>
              </button>
            ) : (
              <button
                type="button"
                disabled={disabled || attachDisabled || !onVoiceSend}
                aria-label="Record voice message"
                onClick={() => void startRecording()}
                className="pressable flex h-11 w-11 shrink-0 items-center justify-center text-[var(--text-secondary)] disabled:opacity-40"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                  <MicIcon className="h-[18px] w-[18px]" />
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {consentOpen ? (
        <SettingsConfirmDialog
          title="Use Message assistant?"
          description="This sends the draft you're editing to OpenAI to rewrite it. Your sent messages stay end-to-end encrypted — only drafts you choose to adjust are shared."
          confirmLabel="Continue"
          cancelLabel="Not now"
          onConfirm={handleConsentContinue}
          onCancel={() => setConsentOpen(false)}
        />
      ) : null}

      {toneSheetOpen ? (
        <RewriteToneSheet
          draft={draft}
          onRewritten={handleRewritten}
          onClose={() => setToneSheetOpen(false)}
        />
      ) : null}
    </form>
  );
}
