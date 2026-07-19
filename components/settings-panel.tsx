"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AvatarPicker } from "@/components/avatar-picker";
import { DEFAULT_AVATAR_ID } from "@/lib/avatars";
import { loadPrivateKey } from "@/lib/keystore";
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
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Could not log out.");
      setBusy(false);
    }
  }

  return (
    <div className="safe-pb safe-pt flex h-full min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-lg space-y-6 p-4 sm:p-6">
        <div>
          <Link
            href="/chats"
            className="mb-3 inline-flex text-sm font-medium text-[#A8A29E] transition-colors duration-150 hover:text-[#FAFAF9] md:hidden"
          >
            ← Chats
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-[#FAFAF9]">
            Settings
          </h1>
          <p className="mt-1 text-sm text-[#A8A29E]">
            Profile and encryption key
          </p>
        </div>

        <section className="rounded-2xl border border-[#292524] bg-[#1C1917] p-5">
          <h2 className="text-base font-semibold text-[#FAFAF9]">Avatar</h2>
          <p className="mt-1 text-sm text-[#A8A29E]">
            Shown next to your username in chats
          </p>
          <div className="mt-4">
            <AvatarPicker value={avatarId} onChange={updateAvatar} />
          </div>
          {avatarSaving ? (
            <p className="mt-3 text-sm text-[#A8A29E]">Saving…</p>
          ) : avatarMessage ? (
            <p className="mt-3 text-sm text-[#A8A29E]">{avatarMessage}</p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-[#292524] bg-[#1C1917] p-5">
          <h2 className="text-base font-semibold text-[#FAFAF9]">Key backup</h2>
          <div className="mt-3 rounded-2xl border border-[#78350F]/50 bg-[#451A03] p-3">
            <p className="text-sm leading-relaxed text-[#FBBF24]/90">
              Anyone with this file can read your messages. If you lose this
              file and lose this device, your messages are gone forever.
            </p>
          </div>
          <button
            type="button"
            onClick={downloadBackup}
            className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl bg-[#EA580C] px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#C2410C] sm:w-auto"
          >
            Download key backup
          </button>
          {message ? (
            <p className="mt-3 text-sm text-[#A8A29E]">{message}</p>
          ) : null}
          {error ? (
            <p className="mt-3 text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-[#292524] bg-[#1C1917] p-5">
          <h2 className="text-base font-semibold text-[#FAFAF9]">Session</h2>
          <button
            type="button"
            onClick={logout}
            disabled={busy}
            className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl px-4 text-sm font-medium text-[#A8A29E] transition-colors duration-150 hover:bg-[#292524] hover:text-[#FAFAF9] disabled:opacity-40 sm:w-auto"
          >
            {busy ? "Logging out…" : "Log out"}
          </button>
        </section>
      </div>
    </div>
  );
}
