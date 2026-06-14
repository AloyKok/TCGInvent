import { completeSale, listInventory } from '../supabase/api';
import type { InventoryItem, QueuedSale } from '../../types/domain';

const DB_NAME = 'cardpulse-offline';
const DB_VERSION = 1;
const SALES_STORE = 'pending_sales';
const INVENTORY_STORE = 'inventory_cache';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SALES_STORE)) {
        db.createObjectStore(SALES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(INVENTORY_STORE)) {
        db.createObjectStore(INVENTORY_STORE, { keyPath: 'orgId' });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T = void>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | void> {
  const db = await openDatabase();
  return new Promise<T | void>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = run(store);
    if (request) {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } else {
      tx.oncomplete = () => resolve(undefined);
    }
    tx.onerror = () => reject(tx.error);
  }).finally(() => db.close());
}

export async function queueSale(sale: Omit<QueuedSale, 'id' | 'createdAt' | 'status'>) {
  const queued: QueuedSale = {
    ...sale,
    id: sale.clientRef,
    createdAt: new Date().toISOString(),
    status: 'pending'
  };
  await withStore(SALES_STORE, 'readwrite', (store) => store.put(queued));
  window.dispatchEvent(new Event('cardpulse-queue-change'));
  return queued;
}

export async function getQueuedSales(): Promise<QueuedSale[]> {
  const rows = (await withStore<QueuedSale[]>(SALES_STORE, 'readonly', (store) => store.getAll())) || [];
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeQueuedSale(id: string) {
  await withStore(SALES_STORE, 'readwrite', (store) => store.delete(id));
  window.dispatchEvent(new Event('cardpulse-queue-change'));
}

export async function markQueuedSaleFailed(id: string, lastError: string) {
  const sale = await withStore<QueuedSale | undefined>(SALES_STORE, 'readonly', (store) => store.get(id));
  if (!sale) return;
  await withStore(SALES_STORE, 'readwrite', (store) => store.put({ ...sale, status: 'failed', lastError }));
  window.dispatchEvent(new Event('cardpulse-queue-change'));
}

export async function syncQueuedSales() {
  if (!navigator.onLine) return { synced: 0, failed: 0 };
  const pending = await getQueuedSales();
  let synced = 0;
  let failed = 0;

  // Each queued sale keeps its clientRef. The RPC is idempotent, so retrying after
  // flaky venue Wi-Fi cannot duplicate a transaction.
  for (const sale of pending) {
    try {
      await completeSale(sale);
      await removeQueuedSale(sale.id);
      synced += 1;
    } catch (error) {
      failed += 1;
      await markQueuedSaleFailed(sale.id, error instanceof Error ? error.message : 'sync failed');
    }
  }

  return { synced, failed };
}

export async function cacheInventory(orgId: string, items: InventoryItem[]) {
  await withStore(INVENTORY_STORE, 'readwrite', (store) =>
    store.put({ orgId, cachedAt: new Date().toISOString(), items })
  );
}

export async function getCachedInventory(orgId: string): Promise<InventoryItem[]> {
  const cached = await withStore<{ orgId: string; cachedAt: string; items: InventoryItem[] } | undefined>(
    INVENTORY_STORE,
    'readonly',
    (store) => store.get(orgId)
  );
  return cached?.items || [];
}

export async function refreshInventoryCache(orgId: string) {
  const items = await listInventory(orgId);
  await cacheInventory(orgId, items);
  return items;
}
