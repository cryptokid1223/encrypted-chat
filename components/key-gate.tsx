"use client";

import { useEffect, useState, type ReactNode } from "react";
import { hasPrivateKey, savePrivateKey } from "@/lib/keystore";

export function KeyGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    hasPrivateKey().then((ok) => {
      if (!cancelled) {
        setHasKey(ok);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onFileChange(file: File | null) {
    if (!file) return;
    setError(null);
    setImporting(true);
    try {
      const text = (await file.text()).trim();
      if (!text) {
        setError("That file is empty.");
        return;
      }
      await savePrivateKey(text);
      setHasKey(true);
    } catch {
      setError("Could not import that key file.");
    } finally {
      setImporting(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-dvh flex-1 items-center justify-center bg-[#0C0A09] p-6 text-sm text-[#A8A29E]">
        Loading…
      </div>
    );
  }

  if (!hasKey) {
    return (
      <div className="safe-pb safe-pt flex min-h-dvh flex-1 items-center justify-center bg-[#0C0A09] p-6">
        <div className="w-full max-w-md rounded-2xl border border-[#292524] bg-[#1C1917] p-6 sm:p-8">
          <p className="text-center text-lg font-semibold tracking-tight text-[#EA580C]">
            Celesth
          </p>
          <h1 className="mt-6 text-xl font-semibold text-[#FAFAF9]">
            Your encryption key isn&apos;t on this device
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[#A8A29E]">
            Import your key backup (
            <span className="text-[#FAFAF9]">celesth-key-backup.txt</span> or an
            older{" "}
            <span className="text-[#FAFAF9]">mychat-key-backup.txt</span>) to
            decrypt messages here.
          </p>

          <label
            className={`mt-6 flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[#292524] bg-[#0C0A09] px-4 py-8 text-center transition-colors duration-150 hover:border-[#EA580C]/60 ${
              importing ? "opacity-60" : ""
            }`}
          >
            <span className="text-sm font-medium text-[#FAFAF9]">
              {importing ? "Importing…" : "Choose key backup file"}
            </span>
            <span className="mt-1 text-xs text-[#78716C]">
              Tap to browse · .txt files
            </span>
            <input
              type="file"
              accept=".txt,text/plain"
              disabled={importing}
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
          </label>

          {error ? (
            <p className="mt-3 text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
