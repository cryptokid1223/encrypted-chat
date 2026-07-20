"use client";

import { useEffect, useState } from "react";
import { CloseIcon } from "@/components/icons";
import { InlineSpinner } from "@/components/inline-spinner";
import {
  dismissWrapSetupBanner,
  markWrapSetupComplete,
  needsWrapSetupBanner,
  wrapAndUploadLocalKey,
} from "@/lib/wrappedKeys";
import { createClient } from "@/lib/supabase/client";

export function WrapSetupBanner({ userId }: { userId: string }) {
  const [visible, setVisible] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void needsWrapSetupBanner(userId).then((needs) => {
      if (!cancelled) setVisible(needs);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!sheetOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) setSheetOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, busy]);

  if (!visible && !doneMessage) return null;

  async function onConfirm() {
    setError(null);
    if (!password) {
      setError("Enter your password.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) {
        setError("Not signed in.");
        return;
      }

      // Verify password via auth before wrapping (password is never stored).
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (authError) {
        setError("Incorrect password.");
        return;
      }

      const result = await wrapAndUploadLocalKey(userId, password);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      markWrapSetupComplete(userId);
      setSheetOpen(false);
      setPassword("");
      setVisible(false);
      setDoneMessage("Password restore enabled.");
      window.setTimeout(() => setDoneMessage(null), 4000);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {doneMessage ? (
        <div className="shrink-0 border-b border-[var(--divider)] bg-[var(--surface)] px-[var(--sp-4)] py-[var(--sp-2)]">
          <p
            className="text-center text-[length:var(--text-secondary-size)] text-[var(--text-secondary)]"
            role="status"
          >
            {doneMessage}
          </p>
        </div>
      ) : null}

      {visible ? (
        <div className="shrink-0 border-b border-[var(--divider)] bg-[var(--surface)] px-[var(--sp-4)] py-[var(--sp-3)]">
          <div className="flex items-start gap-[var(--sp-2)]">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="pressable min-w-0 flex-1 text-left"
            >
              <p className="text-[length:var(--text-secondary-size)] font-medium text-[var(--text-primary)]">
                Finish setup: enable password message restore
              </p>
              <p className="mt-0.5 text-[length:var(--text-caption)] text-[var(--text-secondary)]">
                Tap to confirm your password so you can restore messages on new
                devices by logging in.
              </p>
            </button>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => {
                dismissWrapSetupBanner(userId);
                setVisible(false);
              }}
              className="pressable flex h-11 w-11 shrink-0 items-center justify-center text-[var(--text-secondary)]"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {sheetOpen ? (
        <div className="fixed inset-x-0 top-0 z-50 flex h-app flex-col justify-end">
          <button
            type="button"
            aria-label="Close"
            className="sheet-backdrop-enter absolute inset-0 bg-black/60"
            disabled={busy}
            onClick={() => {
              if (!busy) setSheetOpen(false);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="wrap-setup-title"
            className="sheet-panel-enter safe-pb relative w-full rounded-t-[var(--radius-sheet)] border border-[var(--divider)] bg-[var(--surface-elevated)] p-[var(--sp-5)]"
          >
            <div className="flex justify-center pb-[var(--sp-2)]">
              <div className="h-1 w-9 rounded-full bg-[var(--divider)]" />
            </div>
            <p
              id="wrap-setup-title"
              className="text-[length:var(--text-title)] font-semibold text-[var(--text-primary)]"
            >
              Enable password restore
            </p>
            <p className="mt-[var(--sp-1)] text-[length:var(--text-secondary-size)] leading-[1.4] text-[var(--text-secondary)]">
              Confirm your password to enable restoring messages with it on new
              devices.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const active = document.activeElement;
                if (active instanceof HTMLElement) active.blur();
                void onConfirm();
              }}
            >
              <input
                type="password"
                autoComplete="current-password"
                enterKeyHint="done"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                className="mt-[var(--sp-4)] h-12 w-full rounded-[var(--radius-input)] border border-[var(--divider)] bg-[var(--surface)] px-[var(--sp-4)] text-[16px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
              />
              {error ? (
                <p
                  className="mt-[var(--sp-2)] text-[length:var(--text-secondary-size)] text-[var(--destructive)]"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
              <div className="mt-[var(--sp-4)] flex gap-[var(--sp-2)]">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setSheetOpen(false)}
                  className="pressable flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius-input)] text-[length:var(--text-body)] font-medium text-[var(--text-primary)] disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !password}
                  className="pressable flex min-h-11 flex-1 items-center justify-center gap-[var(--sp-2)] rounded-[var(--radius-input)] bg-[var(--accent)] text-[length:var(--text-body)] font-semibold text-white disabled:opacity-40"
                >
                  {busy ? (
                    <>
                      <InlineSpinner className="h-4 w-4" />
                      Enabling…
                    </>
                  ) : (
                    "Confirm"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
