"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { AuthAtmosphere } from "@/components/auth-atmosphere";
import { Logo } from "@/components/logo";
import {
  hasPrivateKey,
  invalidatePrivateKeyCache,
  savePrivateKey,
} from "@/lib/keystore";
import { createClient } from "@/lib/supabase/client";

const GATE_SAFETY_MS = 6000;
const CHECK_NOTICE =
  "Couldn't check for your encryption key on this device";

type KeyGateContextValue = {
  hasKey: boolean;
  /** Force the import screen (e.g. after encrypt fails with a missing key). */
  requireKeyImport: () => void;
};

const KeyGateContext = createContext<KeyGateContextValue>({
  hasKey: false,
  requireKeyImport: () => {},
});

export function useKeyGate(): KeyGateContextValue {
  return useContext(KeyGateContext);
}

export function KeyGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [checkNotice, setCheckNotice] = useState<string | null>(null);
  const settledRef = useRef(false);

  const settle = useCallback(
    (ok: boolean, notice: string | null = null) => {
      if (settledRef.current) return;
      settledRef.current = true;
      setHasKey(ok);
      if (notice) setCheckNotice(notice);
      setReady(true);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    const safety = setTimeout(() => {
      if (cancelled || settledRef.current) return;
      console.warn(
        "[key-gate] key detection exceeded 6s; showing import screen",
      );
      settle(false, CHECK_NOTICE);
    }, GATE_SAFETY_MS);

    void (async () => {
      try {
        const ok = await hasPrivateKey();
        if (!cancelled) settle(ok);
      } catch {
        if (!cancelled) settle(false, CHECK_NOTICE);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(safety);
    };
  }, [settle]);

  const requireKeyImport = useCallback(() => {
    settledRef.current = true;
    setFlash("Your encryption key isn't on this device");
    setHasKey(false);
    setReady(true);
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
      const ok = await hasPrivateKey();
      if (!ok) {
        setError("Key did not save. Try again.");
        setHasKey(false);
        return;
      }
      setHasKey(true);
      setFlash(null);
      setCheckNotice(null);
    } catch {
      setError("Could not import that key file.");
      setHasKey(false);
    } finally {
      setImporting(false);
    }
  }

  async function logout() {
    setLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      // New session/account should not reuse the previous in-memory decrypted key.
      invalidatePrivateKeyCache();
      router.replace("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
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
      <KeyGateContext.Provider value={{ hasKey: false, requireKeyImport }}>
        <div className="safe-px relative flex min-h-dvh flex-1 justify-center overflow-y-auto bg-[#0F0E0D] p-4">
          {flash ? (
            <div
              role="status"
              className="fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-50 max-w-[90vw] -translate-x-1/2 rounded-xl border border-[#2E2B28] bg-[#1A1816] px-4 py-2.5 text-[13px] text-[#FAFAF9]"
            >
              {flash}
            </div>
          ) : null}
          <AuthAtmosphere />
          <div className="safe-pb safe-pt relative z-10 my-auto w-full max-w-md rounded-3xl border border-[#2E2B28] bg-[#1A1816] p-8">
            <div className="flex justify-center">
              <Logo size="lg" markSize={28} />
            </div>
            <p className="mt-6 text-[20px] font-semibold leading-[1.4] text-[#FAFAF9]">
              Your encryption key isn&apos;t on this device
            </p>
            {checkNotice ? (
              <p
                className="mt-2 text-[13px] leading-[1.4] text-amber-400/90"
                role="status"
              >
                {checkNotice}
              </p>
            ) : null}
            <p className="mt-2 text-[13px] leading-[1.4] text-[#6E6963]">
              Signed in on a new device? Import the key backup you downloaded, or
              log out and create a new account.
            </p>
            <p className="mt-2 text-[12px] leading-[1.4] text-[#6E6963]">
              Accepts{" "}
              <span className="text-[#FAFAF9]">celesth-key-backup.txt</span> or
              older{" "}
              <span className="text-[#FAFAF9]">mychat-key-backup.txt</span>.
            </p>

            <label
              className={`mt-5 flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#2E2B28] bg-[#242220] px-4 py-6 text-center transition-colors duration-150 ease-in-out hover:border-[#EA580C]/50 ${
                importing ? "opacity-60" : ""
              }`}
            >
              <span className="text-[14px] font-medium text-[#FAFAF9]">
                {importing ? "Importing…" : "Import key backup"}
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

            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              className="mt-5 w-full text-center text-[13px] font-medium text-[#6E6963] transition-colors duration-150 ease-in-out hover:text-red-400 disabled:opacity-40"
            >
              {loggingOut ? "Logging out…" : "Log out"}
            </button>
          </div>
        </div>
      </KeyGateContext.Provider>
    );
  }

  return (
    <KeyGateContext.Provider value={{ hasKey: true, requireKeyImport }}>
      {children}
    </KeyGateContext.Provider>
  );
}
