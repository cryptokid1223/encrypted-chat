"use client";

import { useMemo, useState } from "react";
import { SendIcon } from "@/components/icons";

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
      className="safe-pb shrink-0 border-t border-[#2E2B28] bg-[#0F0E0D]"
    >
      <div className="mx-auto w-full max-w-3xl px-3 py-2.5">
        <div className="relative flex items-center">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message"
            autoComplete="off"
            className={`h-11 w-full rounded-full border border-[#2E2B28] bg-[#242220] py-2.5 text-[14px] leading-[1.4] text-[#FAFAF9] placeholder:text-[#6E6963] outline-none transition-[border-color] duration-150 ease-in-out focus:border-[#EA580C] ${
              canSend ? "pl-4 pr-12" : "px-4"
            }`}
          />
          {canSend ? (
            <button
              type="submit"
              disabled={disabled}
              aria-label="Send"
              className="absolute right-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-[#EA580C] text-white transition-colors duration-150 ease-in-out hover:bg-[#C2410C] disabled:opacity-40"
            >
              <SendIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}

