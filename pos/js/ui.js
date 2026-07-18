// ui.js — Helpers de DOM y componentes livianos (sin framework).
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'value') node.value = v;
    else if (k === 'checked') node.checked = !!v;
    else node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null || c === false) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

let toastTimer;
export function toast(msg, kind = 'ok') {
  let t = document.getElementById('toast');
  if (!t) { t = el('div', { id: 'toast' }); document.body.appendChild(t); }
  t.className = 'toast show ' + kind;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// Modal reutilizable. Devuelve {close}.
export function modal(title, contentNode, { onClose } = {}) {
  const overlay = el('div', { class: 'modal-overlay' });
  const close = () => { overlay.remove(); onClose && onClose(); };
  const box = el('div', { class: 'modal' }, [
    el('div', { class: 'modal-head' }, [
      el('h3', { text: title }),
      el('button', { class: 'icon-btn', text: '✕', onclick: close }),
    ]),
    el('div', { class: 'modal-body' }, [contentNode]),
  ]);
  overlay.appendChild(box);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
  return { close, overlay };
}

// Confirmación con PIN de autorización (para descuentos, ajustes, cancelaciones).
import { verifyAuthPin } from './store.js';
import { t } from './i18n.js';
export function requireAuth(action) {
  return new Promise((resolve) => {
    const input = el('input', { type: 'password', inputmode: 'numeric', class: 'input big', placeholder: '••••', maxlength: '6' });
    const err = el('div', { class: 'error' });
    const submit = async () => {
      const ok = await verifyAuthPin(input.value);
      if (ok) { m.close(); resolve(true); }
      else { err.textContent = t('wrong_pin'); input.value = ''; input.focus(); }
    };
    const body = el('div', {}, [
      el('p', { class: 'muted', text: action || t('authorize') }),
      input, err,
      el('button', { class: 'btn primary block', text: t('authorize'), onclick: submit }),
    ]);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    const m = modal(t('authorization'), body, { onClose: () => resolve(false) });
    setTimeout(() => input.focus(), 50);
  });
}

export function confirmBox(message) {
  return new Promise((resolve) => {
    const body = el('div', {}, [
      el('p', { text: message, class: 'confirm-msg' }),
      el('div', { class: 'row gap' }, [
        el('button', { class: 'btn ghost', text: t('cancel'), onclick: () => { m.close(); resolve(false); } }),
        el('button', { class: 'btn primary', text: t('confirm'), onclick: () => { m.close(); resolve(true); } }),
      ]),
    ]);
    const m = modal(t('confirm'), body, { onClose: () => resolve(false) });
  });
}
