// db.js — Envoltura mínima sobre IndexedDB (sin dependencias externas).
// Local-first: toda lectura/escritura ocurre aquí primero. La red solo sincroniza.

const DB_NAME = 'snackpos';
const DB_VERSION = 1;

// Almacenes (object stores). El stock NUNCA se edita directo: se deriva de stock_moves.
const STORES = {
  meta: { keyPath: 'key' },                 // kv: sesión, config app
  business: { keyPath: 'id' },              // 1 registro: id='current'
  users: { keyPath: 'id', indexes: ['role'] },
  categories: { keyPath: 'id', indexes: ['order'] },
  products: { keyPath: 'id', indexes: ['category_id', 'favorite', 'barcode'] },
  stock_moves: { keyPath: 'id', indexes: ['product_id', 'type', 'created_at'] },
  sales: { keyPath: 'id', indexes: ['created_at', 'seller_id', 'customer_id', 'cash_session_id'] },
  customers: { keyPath: 'id', indexes: ['name'] },
  credits: { keyPath: 'id', indexes: ['customer_id', 'status'] },
  credit_payments: { keyPath: 'id', indexes: ['customer_id', 'created_at'] },
  suppliers: { keyPath: 'id' },
  purchases: { keyPath: 'id', indexes: ['created_at', 'supplier_id'] },
  cash_sessions: { keyPath: 'id', indexes: ['status', 'opened_at'] },
  cash_moves: { keyPath: 'id', indexes: ['cash_session_id', 'type', 'created_at'] },
  expenses: { keyPath: 'id', indexes: ['created_at'] },
  outbox: { keyPath: 'seq', autoIncrement: true }, // cola de operaciones pendientes de sync
};

let _db = null;

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      // Migraciones versionadas: en el futuro, if (e.oldVersion < 2) {...}
      for (const [name, cfg] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, {
          keyPath: cfg.keyPath,
          autoIncrement: !!cfg.autoIncrement,
        });
        (cfg.indexes || []).forEach((ix) => store.createIndex(ix, ix, { unique: false }));
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode = 'readonly') {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}

export async function put(store, value, { queue = true } = {}) {
  const os = await tx(store, 'readwrite');
  await req(os.put(value));
  if (queue && store !== 'outbox' && store !== 'meta') await enqueue('put', store, value);
  return value;
}

export async function bulkPut(store, values, { queue = false } = {}) {
  const os = await tx(store, 'readwrite');
  for (const v of values) os.put(v);
  await done(os.transaction);
  if (queue) for (const v of values) await enqueue('put', store, v);
  return values;
}

export async function get(store, key) {
  const os = await tx(store);
  return req(os.get(key));
}

export async function all(store) {
  const os = await tx(store);
  return req(os.getAll());
}

export async function byIndex(store, index, value) {
  const os = await tx(store);
  const ix = os.index(index);
  return req(ix.getAll(value));
}

export async function del(store, key, { queue = true } = {}) {
  const os = await tx(store, 'readwrite');
  await req(os.delete(key));
  if (queue) await enqueue('delete', store, { id: key });
}

// --- Cola de sincronización (outbox). Cada operación es idempotente por id. ---
async function enqueue(op, store, value) {
  const os = await tx('outbox', 'readwrite');
  os.put({ op, store, value, created_at: Date.now(), synced: false });
  return done(os.transaction);
}

export async function outboxPending() {
  const os = await tx('outbox');
  const items = await req(os.getAll());
  return items.filter((i) => !i.synced);
}

export async function outboxCount() {
  return (await outboxPending()).length;
}

// --- meta (kv rápido para sesión y flags) ---
export async function getMeta(key, fallback = null) {
  const r = await get('meta', key);
  return r ? r.value : fallback;
}
export async function setMeta(key, value) {
  return put('meta', { key, value }, { queue: false });
}

// Helpers de promisificación
function req(request) {
  return new Promise((res, rej) => {
    request.onsuccess = () => res(request.result);
    request.onerror = () => rej(request.error);
  });
}
function done(transaction) {
  return new Promise((res, rej) => {
    transaction.oncomplete = () => res();
    transaction.onerror = () => rej(transaction.error);
    transaction.onabort = () => rej(transaction.error);
  });
}

// UUID de cliente (sin colisiones al sincronizar). crypto disponible en PWA https.
export function uid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'x' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
}

export async function wipe() {
  const db = await openDB();
  for (const name of Object.keys(STORES)) {
    db.transaction(name, 'readwrite').objectStore(name).clear();
  }
}
