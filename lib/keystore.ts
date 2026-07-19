/**
 * Private key storage — IndexedDB on web, iOS Keychain on native.
 *
 * The private key is stored only on this device.
 * It must NEVER be sent to Supabase or any server.
 *
 * Capacitor packages are loaded only via dynamic import() inside functions.
 * Any native/detection failure or hang falls back to IndexedDB.
 */

const DB_NAME = "cipher-keystore";
const STORE_NAME = "keys";
const PRIVATE_KEY_ID = "privateKey";
const SECURE_KEY = "chat_private_key";
/** Hard cap for every native import / plugin call / public API settle. */
const NATIVE_TIMEOUT_MS = 3000;

type SecureStorage = {
  get: (options: { key: string }) => Promise<{ value: string }>;
  set: (options: {
    key: string;
    value: string;
  }) => Promise<{ value: boolean }>;
};

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

/** Never throws — false on web, SSR, or any Capacitor load/detect failure/hang. */
async function isNative(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const result = await withNativeTimeout("Capacitor platform detect", async () => {
    const core = await import("@capacitor/core");
    return Boolean(core.Capacitor?.isNativePlatform?.());
  });
  return result === true;
}

/** Never hangs/throws — null if the plugin cannot be loaded in time. */
async function getSecureStorage(): Promise<SecureStorage | null> {
  return withNativeTimeout("SecureStoragePlugin import", async () => {
    // Exact package name required by Capacitor plugin registration.
    const mod = await import("capacitor-secure-storage-plugin");
    const plugin = mod.SecureStoragePlugin;
    if (!plugin?.get || !plugin?.set) {
      throw new Error("SecureStoragePlugin missing get/set");
    }
    return plugin as SecureStorage;
  });
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

async function idbSave(base64: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(base64, PRIVATE_KEY_ID);
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

async function idbLoad(): Promise<string | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(PRIVATE_KEY_ID);
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

async function idbClear(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(PRIVATE_KEY_ID);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error("Failed to clear IndexedDB key"));
      };
    });
  } catch {
    // ignore
  }
}

// ── Keychain (native) ────────────────────────────────────────────

async function secureLoad(plugin: SecureStorage): Promise<string | null> {
  const result = await withNativeTimeout("SecureStoragePlugin.get", async () => {
    try {
      const { value } = await plugin.get({ key: SECURE_KEY });
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
  base64: string,
): Promise<boolean> {
  const ok = await withNativeTimeout("SecureStoragePlugin.set", async () => {
    await plugin.set({ key: SECURE_KEY, value: base64 });
    return true;
  });
  return ok === true;
}

/**
 * Try keychain; migrate from IndexedDB if needed.
 * `idbPromise` is started in parallel by the caller so timeout fallbacks are instant.
 */
async function tryNativeLoad(
  idbPromise: Promise<string | null>,
): Promise<string | null> {
  if (!(await isNative())) return null;

  const plugin = await getSecureStorage();
  if (!plugin) return null;

  const fromKeychain = await secureLoad(plugin);
  if (fromKeychain) return fromKeychain;

  const fromIdb = await idbPromise;
  if (!fromIdb) return null;

  const saved = await secureSave(plugin, fromIdb);
  if (saved) {
    await idbClear();
  }
  return fromIdb;
}

// ── Public API ───────────────────────────────────────────────────

export async function savePrivateKey(base64: string): Promise<void> {
  const idbFallback = async () => {
    try {
      await idbSave(base64);
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
          if (await isNative()) {
            const plugin = await getSecureStorage();
            if (plugin) {
              const saved = await secureSave(plugin, base64);
              if (saved) return;
            }
          }
        } catch (err) {
          console.warn(
            "[keystore] native save failed; falling back to IndexedDB",
            err,
          );
        }
        await idbSave(base64);
      })(),
    );
  } catch (err) {
    console.warn("[keystore] savePrivateKey failed or timed out", err);
    await idbFallback();
  }
}

/**
 * Always settles within ~3s — native hangs fall back to IndexedDB.
 */
export async function loadPrivateKey(): Promise<string | null> {
  const idbPromise = idbLoad();

  try {
    const result = await Promise.race([
      (async () => {
        const nativeKey = await tryNativeLoad(idbPromise);
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
}

/**
 * Always settles within ~3s with true or false — never hangs.
 */
export async function hasPrivateKey(): Promise<boolean> {
  try {
    const result = await Promise.race([
      (async () => {
        const key = await loadPrivateKey();
        return typeof key === "string" && key.length > 0;
      })(),
      new Promise<false>((resolve) => {
        setTimeout(() => {
          console.warn(
            "[keystore] hasPrivateKey timed out after 3s; treating as no key",
          );
          resolve(false);
        }, NATIVE_TIMEOUT_MS);
      }),
    ]);
    return result === true;
  } catch {
    return false;
  }
}
