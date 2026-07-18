// store.js — Estado en memoria: sesión de usuario, negocio, tema.
import * as db from './db.js';
import { setCurrency } from './money.js';
import { setLang } from './i18n.js';

const state = {
  user: null,        // usuario logueado
  business: null,    // config del negocio
  cart: [],          // carrito POS actual
};

export function getState() { return state; }
export function currentUser() { return state.user; }
export function business() { return state.business; }

export async function loadBusiness() {
  state.business = await db.get('business', 'current');
  if (state.business) {
    setCurrency({ code: state.business.currency, symbol: state.business.symbol, decimals: state.business.decimals });
    if (state.business.lang) setLang(state.business.lang);
  }
  return state.business;
}

export async function restoreSession() {
  const id = await db.getMeta('session_user', null);
  if (id) state.user = await db.get('users', id);
  return state.user;
}

export async function login(userId, pin) {
  const u = await db.get('users', userId);
  if (!u || u.pin !== pin) return null;
  state.user = u;
  await db.setMeta('session_user', u.id);
  return u;
}

export async function logout() {
  state.user = null;
  await db.setMeta('session_user', null);
}

export function isOwner() { return state.user && state.user.role === 'owner'; }

// Verifica un PIN con permiso de autorización (dueño). Funciona offline.
export async function verifyAuthPin(pin) {
  const users = await db.all('users');
  return users.some((u) => u.role === 'owner' && u.pin === pin);
}

// ---------- Tema ----------
export function applyTheme(theme) {
  const t = theme || localStorage.getItem('pos_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('pos_theme', t);
}
export function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}
