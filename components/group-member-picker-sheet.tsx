"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, CloseIcon } from "@/components/icons";
import { InlineSpinner } from "@/components/inline-spinner";
import { Avatar } from "@/lib/avatars";
import { displayName } from "@/lib/display-name";
import {
  lookupGroupMemberCandidate,
  type GroupMemberCandidate,
} from "@/lib/groups";

export function GroupMemberPickerSheet({
  title,
  submitLabel,
  maxPick,
  excludeUserIds,
  slotsLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  submitLabel: string;
  maxPick: number;
  excludeUserIds: string[];
  slotsLabel?: string;
  onSubmit: (memberIds: string[]) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}) {
  const memberSearchRef = useRef<HTMLInputElement>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<GroupMemberCandidate[]>(
    [],
  );
  const [memberSearch, setMemberSearch] = useState("");
  const [memberSearchBusy, setMemberSearchBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void import("@/lib/supabase/client").then(({ createClient }) => {
      void createClient()
        .auth.getUser()
        .then(({ data: { user } }) => {
          if (user) setMyUserId(user.id);
        });
    });
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => memberSearchRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function addMemberFromSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);

    if (!myUserId) {
      setError("Not signed in.");
      return;
    }

    if (selectedMembers.length >= maxPick) {
      setError("No slots left in this group.");
      return;
    }

    setMemberSearchBusy(true);
    try {
      const result = await lookupGroupMemberCandidate(memberSearch, myUserId);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (excludeUserIds.includes(result.member.id)) {
        setError("That person is already in the group.");
        return;
      }

      if (selectedMembers.some((m) => m.id === result.member.id)) {
        setError("That person is already selected.");
        return;
      }

      setSelectedMembers((prev) => [...prev, result.member]);
      setMemberSearch("");
    } finally {
      setMemberSearchBusy(false);
    }
  }

  function removeMember(id: string) {
    setSelectedMembers((prev) => prev.filter((m) => m.id !== id));
    setError(null);
  }

  async function handleSubmit() {
    if (selectedMembers.length === 0) {
      setError("Pick at least one member.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await onSubmit(selectedMembers.map((m) => m.id));
      if (!result.ok) {
        setError(result.error ?? "Could not add members.");
        return;
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end md:items-center md:justify-center md:p-4">
      <button
        type="button"
        aria-label="Close"
        className="sheet-backdrop-enter absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-member-picker-title"
        className="sheet-panel-enter safe-pb relative flex max-h-[min(85%,100%)] w-full max-w-lg flex-col rounded-t-[var(--radius-sheet)] border border-[var(--divider)] bg-[var(--surface-elevated)] md:max-h-[90%] md:rounded-[var(--radius-sheet)]"
      >
        <div className="flex shrink-0 items-center gap-[var(--sp-1)] border-b border-[var(--divider)] px-[var(--sp-2)] py-[var(--sp-1)]">
          <button
            type="button"
            aria-label="Back"
            onClick={onClose}
            className="pressable flex h-11 w-11 items-center justify-center text-[var(--text-secondary)]"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <p
            id="group-member-picker-title"
            className="text-[length:var(--text-title)] font-semibold text-[var(--text-primary)]"
          >
            {title}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-[var(--sp-5)]">
          {selectedMembers.length > 0 ? (
            <div className="mb-[var(--sp-3)] flex flex-wrap gap-[var(--sp-2)]">
              {selectedMembers.map((member) => (
                <span
                  key={member.id}
                  className="inline-flex max-w-full items-center gap-[var(--sp-1)] rounded-full border border-[var(--divider)] bg-[var(--surface)] py-1 pl-1 pr-[var(--sp-1)]"
                >
                  <Avatar avatarId={member.avatarId} size={28} />
                  <span className="max-w-[120px] truncate text-[length:var(--text-caption)] font-medium text-[var(--text-primary)]">
                    {displayName({ username: member.username, nickname: null })}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${member.username}`}
                    onClick={() => removeMember(member.id)}
                    className="pressable flex h-11 w-11 items-center justify-center text-[var(--text-secondary)]"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <form onSubmit={addMemberFromSearch} className="space-y-[var(--sp-2)]">
            <div className="flex items-center justify-between gap-[var(--sp-2)]">
              <label
                htmlFor="add-group-member-search"
                className="text-[length:var(--text-secondary-size)] text-[var(--text-secondary)]"
              >
                Add by username
              </label>
              <span className="shrink-0 text-[length:var(--text-caption)] tabular-nums text-[var(--text-secondary)]">
                {slotsLabel ?? `${selectedMembers.length}/${maxPick}`}
              </span>
            </div>
            <div className="flex gap-[var(--sp-2)]">
              <input
                ref={memberSearchRef}
                id="add-group-member-search"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value.toLowerCase())}
                placeholder="username"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="h-11 min-h-[44px] flex-1 rounded-[var(--radius-input)] border border-[var(--divider)] bg-[var(--surface)] px-[var(--sp-4)] text-[16px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
              />
              <button
                type="submit"
                disabled={
                  memberSearchBusy ||
                  !memberSearch.trim() ||
                  selectedMembers.length >= maxPick
                }
                className="pressable h-11 min-h-[44px] shrink-0 rounded-[var(--radius-input)] bg-[var(--accent)] px-[var(--sp-4)] text-[length:var(--text-secondary-size)] font-medium text-white disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </form>

          {error ? (
            <p
              className="mt-[var(--sp-2)] text-[length:var(--text-secondary-size)] text-[var(--destructive)]"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <button
            type="button"
            disabled={busy || selectedMembers.length === 0}
            onClick={() => void handleSubmit()}
            className="pressable mt-[var(--sp-4)] flex h-11 min-h-[44px] w-full items-center justify-center gap-[var(--sp-2)] rounded-[var(--radius-input)] bg-[var(--accent)] text-[length:var(--text-secondary-size)] font-medium text-white disabled:opacity-40"
          >
            {busy ? (
              <>
                <InlineSpinner className="h-4 w-4" />
                Adding…
              </>
            ) : (
              submitLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
