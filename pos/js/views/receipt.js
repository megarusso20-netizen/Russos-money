// views/receipt.js — Recibo: vista, imprimir (ventana) y compartir (Web Share).
import { el, modal, toast } from '../ui.js';
import { t } from '../i18n.js';
import { fmt } from '../money.js';
import { business } from '../store.js';

function receiptText(sale) {
  const biz = business();
  const lines = [];
  lines.push((biz?.name || 'Snack').toUpperCase());
  lines.push('Ticket #' + sale.number);
  lines.push(new Date(sale.created_at).toLocaleString('nl-CW'));
  lines.push('--------------------------------');
  sale.items.forEach((l) => {
    lines.push(`${l.qty} x ${l.name}${l.factor > 1 ? ' (' + l.unit_label + ')' : ''}`);
    lines.push(`    ${fmt(l.line_total)}`);
  });
  lines.push('--------------------------------');
  lines.push(`${t('subtotal')}: ${fmt(sale.subtotal)}`);
  if (sale.discount_cents) lines.push(`${t('discount')}: -${fmt(sale.discount_cents)}`);
  if (sale.tax_cents) lines.push(`${t('tax')}: ${fmt(sale.tax_cents)}`);
  lines.push(`${t('total')}: ${fmt(sale.total)}`);
  sale.payments.forEach((p) => lines.push(`${t(p.method)}: ${fmt(p.amount)}`));
  lines.push('');
  lines.push(biz?.receipt_footer || 'Danki!');
  return lines.join('\n');
}

export function showReceipt(sale, onDone) {
  const biz = business();
  const body = el('div', { class: 'receipt' }, [
    el('div', { class: 'r-head' }, [
      el('strong', { text: biz?.name || 'Snack' }),
      el('div', { class: 'muted', text: 'Ticket #' + sale.number }),
      el('div', { class: 'muted small', text: new Date(sale.created_at).toLocaleString('nl-CW') }),
    ]),
    el('div', { class: 'r-items' }, sale.items.map((l) =>
      el('div', { class: 'r-line' }, [
        el('span', { text: `${l.qty}× ${l.name}${l.factor > 1 ? ' · ' + l.unit_label : ''}` }),
        el('span', { text: fmt(l.line_total) }),
      ]))),
    el('div', { class: 'r-totals' }, [
      sale.discount_cents ? line(t('discount'), '−' + fmt(sale.discount_cents)) : null,
      line(t('total'), fmt(sale.total), true),
      ...sale.payments.map((p) => line(t(p.method), fmt(p.amount))),
    ]),
    el('div', { class: 'r-foot muted center', text: biz?.receipt_footer || 'Danki!' }),
    el('div', { class: 'row gap mt' }, [
      el('button', { class: 'btn ghost', text: '🖨️ ' + t('print_receipt'), onclick: () => printReceipt(sale) }),
      el('button', { class: 'btn ghost', text: '📤 ' + t('share_receipt'), onclick: () => shareReceipt(sale) }),
      el('button', { class: 'btn primary', text: t('new_sale'), onclick: () => { m.close(); onDone && onDone(); } }),
    ]),
  ]);
  const m = modal(t('sale_done'), body, { onClose: onDone });
}

function line(label, value, big) {
  return el('div', { class: 'r-total-row' + (big ? ' big' : '') }, [el('span', { text: label }), el('strong', { text: value })]);
}

function printReceipt(sale) {
  const w = window.open('', '_blank', 'width=320,height=600');
  if (!w) { toast(t('print_receipt'), 'err'); return; }
  w.document.write(`<pre style="font:13px monospace;padding:8px;white-space:pre-wrap">${receiptText(sale)}</pre>`);
  w.document.close(); w.focus(); w.print();
}

async function shareReceipt(sale) {
  const text = receiptText(sale);
  if (navigator.share) { try { await navigator.share({ title: 'Ticket #' + sale.number, text }); return; } catch (e) {} }
  await navigator.clipboard?.writeText(text);
  toast(t('share_receipt'));
}
