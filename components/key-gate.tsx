"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AuthAtmosphere } from "@/components/auth-atmosphere";
import { Logo } from "@/components/logo";
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
      <div className="flex min-h-dvh flex-1 items-center justify-center bg-[#0F0E0D] p-6 text-[13px] text-[#6E6963]">
        Loading…
      </div>
    );
  }

  if (!hasKey) {
    return (
      <div className="relative flex min-h-dvh flex-1 justify-center overflow-y-auto bg-[#0F0E0D] p-4">
        <AuthAtmosphere />
        <div className="safe-pb relative z-10 my-auto w-full max-w-md rounded-3xl border border-[#2E2B28] bg-[#1A1816] p-8">
          <div className="flex justify-center">
            <Logo size="lg" markSize={28} />
          </div>
          <p className="mt-6 text-[20px] font-semibold leading-[1.4] text-[#FAFAF9]">
            Your encryption key isn&apos;t on this device
          </p>
          <p className="mt-2 text-[13px] leading-[1.4] text-[#6E6963]">
            Import your key backup (
            <span className="text-[#FAFAF9]">celesth-key-backup.txt</span> or
            older{" "}
            <span className="text-[#FAFAF9]">mychat-key-backup.txt</span>) to
            decrypt messages here.
          </p>

          <label
            className={`mt-5 flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#2E2B28] bg-[#242220] px-4 py-6 text-center transition-colors duration-150 ease-in-out hover:border-[#EA580C]/50 ${
              importing ? "opacity-60" : ""
            }`}
          >
            <span className="text-[14px] font-medium text-[#FAFAF9]">
              {importing ? "Importing…" : "Choose key backup file"}
            </span>
            <span className="mt-1 text-[12px] text-[#6E6963]">
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
            <p className="mt-3 text-[13px] text-red-400" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
