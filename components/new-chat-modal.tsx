"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { orderedParticipants } from "@/lib/chat";
import { createClient } from "@/lib/supabase/client";

export function NewChatModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setUsername("");
      setError(null);
      setBusy(false);
      const t = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

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
        onClose();
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
          onClose();
          router.push(`/chats/${raced.id}`);
          return;
        }

        setError("Could not create conversation. Try again.");
        return;
      }

      onClose();
      router.push(`/chats/${created.id}`);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/60 transition-opacity duration-150 ease-in-out"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-chat-title"
        className="safe-pb relative z-10 w-full max-w-lg rounded-t-2xl border border-[#2E2B28] bg-[#1A1816] p-5 sm:rounded-2xl"
      >
        <p
          id="new-chat-title"
          className="text-[15px] font-semibold text-[#FAFAF9]"
        >
          New chat
        </p>
        <p className="mt-1 text-[13px] text-[#6E6963]">
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
            className="h-12 w-full rounded-xl border border-[#2E2B28] bg-[#242220] px-4 text-[14px] text-[#FAFAF9] placeholder:text-[#6E6963] outline-none transition-[border-color] duration-150 ease-in-out focus:border-[#EA580C]"
          />
          {error ? (
            <p className="text-[13px] text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-11 flex-1 rounded-xl px-4 text-[13px] font-medium text-[#6E6963] transition-colors duration-150 ease-in-out hover:bg-[#242220] hover:text-[#FAFAF9]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !username.trim()}
              className="h-11 flex-1 rounded-xl bg-[#EA580C] px-4 text-[13px] font-medium text-white transition-colors duration-150 ease-in-out hover:bg-[#C2410C] disabled:opacity-40"
            >
              {busy ? "Opening…" : "Chat"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
