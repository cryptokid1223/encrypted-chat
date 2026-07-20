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
      className="safe-pb shrink-0 border-t border-[#2E2B28] bg-[#1A1816]"
    >
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-2 py-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message"
          autoComplete="off"
          className="min-h-[44px] flex-1 rounded-full border border-[#2E2B28] bg-[#242220] px-4 py-2.5 text-[16px] leading-[1.4] text-[#FAFAF9] placeholder:text-[#6E6963] outline-none transition-[border-color] duration-150 ease-in-out focus:border-[#EA580C]"
        />
        <button
          type="submit"
          disabled={disabled || !canSend}
          aria-label="Send"
          className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full bg-[#EA580C] text-white transition-colors duration-150 ease-in-out hover:bg-[#C2410C] disabled:opacity-30"
        >
          <SendIcon className="h-5 w-5" />
        </button>
      </div>
    </form>
  );
}
