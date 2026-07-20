/**
 * Private key storage — IndexedDB on web, iOS Keychain on native.
 *
 * Keys are namespaced per Supabase user id so multiple accounts on one device
 * do not overwrite each other. Logout clears only the in-memory cache.
 *
 * The private key is stored only on this device.
 * It must NEVER be sent to Supabase or any server.
 *
 * All key persistence goes through saveKeypairForUser (or generateKeyPairForNewAccount
 * which calls it). Direct SecureStoragePlugin.set / IndexedDB puts are private.
 */

import { Capacitor } from "@capacitor/core";
import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";
import { generateKeyPair, publicKeyFromPrivateKey } from "@/lib/crypto";
import { createClient } from "@/lib/supabase/client";

const DB_NAME = "cipher-keystore";
const STORE_NAME = "keys";

/** Legacy single-slot keys (pre-namespacing). Migrated on first successful load. */
const LEGACY_IDB_KEY = "privateKey";
const LEGACY_SECURE_KEY = "chat_private_key";

/** Hard cap for native plugin calls as a last-resort hang guard. */
const NATIVE_TIMEOUT_MS = 3000;

let backendLogged = false;

/**
 * Decide Keychain vs IndexedDB at call time (not module init).
 * Capacitor's bridge / plugin registry may not be ready when this module first
 * evaluates; a one-shot const would permanently pick the wrong backend.
 */
function useNativeBackend(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      Capacitor.isNativePlatform() &&
      Capacitor.isPluginAvailable("SecureStoragePlugin")
    );
  } catch {
    return false;
  }
}

function logBackendOnce(native: boolean): void {
  if (backendLogged || typeof window === "undefined") return;
  backendLogged = true;
  console.log(
    native
      ? "[keystore] backend: keychain"
      : "[keystore] backend: indexeddb(web)",
  );
}

function storageKeyForUser(userId: string): string {
  return `celesth_pk_${userId}`;
}

function errMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return String(err);
}

/** Plugin rejects with this when the Keychain/SharedPreferences slot is empty. */
function isMissingKeyError(err: unknown): boolean {
  const msg = errMessage(err).toLowerCase();
  return msg.includes("does not exist") || msg.includes("not found");
}

function timeoutError(label: string): Error {
  return new Error(`${label} timed out after ${NATIVE_TIMEOUT_MS}ms`);
}

function withTimeout<T>(label: string, work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(timeoutError(label)), NATIVE_TIMEOUT_MS);
    }),
  ]);
}

// ── Typed errors ─────────────────────────────────────────────────

export class KeyMismatchError extends Error {
  readonly name = "KeyMismatchError";
  constructor(message: string) {
    super(message);
  }
}

export class KeyGenerationBlockedError extends Error {
  readonly name = "KeyGenerationBlockedError";
  constructor(message: string) {
    super(message);
  }
}

export type Keypair = {
  publicKey: string;
  privateKey: string;
};

export type KeySessionResult =
  | { status: "ready" }
  | {
      status: "restore_needed";
      reason: "missing" | "mismatch";
      message: string;
    }
  | {
      status: "unprovisioned";
      message: string;
    };

// ── IndexedDB (web + native migration source) ────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open IndexedDB"));
  });
}

async function idbSave(slot: string, base64: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(base64, slot);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Failed to save private key"));
    };
  });
}

async function idbLoad(slot: string): Promise<string | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(slot);
      request.onsuccess = () => {
        db.close();
        resolve((request.result as string | undefined) ?? null);
      };
      request.onerror = () => {
        db.close();
        reject(request.error ?? new Error("Failed to load private key"));
      };
    });
  } catch {
    return null;
  }
}

async function idbDelete(slot: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(slot);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error("Failed to delete IndexedDB key"));
      };
    });
  } catch {
    // ignore
  }
}

// ── Keychain (native) ────────────────────────────────────────────

/**
 * Load from Keychain. A plugin throw for a missing key means "no key stored"
 * (return null). Plugin unavailability is a hard failure.
 */
async function secureLoad(slot: string): Promise<string | null> {
  if (!Capacitor.isPluginAvailable("SecureStoragePlugin")) {
    throw new Error("SecureStoragePlugin is not available");
  }
  try {
    const { value } = await withTimeout(
      "SecureStoragePlugin.get",
      SecureStoragePlugin.get({ key: slot }),
    );
    return value && value.length > 0 ? value : null;
  } catch (err) {
    // Missing key → empty slot, not a plugin failure.
    if (isMissingKeyError(err)) return null;
    console.error(
      `[keystore] SecureStoragePlugin.get failed for ${slot}: ${errMessage(err)}`,
    );
    throw err;
  }
}

async function secureSave(slot: string, base64: string): Promise<void> {
  if (!Capacitor.isPluginAvailable("SecureStoragePlugin")) {
    throw new Error("SecureStoragePlugin is not available");
  }
  try {
    await withTimeout(
      "SecureStoragePlugin.set",
      SecureStoragePlugin.set({ key: slot, value: base64 }),
    );
  } catch (err) {
    console.error(
      `[keystore] SecureStoragePlugin.set failed for ${slot}: ${errMessage(err)}`,
    );
    throw new Error(`Could not save encryption key: ${errMessage(err)}`);
  }
}

async function secureRemove(slot: string): Promise<void> {
  if (!Capacitor.isPluginAvailable("SecureStoragePlugin")) {
    return;
  }
  try {
    await withTimeout(
      "SecureStoragePlugin.remove",
      SecureStoragePlugin.remove({ key: slot }),
    );
  } catch (err) {
    if (isMissingKeyError(err)) return;
    console.error(
      `[keystore] SecureStoragePlugin.remove failed for ${slot}: ${errMessage(err)}`,
    );
  }
}

let legacyMigrationWarned = false;

function warnLegacyMigration(userId: string): void {
  if (legacyMigrationWarned) return;
  legacyMigrationWarned = true;
  console.warn(
    "[keystore] Migrated legacy global private key into namespaced slot. " +
      "Ownership was not verified; if decrypt fails for this account, restore from backup.",
    { userId },
  );
}

/**
 * Sole storage write path for private-key bytes.
 * Callers must go through saveKeypairForUser (or legacy migration helpers).
 */
async function writePrivateKeyToStorage(
  userId: string,
  base64: string,
): Promise<void> {
  const slot = storageKeyForUser(userId);
  const native = useNativeBackend();
  logBackendOnce(native);

  if (native) {
    await secureSave(slot, base64);
  } else {
    try {
      await idbSave(slot, base64);
    } catch (idbErr) {
      console.error(
        `[keystore] IndexedDB save failed: ${errMessage(idbErr)}`,
      );
      throw new Error("Could not save encryption key on this device");
    }
  }
}

/** Promote a recovered key into the namespaced Keychain slot (native only). */
async function promoteToNamespacedKeychain(
  userId: string,
  base64: string,
  options?: { clearLegacySecure?: boolean; clearLegacyIdb?: boolean },
): Promise<void> {
  await writePrivateKeyToStorage(userId, base64);
  if (options?.clearLegacySecure) {
    await secureRemove(LEGACY_SECURE_KEY);
  }
  if (options?.clearLegacyIdb) {
    await idbDelete(LEGACY_IDB_KEY);
  }
  // Best-effort: drop stranded IndexedDB copy after Keychain write succeeds.
  await idbDelete(storageKeyForUser(userId));
  warnLegacyMigration(userId);
}

/**
 * Native load: Keychain first, then migrate from IndexedDB if a prior fallback
 * / pre-namespacing copy exists. Does not treat IDB as an ongoing write backend.
 */
async function loadFromKeychain(userId: string): Promise<string | null> {
  const slot = storageKeyForUser(userId);
  try {
    const fromKeychain = await secureLoad(slot);
    if (fromKeychain) return fromKeychain;
  } catch (err) {
    // Plugin failure (not missing-key): surface as no usable key for this check.
    console.error(
      `[keystore] Keychain load failed: ${errMessage(err)}`,
    );
    return null;
  }

  try {
    const legacySecure = await secureLoad(LEGACY_SECURE_KEY);
    if (legacySecure) {
      await promoteToNamespacedKeychain(userId, legacySecure, {
        clearLegacySecure: true,
      });
      return legacySecure;
    }
  } catch {
    // ignore legacy slot failures
  }

  // Keys may live only in IndexedDB after the SecureStoragePlugin import
  // regression that wrote to IDB while Keychain was unreachable.
  const fromIdb = await idbLoad(slot);
  if (fromIdb) {
    try {
      await promoteToNamespacedKeychain(userId, fromIdb);
    } catch (err) {
      console.error(
        `[keystore] Failed to promote IndexedDB key to Keychain: ${errMessage(err)}`,
      );
      // Still return the key so encrypt/decrypt can proceed this session.
    }
    return fromIdb;
  }

  const legacyIdb = await idbLoad(LEGACY_IDB_KEY);
  if (legacyIdb) {
    try {
      await promoteToNamespacedKeychain(userId, legacyIdb, {
        clearLegacyIdb: true,
      });
    } catch (err) {
      console.error(
        `[keystore] Failed to promote legacy IndexedDB key to Keychain: ${errMessage(err)}`,
      );
    }
    return legacyIdb;
  }

  return null;
}

async function loadFromIdbWithLegacy(userId: string): Promise<string | null> {
  const slot = storageKeyForUser(userId);
  const namespaced = await idbLoad(slot);
  if (namespaced) return namespaced;

  const legacy = await idbLoad(LEGACY_IDB_KEY);
  if (!legacy) return null;

  try {
    await writePrivateKeyToStorage(userId, legacy);
    await idbDelete(LEGACY_IDB_KEY);
    warnLegacyMigration(userId);
  } catch (err) {
    console.warn(
      `[keystore] Legacy IndexedDB migration failed: ${errMessage(err)}`,
    );
  }
  return legacy;
}

/** Raw load from storage — does not validate against the server public key. */
async function loadPrivateKeyRaw(userId: string): Promise<string | null> {
  const native = useNativeBackend();
  logBackendOnce(native);
  if (native) {
    return loadFromKeychain(userId);
  }
  return loadFromIdbWithLegacy(userId);
}

// ── Server public key ────────────────────────────────────────────

/** Published Curve25519 public key from profiles, or null if none. */
export async function fetchPublishedPublicKey(
  userId: string,
): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("public_key")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error(
      `[keystore] Failed to fetch published public key: ${error.message}`,
    );
    return null;
  }
  const key = (data?.public_key as string | null | undefined)?.trim();
  return key && key.length > 0 ? key : null;
}

// ── Public API ───────────────────────────────────────────────────

let cacheUserId: string | null = null;
let privateKeyCache: string | null | undefined = undefined;
let privateKeyLoadPromise: Promise<string | null> | null = null;
let loadPromiseUserId: string | null = null;
let privateKeyCacheVersion = 0;

/** Session: local key verified against server public key for this user. */
let verifiedMatchUserId: string | null = null;

/**
 * Clears the in-memory session cache.
 * Storage (IndexedDB/Keychain) is intentionally left untouched.
 */
export function invalidatePrivateKeyCache(): void {
  privateKeyCacheVersion += 1;
  privateKeyCache = undefined;
  cacheUserId = null;
  privateKeyLoadPromise = null;
  loadPromiseUserId = null;
  verifiedMatchUserId = null;
}

/**
 * Sole public write path for persisting a keypair.
 * Rejects when a published server public key exists and does not match.
 */
export async function saveKeypairForUser(
  userId: string,
  keypair: Keypair,
  opts?: {
    /**
     * Restore paths: pass the server public key already verified to match
     * keypair.publicKey. Still re-compared inside this function.
     */
    expectedServerKey?: string;
  },
): Promise<void> {
  if (!userId) {
    throw new Error("Cannot save encryption key without a user id");
  }
  if (!keypair.privateKey?.trim() || !keypair.publicKey?.trim()) {
    throw new Error("Cannot save incomplete keypair");
  }

  const derived = await publicKeyFromPrivateKey(keypair.privateKey);
  if (derived !== keypair.publicKey) {
    console.error(
      "[keystore] KeyMismatchError: provided public key does not match private key",
    );
    throw new KeyMismatchError(
      "Provided public key does not match the private key.",
    );
  }

  if (
    opts?.expectedServerKey &&
    opts.expectedServerKey !== keypair.publicKey
  ) {
    console.error(
      "[keystore] KeyMismatchError: expectedServerKey does not match keypair public key",
    );
    throw new KeyMismatchError(
      "Restored key does not match the expected server public key.",
    );
  }

  const serverKey = await fetchPublishedPublicKey(userId);
  if (serverKey && serverKey !== keypair.publicKey) {
    console.error(
      "[keystore] KeyMismatchError: refusing to overwrite local key — " +
        "keypair public key does not match the account's published public key",
      { userId },
    );
    throw new KeyMismatchError(
      "This key does not match your account's published public key. Restore aborted.",
    );
  }

  if (opts?.expectedServerKey && serverKey && serverKey !== opts.expectedServerKey) {
    console.error(
      "[keystore] KeyMismatchError: server public key drifted from expectedServerKey",
      { userId },
    );
    throw new KeyMismatchError(
      "Server public key does not match the verified restore key.",
    );
  }

  invalidatePrivateKeyCache();
  await writePrivateKeyToStorage(userId, keypair.privateKey);

  privateKeyCache = keypair.privateKey;
  cacheUserId = userId;
  verifiedMatchUserId = userId;
}

/**
 * Restore a private-key backup (QR / file). Derives the public key, requires a
 * matching published server key, then persists via saveKeypairForUser.
 */
export async function saveRestoredPrivateKey(
  userId: string,
  privateKeyB64: string,
): Promise<void> {
  const trimmed = privateKeyB64.trim();
  if (!trimmed) {
    throw new Error("Empty key backup");
  }
  const publicKey = await publicKeyFromPrivateKey(trimmed);
  const serverKey = await fetchPublishedPublicKey(userId);
  if (!serverKey) {
    throw new Error(
      "Cannot restore: this account has no published public key yet.",
    );
  }
  if (serverKey !== publicKey) {
    console.error(
      "[keystore] KeyMismatchError: restored backup does not match published public key",
      { userId },
    );
    throw new KeyMismatchError(
      "This backup does not match your account. Check that you imported the right key.",
    );
  }
  await saveKeypairForUser(
    userId,
    { publicKey, privateKey: trimmed },
    { expectedServerKey: serverKey },
  );
}

/**
 * Sole place that may generate a crypto_box keypair.
 * Allowed only when the account has no published public key (new signup).
 */
export async function generateKeyPairForNewAccount(
  userId: string,
): Promise<Keypair> {
  if (!userId) {
    throw new Error("Cannot generate encryption key without a user id");
  }

  const serverKey = await fetchPublishedPublicKey(userId);
  if (serverKey) {
    console.error(
      "[keystore] KeyGenerationBlockedError: refusing to generate — " +
        "account already has a published public key",
      { userId },
    );
    throw new KeyGenerationBlockedError(
      "This account already has an encryption key. Restore it instead of creating a new one.",
    );
  }

  const keypair = await generateKeyPair();
  await saveKeypairForUser(userId, keypair);
  return keypair;
}

/**
 * Session start / KeyGate: decide whether the local key is usable.
 * Never generates. Mismatched local keys are left in storage untouched.
 */
export async function resolveKeySession(
  userId: string,
): Promise<KeySessionResult> {
  if (!userId) {
    return {
      status: "restore_needed",
      reason: "missing",
      message: "Not signed in.",
    };
  }

  const serverKey = await fetchPublishedPublicKey(userId);
  const localKey = await loadPrivateKeyRaw(userId);

  if (localKey) {
    let localPublic: string;
    try {
      localPublic = await publicKeyFromPrivateKey(localKey);
    } catch {
      return {
        status: "restore_needed",
        reason: "mismatch",
        message:
          "The key on this device is unreadable. Restore your encryption key.",
      };
    }

    if (serverKey && localPublic === serverKey) {
      verifiedMatchUserId = userId;
      privateKeyCache = localKey;
      cacheUserId = userId;
      return { status: "ready" };
    }

    if (serverKey && localPublic !== serverKey) {
      verifiedMatchUserId = null;
      // Do not delete — leave mismatched bytes in storage; do not use them.
      if (cacheUserId === userId) {
        privateKeyCache = undefined;
        cacheUserId = null;
      }
      return {
        status: "restore_needed",
        reason: "mismatch",
        message:
          "The key on this device doesn't match your account. Restore your encryption key.",
      };
    }

    // Local key present but no published server key (incomplete signup).
    verifiedMatchUserId = userId;
    privateKeyCache = localKey;
    cacheUserId = userId;
    return { status: "ready" };
  }

  // No local key
  verifiedMatchUserId = null;

  if (serverKey) {
    return {
      status: "restore_needed",
      reason: "missing",
      message:
        "This device doesn't have your encryption key. Restore it to read your messages.",
    };
  }

  return {
    status: "unprovisioned",
    message:
      "No encryption key on this device or account. Sign up again or contact support.",
  };
}

/**
 * Load the private key for a specific account once per session.
 * Returns null if missing or if the local key does not match the server
 * (mismatched keys stay on disk but are never returned for use).
 */
export async function loadPrivateKey(userId: string): Promise<string | null> {
  if (!userId) return null;

  if (
    privateKeyCache !== undefined &&
    cacheUserId === userId &&
    verifiedMatchUserId === userId &&
    privateKeyCache
  ) {
    return privateKeyCache;
  }
  if (privateKeyLoadPromise && loadPromiseUserId === userId) {
    return privateKeyLoadPromise;
  }

  const versionAtStart = privateKeyCacheVersion;
  const slotUserId = userId;

  const loadPromise: Promise<string | null> = (async () => {
    const session = await resolveKeySession(slotUserId);
    if (session.status !== "ready") return null;
    if (privateKeyCache && cacheUserId === slotUserId) {
      return privateKeyCache;
    }
    return loadPrivateKeyRaw(slotUserId);
  })()
    .then((key) => {
      if (
        privateKeyCacheVersion === versionAtStart &&
        key &&
        verifiedMatchUserId === slotUserId
      ) {
        privateKeyCache = key;
        cacheUserId = slotUserId;
      }
      return key;
    })
    .finally(() => {
      if (privateKeyLoadPromise === loadPromise) {
        privateKeyLoadPromise = null;
        loadPromiseUserId = null;
      }
    });

  privateKeyLoadPromise = loadPromise;
  loadPromiseUserId = slotUserId;
  return loadPromise;
}

/**
 * True iff a usable private key for this account is present on this device
 * (matches the published server public key when one exists).
 */
export async function hasPrivateKey(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const key = await loadPrivateKey(userId);
    return typeof key === "string" && key.length > 0;
  } catch {
    return false;
  }
}

/**
 * Permanently remove this account's private key from this device.
 * This is the only intentional way a key leaves device storage.
 */
export async function removePrivateKey(userId: string): Promise<void> {
  if (!userId) return;

  if (cacheUserId === userId) {
    invalidatePrivateKeyCache();
  } else {
    privateKeyCacheVersion += 1;
    if (loadPromiseUserId === userId) {
      privateKeyLoadPromise = null;
      loadPromiseUserId = null;
    }
    if (verifiedMatchUserId === userId) {
      verifiedMatchUserId = null;
    }
  }

  const slot = storageKeyForUser(userId);
  const native = useNativeBackend();
  logBackendOnce(native);

  if (native) {
    await secureRemove(slot);
    await secureRemove(LEGACY_SECURE_KEY);
    await idbDelete(slot);
    await idbDelete(LEGACY_IDB_KEY);
    return;
  }

  await idbDelete(slot);
  await idbDelete(LEGACY_IDB_KEY);
}
