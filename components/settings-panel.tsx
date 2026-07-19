"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { loadPrivateKey } from "@/lib/keystore";
import { createClient } from "@/lib/supabase/client";

export function SettingsPanel() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      a.download = "mychat-key-backup.txt";
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
    <div className="mx-auto w-full max-w-lg space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Settings</h1>
        <p className="mt-1 text-sm text-neutral-600">Account and encryption key</p>
      </div>

      <section className="border border-neutral-300 bg-white p-5">
        <h2 className="text-base font-semibold text-neutral-900">Key backup</h2>
        <div className="mt-3 border border-[#EA580C] bg-[#FFF7ED] p-3">
          <p className="text-sm leading-relaxed text-neutral-900">
            Anyone with this file can read your messages. If you lose this file
            and lose this device, your messages are gone forever.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadBackup}
          className="mt-4 border border-[#EA580C] bg-[#EA580C] px-4 py-2.5 text-sm font-medium text-white"
        >
          Download key backup
        </button>
        {message ? (
          <p className="mt-3 text-sm text-neutral-700">{message}</p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <section className="border border-neutral-300 bg-white p-5">
        <h2 className="text-base font-semibold text-neutral-900">Session</h2>
        <button
          type="button"
          onClick={logout}
          disabled={busy}
          className="mt-4 border border-neutral-400 bg-white px-4 py-2.5 text-sm font-medium text-neutral-900 disabled:opacity-40"
        >
          {busy ? "Logging out…" : "Log out"}
        </button>
      </section>
    </div>
  );
}
