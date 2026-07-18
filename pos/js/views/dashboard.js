// views/dashboard.js — Resumen visual del día: ventas, tickets, stock bajo, caja.
import { el, clear } from '../ui.js';
import { t } from '../i18n.js';
import { fmt } from '../money.js';
import * as data from '../data.js';
import { go } from '../router.js';
import { currentUser } from '../store.js';

export default async function dashboardView(container) {
  clear(container);
  const from = data.dayStart();
  const sales = await data.salesBetween(from, Date.now());
  const totalToday = sales.reduce((a, s) => a + s.total, 0);
  const low = await data.lowStockProducts();
  const session = await data.currentCashSession();

  // Más vendidos hoy
  const counts = {};
  sales.forEach((s) => s.items.forEach((l) => { counts[l.name] = (counts[l.name] || 0) + l.qty; }));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  container.append(
    el('div', { class: 'page' }, [
      el('div', { class: 'greeting' }, [
        el('h2', { text: '👋 ' + (currentUser()?.name || '') }),
        el('span', { class: 'muted', text: new Date().toLocaleDateString('nl-CW', { weekday: 'long', day: 'numeric', month: 'long' }) }),
      ]),
      el('div', { class: 'stat-grid' }, [
        statCard('💰', t('sales_today'), fmt(totalToday), 'accent', () => go('reports')),
        statCard('🧾', t('tickets_today'), String(sales.length), '', () => go('reports')),
        statCard('📦', t('low_stock'), String(low.length), low.length ? 'warn' : '', () => go('inventory')),
        session
          ? statCard('💵', t('cash_open'), fmt(session.initial_fund), 'ok', () => go('cash'))
          : statCard('💵', t('cash_closed'), t('open_cash'), 'muted', () => go('cash')),
      ]),
      low.length ? el('div', { class: 'card' }, [
        el('h3', { text: '⚠️ ' + t('low_stock') }),
        el('div', { class: 'list' }, low.slice(0, 6).map((p) =>
          el('div', { class: 'list-item' }, [
            el('span', { text: p.name }),
            el('span', { class: 'tag warn', text: p.stock + ' / ' + p.min_stock }),
          ]))),
      ]) : null,
      top.length ? el('div', { class: 'card' }, [
        el('h3', { text: '🔥 ' + t('top_products') }),
        el('div', { class: 'list' }, top.map(([name, qty]) =>
          el('div', { class: 'list-item' }, [el('span', { text: name }), el('strong', { text: '×' + qty })]))),
      ]) : el('div', { class: 'card center muted', text: t('empty') }),
      el('button', { class: 'btn primary block lg', text: '🛒 ' + t('nav_pos'), onclick: () => go('pos') }),
    ])
  );
}

function statCard(icon, label, value, cls, onclick) {
  return el('button', { class: 'stat-card ' + cls, onclick }, [
    el('span', { class: 'stat-ico', text: icon }),
    el('span', { class: 'stat-val', text: value }),
    el('span', { class: 'stat-lbl', text: label }),
  ]);
}
