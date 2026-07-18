// router.js — Enrutador hash mínimo. Cada vista exporta render(container, params).
const routes = {};
let outlet = null;
let onNavigate = null;

export function register(path, view) { routes[path] = view; }
export function setOutlet(node) { outlet = node; }
export function setOnNavigate(fn) { onNavigate = fn; }

export function go(path) {
  if (location.hash === '#' + path) render();
  else location.hash = path;
}

export function current() { return (location.hash || '#pos').slice(1); }

// Serializa los renders: las vistas son async y un cambio de ruta rápido
// (o una doble invocación) podría solaparlas y duplicar el DOM. Un solo
// render corre a la vez y solo el más reciente se pinta.
let renderChain = Promise.resolve();
let gen = 0;

export function render() {
  renderChain = renderChain.then(_render).catch(() => {});
  return renderChain;
}

async function _render() {
  const my = ++gen;
  const [path, query] = current().split('?');
  const view = routes[path] || routes['pos'];
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  if (outlet) {
    outlet.innerHTML = '';
    const spinner = document.createElement('div');
    spinner.className = 'view-loading';
    outlet.appendChild(spinner);
    try {
      await view(outlet, params);
    } finally {
      if (my === gen) spinner.remove();
    }
  }
  if (my === gen && onNavigate) onNavigate(path);
}

// Solo engancha la navegación por hash. El primer pintado lo dispara el shell
// con render(), para evitar un doble render al arrancar.
export function initRouter() {
  window.addEventListener('hashchange', render);
}
