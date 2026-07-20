"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AvatarPicker } from "@/components/avatar-picker";
import { KeyTransferModal } from "@/components/key-transfer-modal";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
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

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-[12px] font-medium uppercase tracking-wide text-[#6E6963]">
        {title}
      </h2>
      <div className="overflow-hidden rounded-2xl border border-[#2E2B28] bg-[#1A1816]">
        {children}
      </div>
    </section>
  );
}

function SettingsRow({
  label,
  value,
  onClick,
  chevron = false,
  destructive = false,
  disabled = false,
}: {
  label: string;
  value?: string;
  onClick?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-150 ease-in-out ${
        onClick
          ? destructive
            ? "text-red-400 hover:bg-[#242220]/50 active:bg-[#242220]"
            : "text-[#FAFAF9] hover:bg-[#242220]/50 active:bg-[#242220]"
          : "text-[#FAFAF9]"
      } disabled:opacity-40`}
    >
      <span
        className={`text-[15px] ${destructive ? "font-medium text-red-400" : ""}`}
      >
        {label}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {value ? (
          <span className="text-[14px] text-[#6E6963]">{value}</span>
        ) : null}
        {chevron ? (
          <ChevronRightIcon className="h-4 w-4 text-[#6E6963]" />
        ) : null}
      </span>
    </Tag>
  );
}

function RowDivider() {
  return <div className="mx-4 h-px bg-[#2E2B28]" />;
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
    <div className="flex h-app min-h-0 w-full flex-col overflow-hidden bg-[#0F0E0D] md:h-full md:flex-1">
      <header className="safe-pt shrink-0 border-b border-[#2E2B28] bg-[#1A1816] md:hidden">
        <div className="flex h-12 items-center gap-1 px-2">
          <Link
            href="/chats"
            aria-label="Back to chats"
            className="flex h-11 w-11 items-center justify-center rounded-full text-[#6E6963] transition-colors duration-150 ease-in-out hover:bg-[#242220] hover:text-[#FAFAF9]"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </Link>
          <span className="text-[15px] font-semibold text-[#FAFAF9]">
            Profile
          </span>
        </div>
      </header>

      <div className="safe-pb min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-xl space-y-6 p-4 sm:p-6">
        <div className="flex flex-col items-center pt-4 md:pt-6">
          <button
            type="button"
            aria-label="Edit avatar"
            onClick={() => setEditingAvatar(true)}
            className="group relative rounded-full transition-opacity duration-150 ease-in-out active:opacity-80"
          >
            <Avatar avatarId={avatarId} size={96} />
            <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#1A1816] bg-[#EA580C] text-white">
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
                <path
                  d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0 0-3L16.5 4.5a2.1 2.1 0 0 0-3 0L3 15v5z"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
          {displayUsername ? (
            <p className="mt-4 text-[22px] font-semibold leading-[1.3] text-[#FAFAF9]">
              {displayUsername}
            </p>
          ) : null}
        </div>

        <SettingsSection title="Account">
          <SettingsRow label="Username" value={displayUsername || "—"} />
          <RowDivider />
          <SettingsRow
            label="Key backup"
            chevron
            onClick={handleKeyBackup}
          />
          <RowDivider />
          <SettingsRow
            label="Transfer key to another device"
            chevron
            onClick={() => setTransferOpen(true)}
          />
        </SettingsSection>

        {backupMessage ? (
          <p className="text-center text-[13px] text-[#6E6963]" role="status">
            {backupMessage}
          </p>
        ) : null}
        {backupError ? (
          <p className="text-center text-[13px] text-red-400" role="alert">
            {backupError}
          </p>
        ) : null}

        <SettingsSection title="Appearance">
          <SettingsRow label="Theme" value="Dark" />
        </SettingsSection>

        <SettingsSection title="About">
          <SettingsRow label="Version" value={APP_VERSION} />
        </SettingsSection>

        <div className="overflow-hidden rounded-2xl border border-[#2E2B28] bg-[#1A1816]">
          <SettingsRow
            label="Log out"
            destructive
            onClick={() => setLogoutOpen(true)}
            disabled={loggingOut}
          />
        </div>
      </div>
      </div>

      {editingAvatar ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Close avatar picker"
            className="absolute inset-0 bg-black/60"
            onClick={() => setEditingAvatar(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="avatar-picker-title"
            className="safe-pb relative z-10 w-full max-w-md rounded-t-2xl border border-[#2E2B28] bg-[#1A1816] p-5 sm:rounded-2xl"
          >
            <p
              id="avatar-picker-title"
              className="text-[15px] font-semibold text-[#FAFAF9]"
            >
              Choose an avatar
            </p>
            <p className="mt-1 text-[13px] text-[#6E6963]">
              Pick one of 12 preset avatars
            </p>
            <div className="mt-4">
              <AvatarPicker
                value={avatarId}
                onChange={updateAvatar}
                size={48}
                showLabels={false}
                columns="settings"
              />
            </div>
            {avatarSaving ? (
              <p className="mt-3 text-[13px] text-[#6E6963]">Saving…</p>
            ) : null}
            <button
              type="button"
              onClick={() => setEditingAvatar(false)}
              className="mt-4 flex min-h-[44px] w-full items-center justify-center rounded-xl text-[14px] font-medium text-[#6E6963] transition-colors duration-150 ease-in-out hover:bg-[#242220] hover:text-[#FAFAF9]"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/60"
            onClick={() => setLogoutOpen(false)}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="logout-title"
            aria-describedby="logout-desc"
            className="relative z-10 w-full max-w-sm rounded-2xl border border-[#2E2B28] bg-[#1A1816] p-5"
          >
            <p
              id="logout-title"
              className="text-[17px] font-semibold text-[#FAFAF9]"
            >
              Log out?
            </p>
            <p
              id="logout-desc"
              className="mt-2 text-[14px] leading-[1.4] text-[#6E6963]"
            >
              Make sure you&apos;ve saved your key backup. Without it you cannot
              restore your messages.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setLogoutOpen(false)}
                disabled={loggingOut}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl text-[14px] font-medium text-[#6E6963] transition-colors duration-150 ease-in-out hover:bg-[#242220] hover:text-[#FAFAF9] disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmLogout}
                disabled={loggingOut}
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-red-600 text-[14px] font-medium text-white transition-colors duration-150 ease-in-out hover:bg-red-700 disabled:opacity-40"
              >
                {loggingOut ? "Logging out…" : "Log out"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
