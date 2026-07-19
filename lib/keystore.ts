/**
 * Private key storage — IndexedDB on web, iOS Keychain on native.
 *
 * The private key is stored only on this device.
 * It must NEVER be sent to Supabase or any server.
 *
 * Capacitor packages are loaded only via dynamic import() inside functions.
 * Any native/detection failure falls back to IndexedDB silently.
 */

const DB_NAME = "cipher-keystore";
const STORE_NAME = "keys";
const PRIVATE_KEY_ID = "privateKey";
const SECURE_KEY = "chat_private_key";

type SecureStorage = {
  get: (options: { key: string }) => Promise<{ value: string }>;
  set: (options: {
    key: string;
    value: string;
  }) => Promise<{ value: boolean }>;
};

/** Never throws — false on web, SSR, or any Capacitor load/detect failure. */
async function isNative(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const core = await import("@capacitor/core");
    return Boolean(core.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/** Never throws — null if the plugin cannot be loaded. */
async function getSecureStorage(): Promise<SecureStorage | null> {
  try {
    const mod = await import("capacitor-secure-storage-plugin");
    return mod.SecureStoragePlugin ?? null;
  } catch {
    return null;
  }
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
  try {
    const { value } = await plugin.get({ key: SECURE_KEY });
    return value && value.length > 0 ? value : null;
  } catch {
    // Missing key (or plugin error) — treat as absent, not a failure.
    return null;
  }
}

async function secureSave(
  plugin: SecureStorage,
  base64: string,
): Promise<void> {
  await plugin.set({ key: SECURE_KEY, value: base64 });
}

/** If keychain is empty but IndexedDB still has a key (old WebView), migrate. */
async function migrateIdbToKeychain(
  plugin: SecureStorage,
): Promise<string | null> {
  const fromIdb = await idbLoad();
  if (!fromIdb) return null;

  try {
    await secureSave(plugin, fromIdb);
  } catch {
    // Keep IndexedDB copy if keychain write fails.
    return fromIdb;
  }

  await idbClear();
  return fromIdb;
}

// ── Public API ───────────────────────────────────────────────────

export async function savePrivateKey(base64: string): Promise<void> {
  try {
    if (await isNative()) {
      const plugin = await getSecureStorage();
      if (plugin) {
        await secureSave(plugin, base64);
        return;
      }
    }
  } catch {
    // Fall through to IndexedDB.
  }
  await idbSave(base64);
}

export async function loadPrivateKey(): Promise<string | null> {
  try {
    if (await isNative()) {
      const plugin = await getSecureStorage();
      if (plugin) {
        const fromKeychain = await secureLoad(plugin);
        if (fromKeychain) return fromKeychain;
        return await migrateIdbToKeychain(plugin);
      }
    }
  } catch {
    // Fall through to IndexedDB.
  }
  return idbLoad();
}

export async function hasPrivateKey(): Promise<boolean> {
  try {
    const key = await loadPrivateKey();
    return typeof key === "string" && key.length > 0;
  } catch {
    return false;
  }
}
