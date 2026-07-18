// views/reports.js — Reportes esenciales: ventas por rango, por método, por producto.
import { el, clear } from '../ui.js';
import { t } from '../i18n.js';
import { fmt } from '../money.js';
import * as data from '../data.js';

export default async function reportsView(container) {
  clear(container);
  const ranges = [
    { key: 'today', label: t('today'), from: () => data.dayStart() },
    { key: 'week', label: '7d', from: () => Date.now() - 7 * 864e5 },
    { key: 'month', label: '30d', from: () => Date.now() - 30 * 864e5 },
  ];
  let active = ranges[0];

  const content = el('div', { class: 'report-content' });

  async function render() {
    clear(content);
    const sales = await data.salesBetween(active.from(), Date.now());
    const total = sales.reduce((a, s) => a + s.total, 0);
    const byMethod = {}; const byProduct = {}; const bySeller = {};
    sales.forEach((s) => {
      s.payments.forEach((p) => byMethod[p.method] = (byMethod[p.method] || 0) + p.amount);
      s.items.forEach((l) => {
        byProduct[l.name] = byProduct[l.name] || { qty: 0, total: 0 };
        byProduct[l.name].qty += l.qty; byProduct[l.name].total += l.line_total;
      });
    });
    const topProducts = Object.entries(byProduct).sort((a, b) => b[1].total - a[1].total).slice(0, 12);

    content.append(
      el('div', { class: 'stat-grid' }, [
        stat('💰', t('total'), fmt(total)),
        stat('🧾', t('tickets_today'), String(sales.length)),
        stat('📊', 'Ticket prom.', fmt(sales.length ? Math.round(total / sales.length) : 0)),
      ]),
      card(t('by_method'), Object.entries(byMethod).map(([m, a]) => rowLine(t(m), fmt(a)))),
      card(t('top_products'), topProducts.map(([n, v]) => rowLine(n + ' ×' + v.qty, fmt(v.total)))),
    );
  }

  container.append(el('div', { class: 'page' }, [
    el('div', { class: 'page-head' }, [el('h2', { text: t('nav_reports') })]),
    el('div', { class: 'seg' }, ranges.map((r) => el('button', {
      class: 'seg-btn' + (r.key === active.key ? ' active' : ''),
      text: r.label,
      onclick: (e) => { active = r; container.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active')); e.currentTarget.classList.add('active'); render(); },
    }))),
    content,
  ]));
  render();
}

function stat(icon, label, value) {
  return el('div', { class: 'stat-card' }, [el('span', { class: 'stat-ico', text: icon }), el('span', { class: 'stat-val', text: value }), el('span', { class: 'stat-lbl', text: label })]);
}
function card(title, rows) {
  return el('div', { class: 'card' }, [el('h3', { text: title }), el('div', { class: 'list' }, rows.length ? rows : [el('div', { class: 'muted', text: t('empty') })])]);
}
function rowLine(label, value) {
  return el('div', { class: 'list-item' }, [el('span', { text: label }), el('strong', { text: value })]);
}
