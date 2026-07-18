// views/cash.js — Caja: apertura, movimientos, gastos y cierre con arqueo.
import { el, clear, modal, toast, requireAuth } from '../ui.js';
import { t } from '../i18n.js';
import { fmt, toCents } from '../money.js';
import * as db from '../db.js';
import * as data from '../data.js';
import { currentUser } from '../store.js';

export default async function cashView(container) {
  clear(container);
  const session = await data.currentCashSession();

  if (!session) return renderClosed(container);
  return renderOpen(container, session);
}

function renderClosed(container) {
  const fund = el('input', { class: 'input big', inputmode: 'decimal', placeholder: '0.00' });
  container.append(el('div', { class: 'page' }, [
    el('div', { class: 'page-head' }, [el('h2', { text: t('cash_register') })]),
    el('div', { class: 'card center' }, [
      el('div', { class: 'big-emoji', text: '🔒' }),
      el('p', { class: 'muted', text: t('cash_closed') }),
      el('label', { class: 'form-lbl', text: t('initial_fund') }),
      fund,
      el('button', { class: 'btn primary block lg mt', text: t('open_cash'), onclick: async () => {
        await data.openCashSession({ initial_fund: toCents(fund.value), by: currentUser().id });
        toast(t('open_cash')); cashView(container);
      } }),
    ]),
    historyBlock(),
  ]));
}

async function renderOpen(container, session) {
  const moves = (await db.byIndex('cash_moves', 'cash_session_id', session.id)).sort((a, b) => b.created_at - a.created_at);
  const expected = await data.cashExpected(session);
  const sales = (await db.all('sales')).filter((s) => s.cash_session_id === session.id);

  // Ventas por método y por vendedor
  const byMethod = {}; const bySeller = {};
  sales.forEach((s) => {
    s.payments.forEach((p) => { byMethod[p.method] = (byMethod[p.method] || 0) + p.amount; });
    bySeller[s.seller_id] = (bySeller[s.seller_id] || 0) + s.total;
  });
  const users = await db.all('users');
  const uname = (id) => users.find((u) => u.id === id)?.name || '—';

  container.append(el('div', { class: 'page' }, [
    el('div', { class: 'page-head' }, [
      el('h2', { text: t('cash_register') }),
      el('span', { class: 'tag ok', text: '● ' + t('cash_open') }),
    ]),
    el('div', { class: 'balance-card' }, [
      el('span', { class: 'muted', text: t('expected_cash') }),
      el('strong', { class: 'big-num', text: fmt(expected) }),
      el('span', { class: 'muted small', text: t('initial_fund') + ': ' + fmt(session.initial_fund) }),
    ]),
    el('div', { class: 'grid-2 gap' }, [
      el('button', { class: 'btn ok', text: '➕ ' + t('cash_in'), onclick: () => moveDialog(session, 'cash_in', container) }),
      el('button', { class: 'btn ghost', text: '➖ ' + t('cash_out'), onclick: () => moveDialog(session, 'cash_out', container) }),
      el('button', { class: 'btn ghost', text: '🧾 ' + t('new_expense'), onclick: () => moveDialog(session, 'expense', container) }),
      el('button', { class: 'btn ghost', text: '💸 ' + t('withdrawal'), onclick: () => moveDialog(session, 'withdrawal', container) }),
    ]),
    el('div', { class: 'card' }, [
      el('h3', { text: t('by_method') }),
      el('div', { class: 'list' }, Object.entries(byMethod).map(([mth, amt]) =>
        el('div', { class: 'list-item' }, [el('span', { text: t(mth) }), el('strong', { text: fmt(amt) })]))
        .concat(Object.keys(byMethod).length ? [] : [el('div', { class: 'muted', text: t('empty') })])),
    ]),
    el('div', { class: 'card' }, [
      el('h3', { text: t('by_seller') }),
      el('div', { class: 'list' }, Object.entries(bySeller).map(([sid, amt]) =>
        el('div', { class: 'list-item' }, [el('span', { text: uname(sid) }), el('strong', { text: fmt(amt) })]))),
    ]),
    el('div', { class: 'card' }, [
      el('h3', { text: t('movement') }),
      el('div', { class: 'list' }, moves.slice(0, 20).map((mv) => el('div', { class: 'list-item' }, [
        el('span', { text: t(mv.type) + (mv.concept ? ' · ' + mv.concept : '') }),
        el('strong', { class: ['sale', 'cash_in', 'credit_payment'].includes(mv.type) ? 'pos' : 'neg',
          text: (['sale', 'cash_in', 'credit_payment'].includes(mv.type) ? '+' : '−') + fmt(mv.amount) }),
      ]))),
    ]),
    el('button', { class: 'btn danger block lg', text: '🔒 ' + t('close_cash'), onclick: () => closeDialog(session, expected, container) }),
  ]));
}

function moveDialog(session, type, container) {
  const amt = el('input', { class: 'input big', inputmode: 'decimal', placeholder: '0.00' });
  const concept = el('input', { class: 'input', placeholder: t('concept') });
  const b = el('div', { class: 'form' }, [
    amt, (type === 'expense' || type === 'cash_out' || type === 'withdrawal') ? concept : null,
    el('button', { class: 'btn primary block', text: t('save'), onclick: async () => {
      const cents = toCents(amt.value);
      if (cents <= 0) { toast(t('required'), 'err'); return; }
      await data.addCashMove({ session_id: session.id, type, amount: cents, concept: concept.value, by: currentUser().id });
      m.close(); toast(t('save')); cashView(container);
    } }),
  ]);
  const m = modal(t(type === 'expense' ? 'new_expense' : type), b);
}

async function closeDialog(session, expected, container) {
  const counted = el('input', { class: 'input big', inputmode: 'decimal', placeholder: '0.00' });
  const diff = el('div', { class: 'diff-line' });
  counted.addEventListener('input', () => {
    const d = toCents(counted.value) - expected;
    diff.className = 'diff-line ' + (d === 0 ? 'ok' : d > 0 ? 'pos' : 'neg');
    diff.textContent = t('difference') + ': ' + (d > 0 ? '+' : '') + fmt(d);
  });
  const b = el('div', { class: 'form' }, [
    el('div', { class: 'ps-row big' }, [el('span', { text: t('expected_cash') }), el('strong', { text: fmt(expected) })]),
    el('label', { class: 'muted', text: t('counted_cash') }), counted, diff,
    el('button', { class: 'btn danger block', text: t('close_cash'), onclick: async () => {
      const ok = await requireAuth(t('close_cash'));
      if (!ok) return;
      await data.closeCashSession({ session, counted_cash: toCents(counted.value), by: currentUser().id });
      m.close(); toast(t('close_cash')); cashView(container);
    } }),
  ]);
  const m = modal(t('close_cash'), b);
}

function historyBlock() {
  const wrap = el('div', { class: 'card' }, [el('h3', { text: t('close_history') }), el('div', { class: 'list', id: 'closeHist' })]);
  db.all('cash_sessions').then((sessions) => {
    const node = wrap.querySelector('#closeHist');
    const closed = sessions.filter((s) => s.status === 'closed').sort((a, b) => b.closed_at - a.closed_at).slice(0, 10);
    if (!closed.length) { node.appendChild(el('div', { class: 'muted', text: t('empty') })); return; }
    closed.forEach((s) => node.appendChild(el('div', { class: 'list-item' }, [
      el('span', { class: 'muted small', text: new Date(s.closed_at).toLocaleString('nl-CW') }),
      el('strong', { class: s.difference === 0 ? 'ok' : s.difference > 0 ? 'pos' : 'neg', text: (s.difference > 0 ? '+' : '') + fmt(s.difference) }),
    ])));
  });
  return wrap;
}
