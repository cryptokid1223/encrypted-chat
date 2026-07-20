"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, PersonIcon } from "@/components/icons";
import { useNicknames } from "@/components/nicknames-context";
import { SettingsRow, SettingsSection } from "@/components/settings-ui";
import { Avatar } from "@/lib/avatars";
import {
  displayName,
  formatAtUsername,
  hasNickname,
} from "@/lib/display-name";

const NICKNAME_MAX = 30;

function NicknameSheet({
  initial,
  onSave,
  onClear,
  onClose,
}: {
  initial: string;
  onSave: (value: string) => Promise<void>;
  onClear: () => Promise<void>;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close nickname editor"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nickname-editor-title"
        className="safe-pb relative w-full rounded-t-[var(--radius-sheet)] bg-[var(--surface-elevated)] p-[var(--sp-5)]"
      >
        <div className="flex justify-center pb-[var(--sp-2)]">
          <div className="h-1 w-9 rounded-full bg-[var(--divider)]" />
        </div>
        <p
          id="nickname-editor-title"
          className="text-[length:var(--text-title)] font-semibold text-[var(--text-primary)]"
        >
          Nickname
        </p>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, NICKNAME_MAX))}
          placeholder="Add a nickname"
          autoComplete="off"
          onFocus={(e) =>
            e.target.scrollIntoView({ block: "nearest", behavior: "smooth" })
          }
          className="mt-[var(--sp-4)] h-12 w-full rounded-[var(--radius-input)] border border-[var(--divider)] bg-[var(--surface)] px-[var(--sp-4)] text-[length:var(--text-body)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none transition-[border-color] duration-150 ease-in-out focus:border-[var(--accent)]"
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
            onClick={onClose}
            className="flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius-input)] text-[length:var(--text-body)] font-medium text-[var(--text-primary)] transition-opacity duration-150 ease-in-out active:opacity-70 disabled:opacity-40"
          >
            Cancel
          </button>
          {initial.trim() ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await onClear();
                    onClose();
                  } catch {
                    setError("Could not clear nickname.");
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              className="flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius-input)] text-[length:var(--text-body)] font-medium text-[var(--destructive)] transition-opacity duration-150 ease-in-out active:opacity-70 disabled:opacity-40"
            >
              Clear
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setError(null);
                try {
                  await onSave(value.trim());
                  onClose();
                } catch {
                  setError("Could not save nickname.");
                } finally {
                  setBusy(false);
                }
              })();
            }}
            className="flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius-input)] bg-[var(--accent)] text-[length:var(--text-body)] font-semibold text-white transition-colors duration-150 ease-in-out active:bg-[var(--accent-pressed)] disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function ContactDetail({
  contactId,
  username,
  avatarId,
  onClose,
}: {
  contactId: string;
  username: string;
  avatarId: string | null;
  onClose: () => void;
}) {
  const { getNickname, saveNickname, clearNickname } = useNicknames();
  const [editingNickname, setEditingNickname] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !editingNickname) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, editingNickname]);

  const nickname = getNickname(contactId);
  const identity = { username, nickname };
  const titled = displayName(identity);
  const showUsernameSubtitle = hasNickname(identity);

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex h-app flex-col md:inset-0 md:items-center md:justify-center md:bg-black/60 md:p-[var(--sp-4)]">
      <button
        type="button"
        aria-label="Close contact detail"
        className="absolute inset-0 hidden md:block"
        onClick={onClose}
      />
      <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--bg)] md:h-auto md:max-h-[90dvh] md:max-w-md md:rounded-[var(--radius-card)] md:bg-[var(--surface-elevated)]">
        <header className="safe-pt shrink-0 border-b border-[var(--divider)] bg-[var(--bg)] md:rounded-t-[var(--radius-card)] md:bg-[var(--surface-elevated)]">
          <div className="flex h-[52px] items-center gap-[var(--sp-1)] px-[var(--sp-2)]">
            <button
              type="button"
              aria-label="Back"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center text-[var(--text-secondary)] transition-opacity duration-150 ease-in-out active:opacity-70"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <span className="text-[length:var(--text-title)] font-semibold text-[var(--text-primary)]">
              Contact
            </span>
          </div>
        </header>

        <div className="safe-pb min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-md px-[var(--sp-4)] pb-[var(--sp-6)] sm:px-[var(--sp-6)]">
            <div className="flex flex-col items-center pt-[var(--sp-6)]">
              <Avatar avatarId={avatarId} size={88} />
              <p className="mt-[var(--sp-3)] text-center text-[length:var(--text-title-lg)] font-bold leading-tight text-[var(--text-primary)]">
                {titled}
              </p>
              {showUsernameSubtitle ? (
                <p className="mt-[var(--sp-1)] text-[length:var(--text-secondary-size)] text-[var(--text-secondary)]">
                  {formatAtUsername(username)}
                </p>
              ) : null}
            </div>

            <SettingsSection title="Details">
              <SettingsRow
                icon={<PersonIcon />}
                label="Nickname"
                value={nickname ?? "None"}
                chevron
                onClick={() => setEditingNickname(true)}
                isLast
              />
            </SettingsSection>
          </div>
        </div>

        {editingNickname ? (
          <NicknameSheet
            initial={nickname ?? ""}
            onClose={() => setEditingNickname(false)}
            onSave={async (value) => {
              if (!value) {
                const result = await clearNickname(contactId);
                if (!result.ok) throw new Error(result.error);
                return;
              }
              const result = await saveNickname(contactId, value);
              if (!result.ok) throw new Error(result.error);
            }}
            onClear={async () => {
              const result = await clearNickname(contactId);
              if (!result.ok) throw new Error(result.error);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
