/**
 * Orchestration for password-wrapped private keys in `public.wrapped_keys`.
 * Calls keyWrap + keystore — does not modify their internals.
 * Never stores or logs passwords / KEKs.
 */

import sodium from "libsodium-wrappers-sumo";
import { wrapPrivateKey, unwrapPrivateKey } from "@/lib/keyWrap";
import { hasPrivateKey, loadPrivateKey, savePrivateKey } from "@/lib/keystore";
import { createClient } from "@/lib/supabase/client";

const B64 = () => sodium.base64_variants.ORIGINAL;

const WRAP_VERSION = 1;

export type WrappedKeyRow = {
  user_id: string;
  wrapped_key: string;
  kdf_salt: string;
  kdf_ops: number;
  kdf_mem: number;
  nonce: string;
  v: number;
};

async function readySodium(): Promise<void> {
  await sodium.ready;
}

function privateKeyB64ToBytes(privateKeyB64: string): Uint8Array {
  return sodium.from_base64(privateKeyB64, B64());
}

function privateKeyBytesToB64(bytes: Uint8Array): string {
  return sodium.to_base64(bytes, B64());
}

/** True if this user already has a wrapped_keys row. */
export async function hasWrappedKeyRow(userId: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("wrapped_keys")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return false;
  return Boolean(data);
}

/**
 * Wrap the given private key (base64) with password and upsert into wrapped_keys.
 * Does not throw on DB failure — returns ok:false so callers can continue.
 */
export async function upsertWrappedKeyForUser(
  userId: string,
  privateKeyB64: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await readySodium();
    const bytes = privateKeyB64ToBytes(privateKeyB64);
    const wrapped = await wrapPrivateKey(bytes, password);

    const supabase = createClient();
    const { error } = await supabase.from("wrapped_keys").upsert(
      {
        user_id: userId,
        wrapped_key: wrapped.wrapped,
        kdf_salt: wrapped.salt,
        kdf_ops: wrapped.ops,
        kdf_mem: wrapped.mem,
        nonce: wrapped.nonce,
        v: WRAP_VERSION,
      },
      { onConflict: "user_id" },
    );

    if (error) {
      return { ok: false, error: "Could not save password restore data." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not wrap encryption key." };
  }
}

/**
 * Load local key for userId, wrap with password, upsert.
 * Used by the backfill banner after password is verified.
 */
export async function wrapAndUploadLocalKey(
  userId: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const privateKeyB64 = await loadPrivateKey(userId);
  if (!privateKeyB64) {
    return { ok: false, error: "No encryption key on this device." };
  }
  return upsertWrappedKeyForUser(userId, privateKeyB64, password);
}

/**
 * If no local key, fetch wrapped_keys and unwrap with password into keystore.
 * Returns:
 *  - restored: unwrapped + saved
 *  - already_present: device already had the key
 *  - missing_row: no wrapped_keys row (fall through to QR/file restore)
 *  - failed: unwrap/save failed (fall through to restore)
 */
export async function tryRestoreKeyFromPassword(
  userId: string,
  password: string,
): Promise<"restored" | "already_present" | "missing_row" | "failed"> {
  if (await hasPrivateKey(userId)) {
    return "already_present";
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("wrapped_keys")
    .select("wrapped_key, kdf_salt, kdf_ops, kdf_mem, nonce")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return "missing_row";
  }

  try {
    await readySodium();
    const bytes = await unwrapPrivateKey(
      data.wrapped_key as string,
      data.kdf_salt as string,
      data.nonce as string,
      data.kdf_ops as number,
      data.kdf_mem as number,
      password,
    );
    await savePrivateKey(privateKeyBytesToB64(bytes), userId);
    return "restored";
  } catch {
    return "failed";
  }
}

const DONE_PREFIX = "wrap_setup_done_";
const DISMISS_PREFIX = "wrap_setup_dismissed_at_";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

export function isWrapSetupComplete(userId: string): boolean {
  try {
    return localStorage.getItem(DONE_PREFIX + userId) === "1";
  } catch {
    return false;
  }
}

export function markWrapSetupComplete(userId: string): void {
  try {
    localStorage.setItem(DONE_PREFIX + userId, "1");
    localStorage.removeItem(DISMISS_PREFIX + userId);
  } catch {
    // ignore
  }
}

export function dismissWrapSetupBanner(userId: string): void {
  try {
    localStorage.setItem(DISMISS_PREFIX + userId, String(Date.now()));
  } catch {
    // ignore
  }
}

export function shouldShowWrapSetupBanner(userId: string): boolean {
  if (isWrapSetupComplete(userId)) return false;
  try {
    const raw = localStorage.getItem(DISMISS_PREFIX + userId);
    if (!raw) return true;
    const at = Number(raw);
    if (!Number.isFinite(at)) return true;
    return Date.now() - at >= DISMISS_MS;
  } catch {
    return true;
  }
}

/**
 * Decide whether the chats-list backfill banner should appear.
 * Requires local key and no wrapped_keys row.
 */
export async function needsWrapSetupBanner(userId: string): Promise<boolean> {
  if (!shouldShowWrapSetupBanner(userId)) return false;
  if (!(await hasPrivateKey(userId))) return false;
  if (await hasWrappedKeyRow(userId)) {
    markWrapSetupComplete(userId);
    return false;
  }
  return true;
}
