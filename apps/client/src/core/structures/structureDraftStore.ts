import {
  exportStructureSetsForSeries,
  importStructureSets,
  type ImportedStructurePayload,
} from './structurePersistence';
import type { StructureSet } from '@webtps/shared-types';

const DB_NAME = 'webtps-structure-drafts';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';

interface DraftRecord {
  seriesUID: string;
  updatedAt: string;
  payloadJson: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export async function saveStructureDraftForSeries(
  seriesUID: string,
  structureSets: StructureSet[],
  activeStructureSetId: string | null,
  activeStructureId: string | null
): Promise<void> {
  const payload = exportStructureSetsForSeries(
    structureSets,
    activeStructureSetId,
    activeStructureId,
    seriesUID
  );
  const db = await openDraftDb();
  const record: DraftRecord = {
    seriesUID,
    updatedAt: payload.exportedAt,
    payloadJson: JSON.stringify(payload),
  };

  await runTransaction(db, 'readwrite', (store) => {
    store.put(record);
  });
}

export async function loadStructureDraftForSeries(
  seriesUID: string
): Promise<ImportedStructurePayload | null> {
  const db = await openDraftDb();
  const record = await getRecord(db, seriesUID);

  if (!record) {
    return null;
  }

  return importStructureSets(record.payloadJson);
}

function openDraftDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'seriesUID' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open draft database.'));
  });

  return dbPromise;
}

function runTransaction(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Draft transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Draft transaction aborted.'));

    work(store);
  });
}

function getRecord(db: IDBDatabase, seriesUID: string): Promise<DraftRecord | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(seriesUID);

    request.onsuccess = () => resolve((request.result as DraftRecord | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Failed to load structure draft.'));
  });
}
