/**
 * Private key storage — IndexedDB on web, iOS Keychain on native.
 *
 * Keys are namespaced per Supabase user id so multiple accounts on one device
 * do not overwrite each other. Logout clears only the in-memory cache.
 *
 * The private key is stored only on this device.
 * It must NEVER be sent to Supabase or any server.
 *
 * Capacitor packages are loaded only via dynamic import() inside functions.
 * Any native/detection failure or hang falls back to IndexedDB.
 *
 * CRYPTO POLICY: this file only stores/loads opaque base64 key strings.
 * It must not change key generation, encrypt/decrypt, or key formats.
 */

const DB_NAME = "cipher-keystore";
const STORE_NAME = "keys";

/** Legacy single-slot keys (pre-namespacing). Migrated on first successful load. */
const LEGACY_IDB_KEY = "privateKey";
const LEGACY_SECURE_KEY = "chat_private_key";

/** Hard cap for every native import / plugin call / public API settle. */
const NATIVE_TIMEOUT_MS = 3000;

type CapacitorLike = { isNativePlatform?: () => boolean };

declare global {
  interface Window {
    Capacitor?: CapacitorLike;
  }
}

// Synchronous one-time native detection.
// IMPORTANT: On web, `window.Capacitor` is typically undefined — in that case we
// must never attempt plugin imports or start any timeout races.
const IS_NATIVE_PLATFORM: boolean = (() => {
  if (typeof window === "undefined") return false;
  try {
    return window.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
})();

type SecureStorage = {
  get: (options: { key: string }) => Promise<{ value: string }>;
  set: (options: {
    key: string;
    value: string;
  }) => Promise<{ value: boolean }>;
  remove?: (options: { key: string }) => Promise<{ value: boolean }>;
};

function storageKeyForUser(userId: string): string {
  return `celesth_pk_${userId}`;
}

function timeoutError(label: string): Error {
  return new Error(`${label} timed out after ${NATIVE_TIMEOUT_MS}ms`);
}

function raceTimeout<T>(label: string, work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(timeoutError(label)), NATIVE_TIMEOUT_MS);
    }),
  ]);
}

/** Race a promise against a 3s timeout. On timeout/failure, returns null and warns. */
async function withNativeTimeout<T>(
  label: string,
  work: () => Promise<T>,
): Promise<T | null> {
  try {
    return await raceTimeout(label, work());
  } catch (err) {
    console.warn(`[keystore] ${label} failed; falling back to IndexedDB`, err);
    return null;
  }
}

function isSecureStoragePlugin(value: unknown): value is SecureStorage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as SecureStorage;
  // Capacitor Proxies expose methods as functions when read.
  return (
    typeof candidate.get === "function" && typeof candidate.set === "function"
  );
}

/**
 * Resolve SecureStoragePlugin on native.
 * Prefer Capacitor registerPlugin(name) — survives bundler interop that can make
 * `import("capacitor-secure-storage-plugin")` yield an empty/broken module object.
 * Fall back to the package's documented named export.
 */
async function resolveSecureStoragePlugin(): Promise<SecureStorage> {
  // 1) Bridge by plugin name (works on iOS/Android regardless of ESM interop).
  try {
    const { registerPlugin } = await import("@capacitor/core");
    const viaRegister = registerPlugin<SecureStorage>("SecureStoragePlugin");
    if (isSecureStoragePlugin(viaRegister)) {
      return viaRegister;
    }
  } catch {
    // Continue to package import.
  }

  // 2) Documented package import (static-export shape, with default-interop fallback).
  const mod = await import("capacitor-secure-storage-plugin");
  const viaNamed = mod.SecureStoragePlugin;
  if (isSecureStoragePlugin(viaNamed)) {
    return viaNamed;
  }

  const viaDefault = (mod as { default?: unknown }).default;
  if (isSecureStoragePlugin(viaDefault)) {
    return viaDefault;
  }
  if (
    viaDefault &&
    typeof viaDefault === "object" &&
    isSecureStoragePlugin(
      (viaDefault as { SecureStoragePlugin?: unknown }).SecureStoragePlugin,
    )
  ) {
    return (viaDefault as { SecureStoragePlugin: SecureStorage })
      .SecureStoragePlugin;
  }

  throw new Error(
    "SecureStoragePlugin missing get/set after registerPlugin + package import",
  );
}

/**
 * Never hangs — null if the plugin cannot be loaded in time.
 * On native, failure is logged as an error (Keychain path must not silently die).
 */
async function getSecureStorage(): Promise<SecureStorage | null> {
  if (!IS_NATIVE_PLATFORM) return null;
  const plugin = await withNativeTimeout(
    "SecureStoragePlugin import",
    resolveSecureStoragePlugin,
  );
  if (!plugin) {
    console.error(
      "[keystore] CRITICAL: SecureStoragePlugin unavailable on native — Keychain path is dead; falling back to IndexedDB. Keys may not load.",
    );
  }
  return plugin;
}

// ── IndexedDB (web / fallback) ───────────────────────────────────

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

async function secureLoad(
  plugin: SecureStorage,
  slot: string,
): Promise<string | null> {
  const result = await withNativeTimeout("SecureStoragePlugin.get", async () => {
    try {
      const { value } = await plugin.get({ key: slot });
      return value && value.length > 0 ? value : "";
    } catch {
      // Missing key (plugin throws) — treat as absent, not a hang/failure.
      return "";
    }
  });
  // null = timeout / hard failure (already warned). "" = no key.
  if (result === null) return null;
  return result.length > 0 ? result : null;
}

async function secureSave(
  plugin: SecureStorage,
  slot: string,
  base64: string,
): Promise<boolean> {
  const ok = await withNativeTimeout("SecureStoragePlugin.set", async () => {
    await plugin.set({ key: slot, value: base64 });
    return true;
  });
  return ok === true;
}

async function secureRemove(plugin: SecureStorage, slot: string): Promise<void> {
  if (typeof plugin.remove !== "function") {
    console.warn(
      "[keystore] SecureStoragePlugin.remove unavailable; skipping Keychain delete for",
      slot,
    );
    return;
  }
  await withNativeTimeout("SecureStoragePlugin.remove", async () => {
    try {
      await plugin.remove!({ key: slot });
    } catch {
      // Missing key is fine.
    }
    return true;
  });
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
 * Persist key under the namespaced slot on both available backends,
 * then remove legacy global slots (best-effort).
 */
async function promoteLegacyKey(
  userId: string,
  base64: string,
  plugin: SecureStorage | null,
): Promise<void> {
  const slot = storageKeyForUser(userId);
  try {
    await idbSave(slot, base64);
  } catch (err) {
    console.warn("[keystore] Failed to write namespaced IndexedDB key during migration", err);
  }
  if (plugin) {
    await secureSave(plugin, slot, base64);
    await secureRemove(plugin, LEGACY_SECURE_KEY);
  }
  await idbDelete(LEGACY_IDB_KEY);
  warnLegacyMigration(userId);
}

/**
 * Try keychain; migrate from IndexedDB / legacy global if needed.
 * `idbNamespacedPromise` is started in parallel by the caller so timeout fallbacks are instant.
 */
async function tryNativeLoad(
  userId: string,
  idbNamespacedPromise: Promise<string | null>,
): Promise<string | null> {
  if (!IS_NATIVE_PLATFORM) return null;

  const plugin = await getSecureStorage();
  if (!plugin) return null;

  const slot = storageKeyForUser(userId);
  const fromKeychain = await secureLoad(plugin, slot);
  if (fromKeychain) return fromKeychain;

  const fromIdb = await idbNamespacedPromise;
  if (fromIdb) {
    const saved = await secureSave(plugin, slot, fromIdb);
    if (saved) {
      // Keep IndexedDB as fallback; do not delete namespaced IDB copy.
    }
    return fromIdb;
  }

  const legacySecure = await secureLoad(plugin, LEGACY_SECURE_KEY);
  if (legacySecure) {
    await promoteLegacyKey(userId, legacySecure, plugin);
    return legacySecure;
  }

  const legacyIdb = await idbLoad(LEGACY_IDB_KEY);
  if (legacyIdb) {
    await promoteLegacyKey(userId, legacyIdb, plugin);
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
    console.warn("[keystore] Legacy IndexedDB migration failed", err);
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

  // Key import should always invalidate the session cache first.
  invalidatePrivateKeyCache();

  const slot = storageKeyForUser(userId);

  // Web path: IndexedDB only (no plugin imports, no timeout races).
  if (!IS_NATIVE_PLATFORM) {
    await idbSave(slot, base64);
    privateKeyCache = base64;
    cacheUserId = userId;
    return;
  }

  const idbFallback = async () => {
    try {
      await idbSave(slot, base64);
    } catch (idbErr) {
      console.warn("[keystore] IndexedDB save failed", idbErr);
      throw new Error("Could not save encryption key on this device");
    }
  };

  try {
    await raceTimeout(
      "savePrivateKey",
      (async () => {
        try {
          const plugin = await getSecureStorage();
          if (plugin) {
            const saved = await secureSave(plugin, slot, base64);
            if (saved) {
              // Mirror to IndexedDB as fallback for timeout paths.
              try {
                await idbSave(slot, base64);
              } catch {
                // Keychain write succeeded — IndexedDB mirror is best-effort.
              }
              return;
            }
          }
        } catch (err) {
          console.warn(
            "[keystore] native save failed; falling back to IndexedDB",
            err,
          );
        }
        await idbSave(slot, base64);
      })(),
    );
  } catch (err) {
    console.warn("[keystore] savePrivateKey failed or timed out", err);
    await idbFallback();
  }

  // If either native or fallback succeeded, the key is now the current session key.
  privateKeyCache = base64;
  cacheUserId = userId;
}

/**
 * Load the private key for a specific account once per session.
 * Never falls back to another account's key.
 * On web, never start native plugin imports or 3s timeout races.
 * On native, still uses the existing timeout+fallback behavior.
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

  const loadPromise: Promise<string | null> = (async () => {
    const idbPromise = loadFromIdbWithLegacy(slotUserId);

    // Web path: IndexedDB only. No timeouts, no native plugin imports.
    if (!IS_NATIVE_PLATFORM) return idbPromise;

    // Native path: race native keychain load against the 3s cap.
    try {
      const result = await Promise.race([
        (async () => {
          const nativeKey = await tryNativeLoad(slotUserId, idbPromise);
          if (nativeKey) return nativeKey;
          return idbPromise;
        })(),
        new Promise<string | null>((resolve) => {
          setTimeout(() => {
            console.warn(
              "[keystore] loadPrivateKey timed out after 3s; IndexedDB fallback",
            );
            void idbPromise.then(resolve);
          }, NATIVE_TIMEOUT_MS);
        }),
      ]);
      return result;
    } catch (err) {
      console.warn(
        "[keystore] loadPrivateKey failed; IndexedDB fallback",
        err,
      );
      return idbPromise;
    }
  })()
    .then((key) => {
      // Avoid overwriting the cache after a logout/key-import invalidation.
      if (privateKeyCacheVersion === versionAtStart) {
        privateKeyCache = key;
        cacheUserId = slotUserId;
      }
      return key;
    })
    .finally(() => {
      // Only clear if this is still the active in-flight load.
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
 * (No native timeout races on web.)
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
    // Still bump version so any in-flight load for this user is discarded.
    privateKeyCacheVersion += 1;
    if (loadPromiseUserId === userId) {
      privateKeyLoadPromise = null;
      loadPromiseUserId = null;
    }
  }

  const slot = storageKeyForUser(userId);
  await idbDelete(slot);
  await idbDelete(LEGACY_IDB_KEY);

  if (IS_NATIVE_PLATFORM) {
    const plugin = await getSecureStorage();
    if (plugin) {
      await secureRemove(plugin, slot);
      await secureRemove(plugin, LEGACY_SECURE_KEY);
    }
  }
}
