// seed.js — Siembra inicial: negocio, usuarios demo, categorías y productos
// que demuestran caja↔unidad (cerveza) y receta opcional (hamburguesa).
import * as db from './db.js';

export async function seedIfEmpty() {
  const business = await db.get('business', 'current');
  if (business) return false;

  await db.put('business', {
    id: 'current', name: 'Mi Snack', currency: 'XCG', symbol: 'ƒ', decimals: 2,
    lang: 'es', tax_percent: 0, kitchen_mode: true,
    receipt_footer: 'Danki! / ¡Gracias!', created_at: Date.now(), synced: false,
  }, { queue: false });

  await db.bulkPut('users', [
    { id: db.uid(), name: 'Dueño', role: 'owner', pin: '1234', created_at: Date.now() },
    { id: db.uid(), name: 'Cajero', role: 'cashier', pin: '1111', created_at: Date.now() },
  ]);

  const cats = [
    { id: db.uid(), name: 'Bebidas', icon: '🥤', order: 1 },
    { id: db.uid(), name: 'Cervezas', icon: '🍺', order: 2 },
    { id: db.uid(), name: 'Snacks', icon: '🍔', order: 3 },
    { id: db.uid(), name: 'Ingredientes', icon: '📦', order: 9 },
  ];
  await db.bulkPut('categories', cats);
  const [bebidas, cervezas, snacks, ingr] = cats.map((c) => c.id);

  // Ingredientes (con stock, sin ser favoritos de venta)
  const pan = ing('Pan de hamburguesa', ingr, 15);
  const carne = ing('Carne', ingr, 40);
  const queso = ing('Queso', ingr, 20);

  const products = [
    pan, carne, queso,
    prod('Coca-Cola', bebidas, 350, '🥤', true, [
      unit('unit', 'Unidad', 1, 350),
    ]),
    // Cerveza: se compra por caja (24) y se vende por unidad o por caja.
    prod('Amstel Bright', cervezas, 300, '🍺', true, [
      unit('unit', 'Unidad', 1, 300),
      unit('box', 'Caja x24', 24, 6000),
    ]),
    prod('Polar', cervezas, 275, '🍺', true, [
      unit('unit', 'Unidad', 1, 275),
      unit('box', 'Caja x24', 24, 5500),
    ]),
    // Hamburguesa con receta opcional -> descuenta pan/carne/queso
    {
      id: db.uid(), name: 'Hamburguesa', category_id: snacks, price: 1200, icon: '🍔',
      favorite: true, track_stock: false, has_recipe: true,
      recipe: [
        { product_id: pan.id, qty: 1 },
        { product_id: carne.id, qty: 1 },
        { product_id: queso.id, qty: 1 },
      ],
      units: [unit('unit', 'Unidad', 1, 1200)],
      created_at: Date.now(), synced: false,
    },
    prod('Papas fritas', snacks, 600, '🍟', true, [unit('unit', 'Unidad', 1, 600)]),
  ];
  await db.bulkPut('products', products);

  await db.bulkPut('customers', [
    { id: db.uid(), name: 'Cliente General', phone: '', balance: 0, credit_limit: 0, created_at: Date.now() },
  ]);
  return true;
}

function unit(kind, label, factor, price) {
  return { id: 'u_' + kind + '_' + factor, kind, label, factor, price };
}
function prod(name, category_id, price, icon, favorite, units) {
  return {
    id: db.uid(), name, category_id, price, icon, favorite,
    track_stock: true, has_recipe: false, recipe: [], units,
    min_stock: 0, created_at: Date.now(), synced: false,
  };
}
function ing(name, category_id, price) {
  return {
    id: db.uid(), name, category_id, price, icon: '📦', favorite: false,
    track_stock: true, has_recipe: false, recipe: [],
    units: [unit('unit', 'Unidad', 1, price)], min_stock: 10,
    created_at: Date.now(), synced: false,
  };
}
