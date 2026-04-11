import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadStructureDraftForSeries, saveStructureDraftForSeries } from './structureDraftStore';
import type { StructureSet } from '@webtps/shared-types';

const records = new Map<string, unknown>();

class FakeRequest {
  result: unknown;
  error: Error | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

class FakeObjectStore {
  put(record: { seriesUID: string }) {
    records.set(record.seriesUID, record);
  }

  get(seriesUID: string) {
    const request = new FakeRequest();
    request.result = records.get(seriesUID);
    queueMicrotask(() => request.onsuccess?.());
    return request;
  }
}

class FakeTransaction {
  error: Error | null = null;
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  objectStore() {
    return new FakeObjectStore();
  }
}

class FakeDb {
  objectStoreNames = {
    contains: () => true,
  };

  transaction() {
    const transaction = new FakeTransaction();
    queueMicrotask(() => transaction.oncomplete?.());
    return transaction;
  }

  createObjectStore() {
    return new FakeObjectStore();
  }
}

function makeStructureSet(): StructureSet {
  return {
    id: 'ss-1',
    label: 'Draft',
    referencedSeriesUID: 'series-1',
    version: 1,
    structures: [],
  };
}

beforeEach(() => {
  records.clear();
  vi.stubGlobal('indexedDB', {
    open: () => {
      const request = new FakeRequest();
      request.result = new FakeDb();
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  });
});

describe('structureDraftStore', () => {
  it('round-trips a structure draft by series UID', async () => {
    await saveStructureDraftForSeries('series-1', [makeStructureSet()], 'ss-1', null);

    const loaded = await loadStructureDraftForSeries('series-1');

    expect(loaded?.activeStructureSetId).toBe('ss-1');
    expect(loaded?.structureSets).toHaveLength(1);
  });
});
