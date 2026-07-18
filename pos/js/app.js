// app.js — Bootstrap y shell de la aplicación (chrome: barra superior + navegación).
import { openDB, outboxCount } from './db.js';
import { seedIfEmpty } from './seed.js';
import { loadBusiness, restoreSession, currentUser, logout, applyTheme, isOwner } from './store.js';
import * as sync from './sync.js';
import { t, onLangChange, getLang } from './i18n.js';
import { el, clear } from './ui.js';
import { register, setOutlet, setOnNavigate, initRouter, render, go, current } from './router.js';

// Vistas
import loginView from './views/login.js';
import posView from './views/pos.js';
import dashboardView from './views/dashboard.js';
import productsView from './views/products.js';
import inventoryView from './views/inventory.js';
import customersView from './views/customers.js';
import cashView from './views/cash.js';
import reportsView from './views/reports.js';
import settingsView from './views/settings.js';

const NAV = [
  { path: 'pos', key: 'nav_pos', icon: '🛒' },
  { path: 'dashboard', key: 'nav_dashboard', icon: '🏠' },
  { path: 'inventory', key: 'nav_inventory', icon: '📦' },
  { path: 'customers', key: 'nav_customers', icon: '👥' },
  { path: 'cash', key: 'nav_cash', icon: '💵' },
];
const MORE = [
  { path: 'products', key: 'nav_products', icon: '🏷️' },
  { path: 'reports', key: 'nav_reports', icon: '📊' },
  { path: 'settings', key: 'nav_settings', icon: '⚙️' },
];

let root, statusEl;

async function boot() {
  applyTheme();
  await openDB();
  await seedIfEmpty();
  await loadBusiness();
  await restoreSession();
  sync.initSync();
  sync.onStatusChange(renderStatus);

  root = document.getElementById('app');
  registerRoutes();
  onLangChange(() => { renderShell(); });

  if (!currentUser()) showLogin();
  else showApp();
}

function registerRoutes() {
  register('pos', posView);
  register('dashboard', dashboardView);
  register('products', productsView);
  register('inventory', inventoryView);
  register('customers', customersView);
  register('cash', cashView);
  register('reports', reportsView);
  register('settings', settingsView);
}

function showLogin() {
  clear(root);
  const container = el('div', { class: 'login-wrap' });
  root.appendChild(container);
  loginView(container, { onLogin: showApp });
}

function showApp() {
  if (!location.hash) history.replaceState(null, '', '#pos'); // sin disparar hashchange
  renderShell();
  initRouter();
}

function renderShell() {
  if (!currentUser()) return;
  clear(root);
  const outlet = el('main', { class: 'outlet', id: 'outlet' });

  const top = el('header', { class: 'topbar' }, [
    el('div', { class: 'brand', text: t('app_name') }),
    (statusEl = el('button', { class: 'sync-pill', title: t('online'), onclick: () => sync.flush() })),
    el('button', {
      class: 'icon-btn', text: '⏻', title: t('logout'),
      onclick: async () => { await logout(); showLogin(); },
    }),
  ]);

  const nav = el('nav', { class: 'bottom-nav' },
    NAV.map((item) => navBtn(item)).concat([moreBtn()]));

  root.appendChild(top);
  root.appendChild(outlet);
  root.appendChild(nav);

  setOutlet(outlet);
  setOnNavigate(highlightNav);
  renderStatus({ online: sync.isOnline(), pending: 0 });
  outboxCount().then((n) => renderStatus({ online: sync.isOnline(), pending: n }));
  render(); // pinta la ruta actual en el nuevo outlet (arranque y cambio de idioma)
}

function navBtn(item) {
  return el('button', {
    class: 'nav-btn', 'data-path': item.path,
    onclick: () => go(item.path),
  }, [
    el('span', { class: 'nav-ico', text: item.icon }),
    el('span', { class: 'nav-lbl', text: t(item.key) }),
  ]);
}

function moreBtn() {
  return el('button', {
    class: 'nav-btn', 'data-path': '__more',
    onclick: (e) => openMore(e),
  }, [
    el('span', { class: 'nav-ico', text: '⋯' }),
    el('span', { class: 'nav-lbl', text: t('nav_more') }),
  ]);
}

function openMore(e) {
  const existing = document.querySelector('.more-sheet');
  if (existing) { existing.remove(); return; }
  const sheet = el('div', { class: 'more-sheet' },
    MORE.filter((m) => m.path !== 'settings' || isOwner() || true).map((item) =>
      el('button', {
        class: 'more-item',
        onclick: () => { sheet.remove(); go(item.path); },
      }, [el('span', { text: item.icon }), el('span', { text: t(item.key) })])
    ));
  document.body.appendChild(sheet);
  setTimeout(() => document.addEventListener('click', function h(ev) {
    if (!sheet.contains(ev.target)) { sheet.remove(); document.removeEventListener('click', h); }
  }), 10);
}

function highlightNav(path) {
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-path') === path);
  });
}

function renderStatus(s) {
  if (!statusEl) return;
  const info = sync.statusLabel(s);
  statusEl.className = 'sync-pill ' + info.cls;
  statusEl.textContent = info.icon + ' ' + info.text;
}

boot();
