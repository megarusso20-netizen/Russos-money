// views/pos.js — Punto de venta. Prioridad: velocidad. Venta común en pocos toques.
import { el, clear, toast, modal, requireAuth, confirmBox } from '../ui.js';
import { t } from '../i18n.js';
import { fmt, toCents, lineTotal } from '../money.js';
import { currentUser, business } from '../store.js';
import * as db from '../db.js';
import * as data from '../data.js';
import { showReceipt } from './receipt.js';
import { paymentModal } from './payment.js';

let cart = [];          // {product_id, name, unit_price, qty, factor, unit_label, note}
let heldOrders = [];    // en memoria de la sesión
let selectedCustomer = null;
let discountCents = 0;

export default async function posView(container, params) {
  clear(container);
  const products = await db.all('products');
  const categories = (await db.all('categories')).sort((a, b) => (a.order || 0) - (b.order || 0));
  const levels = await data.stockLevels();
  const biz = business();

  let activeCat = 'fav';
  let query = '';

  const grid = el('div', { class: 'pos-grid' });
  const cartPanel = el('aside', { class: 'cart-panel' });

  const search = el('input', {
    class: 'input search', type: 'search', placeholder: t('search'),
    oninput: (e) => { query = e.target.value.trim().toLowerCase(); renderGrid(); },
  });

  const catBar = el('div', { class: 'cat-bar' }, [
    catChip('fav', '⭐ ' + t('favorites'), () => { activeCat = 'fav'; renderGrid(); }),
    catChip('all', t('all'), () => { activeCat = 'all'; renderGrid(); }),
    ...categories.filter((c) => c.name !== 'Ingredientes').map((c) =>
      catChip(c.id, (c.icon || '') + ' ' + c.name, () => { activeCat = c.id; renderGrid(); })),
  ]);

  function catChip(id, label, onclick) {
    return el('button', { class: 'cat-chip', 'data-cat': id, text: label, onclick: (e) => {
      catBar.querySelectorAll('.cat-chip').forEach((c) => c.classList.remove('active'));
      e.currentTarget.classList.add('active'); onclick();
    } });
  }

  function visibleProducts() {
    let list = products.filter((p) => p.category_id == null || categories.find((c) => c.id === p.category_id)?.name !== 'Ingredientes');
    if (query) return list.filter((p) => p.name.toLowerCase().includes(query) || (p.barcode || '').includes(query));
    if (activeCat === 'fav') return list.filter((p) => p.favorite);
    if (activeCat === 'all') return list;
    return list.filter((p) => p.category_id === activeCat);
  }

  function renderGrid() {
    clear(grid);
    const list = visibleProducts();
    if (!list.length) { grid.appendChild(el('div', { class: 'empty-hint', text: t('empty') })); return; }
    list.forEach((p) => {
      const stock = levels[p.id] || 0;
      const low = p.track_stock && p.min_stock > 0 && stock <= p.min_stock;
      grid.appendChild(el('button', {
        class: 'prod-card' + (p.track_stock && stock <= 0 && !p.has_recipe ? ' out' : ''),
        onclick: () => addProduct(p),
      }, [
        el('span', { class: 'prod-ico', text: p.icon || '🍽️' }),
        el('span', { class: 'prod-name', text: p.name }),
        el('span', { class: 'prod-price', text: fmt(p.price) }),
        p.track_stock ? el('span', { class: 'prod-stock' + (low ? ' low' : ''), text: String(stock) }) : null,
        (p.units && p.units.length > 1) ? el('span', { class: 'prod-badge', text: '⇄' }) : null,
      ]));
    });
  }

  function addProduct(p) {
    // Varias presentaciones -> elegir (unidad/caja). Una sola -> agrega directo.
    if (p.units && p.units.length > 1) return chooseUnit(p);
    const u = p.units && p.units[0] ? p.units[0] : { factor: 1, price: p.price, label: 'unit' };
    addLine(p, u);
  }

  function chooseUnit(p) {
    const body = el('div', { class: 'unit-choices' }, p.units.map((u) =>
      el('button', { class: 'btn ghost block', onclick: () => { m.close(); addLine(p, u); } }, [
        el('span', { text: u.label }), el('span', { class: 'spacer' }), el('strong', { text: fmt(u.price) }),
      ])));
    const m = modal(p.name, body);
  }

  function addLine(p, u) {
    const existing = cart.find((l) => l.product_id === p.id && l.factor === u.factor);
    if (existing) existing.qty += 1;
    else cart.push({ product_id: p.id, name: p.name, unit_price: u.price, qty: 1, factor: u.factor || 1, unit_label: u.label || '', icon: p.icon });
    renderCart();
  }

  function cartSubtotal() { return cart.reduce((a, l) => a + lineTotal(l.unit_price, l.qty), 0); }
  function cartTotal() {
    const tax = biz && biz.tax_percent ? Math.round((cartSubtotal() - discountCents) * biz.tax_percent / 100) : 0;
    return { subtotal: cartSubtotal(), tax, total: cartSubtotal() - discountCents + tax };
  }

  function renderCart() {
    clear(cartPanel);
    const { subtotal, tax, total } = cartTotal();

    const header = el('div', { class: 'cart-head' }, [
      el('h3', { text: t('cart') }),
      el('button', {
        class: 'link', text: t('select_customer'),
        onclick: pickCustomer,
      }),
    ]);
    if (selectedCustomer) header.lastChild.textContent = '👤 ' + selectedCustomer.name;

    const items = el('div', { class: 'cart-items' });
    if (!cart.length) items.appendChild(el('div', { class: 'empty-hint', text: t('cart_empty') }));
    cart.forEach((l, i) => {
      items.appendChild(el('div', { class: 'cart-line' }, [
        el('div', { class: 'cl-info' }, [
          el('div', { class: 'cl-name', text: (l.icon || '') + ' ' + l.name + (l.factor > 1 ? ' · ' + l.unit_label : '') }),
          el('div', { class: 'cl-price muted', text: fmt(l.unit_price) + ' × ' + l.qty }),
        ]),
        el('div', { class: 'qty-ctl' }, [
          el('button', { class: 'qbtn', text: '−', onclick: () => { l.qty -= 1; if (l.qty <= 0) cart.splice(i, 1); renderCart(); } }),
          el('span', { class: 'qval', text: String(l.qty) }),
          el('button', { class: 'qbtn', text: '+', onclick: () => { l.qty += 1; renderCart(); } }),
        ]),
        el('div', { class: 'cl-total', text: fmt(lineTotal(l.unit_price, l.qty)) }),
      ]));
    });

    const totals = el('div', { class: 'cart-totals' }, [
      row(t('subtotal'), fmt(subtotal)),
      discountCents ? row(t('discount'), '−' + fmt(discountCents), 'disc') : null,
      tax ? row(t('tax'), fmt(tax)) : null,
      el('div', { class: 'total-row big' }, [el('span', { text: t('total') }), el('strong', { text: fmt(total) })]),
    ]);

    const actions = el('div', { class: 'cart-actions' }, [
      el('button', { class: 'btn ghost', text: '％ ' + t('discount'), disabled: !cart.length, onclick: applyDiscount }),
      el('button', { class: 'btn ghost', text: t('hold'), disabled: !cart.length, onclick: holdOrder }),
      el('button', { class: 'btn ghost', text: t('held_orders') + (heldOrders.length ? ' (' + heldOrders.length + ')' : ''), disabled: !heldOrders.length, onclick: recallOrders }),
      el('button', { class: 'btn primary charge', disabled: !cart.length, onclick: charge }, [
        el('span', { text: t('charge') }), el('strong', { text: fmt(total) }),
      ]),
    ]);

    cartPanel.append(header, items, totals, actions);
  }

  function row(label, value, cls = '') {
    return el('div', { class: 'total-row ' + cls }, [el('span', { text: label }), el('span', { text: value })]);
  }

  async function applyDiscount() {
    const ok = await requireAuth(t('discount'));
    if (!ok) return;
    const input = el('input', { class: 'input big', inputmode: 'decimal', placeholder: '0.00' });
    const body = el('div', {}, [
      el('p', { class: 'muted', text: t('discount') + ' (' + business().symbol + ')' }),
      input,
      el('button', { class: 'btn primary block', text: t('confirm'), onclick: () => {
        discountCents = Math.min(toCents(input.value), cartSubtotal()); m.close(); renderCart();
      } }),
    ]);
    const m = modal(t('discount'), body);
    setTimeout(() => input.focus(), 50);
  }

  async function pickCustomer() {
    const customers = await db.all('customers');
    const body = el('div', { class: 'list' }, [
      el('button', { class: 'list-item', text: '— ' + t('no_customer'), onclick: () => { selectedCustomer = null; m.close(); renderCart(); } }),
      ...customers.map((c) => el('button', {
        class: 'list-item', onclick: () => { selectedCustomer = c; m.close(); renderCart(); },
      }, [
        el('span', { text: c.name }),
        c.balance ? el('span', { class: 'tag debt', text: t('debt') + ' ' + fmt(c.balance) }) : null,
      ])),
    ]);
    const m = modal(t('select_customer'), body);
  }

  function holdOrder() {
    heldOrders.push({ id: db.uid(), cart: cart.slice(), customer: selectedCustomer, discount: discountCents, at: Date.now() });
    resetSale();
    toast(t('hold'));
    renderCart();
  }

  function recallOrders() {
    const body = el('div', { class: 'list' }, heldOrders.map((o) =>
      el('button', { class: 'list-item', onclick: () => {
        cart = o.cart; selectedCustomer = o.customer; discountCents = o.discount;
        heldOrders = heldOrders.filter((x) => x.id !== o.id); m.close(); renderCart();
      } }, [
        el('span', { text: (o.customer ? o.customer.name + ' · ' : '') + o.cart.length + ' ítems' }),
        el('strong', { text: fmt(o.cart.reduce((a, l) => a + lineTotal(l.unit_price, l.qty), 0)) }),
      ])));
    const m = modal(t('held_orders'), body);
  }

  async function charge() {
    const { subtotal, tax, total } = cartTotal();
    paymentModal({
      total, customer: selectedCustomer,
      onConfirm: async (payments) => {
        const sale = await data.createSale({
          items: cart.map((l) => ({ product_id: l.product_id, name: l.name, unit_price: l.unit_price, qty: l.qty, factor: l.factor, unit_label: l.unit_label })),
          payments, customer_id: selectedCustomer?.id, seller_id: currentUser().id,
          cash_session_id: (await data.currentCashSession())?.id,
          discount_cents: discountCents, tax_cents: tax,
        });
        toast(t('sale_done'));
        showReceipt(sale, () => { resetSale(); renderCart(); posView(container, params); });
        resetSale();
      },
    });
  }

  function resetSale() { cart = []; selectedCustomer = null; discountCents = 0; }

  // Layout
  container.appendChild(el('div', { class: 'pos-layout' }, [
    el('section', { class: 'pos-main' }, [search, catBar, grid]),
    cartPanel,
  ]));
  catBar.querySelector('[data-cat="fav"]').classList.add('active');
  renderGrid();
  renderCart();
}
