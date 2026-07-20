"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon } from "@/components/icons";
import { InlineSpinner } from "@/components/inline-spinner";
import { orderedParticipants } from "@/lib/chat";
import { createClient } from "@/lib/supabase/client";

function NewChatSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dismiss = useCallback(() => {
    inputRef.current?.blur();
    onClose();
  }, [onClose]);

  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  async function startChat(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleaned = username.trim().toLowerCase();
    if (!cleaned) {
      setError("Enter a username.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Not signed in.");
        return;
      }

      const { data: profile, error: lookupError } = await supabase
        .from("profiles")
        .select("id, username")
        .eq("username", cleaned)
        .maybeSingle();

      if (lookupError) {
        setError("Could not look up that user. Try again.");
        return;
      }

      if (!profile) {
        setError("No user with that username.");
        return;
      }

      if (profile.id === user.id) {
        setError("That's you — try someone else's username.");
        return;
      }

      const [participant_a, participant_b] = orderedParticipants(
        user.id,
        profile.id as string,
      );

      const { data: existing, error: findError } = await supabase
        .from("conversations")
        .select("id")
        .eq("participant_a", participant_a)
        .eq("participant_b", participant_b)
        .maybeSingle();

      if (findError) {
        setError("Could not open conversation. Try again.");
        return;
      }

      if (existing) {
        dismiss();
        router.push(`/chats/${existing.id}`);
        return;
      }

      const { data: created, error: createError } = await supabase
        .from("conversations")
        .insert({ participant_a, participant_b })
        .select("id")
        .single();

      if (createError) {
        const { data: raced } = await supabase
          .from("conversations")
          .select("id")
          .eq("participant_a", participant_a)
          .eq("participant_b", participant_b)
          .maybeSingle();

        if (raced) {
          dismiss();
          router.push(`/chats/${raced.id}`);
          return;
        }

        setError("Could not create conversation. Try again.");
        return;
      }

      dismiss();
      router.push(`/chats/${created.id}`);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center md:p-4">
      <button
        type="button"
        aria-label="Close new chat"
        className="sheet-backdrop-enter absolute inset-0 bg-black/60 transition-opacity duration-150 ease-in-out"
        onClick={dismiss}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-chat-title"
        className="sheet-panel-enter safe-pb relative flex max-h-[min(85%,100%)] w-full max-w-lg flex-col rounded-t-2xl border border-[#2E2B28] bg-[#1A1816] md:max-h-[90%] md:rounded-2xl"
      >
        <div className="flex shrink-0 items-center gap-1 border-b border-[#2E2B28] px-2 py-1">
          <button
            type="button"
            aria-label="Close"
            onClick={dismiss}
            className="pressable flex h-11 w-11 items-center justify-center rounded-full text-[#6E6963] hover:bg-[#242220] hover:text-[#FAFAF9]"
          >
            <ChevronLeftIcon className="h-5 w-5 md:hidden" />
            <span className="hidden text-[18px] leading-none md:inline">×</span>
          </button>
          <p
            id="new-chat-title"
            className="text-[15px] font-semibold text-[#FAFAF9]"
          >
            New chat
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <p className="text-[13px] text-[#6E6963]">
            Enter their exact Celesth username
          </p>

          <form onSubmit={startChat} className="mt-4 space-y-3">
            <input
              ref={inputRef}
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="username"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="h-12 w-full rounded-xl border border-[#2E2B28] bg-[#242220] px-4 text-[16px] text-[#FAFAF9] placeholder:text-[#6E6963] outline-none transition-[border-color] duration-150 ease-in-out focus:border-[#EA580C]"
            />
            {error ? (
              <p className="text-[13px] text-red-400" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={dismiss}
                className="pressable flex h-11 min-h-[44px] flex-1 items-center justify-center rounded-xl px-4 text-[13px] font-medium text-[#6E6963] hover:bg-[#242220] hover:text-[#FAFAF9]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !username.trim()}
                className="pressable flex h-11 min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#EA580C] px-4 text-[13px] font-medium text-white hover:bg-[#C2410C] disabled:opacity-40"
              >
                {busy ? (
                  <>
                    <InlineSpinner className="h-4 w-4" />
                    Opening…
                  </>
                ) : (
                  "Chat"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export function NewChatModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return <NewChatSheet onClose={onClose} />;
}
