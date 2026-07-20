"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
  SettingsToggleRow,
} from "@/components/settings-ui";
import {
  getAiAssistEnabled,
  setAiAssistEnabled,
} from "@/components/ai-assist-prefs";
import { useProfile } from "@/components/profile-context";
import { useKeyGate } from "@/components/key-gate";
import { Avatar } from "@/lib/avatars";
import { invalidatePrivateKeyCache, loadPrivateKey, removePrivateKey } from "@/lib/keystore";
import { revokeAllAttachmentUrls } from "@/lib/attachmentCache";
import { createClient } from "@/lib/supabase/client";

const APP_VERSION = "0.1.0";

/** Existing key backup download flow — unchanged behavior. */
async function downloadKeyBackup(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "Not signed in." };
    }
    const key = await loadPrivateKey(user.id);
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
  const searchParams = useSearchParams();
  const rawReturnTo = searchParams.get("returnTo");
  const returnTo =
    rawReturnTo?.startsWith("/chats") ? rawReturnTo : "/chats";

  const { avatarId, username, setAvatarId } = useProfile();
  const { requireKeyImport } = useKeyGate();
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [aiAssistEnabled, setAiAssistEnabledState] = useState(true);
  const [removeKeyOpen, setRemoveKeyOpen] = useState(false);
  const [removingKey, setRemovingKey] = useState(false);

  useEffect(() => {
    setAiAssistEnabledState(getAiAssistEnabled());
  }, []);

  const navigateBack = useCallback(() => {
    router.push(returnTo);
  }, [router, returnTo]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (editingAvatar || logoutOpen || transferOpen || removeKeyOpen) return;
      navigateBack();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigateBack, editingAvatar, logoutOpen, transferOpen, removeKeyOpen]);

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
      // Session + in-memory key cache clear; persisted per-user keys stay on device.
      invalidatePrivateKeyCache();
      revokeAllAttachmentUrls();
      router.replace("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
      setLogoutOpen(false);
    }
  }

  async function confirmRemoveKey() {
    setRemovingKey(true);
    setBackupError(null);
    setBackupMessage(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setBackupError("Not signed in.");
        return;
      }
      await removePrivateKey(user.id);
      setRemoveKeyOpen(false);
      setBackupMessage(null);
      requireKeyImport();
    } catch {
      setBackupError("Could not remove the key from this device.");
    } finally {
      setRemovingKey(false);
    }
  }

  const displayUsername = username ? `@${username}` : "";

  return (
    <div className="screen-enter flex h-app min-h-0 w-full min-w-0 flex-col overflow-hidden overflow-x-hidden bg-[var(--bg)] md:h-full md:flex-1">
      <header className="safe-pt shrink-0 border-b border-[var(--divider)] bg-[var(--bg)]">
        <div className="flex h-[52px] items-center gap-[var(--sp-1)] px-[var(--sp-2)]">
          <Link
            href={returnTo}
            aria-label="Back"
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
              isLast={false}
            />
            <SettingsRow
              label="Remove key from this device"
              destructive
              onClick={() => setRemoveKeyOpen(true)}
              isLast
            />
          </SettingsSection>
          <p className="mt-[var(--sp-2)] px-[var(--sp-4)] text-[length:var(--text-caption)] leading-[1.4] text-[var(--text-secondary)]">
            Usually not needed — logging in with your password restores your
            messages.
          </p>

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

          <SettingsSection title="Message assistant">
            <SettingsToggleRow
              label="Message assistant"
              checked={aiAssistEnabled}
              onChange={(next) => {
                setAiAssistEnabled(next);
                setAiAssistEnabledState(next);
                window.dispatchEvent(new Event("ai-assist-pref-changed"));
              }}
              isLast
            />
          </SettingsSection>
          <p className="mt-[var(--sp-2)] px-[var(--sp-4)] text-[length:var(--text-caption)] leading-[1.4] text-[var(--text-secondary)]">
            Rewrites drafts you choose using OpenAI. Sent messages stay end-to-end
            encrypted.
          </p>

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

      {removeKeyOpen ? (
        <SettingsConfirmDialog
          title="Remove key from this device?"
          description="This device will no longer be able to read your messages unless you restore your key. Make sure you have your key backup."
          confirmLabel={removingKey ? "Removing…" : "Remove key"}
          cancelLabel="Cancel"
          onConfirm={() => void confirmRemoveKey()}
          onCancel={() => setRemoveKeyOpen(false)}
          confirming={removingKey}
          destructive
        />
      ) : null}
    </div>
  );
}
