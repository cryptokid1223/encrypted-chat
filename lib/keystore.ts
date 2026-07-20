/**
 * Private key storage — IndexedDB on web, iOS Keychain on native.
 *
 * Keys are namespaced per Supabase user id so multiple accounts on one device
 * do not overwrite each other. Logout clears only the in-memory cache.
 *
 * The private key is stored only on this device.
 * It must NEVER be sent to Supabase or any server.
 *
 * CRYPTO POLICY: this file only stores/loads opaque base64 key strings.
 * It must not change key generation, encrypt/decrypt, or key formats.
 */

import { Capacitor } from "@capacitor/core";
import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";

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

async function secureLoad(slot: string): Promise<string | null> {
  try {
    const { value } = await withTimeout(
      "SecureStoragePlugin.get",
      SecureStoragePlugin.get({ key: slot }),
    );
    return value && value.length > 0 ? value : null;
  } catch (err) {
    if (isMissingKeyError(err)) return null;
    console.error(
      `[keystore] SecureStoragePlugin.get failed for ${slot}: ${errMessage(err)}`,
    );
    return null;
  }
}

async function secureSave(slot: string, base64: string): Promise<void> {
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

/** Promote a recovered key into the namespaced Keychain slot (native only). */
async function promoteToNamespacedKeychain(
  userId: string,
  base64: string,
  options?: { clearLegacySecure?: boolean; clearLegacyIdb?: boolean },
): Promise<void> {
  const slot = storageKeyForUser(userId);
  await secureSave(slot, base64);
  if (options?.clearLegacySecure) {
    await secureRemove(LEGACY_SECURE_KEY);
  }
  if (options?.clearLegacyIdb) {
    await idbDelete(LEGACY_IDB_KEY);
  }
  // Best-effort: drop stranded IndexedDB copy after Keychain write succeeds.
  await idbDelete(slot);
  warnLegacyMigration(userId);
}

/**
 * Native load: Keychain first, then migrate from IndexedDB if a prior fallback
 * / pre-namespacing copy exists. Does not treat IDB as an ongoing write backend.
 */
async function loadFromKeychain(userId: string): Promise<string | null> {
  const slot = storageKeyForUser(userId);
  const fromKeychain = await secureLoad(slot);
  if (fromKeychain) return fromKeychain;

  const legacySecure = await secureLoad(LEGACY_SECURE_KEY);
  if (legacySecure) {
    await promoteToNamespacedKeychain(userId, legacySecure, {
      clearLegacySecure: true,
    });
    return legacySecure;
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
    await idbSave(slot, legacy);
    await idbDelete(LEGACY_IDB_KEY);
    warnLegacyMigration(userId);
  } catch (err) {
    console.warn(
      `[keystore] Legacy IndexedDB migration failed: ${errMessage(err)}`,
    );
  }
  return legacy;
}

// ── Public API ───────────────────────────────────────────────────

let cacheUserId: string | null = null;
let privateKeyCache: string | null | undefined = undefined;
let privateKeyLoadPromise: Promise<string | null> | null = null;
let loadPromiseUserId: string | null = null;
let privateKeyCacheVersion = 0;

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
}

export async function savePrivateKey(
  base64: string,
  userId: string,
): Promise<void> {
  if (!userId) {
    throw new Error("Cannot save encryption key without a user id");
  }

  invalidatePrivateKeyCache();

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

  privateKeyCache = base64;
  cacheUserId = userId;
}

/**
 * Load the private key for a specific account once per session.
 * Never falls back to another account's key.
 * Successful loads are cached; misses are not (so a later restore/save is visible).
 */
export async function loadPrivateKey(userId: string): Promise<string | null> {
  if (!userId) return null;

  if (privateKeyCache !== undefined && cacheUserId === userId) {
    return privateKeyCache;
  }
  if (privateKeyLoadPromise && loadPromiseUserId === userId) {
    return privateKeyLoadPromise;
  }

  const versionAtStart = privateKeyCacheVersion;
  const slotUserId = userId;
  const native = useNativeBackend();
  logBackendOnce(native);

  const loadPromise: Promise<string | null> = (async () => {
    if (native) {
      return loadFromKeychain(slotUserId);
    }
    return loadFromIdbWithLegacy(slotUserId);
  })()
    .then((key) => {
      // Only cache positive hits. Caching null made post-restore / migration
      // loads look like permanent "no key" for the rest of the session.
      if (privateKeyCacheVersion === versionAtStart && key) {
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
 * True iff a private key for this account is present on this device.
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
