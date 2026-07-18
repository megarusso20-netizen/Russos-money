// views/products.js — Alta/edición de productos y categorías, con presentaciones y receta.
import { el, clear, modal, toast, confirmBox } from '../ui.js';
import { t } from '../i18n.js';
import { fmt, toCents } from '../money.js';
import * as db from '../db.js';

export default async function productsView(container) {
  clear(container);
  const categories = (await db.all('categories')).sort((a, b) => (a.order || 0) - (b.order || 0));
  const products = await db.all('products');

  const list = el('div', { class: 'list' });
  function renderList() {
    clear(list);
    const byCat = {};
    products.forEach((p) => { (byCat[p.category_id] ||= []).push(p); });
    categories.forEach((c) => {
      const items = byCat[c.id] || [];
      list.appendChild(el('div', { class: 'group-head', text: (c.icon || '') + ' ' + c.name }));
      items.forEach((p) => list.appendChild(el('button', { class: 'list-item', onclick: () => editProduct(p) }, [
        el('span', { text: (p.favorite ? '⭐ ' : '') + (p.icon || '') + ' ' + p.name }),
        el('span', { class: 'muted', text: fmt(p.price) + (p.units && p.units.length > 1 ? ' ⇄' : '') }),
      ])));
    });
  }

  async function reload() {
    products.length = 0; (await db.all('products')).forEach((p) => products.push(p)); renderList();
  }

  function editProduct(p) {
    const isNew = !p;
    const model = p ? JSON.parse(JSON.stringify(p)) : {
      id: db.uid(), name: '', category_id: categories[0]?.id, price: 0, icon: '🍽️',
      favorite: false, track_stock: true, has_recipe: false, recipe: [],
      units: [{ id: 'u_unit_1', kind: 'unit', label: t('unit'), factor: 1, price: 0 }],
      min_stock: 0, created_at: Date.now(), synced: false,
    };

    const name = input(model.name, t('name'));
    const price = input(model.price ? (model.price / 100).toFixed(2) : '', t('sell_price'), 'decimal');
    const icon = input(model.icon, '🍽️');
    const minStock = input(model.min_stock || '', t('min_stock'), 'numeric');
    const catSel = el('select', { class: 'input' }, categories.map((c) =>
      el('option', { value: c.id, text: c.name, selected: c.id === model.category_id })));
    const favToggle = toggle(model.favorite, t('favorite'));
    const trackToggle = toggle(model.track_stock, t('track_stock'));

    // Presentaciones (unidad / caja) — factor = unidades base
    const unitsBox = el('div', { class: 'units-box' });
    function renderUnits() {
      clear(unitsBox);
      model.units.forEach((u, i) => {
        unitsBox.appendChild(el('div', { class: 'unit-row' }, [
          input(u.label, t('name'), 'text', (v) => u.label = v),
          input(u.factor, t('factor'), 'numeric', (v) => u.factor = parseInt(v) || 1, u.factor === 1),
          input((u.price / 100 || 0).toFixed ? (u.price / 100).toFixed(2) : '', t('price'), 'decimal', (v) => u.price = toCents(v)),
          i > 0 ? el('button', { class: 'icon-btn', text: '✕', onclick: () => { model.units.splice(i, 1); renderUnits(); } }) : el('span'),
        ]));
      });
      unitsBox.appendChild(el('button', { class: 'link', text: '+ ' + t('presentations'), onclick: () => {
        model.units.push({ id: db.uid(), kind: 'box', label: t('box'), factor: 24, price: 0 }); renderUnits();
      } }));
    }
    renderUnits();

    const body = el('div', { class: 'form' }, [
      row2(name, icon),
      catSel,
      price,
      el('div', { class: 'toggles' }, [favToggle.node, trackToggle.node]),
      trackToggle ? minStock : null,
      el('label', { class: 'form-lbl', text: t('presentations') }),
      unitsBox,
      el('div', { class: 'row gap mt' }, [
        !isNew ? el('button', { class: 'btn danger', text: t('delete'), onclick: async () => {
          if (await confirmBox(t('delete') + ' ' + model.name + '?')) { await db.del('products', model.id); m.close(); reload(); }
        } }) : el('span'),
        el('button', { class: 'btn primary', text: t('save'), onclick: save }),
      ]),
    ]);

    async function save() {
      model.name = name.value.trim();
      if (!model.name) { toast(t('required'), 'err'); return; }
      model.price = toCents(price.value);
      model.icon = icon.value || '🍽️';
      model.category_id = catSel.value;
      model.favorite = favToggle.get();
      model.track_stock = trackToggle.get();
      model.min_stock = parseInt(minStock.value) || 0;
      // La presentación base (factor 1) toma el precio principal si está en 0
      const base = model.units.find((u) => u.factor === 1);
      if (base && !base.price) base.price = model.price;
      if (base) base.price = base.price || model.price;
      await db.put('products', model);
      m.close(); toast(t('save')); reload();
    }
    const m = modal(isNew ? t('new_product') : model.name, body);
  }

  function manageCategories() {
    const body = el('div', { class: 'list' }, [
      ...categories.map((c) => el('div', { class: 'list-item' }, [
        el('span', { text: (c.icon || '') + ' ' + c.name }),
      ])),
      el('button', { class: 'btn ghost block mt', text: '+ ' + t('new_category'), onclick: () => {
        const nm = input('', t('name')); const ic = input('🏷️', '🏷️');
        const b = el('div', { class: 'form' }, [row2(nm, ic), el('button', { class: 'btn primary', text: t('save'), onclick: async () => {
          if (!nm.value.trim()) return;
          const c = { id: db.uid(), name: nm.value.trim(), icon: ic.value || '🏷️', order: categories.length + 1 };
          await db.put('categories', c); categories.push(c); m2.close(); toast(t('save'));
        } })]);
        const m2 = modal(t('new_category'), b);
      } }),
    ]);
    modal(t('categories'), body);
  }

  container.append(el('div', { class: 'page' }, [
    el('div', { class: 'page-head' }, [
      el('h2', { text: t('nav_products') }),
      el('div', { class: 'row gap' }, [
        el('button', { class: 'btn ghost', text: t('categories'), onclick: manageCategories }),
        el('button', { class: 'btn primary', text: '+ ' + t('new_product'), onclick: () => editProduct(null) }),
      ]),
    ]),
    list,
  ]));
  renderList();
}

// helpers de formulario
function input(value, ph, mode = 'text', oninput, disabled) {
  const im = mode === 'decimal' ? 'decimal' : mode === 'numeric' ? 'numeric' : null;
  const node = el('input', { class: 'input', value: value ?? '', placeholder: ph, inputmode: im, disabled });
  if (oninput) node.addEventListener('input', (e) => oninput(e.target.value));
  return node;
}
function row2(a, b) { return el('div', { class: 'row gap' }, [a, b]); }
function toggle(initial, label) {
  let val = initial;
  const box = el('button', { class: 'toggle' + (val ? ' on' : ''), onclick: () => { val = !val; box.classList.toggle('on', val); } }, [
    el('span', { class: 'toggle-dot' }), el('span', { class: 'toggle-lbl', text: label }),
  ]);
  return { node: box, get: () => val };
}
