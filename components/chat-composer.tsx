"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ArrowUpIcon, PlusIcon } from "@/components/icons";

export function ChatComposer({
  onSend,
  onFileSelected,
  onPhotoSelected,
  disabled,
  attachDisabled,
  attachError,
}: {
  onSend: (text: string) => void;
  onFileSelected?: (file: File) => void;
  /** @deprecated Use onFileSelected */
  onPhotoSelected?: (file: File) => void;
  disabled?: boolean;
  attachDisabled?: boolean;
  attachError?: string | null;
}) {
  const handleFile = onFileSelected ?? onPhotoSelected;
  const [draft, setDraft] = useState("");
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSend = useMemo(() => draft.trim().length > 0, [draft]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (disabled) return;
        const text = draft.trim();
        if (!text) return;
        setDraft("");
        onSend(text);
      }}
      className="composer-bar shrink-0 border-t border-[var(--divider)] bg-[var(--bg)]"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col px-[var(--sp-3)] py-[var(--sp-2)]">
        {attachError ? (
          <p
            className="mb-[var(--sp-1)] text-[length:var(--text-caption)] text-[var(--destructive)]"
            role="alert"
          >
            {attachError}
          </p>
        ) : null}
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
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message"
            autoComplete="off"
            className="min-h-10 flex-1 rounded-[var(--radius-input)] border border-[var(--divider)] bg-[var(--surface)] px-[var(--sp-4)] py-[var(--sp-2)] text-[length:var(--text-body)] leading-[1.35] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none"
          />
          <button
            type="submit"
            disabled={disabled || !canSend}
            aria-label="Send"
            className="pressable flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-40"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-white">
              <ArrowUpIcon className="h-[18px] w-[18px]" />
            </span>
          </button>
        </div>
      </div>
    </form>
  );
}
