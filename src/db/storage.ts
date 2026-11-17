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

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () =>
      reject(request.error ?? new Error('Erreur ouverture IndexedDB.'));
    request.onblocked = () =>
      reject(new Error('Ouverture IndexedDB bloquée par un autre onglet.'));
  });
}

/**
 * Retourne null uniquement si aucune base n'a encore été enregistrée.
 * Toute erreur réelle de lecture doit remonter à l'appelant afin d'éviter
 * qu'une erreur IndexedDB soit interprétée comme une première installation.
 */
export async function loadSqliteBytes(): Promise<Uint8Array | null> {
  const db = await openStorage();

  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(DB_KEY);
      let result: Uint8Array | null = null;

      request.onsuccess = () => {
        const value: unknown = request.result;

        if (value === undefined) {
          result = null;
        } else if (value instanceof Uint8Array) {
          result = new Uint8Array(value);
        } else if (value instanceof ArrayBuffer) {
          result = new Uint8Array(value.slice(0));
        } else if (ArrayBuffer.isView(value)) {
          const view = value as ArrayBufferView;
          result = new Uint8Array(
            view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
          );
        } else {
          reject(new Error('Le fichier SQLite enregistré a un format invalide.'));
        }
      };

      request.onerror = () =>
        reject(request.error ?? new Error('Erreur de lecture SQLite locale.'));
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(tx.error ?? new Error('Lecture SQLite locale interrompue.'));
      tx.onerror = () =>
        reject(tx.error ?? new Error('Erreur pendant la lecture SQLite locale.'));
    });
  } finally {
    db.close();
  }
}

/**
 * La sauvegarde est confirmée uniquement après la fin de la transaction.
 */
export async function saveSqliteBytes(bytes: Uint8Array): Promise<void> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new Error('Impossible de sauvegarder une base SQLite vide ou invalide.');
  }

  const db = await openStorage();
  const copy = new Uint8Array(bytes);

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(copy, DB_KEY);

      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(tx.error ?? new Error('Sauvegarde SQLite locale interrompue.'));
      tx.onerror = () =>
        reject(tx.error ?? new Error('Erreur pendant la sauvegarde SQLite locale.'));
    });
  } finally {
    db.close();
  }
}
