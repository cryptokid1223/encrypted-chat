"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AvatarPicker } from "@/components/avatar-picker";
import { ContactDetail } from "@/components/contact-detail";
import { GroupAvatar } from "@/components/group-avatar";
import { GroupMemberPickerSheet } from "@/components/group-member-picker-sheet";
import {
  ChevronLeftIcon,
  MinusIcon,
  PencilIcon,
  PersonPlusIcon,
} from "@/components/icons";
import { useNicknames } from "@/components/nicknames-context";
import {
  SettingsConfirmDialog,
  SettingsRow,
  SettingsSection,
} from "@/components/settings-ui";
import { findOrCreateDirectConversation } from "@/lib/directChat";
import { displayName, formatAtUsername } from "@/lib/display-name";
import { setGroupNotice } from "@/lib/groupNotice";
import {
  addGroupMembers,
  fetchGroupDetails,
  leaveGroup,
  promoteGroupAdmin,
  remainingMemberSlots,
  removeGroupMember,
  updateGroupAvatar,
  updateGroupName,
  type GroupDetails,
  type GroupMemberDetail,
} from "@/lib/groups";
import { Avatar } from "@/lib/avatars";

function GroupNameSheet({
  initial,
  onSave,
  onClose,
}: {
  initial: string;
  onSave: (value: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close name editor"
        className="sheet-backdrop-enter absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="sheet-panel-enter safe-pb relative w-full rounded-t-[var(--radius-sheet)] bg-[var(--surface-elevated)] p-[var(--sp-5)]"
      >
        <p className="text-[length:var(--text-title)] font-semibold text-[var(--text-primary)]">
          Group name
        </p>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, 40))}
          maxLength={40}
          autoComplete="off"
          className="mt-[var(--sp-4)] h-12 w-full rounded-[var(--radius-input)] border border-[var(--divider)] bg-[var(--surface)] px-[var(--sp-4)] text-[16px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        />
        {error ? (
          <p className="mt-[var(--sp-2)] text-[length:var(--text-secondary-size)] text-[var(--destructive)]">
            {error}
          </p>
        ) : null}
        <div className="mt-[var(--sp-4)] flex gap-[var(--sp-2)]">
          <button
            type="button"
            onClick={onClose}
            className="pressable flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius-input)] text-[length:var(--text-body)] font-medium text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || value.trim().length < 1}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setError(null);
                try {
                  await onSave(value.trim());
                  onClose();
                } catch {
                  setError("Could not save name.");
                } finally {
                  setBusy(false);
                }
              })();
            }}
            className="pressable flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius-input)] bg-[var(--accent)] text-[length:var(--text-body)] font-semibold text-white disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminPromotionSheet({
  members,
  onPromote,
  onClose,
}: {
  members: GroupMemberDetail[];
  onPromote: (userId: string) => Promise<void>;
  onClose: () => void;
}) {
  const { getNickname } = useNicknames();
  const [busyId, setBusyId] = useState<string | null>(null);

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        className="sheet-backdrop-enter absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div className="sheet-panel-enter safe-pb relative w-full rounded-t-[var(--radius-sheet)] bg-[var(--surface-elevated)] p-[var(--sp-5)]">
        <p className="text-[length:var(--text-title)] font-semibold text-[var(--text-primary)]">
          Choose a new admin
        </p>
        <p className="mt-[var(--sp-1)] text-[length:var(--text-secondary-size)] text-[var(--text-secondary)]">
          Promote someone before you leave.
        </p>
        <ul className="mt-[var(--sp-4)] space-y-[var(--sp-1)]">
          {members.map((member) => (
            <li key={member.userId}>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => {
                  void (async () => {
                    setBusyId(member.userId);
                    try {
                      await onPromote(member.userId);
                      onClose();
                    } finally {
                      setBusyId(null);
                    }
                  })();
                }}
                className="row-press flex min-h-11 w-full items-center gap-[var(--sp-3)] rounded-[var(--radius-input)] px-[var(--sp-2)] text-left disabled:opacity-40"
              >
                <Avatar avatarId={member.avatarId} size={40} />
                <span className="text-[length:var(--text-body)] font-medium text-[var(--text-primary)]">
                  {displayName({
                    username: member.username,
                    nickname: getNickname(member.userId),
                  })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function GroupInfo({
  groupId,
  myUserId,
  onClose,
  onMembershipChanged,
  onGroupUpdated,
  onLeftGroup,
  membersRevision = 0,
}: {
  groupId: string;
  myUserId: string;
  onClose: () => void;
  onMembershipChanged: () => void;
  onGroupUpdated: (patch: { name?: string; avatarId?: string | null }) => void;
  onLeftGroup: () => void;
  membersRevision?: number;
}) {
  const router = useRouter();
  const { getNickname } = useNicknames();

  const [details, setDetails] = useState<GroupDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [promotionOpen, setPromotionOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<GroupMemberDetail | null>(
    null,
  );
  const [removeBusy, setRemoveBusy] = useState(false);
  const [contactTarget, setContactTarget] = useState<GroupMemberDetail | null>(
    null,
  );

  const loadDetails = useCallback(async () => {
    setError(null);
    const result = await fetchGroupDetails(groupId, myUserId);
    if (!result.ok) {
      setError(result.error);
      setDetails(null);
      return;
    }
    setDetails(result.details);
  }, [groupId, myUserId]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await loadDetails();
      setLoading(false);
    })();
  }, [loadDetails]);

  useEffect(() => {
    if (membersRevision === 0) return;
    void loadDetails();
  }, [membersRevision, loadDetails]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.key === "Escape" &&
        !editingName &&
        !editingAvatar &&
        !addMembersOpen &&
        !leaveOpen &&
        !promotionOpen &&
        !removeTarget &&
        !contactTarget
      ) {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    onClose,
    editingName,
    editingAvatar,
    addMembersOpen,
    leaveOpen,
    promotionOpen,
    removeTarget,
    contactTarget,
  ]);

  const isAdmin = details?.myRole === "admin";
  const slotsLeft = details
    ? remainingMemberSlots(details.members.length)
    : 0;

  async function handleMemberTap(member: GroupMemberDetail) {
    if (member.userId === myUserId) return;

    const result = await findOrCreateDirectConversation(
      myUserId,
      member.userId,
    );
    if (result.ok) {
      onClose();
      router.push(`/chats/${result.conversationId}`);
      return;
    }

    setContactTarget(member);
  }

  async function confirmLeave() {
    if (!details) return;
    setLeaveBusy(true);
    try {
      const result = await leaveGroup(groupId, myUserId);
      if (!result.ok) {
        if (result.needsAdminPromotion) {
          setLeaveOpen(false);
          setPromotionOpen(true);
          return;
        }
        setError(result.error);
        setLeaveOpen(false);
        return;
      }

      setLeaveOpen(false);
      onLeftGroup();
      setGroupNotice("You left the group.");
      router.push("/chats");
    } finally {
      setLeaveBusy(false);
    }
  }

  async function promoteAndLeave(newAdminId: string) {
    const promoteResult = await promoteGroupAdmin(groupId, newAdminId);
    if (!promoteResult.ok) {
      setError(promoteResult.error);
      return;
    }

    setPromotionOpen(false);
    setLeaveBusy(true);
    try {
      const leaveResult = await leaveGroup(groupId, myUserId);
      if (!leaveResult.ok) {
        setError(leaveResult.error);
        return;
      }
      onLeftGroup();
      setGroupNotice("You left the group.");
      router.push("/chats");
    } finally {
      setLeaveBusy(false);
    }
  }

  return (
    <div className="screen-enter fixed inset-x-0 top-0 z-50 flex h-app min-w-0 flex-col overflow-x-hidden md:inset-0 md:items-center md:justify-center md:bg-black/60 md:p-[var(--sp-4)]">
      <button
        type="button"
        aria-label="Close group info"
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
              className="pressable flex h-11 w-11 shrink-0 items-center justify-center text-[var(--text-secondary)]"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <span className="text-[length:var(--text-title)] font-semibold text-[var(--text-primary)]">
              Group info
            </span>
          </div>
        </header>

        <div className="safe-pb min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="px-[var(--sp-4)] py-[var(--sp-6)] text-[length:var(--text-secondary-size)] text-[var(--text-secondary)]">
              Loading…
            </p>
          ) : error && !details ? (
            <p
              className="px-[var(--sp-4)] py-[var(--sp-6)] text-[length:var(--text-secondary-size)] text-[var(--destructive)]"
              role="alert"
            >
              {error}
            </p>
          ) : details ? (
            <div className="mx-auto w-full max-w-md px-[var(--sp-4)] pb-[var(--sp-6)] sm:px-[var(--sp-6)]">
              <div className="flex flex-col items-center pt-[var(--sp-6)]">
                {isAdmin ? (
                  <button
                    type="button"
                    aria-label="Edit group avatar"
                    onClick={() => setEditingAvatar(true)}
                    className="pressable relative flex h-[88px] w-[88px] items-center justify-center"
                  >
                    <GroupAvatar avatarId={details.avatarId} size={88} />
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-white ring-2 ring-[var(--bg)]">
                      <PencilIcon className="h-3.5 w-3.5" />
                    </span>
                  </button>
                ) : (
                  <GroupAvatar avatarId={details.avatarId} size={88} />
                )}

                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => setEditingName(true)}
                    className="pressable mt-[var(--sp-3)] text-center text-[length:var(--text-title-lg)] font-bold leading-tight text-[var(--text-primary)]"
                  >
                    {details.name}
                  </button>
                ) : (
                  <p className="mt-[var(--sp-3)] text-center text-[length:var(--text-title-lg)] font-bold leading-tight text-[var(--text-primary)]">
                    {details.name}
                  </p>
                )}

                <p className="mt-[var(--sp-1)] text-[length:var(--text-secondary-size)] text-[var(--text-secondary)]">
                  {details.members.length === 1
                    ? "1 member"
                    : `${details.members.length} members`}
                </p>
              </div>

              <SettingsSection title="Members">
                {isAdmin ? (
                  <SettingsRow
                    icon={<PersonPlusIcon />}
                    label="Add members"
                    value={
                      slotsLeft > 0
                        ? `${slotsLeft} slot${slotsLeft === 1 ? "" : "s"} left`
                        : "Full"
                    }
                    chevron
                    disabled={slotsLeft === 0}
                    onClick={() => setAddMembersOpen(true)}
                    isLast={false}
                  />
                ) : null}

                {details.members.map((member, index) => {
                  const isSelf = member.userId === myUserId;
                  const isLast =
                    index === details.members.length - 1 && !isAdmin;
                  const label = displayName({
                    username: member.username,
                    nickname: getNickname(member.userId),
                  });

                  return (
                    <div
                      key={member.userId}
                      className={`flex w-full min-h-12 items-center gap-[var(--sp-3)] pl-[var(--sp-4)] pr-[var(--sp-2)] ${
                        index < details.members.length - 1 || isAdmin
                          ? ""
                          : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => void handleMemberTap(member)}
                        disabled={isSelf}
                        className={`row-press-elevated flex min-w-0 flex-1 items-center gap-[var(--sp-3)] py-[var(--sp-3)] text-left ${
                          isSelf ? "cursor-default opacity-100" : ""
                        } ${!isLast ? "border-b border-[var(--divider)]" : ""}`}
                      >
                        <Avatar avatarId={member.avatarId} size={40} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[length:var(--text-body)] font-medium text-[var(--text-primary)]">
                            {label}
                            {isSelf ? " (You)" : ""}
                          </p>
                          {!getNickname(member.userId) ? (
                            <p className="truncate text-[length:var(--text-caption)] text-[var(--text-secondary)]">
                              {formatAtUsername(member.username)}
                            </p>
                          ) : null}
                        </div>
                        {member.role === "admin" ? (
                          <span className="shrink-0 text-[length:var(--text-caption)] text-[var(--text-secondary)]">
                            Admin
                          </span>
                        ) : null}
                      </button>
                      {isAdmin && !isSelf ? (
                        <button
                          type="button"
                          aria-label={`Remove ${member.username}`}
                          onClick={() => setRemoveTarget(member)}
                          className="pressable flex h-11 w-11 shrink-0 items-center justify-center text-[var(--text-secondary)]"
                        >
                          <MinusIcon className="h-5 w-5" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </SettingsSection>

              <div className="mt-[var(--sp-6)] overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)]">
                <SettingsRow
                  label="Leave group"
                  destructive
                  onClick={() => setLeaveOpen(true)}
                  isLast
                />
              </div>

              {error ? (
                <p
                  className="mt-[var(--sp-3)] text-center text-[length:var(--text-secondary-size)] text-[var(--destructive)]"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {editingName && details ? (
          <GroupNameSheet
            initial={details.name}
            onClose={() => setEditingName(false)}
            onSave={async (name) => {
              const result = await updateGroupName(groupId, name);
              if (!result.ok) throw new Error(result.error);
              setDetails((prev) => (prev ? { ...prev, name } : prev));
              onGroupUpdated({ name });
            }}
          />
        ) : null}

        {editingAvatar && details ? (
          <div className="absolute inset-0 z-30 flex items-end justify-center sm:items-center">
            <button
              type="button"
              aria-label="Close avatar picker"
              className="sheet-backdrop-enter absolute inset-0 bg-black/60"
              onClick={() => setEditingAvatar(false)}
            />
            <div className="sheet-panel-enter safe-pb relative z-10 w-full max-w-md rounded-t-[var(--radius-sheet)] bg-[var(--surface-elevated)] sm:rounded-[var(--radius-sheet)]">
              <div className="p-[var(--sp-4)]">
                <p className="text-[length:var(--text-title)] font-semibold text-[var(--text-primary)]">
                  Group avatar
                </p>
                <div className="mt-[var(--sp-3)]">
                  <button
                    type="button"
                    onClick={() => {
                      void (async () => {
                        setAvatarSaving(true);
                        const result = await updateGroupAvatar(groupId, null);
                        setAvatarSaving(false);
                        if (result.ok) {
                          setDetails((prev) =>
                            prev ? { ...prev, avatarId: null } : prev,
                          );
                          onGroupUpdated({ avatarId: null });
                          setEditingAvatar(false);
                        }
                      })();
                    }}
                    className="pressable mb-[var(--sp-3)] rounded-[var(--radius-input)] border border-[var(--divider)] px-[var(--sp-3)] py-[var(--sp-2)] text-[length:var(--text-caption)] text-[var(--text-secondary)]"
                  >
                    Default icon
                  </button>
                  <AvatarPicker
                    value={details.avatarId ?? "aurora"}
                    onChange={(avatarId) => {
                      void (async () => {
                        setAvatarSaving(true);
                        const result = await updateGroupAvatar(groupId, avatarId);
                        setAvatarSaving(false);
                        if (result.ok) {
                          setDetails((prev) =>
                            prev ? { ...prev, avatarId } : prev,
                          );
                          onGroupUpdated({ avatarId });
                          setEditingAvatar(false);
                        }
                      })();
                    }}
                    size={60}
                    showLabels={false}
                    columns="settings"
                  />
                </div>
                {avatarSaving ? (
                  <p className="text-[length:var(--text-secondary-size)] text-[var(--text-secondary)]">
                    Saving…
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {addMembersOpen && details ? (
          <GroupMemberPickerSheet
            title="Add members"
            submitLabel="Add to group"
            maxPick={slotsLeft}
            excludeUserIds={details.members.map((m) => m.userId)}
            slotsLabel={`${slotsLeft} slot${slotsLeft === 1 ? "" : "s"} left`}
            onClose={() => setAddMembersOpen(false)}
            onSubmit={async (memberIds) => {
              const result = await addGroupMembers(groupId, memberIds);
              if (!result.ok) {
                return { ok: false, error: result.error };
              }
              onMembershipChanged();
              await loadDetails();
              return { ok: true };
            }}
          />
        ) : null}

        {promotionOpen && details ? (
          <AdminPromotionSheet
            members={details.members.filter((m) => m.userId !== myUserId)}
            onPromote={(userId) => promoteAndLeave(userId)}
            onClose={() => setPromotionOpen(false)}
          />
        ) : null}

        {leaveOpen && details ? (
          <SettingsConfirmDialog
            title={`Leave ${details.name}?`}
            description="You'll stop receiving new messages. Your message history stays on this device until you close the chat."
            confirmLabel={leaveBusy ? "Leaving…" : "Leave group"}
            cancelLabel="Cancel"
            onConfirm={() => void confirmLeave()}
            onCancel={() => setLeaveOpen(false)}
            confirming={leaveBusy}
            destructive
          />
        ) : null}

        {removeTarget ? (
          <SettingsConfirmDialog
            title="Remove member?"
            description={`Remove ${formatAtUsername(removeTarget.username)} from the group?`}
            confirmLabel={removeBusy ? "Removing…" : "Remove"}
            cancelLabel="Cancel"
            onConfirm={() => {
              void (async () => {
                setRemoveBusy(true);
                try {
                  const result = await removeGroupMember(
                    groupId,
                    removeTarget.userId,
                  );
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setRemoveTarget(null);
                  onMembershipChanged();
                  await loadDetails();
                } finally {
                  setRemoveBusy(false);
                }
              })();
            }}
            onCancel={() => setRemoveTarget(null)}
            confirming={removeBusy}
            destructive
          />
        ) : null}

        {contactTarget ? (
          <ContactDetail
            contactId={contactTarget.userId}
            username={contactTarget.username}
            avatarId={contactTarget.avatarId}
            onClose={() => setContactTarget(null)}
          />
        ) : null}
      </div>
    </div>
  );
}
