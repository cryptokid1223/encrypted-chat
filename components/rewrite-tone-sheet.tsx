"use client";

import { useEffect, useState } from "react";
import { InlineSpinner } from "@/components/inline-spinner";
import { createClient } from "@/lib/supabase/client";

export type RewriteTone =
  | "grammar"
  | "friendly"
  | "formal"
  | "shorter"
  | "clearer";

const TONE_OPTIONS: { key: RewriteTone; label: string }[] = [
  { key: "grammar", label: "Fix grammar" },
  { key: "friendly", label: "Friendlier" },
  { key: "formal", label: "More formal" },
  { key: "shorter", label: "Shorter" },
  { key: "clearer", label: "Clearer" },
];

async function getAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function rewriteDraft(
  text: string,
  tone: RewriteTone,
): Promise<
  | { ok: true; rewritten: string }
  | {
      ok: false;
      error:
        | "rate_limited"
        | "too_long"
        | "unauthorized"
        | "unavailable";
      retryAfterSeconds?: number;
    }
> {
  async function post(token: string) {
    return fetch("/api/rewrite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text, tone }),
    });
  }

  let token = await getAccessToken();
  if (!token) {
    return { ok: false, error: "unauthorized" };
  }

  let response: Response;
  try {
    response = await post(token);
  } catch {
    return { ok: false, error: "unavailable" };
  }

  if (response.status === 401) {
    token = await getAccessToken();
    if (!token) {
      return { ok: false, error: "unauthorized" };
    }
    try {
      response = await post(token);
    } catch {
      return { ok: false, error: "unavailable" };
    }
    if (response.status === 401) {
      return { ok: false, error: "unauthorized" };
    }
  }

  if (response.status === 429) {
    let retryAfterSeconds: number | undefined;
    try {
      const body = (await response.json()) as { retryAfterSeconds?: number };
      if (typeof body.retryAfterSeconds === "number") {
        retryAfterSeconds = body.retryAfterSeconds;
      }
    } catch {
      // Ignore body parse failures.
    }
    return { ok: false, error: "rate_limited", retryAfterSeconds };
  }

  if (response.status === 400) {
    try {
      const body = (await response.json()) as { reason?: string };
      if (body.reason === "too_long") {
        return { ok: false, error: "too_long" };
      }
    } catch {
      // Fall through.
    }
    return { ok: false, error: "unavailable" };
  }

  if (!response.ok) {
    return { ok: false, error: "unavailable" };
  }

  try {
    const body = (await response.json()) as { rewritten?: string };
    if (typeof body.rewritten !== "string" || !body.rewritten.trim()) {
      return { ok: false, error: "unavailable" };
    }
    return { ok: true, rewritten: body.rewritten };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

function errorMessage(
  error: "rate_limited" | "too_long" | "unauthorized" | "unavailable",
  retryAfterSeconds?: number,
): string {
  if (error === "rate_limited") {
    if (retryAfterSeconds && retryAfterSeconds > 0) {
      return `You're adjusting messages too quickly. Try again in ~${retryAfterSeconds}s.`;
    }
    return "You're adjusting messages too quickly. Try again in a moment.";
  }
  if (error === "too_long") {
    return "Message is too long to adjust (1000 characters max).";
  }
  if (error === "unauthorized") {
    return "Please log in again.";
  }
  return "Couldn't reach the assistant. Try again.";
}

export function RewriteToneSheet({
  draft,
  onRewritten,
  onClose,
}: {
  draft: string;
  onRewritten: (rewritten: string, original: string) => void;
  onClose: () => void;
}) {
  const [busyTone, setBusyTone] = useState<RewriteTone | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busyTone) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busyTone]);

  async function handleTone(tone: RewriteTone) {
    if (busyTone) return;
    setError(null);
    setBusyTone(tone);

    const sentText = draft;
    const result = await rewriteDraft(sentText, tone);

    setBusyTone(null);

    if (!result.ok) {
      setError(errorMessage(result.error, result.retryAfterSeconds));
      return;
    }

    onRewritten(result.rewritten, sentText);
  }

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex h-app flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        className="sheet-backdrop-enter absolute inset-0 bg-black/60"
        disabled={Boolean(busyTone)}
        onClick={() => {
          if (!busyTone) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rewrite-tone-title"
        className="sheet-panel-enter safe-pb relative w-full rounded-t-[var(--radius-sheet)] border border-[var(--divider)] bg-[var(--surface-elevated)]"
      >
        <div className="flex justify-center pt-[var(--sp-2)]">
          <div className="h-1 w-9 rounded-full bg-[var(--divider)]" />
        </div>
        <p
          id="rewrite-tone-title"
          className="px-[var(--sp-5)] pt-[var(--sp-3)] text-[length:var(--text-title)] font-semibold text-[var(--text-primary)]"
        >
          Adjust message
        </p>
        <ul className="px-[var(--sp-2)] pb-[var(--sp-3)] pt-[var(--sp-2)]">
          {TONE_OPTIONS.map((option, index) => {
            const isBusy = busyTone === option.key;
            const disabled = busyTone !== null;
            return (
              <li key={option.key}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void handleTone(option.key)}
                  className={`row-press flex min-h-11 w-full items-center justify-between gap-[var(--sp-3)] rounded-[var(--radius-input)] px-[var(--sp-3)] text-left disabled:opacity-50 ${
                    index < TONE_OPTIONS.length - 1
                      ? "border-b border-[var(--divider)]"
                      : ""
                  }`}
                >
                  <span className="text-[length:var(--text-body)] text-[var(--text-primary)]">
                    {option.label}
                  </span>
                  {isBusy ? <InlineSpinner className="h-4 w-4 text-[var(--text-secondary)]" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
        {error ? (
          <p
            className="px-[var(--sp-5)] pb-[var(--sp-4)] text-[length:var(--text-secondary-size)] text-[var(--destructive)]"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
