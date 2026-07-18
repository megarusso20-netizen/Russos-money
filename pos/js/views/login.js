// views/login.js — Selección de usuario + PIN. Funciona 100% offline.
import { el, clear, toast } from '../ui.js';
import { t, LANGS, getLang, setLang } from '../i18n.js';
import { business, login } from '../store.js';
import * as db from '../db.js';

export default async function loginView(container, { onLogin } = {}) {
  clear(container);
  const users = await db.all('users');
  const biz = business();
  let selected = users[0];
  let pin = '';

  const pinDisplay = el('div', { class: 'pin-dots' });
  const err = el('div', { class: 'error center' });

  function renderDots() {
    clear(pinDisplay);
    for (let i = 0; i < 4; i++) pinDisplay.appendChild(el('span', { class: 'dot' + (i < pin.length ? ' filled' : '') }));
  }

  async function tryLogin() {
    const u = await login(selected.id, pin);
    if (u) { onLogin && onLogin(); }
    else { err.textContent = t('wrong_pin'); pin = ''; renderDots(); }
  }

  function press(d) {
    if (d === 'del') pin = pin.slice(0, -1);
    else if (pin.length < 6) pin += d;
    err.textContent = '';
    renderDots();
    if (pin.length === 4) tryLogin();
  }

  const userChips = el('div', { class: 'user-chips' },
    users.map((u) => el('button', {
      class: 'chip' + (u.id === selected.id ? ' active' : ''),
      onclick: () => { selected = u; pin = ''; renderDots(); container.querySelectorAll('.user-chips .chip').forEach((c, i) => c.classList.toggle('active', users[i].id === u.id)); },
    }, [
      el('span', { class: 'chip-ico', text: u.role === 'owner' ? '👑' : '🧑‍🍳' }),
      el('span', { text: u.name }),
    ])));

  const keypad = el('div', { class: 'keypad' },
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'lang', '0', 'del'].map((k) => {
      if (k === 'lang') return el('button', { class: 'key key-mini', text: '🌐', onclick: cycleLang });
      if (k === 'del') return el('button', { class: 'key key-mini', text: '⌫', onclick: () => press('del') });
      return el('button', { class: 'key', text: k, onclick: () => press(k) });
    }));

  function cycleLang() {
    const i = LANGS.findIndex((l) => l.code === getLang());
    const next = LANGS[(i + 1) % LANGS.length];
    setLang(next.code);
    loginView(container, { onLogin });
  }

  container.appendChild(el('div', { class: 'login-card' }, [
    el('div', { class: 'login-logo', text: '🥪' }),
    el('h1', { class: 'login-title', text: biz ? biz.name : t('app_name') }),
    el('p', { class: 'muted center', text: t('enter_pin') }),
    userChips,
    pinDisplay,
    err,
    keypad,
    el('p', { class: 'hint center', text: 'Dueño PIN 1234 · Cajero PIN 1111' }),
  ]));
  renderDots();
}
