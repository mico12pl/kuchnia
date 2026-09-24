// Lista zakupów.
import * as st from '../store.js';
import { S } from '../store.js';
import { esc, instrumental, norm, plural } from '../util.js';
import { empty, icon, on, onInput, sheet, toast } from '../ui.js';
import { openPlanToList } from './sheets.js';
import { weekStart } from '../util.js';

const ILLU_BASKET = `<svg class="illu" viewBox="0 0 120 100" aria-hidden="true"><path d="M40 42a20 20 0 0 1 40 0" fill="none" stroke="var(--ink)" stroke-width="2.5"/><path d="M24 42h72l-8 44a6 6 0 0 1-6 5H38a6 6 0 0 1-6-5Z" fill="var(--mod-accent)" stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round"/><path d="M48 56v20M60 56v20M72 56v20" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round"/><circle cx="95" cy="26" r="7" fill="#FFD23F" stroke="var(--ink)" stroke-width="2.5"/><path d="M18 24l6 4M14 34h7" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round"/></svg>`;

export function avatars() {
  const names = [S.user?.name, ...st.people()].filter(Boolean).slice(0, 3);
  return `<div class="avatars" aria-label="${esc(names.join(', '))}">${names.map((n, i) => `<span class="av a${i}">${esc(n[0].toUpperCase())}</span>`).join('')}</div>`;
}
export function offlineBanner() {
  const n = st.pendingCount();
  if (!n || (S.online && !S.sessionExpired)) return '';
  return `<div class="offline">${icon('cloudOff')}<div><b>${n} ${plural(n, 'zmiana czeka', 'zmiany czekają', 'zmian czeka')} na wysłanie</b>
    <span>${S.sessionExpired ? 'Sesja wygasła. Wyślę je po odświeżeniu sesji.' : 'Brak internetu. Wyślę je, gdy wróci sieć.'}</span></div></div>`;
}

export const listView = {
  mod: 'lista', nav: true, refresh: ['lista', 'produkty'], poll: 15000,
  render() {
    const items = S.t.lista;
    const left = items.filter(i => !i.kupione).length;
    const bought = items.length - left;
    const p = st.people();
    const shared = p.length ? ` · wspólna z ${esc(instrumental(p[0]))}` : '';
    const head = `<header class="mod-head"><div class="head-flex"><h1>Lista zakupów</h1>${avatars()}</div>
      <p class="sub">${left ? `${left} do kupienia` : 'Nic do kupienia'}${shared}</p>${offlineBanner()}</header>`;
    if (!items.length) {
      if (!S.loadedTables.has('lista')) return head + '<div class="loading">Wczytuję listę…</div>';
      const freq = st.frequent();
      return head + empty(ILLU_BASKET, 'Lista jest pusta', 'Dodaj pierwszy produkt albo zbierz składniki z tego, co macie w planie tygodnia.',
        `<button class="btn ghost small-w" data-act="ls-from-plan">${icon('calendar')} Zbierz z planu tygodnia</button>`) +
        (freq.length ? `<section class="page"><h2 class="h2s">Często kupujecie</h2><div class="chips">${freq.map(f => `<button class="chip plain" data-act="ls-quick" data-n="${esc(f.nazwa)}">${icon('plus', 'plus-g')}${esc(f.nazwa)}</button>`).join('')}</div></section>` : '') +
        `<div class="dock"><button class="btn primary grow" data-act="ls-add">${icon('plus')} Dodaj produkt</button></div>`;
    }
    const order = st.orderedDepts();
    const groups = new Map(order.map(d => [d, []]));
    for (const it of items) {
      const d = groups.has(it.dzial) ? it.dzial : 'Inne';
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d).push(it);
    }
    let html = '';
    for (const [dept, arr] of groups) {
      if (!arr.length) continue;
      arr.sort((a, b) => a.kupione - b.kupione);
      const n = arr.filter(i => !i.kupione).length;
      html += `<section class="dept"><h2>${esc(dept)} <small>${n ? `${n} do kupienia` : 'wszystko kupione'}</small></h2>
        ${arr.map(it => `<button class="li${it.kupione ? ' done' : ''}" data-act="ls-toggle" data-id="${it.id}" role="checkbox" aria-checked="${it.kupione}">
          <i class="box">${icon('check')}</i><span class="grow"><span class="nm">${esc(it.nazwa)}</span>${it.zPrzepisu && !it.kupione ? `<small>${esc(it.zPrzepisu)}</small>` : ''}</span><span class="q">${esc(it.ilosc)}</span></button>`).join('')}</section>`;
    }
    return head + `<div class="page">${bought ? `<div class="right"><button class="link-btn strong" data-act="ls-clear">${icon('trash')} Usuń kupione (${bought})</button></div>` : ''}${html}</div>
      <div class="dock"><button class="btn primary grow" data-act="ls-add">${icon('plus')} Dodaj produkt</button></div>`;
  },
};
on('ls-toggle', el => st.listToggle(el.dataset.id));
on('ls-clear', () => {
  const n = S.t.lista.filter(i => i.kupione).length;
  const ids = st.listRemoveBought();
  toast(`Usunięto ${n} ${plural(n, 'kupiony produkt', 'kupione produkty', 'kupionych produktów')}. W spiżarni: „jest”.`, { undo: () => st.undo(ids) });
});
on('ls-quick', el => { st.listAdd([{ nazwa: el.dataset.n }]); });
on('ls-from-plan', () => openPlanToList(weekStart()));

// ----- Dodaj produkt -----
const AP = { name: '', qty: '', dept: null, change: false, added: [] };
function apDept() {
  if (AP.dept) return AP.dept;
  if (!AP.name.trim()) return 'Inne';
  if (st.product(AP.name)) return st.deptFor(AP.name);
  const g = st.deptFor(AP.name);
  if (g !== 'Inne') return g;
  const first = apSugg()[0];
  return first ? (first.dzial || st.deptFor(first.nazwa)) : g;
}
function apSugg() {
  const q = norm(AP.name);
  if (!q) return [];
  const names = new Map();
  for (const p of S.t.produkty) names.set(norm(p.nazwa), { nazwa: p.nazwa, dzial: p.dzial });
  for (const n of st.knownIngredientNames()) if (!names.has(norm(n))) names.set(norm(n), { nazwa: n, dzial: st.deptFor(n) });
  return [...names.values()].filter(p => norm(p.nazwa).includes(q) && norm(p.nazwa) !== q)
    .sort((a, b) => norm(b.nazwa).startsWith(q) - norm(a.nazwa).startsWith(q)).slice(0, 4);
}
function apSuggHtml() {
  return apSugg().map(p => `<button class="sugg-row" data-act="ap-pick" data-n="${esc(p.nazwa)}"><span>${esc(p.nazwa)}</span><small>${esc(p.dzial || st.deptFor(p.nazwa))}</small></button>`).join('');
}
function apDeptHtml() {
  const d = apDept();
  if (AP.change) return `<div class="chips">${st.orderedDepts().map(x => `<button class="chip plain${x === d ? ' on-mint' : ''}" data-act="ap-dept" data-d="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
  return `<div class="dept-box"><div><b>${esc(d)}</b><small>${AP.dept ? 'wybrany ręcznie' : (st.product(AP.name)?.dzial ? 'zapamiętany' : 'dobrany automatycznie')}</small></div><button class="link-btn strong mint" data-act="ap-change">Zmień</button></div>`;
}
function apBody() {
  return `<label class="lbl" for="ap-n">Nazwa</label>
    <input class="field big" id="ap-n" value="${esc(AP.name)}" data-in="ap-name" data-enter="ap-save" autocomplete="off" autofocus enterkeyhint="done" placeholder="np. pomidor">
    <div id="ap-sugg">${apSuggHtml()}</div>
    <label class="lbl" for="ap-q">Ilość <em>opcjonalnie</em></label>
    <input class="field" id="ap-q" value="${esc(AP.qty)}" data-in="ap-qty" data-enter="ap-save" placeholder="np. 500 g albo 2 szt" autocomplete="off">
    <label class="lbl">Dział</label><div id="ap-dept">${apDeptHtml()}</div>
    ${AP.added.length ? `<p class="note">Dodano: ${esc(AP.added.join(', '))}.</p>` : ''}`;
}
on('ls-add', () => {
  Object.assign(AP, { name: '', qty: '', dept: null, change: false, added: [] });
  sheet.open({ title: 'Dodaj produkt', body: apBody(), footer: `<button class="btn primary mod-lista" data-act="ap-save">${icon('plus')} Dodaj do listy</button>`, cls: 'tall' });
});
onInput('ap-name', el => {
  AP.name = el.value;
  if (!AP.change) AP.dept = null;
  document.getElementById('ap-sugg').innerHTML = apSuggHtml();
  document.getElementById('ap-dept').innerHTML = apDeptHtml();
});
onInput('ap-qty', el => { AP.qty = el.value; });
on('ap-pick', el => {
  AP.name = el.dataset.n; AP.dept = null;
  const n = document.getElementById('ap-n'); n.value = AP.name;
  document.getElementById('ap-sugg').innerHTML = '';
  document.getElementById('ap-dept').innerHTML = apDeptHtml();
  document.getElementById('ap-q').focus();
});
on('ap-change', () => { AP.change = true; document.getElementById('ap-dept').innerHTML = apDeptHtml(); });
on('ap-dept', el => { AP.dept = el.dataset.d; AP.change = false; document.getElementById('ap-dept').innerHTML = apDeptHtml(); });
on('ap-save', () => {
  const name = AP.name.trim();
  if (!name) { document.getElementById('ap-n').focus(); return; }
  if (st.isBasic(name)) toast(`„${name}” jest na liście podstaw – dodaję mimo to.`);
  st.listAdd([{ nazwa: name, ilosc: AP.qty.trim(), dzial: apDept(), manual: !!AP.dept }]);
  AP.added.push(name);
  Object.assign(AP, { name: '', qty: '', dept: null, change: false });
  sheet.update({ body: apBody() });
  document.getElementById('ap-n')?.focus();
});
