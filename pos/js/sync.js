// sync.js — Estrategia offline. Hoy: cola local (outbox) + indicador de estado.
// Mañana: enchufar un adaptador (ej. Supabase) sin tocar el resto de la app.
import { outboxPending, outboxCount } from './db.js';
import { t } from './i18n.js';

let online = navigator.onLine;
const listeners = new Set();

export function isOnline() { return online; }
export function onStatusChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

async function notify() {
  const count = await outboxCount();
  listeners.forEach((fn) => fn({ online, pending: count }));
}

// Adaptador de backend. Null = solo local. Se inyecta en Fase 2 (Supabase).
let adapter = null;
export function setAdapter(a) { adapter = a; flush(); }

export async function flush() {
  if (!online || !adapter) { notify(); return; }
  const pending = await outboxPending();
  for (const item of pending) {
    try { await adapter.push(item); item.synced = true; }
    catch (e) { break; } // reintenta luego; orden preservado
  }
  notify();
}

export function initSync() {
  window.addEventListener('online', () => { online = true; flush(); });
  window.addEventListener('offline', () => { online = false; notify(); });
  notify();
  // Reintento periódico suave mientras haya pendientes.
  setInterval(() => { if (online) flush(); }, 30000);
}

export function statusLabel({ online, pending }) {
  if (!online) return { icon: '⚡', text: t('offline'), cls: 'off' };
  if (pending > 0) return { icon: '↻', text: t('pending_sync', { n: pending }), cls: 'pending' };
  return { icon: '✓', text: t('synced'), cls: 'ok' };
}
