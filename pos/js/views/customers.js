// views/customers.js — Clientes, deuda, límite de crédito y abonos (movimientos separados).
import { el, clear, modal, toast } from '../ui.js';
import { t } from '../i18n.js';
import { fmt, toCents } from '../money.js';
import * as db from '../db.js';
import * as data from '../data.js';
import { currentUser } from '../store.js';

export default async function customersView(container) {
  clear(container);
  const customers = await db.all('customers');
  const list = el('div', { class: 'list' });

  function render() {
    clear(list);
    customers.forEach((c) => list.appendChild(el('button', { class: 'list-item', onclick: () => openCustomer(c) }, [
      el('div', {}, [el('div', { text: c.name }), c.phone ? el('div', { class: 'muted small', text: c.phone }) : null]),
      c.balance ? el('span', { class: 'tag debt', text: fmt(c.balance) }) : el('span', { class: 'tag ok', text: '✓' }),
    ])));
  }

  async function reload() { customers.length = 0; (await db.all('customers')).forEach((c) => customers.push(c)); render(); }

  function editCustomer(c) {
    const isNew = !c;
    const model = c || { id: db.uid(), name: '', phone: '', balance: 0, credit_limit: 0, created_at: Date.now() };
    const name = el('input', { class: 'input', value: model.name, placeholder: t('name') });
    const phone = el('input', { class: 'input', value: model.phone, placeholder: t('phone'), inputmode: 'tel' });
    const limit = el('input', { class: 'input', value: model.credit_limit ? (model.credit_limit / 100).toFixed(2) : '', placeholder: t('credit_limit'), inputmode: 'decimal' });
    const body = el('div', { class: 'form' }, [
      name, phone,
      el('label', { class: 'muted', text: t('credit_limit') + ' (0 = ' + t('none') + ')' }), limit,
      el('button', { class: 'btn primary block', text: t('save'), onclick: async () => {
        if (!name.value.trim()) { toast(t('required'), 'err'); return; }
        model.name = name.value.trim(); model.phone = phone.value; model.credit_limit = toCents(limit.value);
        await db.put('customers', model); m.close(); reload();
      } }),
    ]);
    const m = modal(isNew ? t('new_customer') : model.name, body);
  }

  async function openCustomer(c) {
    const credits = (await db.byIndex('credits', 'customer_id', c.id)).sort((a, b) => b.created_at - a.created_at);
    const payments = (await db.byIndex('credit_payments', 'customer_id', c.id)).sort((a, b) => b.created_at - a.created_at);
    const sales = (await db.all('sales')).filter((s) => s.customer_id === c.id).sort((a, b) => b.created_at - a.created_at);

    const body = el('div', {}, [
      el('div', { class: 'cust-head' }, [
        el('div', {}, [el('strong', { text: c.name }), c.phone ? el('div', { class: 'muted', text: c.phone }) : null]),
        el('button', { class: 'icon-btn', text: '✏️', onclick: () => { m.close(); editCustomer(c); } }),
      ]),
      el('div', { class: 'balance-card' + (c.balance ? ' debt' : '') }, [
        el('span', { class: 'muted', text: t('balance') }),
        el('strong', { class: 'big-num', text: fmt(c.balance || 0) }),
        c.credit_limit ? el('span', { class: 'muted small', text: t('credit_limit') + ': ' + fmt(c.credit_limit) }) : null,
      ]),
      c.balance > 0 ? el('button', { class: 'btn primary block', text: '💵 ' + t('add_credit_payment'), onclick: () => payDialog(c) }) : null,
      el('h4', { class: 'mt', text: t('purchases_history') }),
      el('div', { class: 'list' }, sales.length ? sales.slice(0, 15).map((s) =>
        el('div', { class: 'list-item' }, [
          el('span', { class: 'muted small', text: '#' + s.number + ' · ' + new Date(s.created_at).toLocaleDateString('nl-CW') }),
          el('strong', { text: fmt(s.total) }),
        ])) : [el('div', { class: 'muted', text: t('empty') })]),
      payments.length ? el('h4', { class: 'mt', text: t('credit_payment') }) : null,
      ...(payments.slice(0, 10).map((p) => el('div', { class: 'list-item' }, [
        el('span', { class: 'muted small', text: new Date(p.created_at).toLocaleDateString('nl-CW') }),
        el('strong', { class: 'pos', text: '−' + fmt(p.amount) }),
      ]))),
    ]);
    const m = modal(c.name, body);

    function payDialog(cust) {
      const amt = el('input', { class: 'input big', inputmode: 'decimal', placeholder: fmt(cust.balance, { symbol: false }) });
      const b = el('div', { class: 'form' }, [
        el('label', { class: 'muted', text: t('debt') + ': ' + fmt(cust.balance) }),
        amt,
        el('button', { class: 'btn primary block', text: t('save'), onclick: async () => {
          const cents = Math.min(toCents(amt.value), cust.balance);
          if (cents <= 0) { toast(t('required'), 'err'); return; }
          await data.addCreditPayment({ customer_id: cust.id, amount: cents, method: 'cash', by: currentUser().id, cash_session_id: (await data.currentCashSession())?.id });
          m.close(); toast(t('save')); reload();
        } }),
      ]);
      modal(t('add_credit_payment'), b);
    }
  }

  container.append(el('div', { class: 'page' }, [
    el('div', { class: 'page-head' }, [
      el('h2', { text: t('nav_customers') }),
      el('button', { class: 'btn primary', text: '+ ' + t('new_customer'), onclick: () => editCustomer(null) }),
    ]),
    list,
  ]));
  render();
}
