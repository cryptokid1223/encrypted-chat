/**
 * Private key storage — IndexedDB on web, iOS Keychain on native.
 *
 * The private key is stored only on this device.
 * It must NEVER be sent to Supabase or any server.
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
  remove: (options: { key: string }) => Promise<{ value: boolean }>;
};

async function isNative(): Promise<boolean> {
  try {
    const core = await import("@capacitor/core");
    return core.Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

async function getSecureStorage(): Promise<SecureStorage> {
  const mod = await import("capacitor-secure-storage-plugin");
  return mod.SecureStoragePlugin;
}

// ── IndexedDB (web) ──────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
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
  const db = await openDb();
  return new Promise((resolve, reject) => {
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
}

async function idbClear(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
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
}

// ── Keychain (native) ────────────────────────────────────────────

async function secureLoad(plugin: SecureStorage): Promise<string | null> {
  try {
    const { value } = await plugin.get({ key: SECURE_KEY });
    return value && value.length > 0 ? value : null;
  } catch {
    // Missing key rejects — treat as absent.
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

  await secureSave(plugin, fromIdb);
  try {
    await idbClear();
  } catch {
    // Key is already safe in keychain; ignore cleanup failure.
  }
  return fromIdb;
}

// ── Public API ───────────────────────────────────────────────────

export async function savePrivateKey(base64: string): Promise<void> {
  if (await isNative()) {
    const plugin = await getSecureStorage();
    await secureSave(plugin, base64);
    return;
  }
  await idbSave(base64);
}

export async function loadPrivateKey(): Promise<string | null> {
  if (await isNative()) {
    const plugin = await getSecureStorage();
    const fromKeychain = await secureLoad(plugin);
    if (fromKeychain) return fromKeychain;
    return migrateIdbToKeychain(plugin);
  }
  return idbLoad();
}

export async function hasPrivateKey(): Promise<boolean> {
  const key = await loadPrivateKey();
  return key !== null && key.length > 0;
}
