"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AvatarPicker } from "@/components/avatar-picker";
import { ChevronLeftIcon } from "@/components/icons";
import { DEFAULT_AVATAR_ID } from "@/lib/avatars";
import {
  invalidatePrivateKeyCache,
  loadPrivateKey,
} from "@/lib/keystore";
import { createClient } from "@/lib/supabase/client";

export function SettingsPanel() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [avatarId, setAvatarId] = useState(DEFAULT_AVATAR_ID);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data } = await supabase
        .from("profiles")
        .select("avatar_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!cancelled && data?.avatar_id) {
        setAvatarId(data.avatar_id as string);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function updateAvatar(nextId: string) {
    setAvatarId(nextId);
    setAvatarMessage(null);
    setAvatarSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setAvatarMessage("Not signed in.");
        return;
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_id: nextId })
        .eq("id", user.id);

      if (updateError) {
        setAvatarMessage("Could not update avatar.");
        return;
      }
      setAvatarMessage("Avatar updated.");
    } catch {
      setAvatarMessage("Could not update avatar.");
    } finally {
      setAvatarSaving(false);
    }
  }

  async function downloadBackup() {
    setError(null);
    setMessage(null);
    try {
      const key = await loadPrivateKey();
      if (!key) {
        setError("No private key found on this device.");
        return;
      }
      const blob = new Blob([key], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "celesth-key-backup.txt";
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Key backup downloaded.");
    } catch {
      setError("Could not export your key.");
    }
  }

  async function logout() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      // New session/account should not reuse the previous in-memory decrypted key.
      invalidatePrivateKeyCache();
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Could not log out.");
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-[#0F0E0D]">
      <div className="safe-pt sticky top-0 z-10 border-b border-[#2E2B28] bg-[#1A1816] md:hidden">
        <div className="flex h-12 items-center gap-1 px-2">
          <Link
            href="/chats"
            aria-label="Back to chats"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#6E6963] transition-colors duration-150 ease-in-out hover:bg-[#242220] hover:text-[#FAFAF9]"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </Link>
          <span className="text-[14px] font-medium text-[#FAFAF9]">Settings</span>
        </div>
      </div>

      <div className="safe-pb mx-auto w-full max-w-xl space-y-4 p-4 sm:p-6">
        <p className="hidden text-[13px] text-[#6E6963] md:block">
          Profile and encryption key
        </p>

        <section className="rounded-2xl border border-[#2E2B28] bg-[#1A1816] p-5">
          <h2 className="text-[13px] font-medium uppercase tracking-wide text-[#6E6963]">
            Avatar
          </h2>
          <div className="mt-3">
            <AvatarPicker
              value={avatarId}
              onChange={updateAvatar}
              size={48}
              showLabels={false}
              columns="settings"
            />
          </div>
          {avatarSaving ? (
            <p className="mt-2 text-[13px] text-[#6E6963]">Saving…</p>
          ) : avatarMessage ? (
            <p className="mt-2 text-[13px] text-[#6E6963]">{avatarMessage}</p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-[#2E2B28] bg-[#1A1816] p-5">
          <h2 className="text-[13px] font-medium uppercase tracking-wide text-[#6E6963]">
            Key backup
          </h2>
          <p className="mt-2 text-[14px] leading-[1.4] text-[#FAFAF9]/90">
            Your encryption key only exists on this device. This backup file
            lets you read your messages if you switch devices.
          </p>
          <div className="mt-3 rounded-xl border border-[#78350F]/40 bg-[#451A03] p-3">
            <p className="text-[13px] leading-[1.4] text-[#FBBF24]/90">
              Anyone with this file can read your messages. If you lose this
              file and lose this device, your messages are gone forever.
            </p>
          </div>
          <button
            type="button"
            onClick={downloadBackup}
            className="mt-3 flex h-10 items-center justify-center rounded-xl bg-[#EA580C] px-4 text-[13px] font-medium text-white transition-colors duration-150 ease-in-out hover:bg-[#C2410C]"
          >
            Download key backup
          </button>
          {message ? (
            <p className="mt-2 text-[13px] text-[#6E6963]">{message}</p>
          ) : null}
          {error ? (
            <p className="mt-2 text-[13px] text-red-400" role="alert">
              {error}
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-[#2E2B28] bg-[#1A1816] p-5">
          <h2 className="text-[13px] font-medium uppercase tracking-wide text-[#6E6963]">
            Session
          </h2>
          <button
            type="button"
            onClick={logout}
            disabled={busy}
            className="mt-3 text-[14px] font-medium text-[#6E6963] transition-colors duration-150 ease-in-out hover:text-red-400 disabled:opacity-40"
          >
            {busy ? "Logging out…" : "Log out"}
          </button>
        </section>
      </div>
    </div>
  );
}
