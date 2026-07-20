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
import {
  AuthBrandHeader,
  AuthPrimaryButton,
} from "@/components/auth-ui";
import { KeyQrScanner } from "@/components/key-qr-scanner";
import {
  hasPrivateKey,
  invalidatePrivateKeyCache,
  savePrivateKey,
} from "@/lib/keystore";
import { revokeAllAttachmentUrls } from "@/lib/attachmentCache";
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
  const [scanOpen, setScanOpen] = useState(false);
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
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) settle(false);
          return;
        }
        const ok = await hasPrivateKey(user.id);
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

  const importKeyBackup = useCallback(async (text: string): Promise<boolean> => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("That file is empty.");
      return false;
    }
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Not signed in.");
      return false;
    }
    await savePrivateKey(trimmed, user.id);
    const ok = await hasPrivateKey(user.id);
    if (!ok) {
      setHasKey(false);
      return false;
    }
    setHasKey(true);
    setFlash(null);
    setCheckNotice(null);
    setError(null);
    return true;
  }, []);

  async function onFileChange(file: File | null) {
    if (!file) return;
    setError(null);
    setImporting(true);
    try {
      const text = await file.text();
      const ok = await importKeyBackup(text);
      if (!ok) {
        setError("Key did not save. Try again.");
      }
    } catch {
      setError("Could not import that key file.");
      setHasKey(false);
    } finally {
      setImporting(false);
    }
  }

  const handleQrDecoded = useCallback(
    async (text: string) => {
      setError(null);
      setImporting(true);
      try {
        const ok = await importKeyBackup(text);
        if (ok) {
          setScanOpen(false);
        }
        return ok;
      } catch {
        setHasKey(false);
        return false;
      } finally {
        setImporting(false);
      }
    },
    [importKeyBackup],
  );

  async function logout() {
    setLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      // New session/account should not reuse the previous in-memory decrypted key.
      invalidatePrivateKeyCache();
      revokeAllAttachmentUrls();
      router.replace("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-[var(--bg)] p-6 text-[13px] text-[var(--text-secondary)]">
        Loading…
      </div>
    );
  }

  if (!hasKey) {
    return (
      <KeyGateContext.Provider value={{ hasKey: false, requireKeyImport }}>
        <div className="relative flex h-app min-h-0 flex-1 flex-col overflow-hidden bg-[var(--bg)]">
          <div className="safe-pb mx-auto flex min-h-0 w-full max-w-[400px] flex-1 flex-col overflow-y-auto px-6 pt-[max(calc(var(--safe-top)+1.25rem),12vh)]">
            {flash ? (
              <div
                role="status"
                className="fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-50 max-w-[90vw] -translate-x-1/2 rounded-[12px] border border-[var(--auth-input-border)] bg-[var(--surface)] px-4 py-2.5 text-[13px] text-[var(--text-primary)]"
              >
                {flash}
              </div>
            ) : null}

            <AuthBrandHeader subtitle="Private messaging. End-to-end encrypted." />

            <h1 className="mt-[var(--sp-6)] text-[22px] font-bold leading-tight tracking-tight text-[var(--text-primary)]">
              Restore your encryption key
            </h1>
            <p className="mt-2 text-[15px] leading-[1.4] text-[var(--text-secondary)]">
              This device doesn&apos;t have your key. Import a backup or scan a
              QR from your other device.
            </p>
            {checkNotice ? (
              <p
                className="mt-2 text-[13px] leading-[1.4] text-[var(--strength-ok)]"
                role="status"
              >
                {checkNotice}
              </p>
            ) : null}

            <div className="mt-[var(--sp-6)]">
              <AuthPrimaryButton
                type="button"
                loading={importing}
                disabled={importing}
                onClick={() => {
                  document.getElementById("key-gate-file-input")?.click();
                }}
              >
                Import key backup
              </AuthPrimaryButton>
              <input
                id="key-gate-file-input"
                type="file"
                accept=".txt,text/plain"
                disabled={importing}
                onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
                className="sr-only"
              />

              <button
                type="button"
                disabled={importing}
                onClick={() => setScanOpen(true)}
                className="pressable mt-4 w-full text-center text-[15px] font-medium text-[var(--accent)] disabled:opacity-40"
              >
                Scan QR code
              </button>

              {error ? (
                <p className="mt-3 text-[13px] text-[var(--danger)]" role="alert">
                  {error}
                </p>
              ) : null}

              <button
                type="button"
                onClick={logout}
                disabled={loggingOut}
                className="pressable mt-6 w-full text-center text-[15px] font-medium text-[var(--text-secondary)] disabled:opacity-40"
              >
                {loggingOut ? "Logging out…" : "Log out"}
              </button>
            </div>
          </div>

          {scanOpen ? (
            <KeyQrScanner
              onDecoded={handleQrDecoded}
              onCancel={() => setScanOpen(false)}
            />
          ) : null}
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
