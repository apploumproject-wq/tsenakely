const DB_NAME = 'tsenakely_sqlite_storage';
const DB_VERSION = 1;
const STORE_NAME = 'sqlite_files';
const DB_KEY = 'tsenakely_main_db';

function openStorage(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB non disponible dans ce navigateur.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Erreur ouverture IndexedDB.'));
  });
}

export async function loadSqliteBytes(): Promise<Uint8Array | null> {
  try {
    const db = await openStorage();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(DB_KEY);
      req.onsuccess = () => {
        const res = req.result;
        if (res instanceof Uint8Array) {
          resolve(res);
        } else if (res instanceof ArrayBuffer) {
          resolve(new Uint8Array(res));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function saveSqliteBytes(bytes: Uint8Array): Promise<void> {
  const db = await openStorage();
  const copy = new Uint8Array(bytes);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(copy, DB_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () =>
      reject(req.error ?? new Error('Erreur sauvegarde locale SQLite.'));
  });
}
