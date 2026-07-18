// data.js — Reglas de negocio sobre db.js. Aquí viven las invariantes del dominio:
//  - El stock se DERIVA de stock_moves (nunca se edita un número directo).
//  - Ventas, abonos y movimientos son inmutables (append-only).
//  - La unidad base es SIEMPRE la unidad individual; cajas/paquetes son vistas.

import * as db from './db.js';
import { lineTotal } from './money.js';

// ---------- Productos y presentaciones ----------
// Un producto tiene `units`: [{id, kind:'unit'|'pack'|'box', label, factor, price}]
// factor = cuántas UNIDADES base contiene esa presentación. unit.factor siempre 1.

export function baseUnit(product) {
  return (product.units || []).find((u) => u.factor === 1)
    || { id: 'u', kind: 'unit', label: 'unit', factor: 1, price: product.price || 0 };
}

// ---------- Stock (derivado) ----------
// Devuelve un mapa product_id -> stock en UNIDADES base.
export async function stockLevels() {
  const moves = await db.all('stock_moves');
  const map = {};
  for (const m of moves) map[m.product_id] = (map[m.product_id] || 0) + m.qty; // qty en unidades base, +entra/-sale
  return map;
}

export async function stockOf(productId) {
  const moves = await db.byIndex('stock_moves', 'product_id', productId);
  return moves.reduce((a, m) => a + m.qty, 0);
}

// Registra un movimiento de stock en unidades base. type: purchase|sale|adjustment|waste|entry
export async function addStockMove({ product_id, qty, type, reason = '', ref = null, by = null }) {
  const move = {
    id: db.uid(), product_id, qty, type, reason, ref,
    by, created_at: Date.now(), synced: false,
  };
  await db.put('stock_moves', move);
  return move;
}

// Convierte una línea de venta a unidades base según la presentación elegida.
export function unitsForLine(line) {
  return (line.qty || 0) * (line.factor || 1);
}

// Expande una venta a descuentos de stock reales (unidades base o ingredientes de receta).
export async function stockDeductionsForSale(items, products) {
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const deductions = []; // {product_id, qty(+ a descontar en base)}
  for (const line of items) {
    const p = byId[line.product_id];
    if (!p) continue;
    if (p.has_recipe && p.recipe && p.recipe.length) {
      // Receta: descuenta ingredientes (cada uno un producto con track_stock)
      for (const ing of p.recipe) {
        deductions.push({ product_id: ing.product_id, qty: ing.qty * (line.qty || 0) });
      }
    } else if (p.track_stock) {
      deductions.push({ product_id: p.id, qty: unitsForLine(line) });
    }
  }
  return deductions;
}

// ---------- Venta (inmutable) ----------
export async function createSale({ items, payments, customer_id, seller_id, cash_session_id, note, discount_cents = 0, tax_cents = 0 }) {
  const products = await db.all('products');
  const subtotal = items.reduce((a, l) => a + lineTotal(l.unit_price, l.qty), 0);
  const total = subtotal - discount_cents + tax_cents;

  const sale = {
    id: db.uid(),
    number: await nextSaleNumber(),
    items: items.map((l) => ({ ...l, line_total: lineTotal(l.unit_price, l.qty) })),
    payments,
    subtotal, discount_cents, tax_cents, total,
    customer_id: customer_id || null,
    seller_id, cash_session_id: cash_session_id || null,
    note: note || '',
    created_at: Date.now(),
    synced: false,
  };
  await db.put('sales', sale);

  // Descontar stock (unidades base / receta)
  const deductions = await stockDeductionsForSale(items, products);
  for (const d of deductions) {
    if (d.qty > 0) await addStockMove({ product_id: d.product_id, qty: -d.qty, type: 'sale', ref: sale.id, by: seller_id });
  }

  // Pagos a crédito -> crear deuda asociada (NO modifica la venta)
  const creditPay = (payments || []).find((p) => p.method === 'credit');
  if (creditPay && customer_id) {
    await db.put('credits', {
      id: db.uid(), customer_id, sale_id: sale.id,
      amount: creditPay.amount, paid: 0, status: 'open',
      created_at: Date.now(), synced: false,
    });
    await bumpCustomerBalance(customer_id, creditPay.amount);
  }

  // Efectivo -> movimiento de caja si hay sesión abierta
  if (cash_session_id) {
    const cashPay = (payments || []).filter((p) => p.method === 'cash').reduce((a, p) => a + p.amount, 0);
    if (cashPay > 0) {
      await db.put('cash_moves', {
        id: db.uid(), cash_session_id, type: 'sale', amount: cashPay,
        ref: sale.id, concept: '', created_at: Date.now(), synced: false,
      });
    }
  }
  return sale;
}

async function nextSaleNumber() {
  const n = (await db.getMeta('sale_counter', 0)) + 1;
  await db.setMeta('sale_counter', n);
  return n;
}

// ---------- Clientes y crédito ----------
export async function bumpCustomerBalance(customer_id, delta) {
  const c = await db.get('customers', customer_id);
  if (!c) return;
  c.balance = (c.balance || 0) + delta;
  await db.put('customers', c);
}

export async function addCreditPayment({ customer_id, amount, method = 'cash', by = null, cash_session_id = null }) {
  // Abono = movimiento SEPARADO. Nunca toca la venta original.
  const pay = {
    id: db.uid(), customer_id, amount, method, by,
    created_at: Date.now(), synced: false,
  };
  await db.put('credit_payments', pay);
  await bumpCustomerBalance(customer_id, -amount);

  // Aplica el abono a las deudas abiertas (FIFO) solo para marcar estado.
  let left = amount;
  const credits = (await db.byIndex('credits', 'customer_id', customer_id))
    .filter((c) => c.status === 'open').sort((a, b) => a.created_at - b.created_at);
  for (const cr of credits) {
    if (left <= 0) break;
    const due = cr.amount - cr.paid;
    const apply = Math.min(due, left);
    cr.paid += apply; left -= apply;
    if (cr.paid >= cr.amount) cr.status = 'paid';
    await db.put('credits', cr);
  }
  if (cash_session_id && method === 'cash') {
    await db.put('cash_moves', {
      id: db.uid(), cash_session_id, type: 'credit_payment', amount,
      ref: pay.id, concept: '', created_at: Date.now(), synced: false,
    });
  }
  return pay;
}

export async function customerDebt(customer_id) {
  const c = await db.get('customers', customer_id);
  return c ? (c.balance || 0) : 0;
}

export async function canSellOnCredit(customer_id, amount) {
  const c = await db.get('customers', customer_id);
  if (!c) return { ok: false };
  const limit = c.credit_limit || 0;
  const newBalance = (c.balance || 0) + amount;
  if (limit > 0 && newBalance > limit) return { ok: false, limit, balance: c.balance || 0, newBalance };
  return { ok: true };
}

// ---------- Caja ----------
export async function openCashSession({ initial_fund, by }) {
  const session = {
    id: db.uid(), status: 'open', initial_fund: initial_fund || 0,
    opened_at: Date.now(), opened_by: by, closed_at: null, synced: false,
  };
  await db.put('cash_sessions', session);
  await db.setMeta('current_cash_session', session.id);
  return session;
}

export async function currentCashSession() {
  const id = await db.getMeta('current_cash_session', null);
  if (!id) return null;
  const s = await db.get('cash_sessions', id);
  return s && s.status === 'open' ? s : null;
}

export async function cashExpected(session) {
  const moves = await db.byIndex('cash_moves', 'cash_session_id', session.id);
  let sum = session.initial_fund || 0;
  for (const m of moves) {
    if (['sale', 'cash_in', 'credit_payment'].includes(m.type)) sum += m.amount;
    else if (['cash_out', 'withdrawal', 'expense'].includes(m.type)) sum -= m.amount;
  }
  return sum;
}

export async function addCashMove({ session_id, type, amount, concept = '', by = null }) {
  const m = { id: db.uid(), cash_session_id: session_id, type, amount, concept, by, created_at: Date.now(), synced: false };
  await db.put('cash_moves', m);
  if (type === 'expense') {
    await db.put('expenses', { id: db.uid(), concept, amount, cash_session_id: session_id, by, created_at: Date.now(), synced: false });
  }
  return m;
}

export async function closeCashSession({ session, counted_cash, by }) {
  const expected = await cashExpected(session);
  session.status = 'closed';
  session.closed_at = Date.now();
  session.closed_by = by;
  session.counted_cash = counted_cash;
  session.expected_cash = expected;
  session.difference = counted_cash - expected;
  await db.put('cash_sessions', session);
  await db.setMeta('current_cash_session', null);
  return session;
}

// ---------- Reportes básicos ----------
export function dayStart(ts = Date.now()) {
  const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime();
}

export async function salesBetween(from, to) {
  const sales = await db.all('sales');
  return sales.filter((s) => s.created_at >= from && s.created_at <= to);
}

export async function lowStockProducts() {
  const [products, levels] = [await db.all('products'), await stockLevels()];
  return products
    .filter((p) => p.track_stock && p.min_stock > 0)
    .map((p) => ({ ...p, stock: levels[p.id] || 0 }))
    .filter((p) => p.stock <= p.min_stock);
}
