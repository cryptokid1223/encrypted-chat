"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AvatarPicker } from "@/components/avatar-picker";
import {
  ChevronLeftIcon,
  InfoIcon,
  KeyIcon,
  MoonIcon,
  PencilIcon,
  PersonIcon,
  QrCodeIcon,
} from "@/components/icons";
import { KeyTransferModal } from "@/components/key-transfer-modal";
import {
  SettingsConfirmDialog,
  SettingsRow,
  SettingsSection,
} from "@/components/settings-ui";
import { useProfile } from "@/components/profile-context";
import { Avatar } from "@/lib/avatars";
import { invalidatePrivateKeyCache, loadPrivateKey } from "@/lib/keystore";
import { createClient } from "@/lib/supabase/client";

const APP_VERSION = "0.1.0";

/** Existing key backup download flow — unchanged behavior. */
async function downloadKeyBackup(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const key = await loadPrivateKey();
    if (!key) {
      return { ok: false, error: "No private key found on this device." };
    }
    const blob = new Blob([key], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "celesth-key-backup.txt";
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not export your key." };
  }
}

export function SettingsPanel() {
  const router = useRouter();
  const { avatarId, username, setAvatarId } = useProfile();
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  async function updateAvatar(nextId: string) {
    if (nextId === avatarId) {
      setEditingAvatar(false);
      return;
    }

    setAvatarSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_id: nextId })
        .eq("id", user.id);

      if (updateError) return;

      setAvatarId(nextId);
      setEditingAvatar(false);
    } finally {
      setAvatarSaving(false);
    }
  }

  async function handleKeyBackup() {
    setBackupError(null);
    setBackupMessage(null);
    const result = await downloadKeyBackup();
    if (result.ok) {
      setBackupMessage("Key backup downloaded.");
    } else {
      setBackupError(result.error);
    }
  }

  async function confirmLogout() {
    setLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      invalidatePrivateKeyCache();
      router.replace("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
      setLogoutOpen(false);
    }
  }

  const displayUsername = username ? `@${username}` : "";

  return (
    <div className="screen-enter flex h-app min-h-0 w-full min-w-0 flex-col overflow-hidden overflow-x-hidden bg-[var(--bg)] md:h-full md:flex-1">
      <header className="safe-pt shrink-0 border-b border-[var(--divider)] bg-[var(--bg)] md:hidden">
        <div className="flex h-[52px] items-center gap-[var(--sp-1)] px-[var(--sp-2)]">
          <Link
            href="/chats"
            aria-label="Back to chats"
            className="pressable flex h-11 w-11 shrink-0 items-center justify-center text-[var(--text-secondary)]"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </Link>
          <span className="text-[length:var(--text-title)] font-semibold text-[var(--text-primary)]">
            Profile
          </span>
        </div>
      </header>

      <div className="safe-pb min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-xl px-[var(--sp-4)] pb-[var(--sp-6)] sm:px-[var(--sp-6)]">
          <div className="flex flex-col items-center pt-[var(--sp-6)]">
            <button
              type="button"
              aria-label="Edit avatar"
              onClick={() => setEditingAvatar(true)}
              className="pressable relative flex h-[88px] w-[88px] items-center justify-center"
            >
              <Avatar avatarId={avatarId} size={88} />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-white ring-2 ring-[var(--bg)]">
                <PencilIcon className="h-3.5 w-3.5" />
              </span>
            </button>
            {displayUsername ? (
              <p className="mt-[var(--sp-3)] text-[length:var(--text-title-lg)] font-bold leading-tight text-[var(--text-primary)]">
                {displayUsername}
              </p>
            ) : null}
          </div>

          <SettingsSection title="Account">
            <SettingsRow
              icon={<PersonIcon />}
              label="Username"
              value={displayUsername || "—"}
              isLast={false}
            />
            <SettingsRow
              icon={<KeyIcon />}
              label="Key backup"
              chevron
              onClick={handleKeyBackup}
              isLast={false}
            />
            <SettingsRow
              icon={<QrCodeIcon />}
              label="Transfer key"
              chevron
              onClick={() => setTransferOpen(true)}
              isLast
            />
          </SettingsSection>

          {backupMessage ? (
            <p
              className="mt-[var(--sp-2)] text-center text-[length:var(--text-secondary-size)] text-[var(--text-secondary)]"
              role="status"
            >
              {backupMessage}
            </p>
          ) : null}
          {backupError ? (
            <p
              className="mt-[var(--sp-2)] text-center text-[length:var(--text-secondary-size)] text-[var(--destructive)]"
              role="alert"
            >
              {backupError}
            </p>
          ) : null}

          <SettingsSection title="Appearance">
            <SettingsRow
              icon={<MoonIcon />}
              label="Theme"
              value="Dark"
              isLast
            />
          </SettingsSection>

          <SettingsSection title="About">
            <SettingsRow
              icon={<InfoIcon />}
              label="Version"
              value={APP_VERSION}
              isLast
            />
          </SettingsSection>

          <div className="mt-[var(--sp-6)] overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)]">
            <SettingsRow
              label="Log out"
              destructive
              onClick={() => setLogoutOpen(true)}
              disabled={loggingOut}
              isLast
            />
          </div>
        </div>
      </div>

      {editingAvatar ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Close avatar picker"
            className="sheet-backdrop-enter absolute inset-0 bg-black/60"
            onClick={() => setEditingAvatar(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="avatar-picker-title"
            className="sheet-panel-enter safe-pb relative z-10 w-full max-w-md rounded-t-[var(--radius-sheet)] bg-[var(--surface-elevated)] sm:rounded-[var(--radius-sheet)]"
          >
            <div className="flex justify-center pt-[var(--sp-2)]">
              <div className="h-1 w-9 rounded-full bg-[var(--divider)]" />
            </div>
            <div className="px-[var(--sp-4)] pt-[var(--sp-3)]">
              <p
                id="avatar-picker-title"
                className="text-[length:var(--text-title)] font-semibold text-[var(--text-primary)]"
              >
                Choose an avatar
              </p>
              <p className="mt-[var(--sp-1)] text-[length:var(--text-secondary-size)] text-[var(--text-secondary)]">
                Pick one of 12 preset avatars
              </p>
            </div>
            <div className="p-[var(--sp-4)]">
              <AvatarPicker
                value={avatarId}
                onChange={updateAvatar}
                size={60}
                showLabels={false}
                columns="settings"
              />
            </div>
            {avatarSaving ? (
              <p className="px-[var(--sp-4)] pb-[var(--sp-2)] text-[length:var(--text-secondary-size)] text-[var(--text-secondary)]">
                Saving…
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setEditingAvatar(false)}
              className="pressable flex min-h-11 w-full items-center justify-center text-[length:var(--text-body)] text-[var(--text-primary)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {transferOpen ? (
        <KeyTransferModal onClose={() => setTransferOpen(false)} />
      ) : null}

      {logoutOpen ? (
        <SettingsConfirmDialog
          title="Log out?"
          description="Make sure you've saved your key backup. Without it you cannot restore your messages."
          confirmLabel={loggingOut ? "Logging out…" : "Log out"}
          cancelLabel="Cancel"
          onConfirm={confirmLogout}
          onCancel={() => setLogoutOpen(false)}
          confirming={loggingOut}
          destructive
        />
      ) : null}
    </div>
  );
}
