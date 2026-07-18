// money.js — Todo el dinero se maneja en CÉNTIMOS (enteros). Nunca float.
// XCG por defecto; símbolo/decimales configurables desde el negocio.

let CONFIG = { code: 'XCG', symbol: 'ƒ', decimals: 2 };

export function setCurrency({ code, symbol, decimals } = {}) {
  if (code) CONFIG.code = code;
  if (symbol) CONFIG.symbol = symbol;
  if (typeof decimals === 'number') CONFIG.decimals = decimals;
}

export function currency() {
  return { ...CONFIG };
}

// Convierte texto/valor ingresado (ej. "12.50") a céntimos (1250).
export function toCents(value) {
  if (value === '' || value == null) return 0;
  if (typeof value === 'number') return Math.round(value * 100);
  const n = parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// Céntimos -> número decimal (1250 -> 12.5)
export function toUnits(cents) {
  return (cents || 0) / 100;
}

// Formatea céntimos como texto de moneda: 1250 -> "ƒ 12.50"
export function fmt(cents, { symbol = true } = {}) {
  const d = CONFIG.decimals;
  const neg = cents < 0;
  const abs = Math.abs(cents || 0);
  const s = (abs / 100).toLocaleString('nl-CW', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
  const body = `${neg ? '-' : ''}${s}`;
  return symbol ? `${CONFIG.symbol} ${body}` : body;
}

// Redondeo seguro para multiplicaciones cantidad × precio.
export function lineTotal(unitPriceCents, qty) {
  return Math.round((unitPriceCents || 0) * (qty || 0));
}
