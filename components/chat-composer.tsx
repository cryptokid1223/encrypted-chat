"use client";

import { useMemo, useState } from "react";
import { ArrowUpIcon } from "@/components/icons";

export function ChatComposer({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");

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
      <div className="mx-auto flex w-full max-w-3xl items-end gap-[var(--sp-2)] px-[var(--sp-3)] py-[var(--sp-2)]">
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
    </form>
  );
}
