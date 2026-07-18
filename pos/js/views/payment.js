// views/payment.js — Cobro: métodos, split de pago, cálculo de cambio, tope de crédito.
import { el, clear, modal, toast, requireAuth } from '../ui.js';
import { t } from '../i18n.js';
import { fmt, toCents } from '../money.js';
import * as data from '../data.js';

const METHODS = [
  { id: 'cash', key: 'cash', icon: '💵' },
  { id: 'card', key: 'card', icon: '💳' },
  { id: 'transfer', key: 'transfer', icon: '📲' },
  { id: 'credit', key: 'credit', icon: '📝' },
];

export function paymentModal({ total, customer, onConfirm }) {
  let payments = [];   // {method, amount}
  let method = 'cash';
  let received = 0;

  const paidSoFar = () => payments.reduce((a, p) => a + p.amount, 0);
  const remaining = () => total - paidSoFar();

  const summary = el('div', { class: 'pay-summary' });
  const methodTabs = el('div', { class: 'method-tabs' },
    METHODS.map((mth) => el('button', {
      class: 'method-tab' + (mth.id === method ? ' active' : ''),
      'data-m': mth.id,
      onclick: () => { method = mth.id; received = remaining(); refresh(); },
    }, [el('span', { text: mth.icon }), el('span', { text: t(mth.key) })])));

  const amountInput = el('input', { class: 'input big center', inputmode: 'decimal', placeholder: fmt(remaining(), { symbol: false }) });
  const changeLine = el('div', { class: 'change-line' });
  const paymentsList = el('div', { class: 'payments-list' });

  const quickCash = el('div', { class: 'quick-cash' },
    [500, 1000, 2000, 2500, 5000, 10000].map((c) =>
      el('button', { class: 'chip', text: fmt(c), onclick: () => { amountInput.value = (c / 100).toFixed(2); refresh(); } })));

  function refresh() {
    methodTabs.querySelectorAll('.method-tab').forEach((tb) => tb.classList.toggle('active', tb.getAttribute('data-m') === method));
    clear(summary);
    summary.append(
      el('div', { class: 'ps-row' }, [el('span', { text: t('total') }), el('strong', { text: fmt(total) })]),
      el('div', { class: 'ps-row' }, [el('span', { text: t('paid') }), el('span', { text: fmt(paidSoFar()) })]),
      el('div', { class: 'ps-row big' }, [el('span', { text: t('remaining') }), el('strong', { text: fmt(Math.max(0, remaining())) })]),
    );

    clear(paymentsList);
    payments.forEach((p, i) => paymentsList.appendChild(el('div', { class: 'pay-chip' }, [
      el('span', { text: t(p.method) + ' ' + fmt(p.amount) }),
      el('button', { class: 'x', text: '✕', onclick: () => { payments.splice(i, 1); refresh(); } }),
    ])));

    // Cambio solo aplica a efectivo
    clear(changeLine);
    if (method === 'cash') {
      const val = toCents(amountInput.value);
      const change = val - remaining();
      if (val > 0 && change > 0) changeLine.append(el('span', { text: t('change') }), el('strong', { text: fmt(change) }));
    }
    quickCash.style.display = method === 'cash' ? 'flex' : 'none';
    confirmBtn.disabled = remaining() > 0 && !(toCents(amountInput.value) > 0);
    confirmBtn.textContent = remaining() > 0 ? t('add_payment') : t('confirm');
  }

  amountInput.addEventListener('input', refresh);
  received = remaining();

  async function onPrimary() {
    let amount = toCents(amountInput.value) || remaining();
    if (method === 'cash') amount = Math.min(amount, remaining()); // el exceso es cambio, no se registra
    if (amount <= 0) return;

    if (method === 'credit') {
      if (!customer) { toast(t('select_customer'), 'err'); return; }
      const check = await data.canSellOnCredit(customer.id, amount);
      if (!check.ok) {
        const ok = await requireAuth(t('over_limit'));
        if (!ok) return;
      }
    }
    payments.push({ method, amount });
    amountInput.value = '';
    if (remaining() <= 0) return finish();
    method = remaining() > 0 ? 'cash' : method;
    refresh();
  }

  function finish() {
    m.close();
    onConfirm(payments);
  }

  const confirmBtn = el('button', { class: 'btn primary block lg', onclick: onPrimary });

  const body = el('div', { class: 'pay-body' }, [
    summary, methodTabs,
    el('div', { class: 'amount-wrap' }, [
      el('label', { class: 'muted', text: t('received') }), amountInput, changeLine,
    ]),
    quickCash, paymentsList, confirmBtn,
  ]);

  const m = modal(t('payment'), body);
  refresh();
  setTimeout(() => amountInput.focus(), 60);
}
