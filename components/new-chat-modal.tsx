"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AvatarPicker } from "@/components/avatar-picker";
import { ChevronLeftIcon, CloseIcon, PeopleIcon } from "@/components/icons";
import { InlineSpinner } from "@/components/inline-spinner";
import { Avatar } from "@/lib/avatars";
import { orderedParticipants } from "@/lib/chat";
import { displayName } from "@/lib/display-name";
import {
  createGroupWithMembers,
  lookupGroupMemberCandidate,
  type GroupMemberCandidate,
} from "@/lib/groups";
import { createClient } from "@/lib/supabase/client";

type SheetMode = "direct" | "group-members" | "group-details";

const MAX_GROUP_PICK = 15;
const MIN_GROUP_PICK = 2;

function NewChatSheet({
  onClose,
  onInboxChanged,
}: {
  onClose: () => void;
  onInboxChanged?: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const memberSearchRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<SheetMode>("direct");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const [selectedMembers, setSelectedMembers] = useState<GroupMemberCandidate[]>(
    [],
  );
  const [memberSearch, setMemberSearch] = useState("");
  const [memberSearchBusy, setMemberSearchBusy] = useState(false);

  const [groupName, setGroupName] = useState("");
  const [groupAvatarId, setGroupAvatarId] = useState<string | null>(null);

  const dismiss = useCallback(() => {
    inputRef.current?.blur();
    memberSearchRef.current?.blur();
    onClose();
  }, [onClose]);

  useEffect(() => {
    void createClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (user) setMyUserId(user.id);
      });
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (mode === "direct") inputRef.current?.focus();
      if (mode === "group-members") memberSearchRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [mode]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  function handleBack() {
    setError(null);
    if (mode === "group-details") {
      setMode("group-members");
      return;
    }
    if (mode === "group-members") {
      setMode("direct");
      return;
    }
    dismiss();
  }

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
        onInboxChanged?.();
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
          onInboxChanged?.();
          dismiss();
          router.push(`/chats/${raced.id}`);
          return;
        }

        setError("Could not create conversation. Try again.");
        return;
      }

      onInboxChanged?.();
      dismiss();
      router.push(`/chats/${created.id}`);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function addMemberFromSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);

    if (!myUserId) {
      setError("Not signed in.");
      return;
    }

    if (selectedMembers.length >= MAX_GROUP_PICK) {
      setError(`Groups can have at most ${MAX_GROUP_PICK + 1} members including you.`);
      return;
    }

    setMemberSearchBusy(true);
    try {
      const result = await lookupGroupMemberCandidate(memberSearch, myUserId);
      if (!result.ok) {
        setError(result.error);
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

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = groupName.trim();
    if (trimmed.length < 1 || trimmed.length > 40) {
      setError("Group name must be 1–40 characters.");
      return;
    }

    setBusy(true);
    try {
      const result = await createGroupWithMembers({
        name: trimmed,
        avatarId: groupAvatarId,
        memberIds: selectedMembers.map((m) => m.id),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onInboxChanged?.();
      dismiss();
      router.push(`/chats/group/${result.groupId}`);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "direct"
      ? "New chat"
      : mode === "group-members"
        ? "New group"
        : "Group details";

  const membersValid =
    selectedMembers.length >= MIN_GROUP_PICK &&
    selectedMembers.length <= MAX_GROUP_PICK;

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center md:p-4">
      <button
        type="button"
        aria-label="Close"
        className="sheet-backdrop-enter absolute inset-0 bg-black/60"
        onClick={dismiss}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-chat-title"
        className="sheet-panel-enter safe-pb relative flex max-h-[min(85%,100%)] w-full max-w-lg flex-col rounded-t-[var(--radius-sheet)] border border-[var(--divider)] bg-[var(--surface-elevated)] md:max-h-[90%] md:rounded-[var(--radius-sheet)]"
      >
        <div className="flex shrink-0 items-center gap-[var(--sp-1)] border-b border-[var(--divider)] px-[var(--sp-2)] py-[var(--sp-1)]">
          <button
            type="button"
            aria-label="Back"
            onClick={handleBack}
            className="pressable flex h-11 w-11 items-center justify-center text-[var(--text-secondary)]"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <p
            id="new-chat-title"
            className="text-[length:var(--text-title)] font-semibold text-[var(--text-primary)]"
          >
            {title}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-[var(--sp-5)]">
          {mode === "direct" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode("group-members");
                }}
                className="row-press flex min-h-11 w-full items-center gap-[var(--sp-3)] rounded-[var(--radius-input)] px-[var(--sp-2)] text-left"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--text-secondary)]">
                  <PeopleIcon className="h-5 w-5" />
                </span>
                <span className="text-[length:var(--text-body)] font-medium text-[var(--text-primary)]">
                  New group
                </span>
              </button>

              <p className="mt-[var(--sp-4)] text-[length:var(--text-secondary-size)] text-[var(--text-secondary)]">
                Enter their exact Celesth username
              </p>

              <form onSubmit={startChat} className="mt-[var(--sp-3)] space-y-[var(--sp-3)]">
                <input
                  ref={inputRef}
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="username"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="h-12 w-full rounded-[var(--radius-input)] border border-[var(--divider)] bg-[var(--surface)] px-[var(--sp-4)] text-[16px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
                />
                {error ? (
                  <p className="text-[length:var(--text-secondary-size)] text-[var(--destructive)]" role="alert">
                    {error}
                  </p>
                ) : null}
                <div className="flex gap-[var(--sp-2)] pt-[var(--sp-1)]">
                  <button
                    type="button"
                    onClick={dismiss}
                    className="pressable flex h-11 min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-input)] text-[length:var(--text-secondary-size)] font-medium text-[var(--text-secondary)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !username.trim()}
                    className="pressable flex h-11 min-h-[44px] flex-1 items-center justify-center gap-[var(--sp-2)] rounded-[var(--radius-input)] bg-[var(--accent)] text-[length:var(--text-secondary-size)] font-medium text-white disabled:opacity-40"
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
            </>
          ) : null}

          {mode === "group-members" ? (
            <>
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

              <form
                onSubmit={addMemberFromSearch}
                className="space-y-[var(--sp-2)]"
              >
                <div className="flex items-center justify-between gap-[var(--sp-2)]">
                  <label
                    htmlFor="group-member-search"
                    className="text-[length:var(--text-secondary-size)] text-[var(--text-secondary)]"
                  >
                    Add members by username
                  </label>
                  <span className="shrink-0 text-[length:var(--text-caption)] tabular-nums text-[var(--text-secondary)]">
                    {selectedMembers.length}/{MAX_GROUP_PICK}
                  </span>
                </div>
                <div className="flex gap-[var(--sp-2)]">
                  <input
                    ref={memberSearchRef}
                    id="group-member-search"
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
                      selectedMembers.length >= MAX_GROUP_PICK
                    }
                    className="pressable h-11 min-h-[44px] shrink-0 rounded-[var(--radius-input)] bg-[var(--accent)] px-[var(--sp-4)] text-[length:var(--text-secondary-size)] font-medium text-white disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              </form>

              {selectedMembers.length === 1 ? (
                <p className="mt-[var(--sp-2)] text-[length:var(--text-caption)] text-[var(--text-secondary)]">
                  For one person, start a direct chat.
                </p>
              ) : null}

              {error ? (
                <p className="mt-[var(--sp-2)] text-[length:var(--text-secondary-size)] text-[var(--destructive)]" role="alert">
                  {error}
                </p>
              ) : null}

              <button
                type="button"
                disabled={!membersValid}
                onClick={() => {
                  setError(null);
                  setMode("group-details");
                }}
                className="pressable mt-[var(--sp-4)] flex h-11 min-h-[44px] w-full items-center justify-center rounded-[var(--radius-input)] bg-[var(--accent)] text-[length:var(--text-secondary-size)] font-medium text-white disabled:opacity-40"
              >
                Next
              </button>
            </>
          ) : null}

          {mode === "group-details" ? (
            <form onSubmit={createGroup} className="space-y-[var(--sp-4)]">
              <div>
                <label
                  htmlFor="group-name"
                  className="text-[length:var(--text-secondary-size)] text-[var(--text-secondary)]"
                >
                  Group name
                </label>
                <input
                  id="group-name"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  maxLength={40}
                  placeholder="Weekend crew"
                  autoComplete="off"
                  className="mt-[var(--sp-2)] h-12 w-full rounded-[var(--radius-input)] border border-[var(--divider)] bg-[var(--surface)] px-[var(--sp-4)] text-[16px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div>
                <p className="text-[length:var(--text-secondary-size)] text-[var(--text-secondary)]">
                  Group avatar (optional)
                </p>
                <div className="mt-[var(--sp-2)] flex items-center gap-[var(--sp-2)]">
                  <button
                    type="button"
                    onClick={() => setGroupAvatarId(null)}
                    className={`pressable rounded-[var(--radius-input)] border px-[var(--sp-3)] py-[var(--sp-2)] text-[length:var(--text-caption)] ${
                      groupAvatarId === null
                        ? "border-[var(--accent)] text-[var(--text-primary)]"
                        : "border-[var(--divider)] text-[var(--text-secondary)]"
                    }`}
                  >
                    Default icon
                  </button>
                </div>
                <div className="mt-[var(--sp-3)]">
                  <AvatarPicker
                    value={groupAvatarId ?? "aurora"}
                    onChange={setGroupAvatarId}
                    size={52}
                    showLabels={false}
                    columns="settings"
                  />
                </div>
              </div>

              {error ? (
                <p className="text-[length:var(--text-secondary-size)] text-[var(--destructive)]" role="alert">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={busy || groupName.trim().length < 1}
                className="pressable flex h-11 min-h-[44px] w-full items-center justify-center gap-[var(--sp-2)] rounded-[var(--radius-input)] bg-[var(--accent)] text-[length:var(--text-secondary-size)] font-medium text-white disabled:opacity-40"
              >
                {busy ? (
                  <>
                    <InlineSpinner className="h-4 w-4" />
                    Creating…
                  </>
                ) : (
                  "Create group"
                )}
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function NewChatModal({
  open,
  onClose,
  onInboxChanged,
}: {
  open: boolean;
  onClose: () => void;
  onInboxChanged?: () => void;
}) {
  if (!open) return null;
  return <NewChatSheet onClose={onClose} onInboxChanged={onInboxChanged} />;
}
