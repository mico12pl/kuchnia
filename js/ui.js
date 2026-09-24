// Wspólne elementy interfejsu: ikony, akcje, okienka od dołu, powiadomienia.
import { esc, fmtNum, tagColor } from './util.js';

const P = {
  book: '<path d="M6 4.5A1.5 1.5 0 0 1 7.5 3H18v15H7.5A1.5 1.5 0 0 0 6 19.5v-15Z"/><path d="M6 19.5A1.5 1.5 0 0 0 7.5 21H18v-3"/><path d="M9.5 7h5"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.4" fill="currentColor"/><circle cx="15" cy="9" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="9" cy="15" r="1.4" fill="currentColor"/><circle cx="15" cy="15" r="1.4" fill="currentColor"/>',
  list: '<path d="M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11"/><circle cx="5.5" cy="18" r="1.5"/><path d="M11 6.5h9M11 12.5h9M11 18h9"/>',
  more: '<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chevR: '<path d="M9.5 6l6 6-6 6"/>',
  chevL: '<path d="M14.5 6l-6 6 6 6"/>',
  chevU: '<path d="M6 14.5l6-6 6 6"/>',
  chevD: '<path d="M6 9.5l6 6 6-6"/>',
  pencil: '<path d="M4 20l1-4L16 5l3 3L8 19l-4 1Z"/><path d="M14 7l3 3"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/><path d="M10.5 11v5M13.5 11v5"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/>',
  cloudOff: '<path d="M3 3l18 18"/><path d="M8 7.5A5 5 0 0 1 16.5 10a4 4 0 0 1 3 6.3M16 19H7a4 4 0 0 1-1.5-7.7"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.3-3.8 4.2-5.5 7.5-5.5s6.2 1.7 7.5 5.5"/>',
  folder: '<path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4.5l2 2H19A1.5 1.5 0 0 1 20.5 9v9A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18V7Z"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.6"/><path d="M4 4v4.6h4.6M12 8v4l3 2"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/><path d="M4 12h2M10 12h10"/><circle cx="8" cy="12" r="2"/>',
  pantry: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M5 9h14M5 14.5h14M10.5 6.3h3M10.5 11.7h3M10.5 17.2h3"/>',
  bowl: '<path d="M4 11h16a8 8 0 0 1-16 0Z"/><path d="M9 7.5c0-1 1-1.5 1-2.5M14 7.5c0-1 1-1.5 1-2.5"/>',
  star: '<path d="M12 3.8l2.5 5.2 5.6.7-4.1 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.7L12 3.8Z"/>',
  logout: '<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 7"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.2v.3"/>',
  xCircle: '<circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/>',
  move: '<path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9"/><path d="M19.5 4v5h-5"/>',
};
export function icon(name, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
}
export const GOOGLE_G = '<svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

// ---------- rejestr akcji (delegacja zdarzeń) ----------
const actions = {};
const inputs = {};
export function on(name, fn) { actions[name] = fn; }
export function onInput(name, fn) { inputs[name] = fn; }
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});
document.addEventListener('input', e => {
  const el = e.target.closest('[data-in]');
  if (el && inputs[el.dataset.in]) inputs[el.dataset.in](el, e);
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]');
  if (el && inputs[el.dataset.change]) inputs[el.dataset.change](el, e);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    const el = e.target.closest('[data-enter]');
    if (el && actions[el.dataset.enter]) { e.preventDefault(); actions[el.dataset.enter](el, e); }
  }
  if (e.key === 'Escape' && sheet.current) sheet.close();
});

// ---------- komponenty ----------
export function tagPill(tag, extra = '') {
  return `<span class="tag" style="--tag:${tagColor(tag)}" ${extra}><i></i>${esc(tag)}</span>`;
}
export function tagChip(tag, selected, act, extra = '') {
  return `<button type="button" class="chip${selected ? ' on' : ''}" style="--tag:${tagColor(tag)}" data-act="${act}" data-tag="${esc(tag)}" aria-pressed="${selected}" ${extra}>${selected ? icon('check', 'chk') : '<i></i>'}${esc(tag)}</button>`;
}
export function dot(tag) { return tag ? `<i class="dot" style="--tag:${tagColor(tag)}"></i>` : '<i class="dot hollow"></i>'; }
export function stars(value, { act = '', size = '', label = '' } = {}) {
  let s = `<span class="stars ${size}" ${label ? `aria-label="${esc(label)}"` : ''}>`;
  for (let i = 1; i <= 5; i++) {
    const full = value >= i;
    s += act
      ? `<button type="button" class="star${full ? ' full' : ''}" data-act="${act}" data-v="${i}" aria-label="${i} z 5">${icon('star')}</button>`
      : `<span class="star${full ? ' full' : ''}">${icon('star')}</span>`;
  }
  return s + '</span>';
}
export function avgText(v) { return v == null ? '' : fmtNum(Math.round(v * 10) / 10).replace(/^(\d)$/, '$1,0'); }
export function empty(illu, title, text, actionsHtml = '') {
  return `<div class="empty">${illu}<h2>${esc(title)}</h2><p>${text}</p>${actionsHtml}</div>`;
}

// ---------- okienko od dołu ----------
export const sheet = {
  current: null,
  open({ title, sub = '', body, footer = '', onClose, cls = '' }) {
    this.close(true);
    const root = document.getElementById('sheet-root');
    root.innerHTML = `<div class="scrim" data-act="sheet-close"></div>
      <section class="sheet ${cls}" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div class="grip"></div>
        <header class="sheet-head"><div><h2 id="sheet-title">${esc(title)}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div>
          <button class="round-x" data-act="sheet-close" aria-label="Zamknij">${icon('x')}</button></header>
        <div class="sheet-body">${body}</div>
        ${footer ? `<footer class="sheet-foot">${footer}</footer>` : ''}
      </section>`;
    root.classList.add('open');
    document.body.classList.add('sheet-open');
    this.current = { onClose };
    requestAnimationFrame(() => root.querySelector('.sheet')?.classList.add('in'));
    const f = root.querySelector('[autofocus]');
    if (f) setTimeout(() => f.focus(), 60);
  },
  update({ body, footer, sub }) {
    const root = document.getElementById('sheet-root');
    if (body != null) { const b = root.querySelector('.sheet-body'); const st = b.scrollTop; b.innerHTML = body; b.scrollTop = st; }
    if (footer != null) { const f = root.querySelector('.sheet-foot'); if (f) f.innerHTML = footer; }
    if (sub != null) { const s = root.querySelector('.sheet-head .sub'); if (s) s.innerHTML = sub; }
  },
  close(silent) {
    const root = document.getElementById('sheet-root');
    if (!this.current) return;
    const cb = this.current.onClose;
    this.current = null;
    root.classList.remove('open');
    root.innerHTML = '';
    document.body.classList.remove('sheet-open');
    if (!silent && cb) cb();
  },
};
on('sheet-close', () => sheet.close());

// ---------- powiadomienia ----------
let toastTimer;
export function toast(msg, { undo, ms = 5000, error = false } = {}) {
  const root = document.getElementById('toast-root');
  clearTimeout(toastTimer);
  root.innerHTML = `<div class="toast${error ? ' err' : ''}" role="status"><span>${esc(msg)}</span>${undo ? '<button data-act="toast-undo">Cofnij</button>' : ''}</div>`;
  root._undo = undo;
  toastTimer = setTimeout(() => { root.innerHTML = ''; root._undo = null; }, ms);
}
on('toast-undo', () => {
  const root = document.getElementById('toast-root');
  const u = root._undo; root._undo = null; root.innerHTML = '';
  if (u) u();
});

export function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 2 + 'px';
}
document.addEventListener('input', e => { if (e.target.matches('textarea.grow')) autoGrow(e.target); });

export async function copyText(txt) {
  try { await navigator.clipboard.writeText(txt); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}
