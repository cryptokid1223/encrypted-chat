/**
 * Orchestration for password-wrapped private keys in `public.wrapped_keys`.
 * Calls keyWrap + keystore — does not modify their internals.
 * Never stores or logs passwords / KEKs.
 */

import sodium from "libsodium-wrappers-sumo";
import { wrapPrivateKey, unwrapPrivateKey } from "@/lib/keyWrap";
import {
  fetchPublishedPublicKey,
  hasPrivateKey,
  loadPrivateKey,
  saveKeypairForUser,
} from "@/lib/keystore";
import { publicKeyFromPrivateKey } from "@/lib/crypto";
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
 *  - already_present: device already had a usable key
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
    const privateKey = privateKeyBytesToB64(bytes);
    const publicKey = await publicKeyFromPrivateKey(privateKey);
    const serverKey = await fetchPublishedPublicKey(userId);
    if (!serverKey || serverKey !== publicKey) {
      console.error(
        "[wrappedKeys] restore aborted: unwrapped key does not match published public key",
        { userId },
      );
      return "failed";
    }
    await saveKeypairForUser(
      userId,
      { publicKey, privateKey },
      { expectedServerKey: serverKey },
    );
    return "restored";
  } catch {
    return "failed";
  }
}

const DONE_PREFIX = "wrap_setup_done_";
const DISMISS_PREFIX = "wrap_setup_dismissed_at_";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

/** Per-session: userIds for which wrapped_keys presence was confirmed on the server. */
const sessionConfirmedWrap = new Set<string>();

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
  sessionConfirmedWrap.add(userId);
}

export function dismissWrapSetupBanner(userId: string): void {
  try {
    localStorage.setItem(DISMISS_PREFIX + userId, String(Date.now()));
  } catch {
    // ignore
  }
}

function isDismissCooldownActive(userId: string): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_PREFIX + userId);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

/**
 * Server-trusted check: should the chats-list backfill banner appear?
 *
 * - Queries wrapped_keys (unless this session already confirmed a row AND the
 *   local wrap_setup_done cache is set — short-circuit only).
 * - A stale wrap_setup_done flag alone NEVER suppresses the banner when the
 *   server has no row.
 */
export async function ensureWrappedKey(userId: string): Promise<boolean> {
  if (!(await hasPrivateKey(userId))) return false;

  // Short-circuit only when local cache says done AND we already hit the server
  // successfully this session.
  if (isWrapSetupComplete(userId) && sessionConfirmedWrap.has(userId)) {
    return false;
  }

  const hasRow = await hasWrappedKeyRow(userId);
  if (hasRow) {
    markWrapSetupComplete(userId);
    sessionConfirmedWrap.add(userId);
    return false;
  }

  // No server row → need wrap, regardless of stale local flag.
  if (isDismissCooldownActive(userId)) return false;
  return true;
}

/** @deprecated Prefer ensureWrappedKey — kept as alias for existing callers. */
export async function needsWrapSetupBanner(userId: string): Promise<boolean> {
  return ensureWrappedKey(userId);
}
