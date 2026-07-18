// views/inventory.js — Stock actual, entradas/compras, mermas, ajustes e historial.
// El stock es DERIVADO de stock_moves; aquí solo se agregan movimientos.
import { el, clear, modal, toast, requireAuth } from '../ui.js';
import { t } from '../i18n.js';
import { fmt, toCents } from '../money.js';
import * as db from '../db.js';
import * as data from '../data.js';
import { currentUser } from '../store.js';

export default async function inventoryView(container) {
  clear(container);
  const products = (await db.all('products')).filter((p) => p.track_stock);
  const levels = await data.stockLevels();
  let query = '';

  const list = el('div', { class: 'list' });
  function render() {
    clear(list);
    const shown = products.filter((p) => !query || p.name.toLowerCase().includes(query));
    shown.forEach((p) => {
      const stock = levels[p.id] || 0;
      const low = p.min_stock > 0 && stock <= p.min_stock;
      list.appendChild(el('button', { class: 'inv-item', onclick: () => openProduct(p) }, [
        el('span', { class: 'inv-ico', text: p.icon || '📦' }),
        el('div', { class: 'inv-info' }, [
          el('div', { text: p.name }),
          el('div', { class: 'muted small', text: t('min_stock') + ': ' + (p.min_stock || 0) }),
        ]),
        el('span', { class: 'inv-stock' + (low ? ' low' : stock <= 0 ? ' out' : '') , text: String(stock) }),
      ]));
    });
    if (!shown.length) list.appendChild(el('div', { class: 'empty-hint', text: t('empty') }));
  }

  async function refresh() {
    const lv = await data.stockLevels();
    Object.assign(levels, lv);
    render();
  }

  function openProduct(p) {
    const stock = levels[p.id] || 0;
    const body = el('div', {}, [
      el('div', { class: 'inv-current' }, [
        el('span', { class: 'muted', text: t('current_stock') }),
        el('strong', { class: 'big-num', text: String(stock) }),
      ]),
      el('div', { class: 'grid-2 gap mt' }, [
        el('button', { class: 'btn ok', text: '➕ ' + t('add_entry'), onclick: () => moveDialog(p, 'entry') }),
        el('button', { class: 'btn ghost', text: '🧾 ' + t('purchase'), onclick: () => moveDialog(p, 'purchase') }),
        el('button', { class: 'btn warn', text: '🗑️ ' + t('add_waste'), onclick: () => moveDialog(p, 'waste') }),
        el('button', { class: 'btn ghost', text: '✏️ ' + t('adjust'), onclick: () => adjustDialog(p) }),
      ]),
      el('h4', { class: 'mt', text: t('history') }),
      el('div', { class: 'hist', id: 'hist' }),
    ]);
    const m = modal(p.name, body);
    loadHistory(p, body.querySelector('#hist'));

    async function moveDialog(prod, type) {
      // Permite ingresar por presentación (ej. cajas) -> convierte a unidades base
      let unitSel = null;
      const qty = el('input', { class: 'input big', inputmode: 'numeric', placeholder: '0' });
      if (prod.units && prod.units.length > 1) {
        unitSel = el('select', { class: 'input' }, prod.units.map((u) =>
          el('option', { value: u.factor, text: u.label + ' (×' + u.factor + ')' })));
      }
      const reason = el('input', { class: 'input', placeholder: t('reason') + ' (' + t('optional') + ')' });
      const b = el('div', { class: 'form' }, [
        el('label', { class: 'muted', text: type === 'waste' ? t('damaged') : t('qty') }),
        qty, unitSel,
        (type === 'waste') ? reason : null,
        el('button', { class: 'btn primary block', text: t('save'), onclick: async () => {
          const factor = unitSel ? parseInt(unitSel.value) : 1;
          const units = (parseInt(qty.value) || 0) * factor;
          if (units <= 0) { toast(t('required'), 'err'); return; }
          const signed = type === 'waste' ? -units : units;
          await data.addStockMove({ product_id: prod.id, qty: signed, type, reason: reason.value, by: currentUser().id });
          m.close(); toast(t('save')); refresh();
        } }),
      ]);
      const mm = modal(t(type === 'purchase' ? 'purchase' : type === 'waste' ? 'add_waste' : 'add_entry'), b);
    }

    async function adjustDialog(prod) {
      const ok = await requireAuth(t('adjustment'));
      if (!ok) return;
      const cur = (await data.stockOf(prod.id));
      const target = el('input', { class: 'input big', inputmode: 'numeric', value: String(cur) });
      const reason = el('input', { class: 'input', placeholder: t('reason') });
      const b = el('div', { class: 'form' }, [
        el('label', { class: 'muted', text: t('current_stock') + ': ' + cur }),
        target, reason,
        el('button', { class: 'btn primary block', text: t('save'), onclick: async () => {
          const delta = (parseInt(target.value) || 0) - cur;
          if (delta === 0) { m.close(); return; }
          await data.addStockMove({ product_id: prod.id, qty: delta, type: 'adjustment', reason: reason.value, by: currentUser().id });
          m.close(); toast(t('save')); refresh();
        } }),
      ]);
      modal(t('adjust'), b);
    }
  }

  async function loadHistory(p, node) {
    const moves = (await db.byIndex('stock_moves', 'product_id', p.id)).sort((a, b) => b.created_at - a.created_at).slice(0, 30);
    clear(node);
    if (!moves.length) { node.appendChild(el('div', { class: 'muted', text: t('empty') })); return; }
    moves.forEach((mv) => node.appendChild(el('div', { class: 'hist-row' }, [
      el('span', { class: 'tag ' + mv.type, text: t(mv.type) }),
      el('span', { class: 'muted small', text: new Date(mv.created_at).toLocaleString('nl-CW') }),
      el('strong', { class: mv.qty < 0 ? 'neg' : 'pos', text: (mv.qty > 0 ? '+' : '') + mv.qty }),
    ])));
  }

  container.append(el('div', { class: 'page' }, [
    el('div', { class: 'page-head' }, [el('h2', { text: t('nav_inventory') })]),
    el('input', { class: 'input search', type: 'search', placeholder: t('search'), oninput: (e) => { query = e.target.value.toLowerCase(); render(); } }),
    list,
  ]));
  render();
}
