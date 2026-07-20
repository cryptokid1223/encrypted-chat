"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { useNicknames } from "@/components/nicknames-context";
import { Avatar } from "@/lib/avatars";
import {
  displayName,
  formatAtUsername,
  hasNickname,
} from "@/lib/display-name";

const NICKNAME_MAX = 30;

function SettingsRow({
  label,
  value,
  onClick,
  chevron = false,
}: {
  label: string;
  value?: string;
  onClick?: () => void;
  chevron?: boolean;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-3 text-left text-[#FAFAF9] transition-colors duration-150 ease-in-out hover:bg-[#242220]/50 active:bg-[#242220]"
    >
      <span className="text-[15px]">{label}</span>
      <span className="flex shrink-0 items-center gap-2">
        {value ? (
          <span className="max-w-[160px] truncate text-[14px] text-[#6E6963]">
            {value}
          </span>
        ) : null}
        {chevron ? (
          <ChevronRightIcon className="h-4 w-4 text-[#6E6963]" />
        ) : null}
      </span>
    </Tag>
  );
}

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
        className="safe-pb relative w-full rounded-t-2xl border border-[#2E2B28] bg-[#1A1816] p-5"
      >
        <p
          id="nickname-editor-title"
          className="text-[15px] font-semibold text-[#FAFAF9]"
        >
          Nickname
        </p>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, NICKNAME_MAX))}
          placeholder="Add a nickname"
          autoComplete="off"
          className="mt-4 h-12 w-full rounded-xl border border-[#2E2B28] bg-[#242220] px-4 text-[16px] text-[#FAFAF9] placeholder:text-[#6E6963] outline-none transition-[border-color] duration-150 ease-in-out focus:border-[#EA580C]"
        />
        {error ? (
          <p className="mt-2 text-[13px] text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl text-[14px] font-medium text-[#6E6963] transition-colors duration-150 ease-in-out hover:bg-[#242220] hover:text-[#FAFAF9] disabled:opacity-40"
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
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl text-[14px] font-medium text-red-400 transition-colors duration-150 ease-in-out hover:bg-[#242220] disabled:opacity-40"
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
            className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-[#EA580C] text-[14px] font-medium text-white transition-colors duration-150 ease-in-out hover:bg-[#C2410C] disabled:opacity-40"
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
    <div className="fixed inset-x-0 top-0 z-50 flex h-app flex-col md:inset-0 md:items-center md:justify-center md:bg-black/60 md:p-4">
      <button
        type="button"
        aria-label="Close contact detail"
        className="absolute inset-0 hidden md:block"
        onClick={onClose}
      />
      <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#0F0E0D] md:h-auto md:max-h-[90dvh] md:max-w-md md:rounded-2xl md:border md:border-[#2E2B28] md:bg-[#1A1816]">
        <header className="safe-pt shrink-0 border-b border-[#2E2B28] bg-[#1A1816] md:rounded-t-2xl">
          <div className="flex h-12 items-center gap-1 px-2">
            <button
              type="button"
              aria-label="Back"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-full text-[#6E6963] transition-colors duration-150 ease-in-out hover:bg-[#242220] hover:text-[#FAFAF9]"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <span className="text-[15px] font-semibold text-[#FAFAF9]">
              Contact
            </span>
          </div>
        </header>

        <div className="safe-pb min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-md space-y-6 p-4 sm:p-6">
            <div className="flex flex-col items-center pt-4">
              <Avatar avatarId={avatarId} size={96} />
              <p className="mt-4 text-center text-[22px] font-semibold leading-[1.3] text-[#FAFAF9]">
                {titled}
              </p>
              {showUsernameSubtitle ? (
                <p className="mt-1 text-[14px] text-[#6E6963]">
                  {formatAtUsername(username)}
                </p>
              ) : null}
            </div>

            <div className="overflow-hidden rounded-2xl border border-[#2E2B28] bg-[#1A1816]">
              <SettingsRow
                label="Nickname"
                value={nickname ?? "None"}
                chevron
                onClick={() => setEditingNickname(true)}
              />
            </div>
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
