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
      <div className="flex min-h-full flex-1 items-center justify-center p-6 text-sm text-neutral-600">
        Loading…
      </div>
    );
  }

  if (!hasKey) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md border border-neutral-300 bg-white p-6">
          <h1 className="text-xl font-semibold text-neutral-900">
            Your encryption key isn&apos;t on this device
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-neutral-700">
            Import your key backup file to decrypt messages on this device.
          </p>
          <label className="mt-6 block">
            <span className="mb-2 block text-sm font-medium text-neutral-800">
              Key backup file
            </span>
            <input
              type="file"
              accept=".txt,text/plain"
              disabled={importing}
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-neutral-800 file:mr-3 file:border file:border-neutral-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-900 hover:file:border-[#EA580C] hover:file:text-[#EA580C]"
            />
          </label>
          {error ? (
            <p className="mt-3 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
