// views/settings.js — Configuración del negocio: nombre, idioma, moneda, tema, cocina.
import { el, clear, toast, confirmBox } from '../ui.js';
import { t, LANGS, getLang, setLang } from '../i18n.js';
import { business, loadBusiness, toggleTheme, applyTheme, isOwner } from '../store.js';
import { setCurrency } from '../money.js';
import * as db from '../db.js';

export default async function settingsView(container) {
  clear(container);
  const biz = business() || {};

  const name = el('input', { class: 'input', value: biz.name || '', placeholder: t('business_name') });
  const symbol = el('input', { class: 'input', value: biz.symbol || 'ƒ' });
  const code = el('input', { class: 'input', value: biz.currency || 'XCG' });
  const tax = el('input', { class: 'input', value: biz.tax_percent || 0, inputmode: 'decimal' });
  const footer = el('input', { class: 'input', value: biz.receipt_footer || '', placeholder: t('receipt_footer') });

  const langSel = el('div', { class: 'seg' }, LANGS.map((l) => el('button', {
    class: 'seg-btn' + (l.code === getLang() ? ' active' : ''),
    text: l.label,
    onclick: (e) => { setLang(l.code); container.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active')); e.currentTarget.classList.add('active'); },
  })));

  const kitchen = toggle(biz.kitchen_mode, t('kitchen_mode'));

  async function save() {
    const b = business() || { id: 'current' };
    b.name = name.value.trim() || 'Snack';
    b.symbol = symbol.value || 'ƒ';
    b.currency = code.value || 'XCG';
    b.tax_percent = parseFloat(tax.value) || 0;
    b.receipt_footer = footer.value;
    b.lang = getLang();
    b.kitchen_mode = kitchen.get();
    b.decimals = 2;
    await db.put('business', b);
    await loadBusiness();
    setCurrency({ code: b.currency, symbol: b.symbol, decimals: 2 });
    toast(t('save'));
  }

  container.append(el('div', { class: 'page' }, [
    el('div', { class: 'page-head' }, [el('h2', { text: t('nav_settings') })]),

    section(t('business'), [
      formRow(t('business_name'), name),
      el('div', { class: 'row gap' }, [formRow(t('currency_label'), code), formRow('Símbolo', symbol)]),
      formRow(t('tax') + ' %', tax),
      formRow(t('receipt_footer'), footer),
      kitchen.node,
    ]),

    section(t('language'), [langSel]),

    section(t('theme'), [
      el('button', { class: 'btn ghost block', text: '🌗 ' + t('theme'), onclick: () => toggleTheme() }),
    ]),

    el('button', { class: 'btn primary block lg', text: t('save'), onclick: save }),

    isOwner() ? section(t('users_roles'), [usersBlock()]) : null,

    el('div', { class: 'danger-zone' }, [
      el('button', { class: 'btn danger ghost block', text: '⟲ Reset demo', onclick: async () => {
        if (await confirmBox('¿Borrar todos los datos locales?')) { await db.wipe(); location.reload(); }
      } }),
    ]),
    el('p', { class: 'muted center small', text: 'Snack POS · Curaçao · v0.1 (MVP local-first)' }),
  ]));
}

function section(title, children) {
  return el('div', { class: 'card' }, [el('h3', { text: title }), ...children]);
}
function formRow(label, node) {
  return el('label', { class: 'field' }, [el('span', { class: 'field-lbl', text: label }), node]);
}
function toggle(initial, label) {
  let val = initial;
  const box = el('button', { class: 'toggle' + (val ? ' on' : ''), onclick: () => { val = !val; box.classList.toggle('on', val); } }, [
    el('span', { class: 'toggle-dot' }), el('span', { class: 'toggle-lbl', text: label }),
  ]);
  return { node: box, get: () => val };
}
function usersBlock() {
  const wrap = el('div', { class: 'list', id: 'usersList' });
  db.all('users').then((users) => users.forEach((u) => wrap.appendChild(
    el('div', { class: 'list-item' }, [
      el('span', { text: (u.role === 'owner' ? '👑 ' : '🧑‍🍳 ') + u.name }),
      el('span', { class: 'tag', text: t('role_' + u.role) }),
    ]))));
  return wrap;
}
