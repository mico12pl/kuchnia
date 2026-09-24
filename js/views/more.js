// Więcej: spiżarnia, „co zrobię z tego, co mam”, historia, ustawienia.
import * as st from '../store.js';
import { S } from '../store.js';
import { DAYS_SHORT, MONTHS_LOC, MONTHS_NOM, esc, instrumental, norm, parseDate, plural, relTime, weekStart, isoDate } from '../util.js';
import { avgText, dot, icon, on, onInput, toast } from '../ui.js';

const backTo = (href, label) => `<nav class="topnav"><a href="${href}">${icon('chevL')} ${label}</a></nav>`;

// ---------------- Więcej ----------------
export const moreView = {
  mod: 'wiecej', nav: true, refresh: ['produkty', 'historia'],
  render({ ctx }) {
    const u = S.user || {};
    const inHome = S.t.produkty.filter(p => p.wDomu).length;
    const last = [...S.t.historia].sort((a, b) => b.data.localeCompare(a.data))[0];
    const p = st.people();
    const demo = S.backend?.kind === 'demo';
    const url = S.backend?.folderUrl?.();
    return `<header class="mod-head"><h1>Więcej</h1>
      <div class="acct"><span class="av big a0">${esc((u.name || '?')[0])}</span><div><b>${esc(u.name || '')}</b>
        <small>${esc(u.email || '')}${demo ? ' · tryb demo' : ' · konto Google'}</small>
        <small><i class="live"></i>${demo ? 'Dane tylko w tej przeglądarce' : `Folder „Kuchnia” na Dysku${p.length ? ` · wspólny z ${esc(instrumental(p[0]))}` : ''}`}</small></div></div></header>
      <div class="page">
        <a class="navcard" href="#/spizarnia"><span class="ic c-blue">${icon('pantry')}</span><span class="grow"><b>Spiżarnia</b><small>${inHome} ${plural(inHome, 'rzecz', 'rzeczy', 'rzeczy')} w domu · co zrobić z tego, co jest</small></span>${icon('chevR', 'chev')}</a>
        <a class="navcard" href="#/historia"><span class="ic c-blue2">${icon('history')}</span><span class="grow"><b>Historia</b><small>${last ? `Ostatnio: ${esc(last.tytul)}, ${relDay(last.data)}` : 'Jeszcze nic nie zapisaliście'}</small></span>${icon('chevR', 'chev')}</a>
        <a class="navcard" href="#/ustawienia"><span class="ic c-grey">${icon('sliders')}</span><span class="grow"><b>Ustawienia</b><small>Działy sklepu, losowanie, podstawy, konto</small></span>${icon('chevR', 'chev')}</a>
        ${url ? `<a class="navcard" href="${url}" target="_blank" rel="noopener"><span class="ic c-grey">${icon('folder')}</span><span class="grow"><b>Folder na Dysku</b><small>Otwórz „Kuchnia” w Google Drive</small></span>${icon('chevR', 'chev')}</a>` : ''}
        <div class="sync"><span>${S.lastSync ? `Zsynchronizowano ${relTime(S.lastSync)}.` : 'Jeszcze nie zsynchronizowano.'}${st.pendingCount() ? ` ${st.pendingCount()} ${plural(st.pendingCount(), 'zmiana czeka', 'zmiany czekają', 'zmian czeka')} na wysłanie.` : ''}</span>
          <button class="link-btn strong" data-act="more-sync">${icon('refresh')} Synchronizuj</button></div>
        ${ctx?.installHint ? `<p class="note">${ctx.installHint}</p>` : ''}
      </div>`;
  },
};
function relDay(iso) {
  const d = parseDate(iso);
  const diff = Math.round((new Date().setHours(0, 0, 0, 0) - d) / 86400000);
  if (diff === 0) return 'dziś';
  if (diff === 1) return 'wczoraj';
  if (diff < 7) return ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'][d.getDay()];
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}
on('more-sync', async () => {
  toast('Synchronizuję…', { ms: 1500 });
  st.flush();
  await Promise.all([st.refresh(Object.keys(S.t), { force: true }), st.syncRecipes({ force: true })]);
  toast(S.online ? 'Wszystko aktualne.' : 'Brak internetu.');
});

// ---------------- Spiżarnia ----------------
let pantryInput = '';
export const pantryView = {
  mod: 'wiecej', nav: true, refresh: ['produkty'], recipes: true,
  render() {
    const prods = S.t.produkty.filter(p => !st.isBasic(p.nazwa));
    const inHome = prods.filter(p => p.wDomu).length;
    const best = st.pantryMatches()[0];
    const groups = new Map(st.orderedDepts().map(d => [d, []]));
    for (const p of prods) { const d = groups.has(p.dzial) ? p.dzial : 'Inne'; groups.get(d).push(p); }
    let html = '';
    for (const [dept, arr] of groups) {
      if (!arr.length) continue;
      arr.sort((a, b) => (b.wDomu - a.wDomu) || a.nazwa.localeCompare(b.nazwa, 'pl'));
      html += `<section class="dept"><h2>${esc(dept)} <small>${arr.filter(p => p.wDomu).length} z ${arr.length} w domu</small></h2>
        ${arr.map(p => `<div class="prow${p.wDomu ? '' : ' out'}"><span class="grow">${esc(p.nazwa)}</span>
          <button class="toggle${p.wDomu ? ' on' : ''}" data-act="pn-toggle" data-n="${esc(p.nazwa)}" aria-pressed="${p.wDomu}">${p.wDomu ? `${icon('check')} jest` : 'nie ma'}</button>
          <button class="x" data-act="pn-del" data-n="${esc(p.nazwa)}" aria-label="Usuń ${esc(p.nazwa)} z katalogu">${icon('x')}</button></div>`).join('')}</section>`;
    }
    return `<header class="mod-head">${backTo('#/wiecej', 'Więcej')}<h1>Spiżarnia</h1>
      <p class="sub">${inHome} ${plural(inHome, 'rzecz', 'rzeczy', 'rzeczy')} w domu · ${prods.length - inHome} się skończyło</p></header>
      <div class="page">
        <a class="hero-card" href="#/co-zrobie"><span class="ic c-yellow">${icon('bowl')}</span><span class="grow"><b>Co zrobię z tego, co mam?</b>
          <small>${best ? `${esc(best.r.tytul)} – masz ${best.have} z ${best.total} ${plural(best.total, 'składnika', 'składników', 'składników')}` : 'Dodaj przepisy ze składnikami'}</small></span>${icon('chevR', 'chev')}</a>
        <div class="add-line"><input class="field" id="pn-in" placeholder="Dodaj, np. czosnek" value="${esc(pantryInput)}" data-in="pn-in" data-enter="pn-add" list="dl-pn" autocomplete="off" aria-label="Dodaj do spiżarni">
          <button class="btn primary mod-wiecej" data-act="pn-add">${icon('plus')} Dodaj</button></div>
        <datalist id="dl-pn">${st.knownIngredientNames().map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        <p class="note">Bez ilości – tylko czy jest. Podstaw (${esc(st.settings().podstawy.join(', '))}) nie trzeba tu trzymać.</p>
        ${html || '<p class="note">Spiżarnia jest pusta. Produkty trafiają tu same, gdy usuwasz kupione z listy zakupów.</p>'}
      </div>`;
  },
};
onInput('pn-in', el => { pantryInput = el.value; });
on('pn-add', () => {
  const v = pantryInput.trim();
  if (!v) { document.getElementById('pn-in')?.focus(); return; }
  if (st.isBasic(v)) { toast(`„${v}” jest na liście podstaw – zawsze liczę, że jest.`); return; }
  st.setInHome(v, true);
  pantryInput = '';
  toast(`Dodano: ${st.canonical(v)}.`);
  requestAnimationFrame(() => document.getElementById('pn-in')?.focus());
});
on('pn-toggle', el => { const p = st.product(el.dataset.n); st.setInHome(el.dataset.n, !p?.wDomu); });
on('pn-del', el => { const id = st.removeProduct(el.dataset.n); toast(`Usunięto „${el.dataset.n}” z katalogu.`, { undo: () => st.undo(id) }); });

// ---------------- Co zrobię ----------------
export const makeView = {
  mod: 'wiecej', nav: true, refresh: ['produkty'], recipes: true,
  render() {
    const m = st.pantryMatches();
    return `<header class="mod-head">${backTo('#/spizarnia', 'Spiżarnia')}<h1>Co zrobię z tego, co mam?</h1>
      <p class="sub">Najpierw to, na co masz najwięcej składników. Podstaw (${esc(st.settings().podstawy.join(', '))}) nie liczę.</p></header>
      <div class="page">${m.length ? m.map((x, i) => `<section class="match">
        <div class="match-h"><a href="#/przepis/${encodeURIComponent(x.r.id)}" class="u"><b>${esc(x.r.tytul)}</b></a><span class="pill${x.have / x.total >= 0.75 ? ' hot' : ''}">${x.have} z ${x.total} ${plural(x.total, 'składnika', 'składników', 'składników')}</span></div>
        <p class="small">${dot(x.r.tagi[0])} ${esc(x.r.tagi[0] || '')}${x.r.czas_min ? ` · ${x.r.czas_min} min` : ''}</p>
        <div class="segs" aria-hidden="true">${x.flags.map(f => `<i class="${f ? 'on' : ''}"></i>`).join('')}</div>
        ${x.missing.length ? `<div class="match-f"><p>Brakuje: <b>${esc(x.missing.join(', '))}</b></p><button class="btn ghost small" data-act="mk-list" data-i="${i}">Brakujące na listę</button></div>` : '<p class="okline">Masz wszystko – można gotować.</p>'}
      </section>`).join('') : '<p class="note">Nie ma jeszcze przepisów ze składnikami.</p>'}</div>`;
  },
};
on('mk-list', el => {
  const x = st.pantryMatches()[el.dataset.i];
  const items = x.missing.map(n => {
    const s = x.r.skladniki.find(k => k.nazwa === n);
    return { nazwa: n, ilosc: s?.ilosc != null ? st.qtyText(s.ilosc, s.jednostka) : '', zPrzepisu: x.r.tytul };
  });
  const ids = st.listAdd(items);
  toast(`Dodano do listy: ${x.missing.join(', ')}.`, { undo: () => st.undo(ids) });
});

// ---------------- Historia ----------------
export const historyView = {
  mod: 'wiecej', nav: true, refresh: ['historia', 'oceny'], recipes: true,
  render() {
    const h = [...S.t.historia].sort((a, b) => b.data.localeCompare(a.data));
    const me = norm(S.user?.name);
    // Podsumowanie
    const byRecipe = new Map();
    for (const x of h) { const r = byRecipe.get(x.przepisId) || { id: x.przepisId, tytul: x.tytul, n: 0, last: x.data, month: 0 }; r.n++; byRecipe.set(x.przepisId, r); }
    const now = new Date();
    const monthPrefix = isoDate(now).slice(0, 7);
    for (const x of h) if (x.data.startsWith(monthPrefix)) byRecipe.get(x.przepisId).month++;
    const title = id => st.recipe(id)?.tytul || byRecipe.get(id)?.tytul || '';
    const rated = st.recipes().map(r => ({ r, a: st.avgRating(r.id) })).filter(x => x.a != null).sort((a, b) => b.a - a.a);
    const fav = rated[0];
    const made = [...byRecipe.values()].filter(x => st.recipe(x.id));
    const old = [...made].sort((a, b) => a.last.localeCompare(b.last))[0];
    const monthTop = [...made].sort((a, b) => b.month - a.month || b.n - a.n)[0];
    const lastD = old && parseDate(old.last);
    const cards = `<div class="sumcards">
      ${fav ? `<a class="sum c-peach" href="#/przepis/${encodeURIComponent(fav.r.id)}"><small>Ulubione</small><b>${esc(fav.r.tytul)}</b><span>${icon('star', 'st')} ${avgText(fav.a)} średnio</span></a>` : ''}
      ${old && made.length > 1 ? `<a class="sum c-lav" href="#/przepis/${encodeURIComponent(old.id)}"><small>Dawno nierobione</small><b>${esc(title(old.id))}</b><span>ostatnio ${lastD.getDate()} ${['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'][lastD.getMonth()]}</span></a>` : ''}
      ${monthTop ? `<a class="sum c-mint" href="#/przepis/${encodeURIComponent(monthTop.id)}"><small>Najczęściej</small><b>${esc(title(monthTop.id))}</b><span>${monthTop.month ? `${monthTop.month}× w ${MONTHS_LOC[now.getMonth()]}` : `${monthTop.n}× łącznie`}</span></a>` : ''}
    </div>`;
    // Lista
    const ws = isoDate(weekStart());
    const groups = [];
    const push = (label, x) => { let g = groups[groups.length - 1]; if (!g || g.label !== label) { g = { label, items: [] }; groups.push(g); } g.items.push(x); };
    for (const x of h) {
      const d = parseDate(x.data);
      let label;
      if (x.data >= ws) label = 'Ten tydzień';
      else if (x.data.startsWith(monthPrefix)) label = `Wcześniej w ${MONTHS_LOC[d.getMonth()]}`;
      else label = MONTHS_NOM[d.getMonth()] + (d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : '');
      push(label, x);
    }
    const rows = groups.map(g => `<h2 class="h2s">${esc(g.label)}</h2>${g.items.map(x => {
      const d = parseDate(x.data);
      const r = st.recipe(x.przepisId);
      const mine = norm(x.kto) === me;
      const fem = /a$/i.test(x.kto);
      return `<a class="hrow" href="${r ? '#/przepis/' + encodeURIComponent(x.przepisId) : '#/historia'}"><span class="date"><b>${d.getDate()}</b><small>${DAYS_SHORT[d.getDay()]}</small></span>
        <span class="grow"><span class="nm">${dot(r?.tagi[0])} ${esc(r?.tytul || x.tytul)}</span><small>${fem ? 'zaznaczyła' : 'zaznaczył'} ${esc(x.kto)}</small></span>
        <span class="av ${mine ? 'a0' : 'a1'}">${esc((x.kto || '?')[0].toUpperCase())}</span></a>`;
    }).join('')}`).join('');
    return `<header class="mod-head">${backTo('#/wiecej', 'Więcej')}<h1>Historia</h1>
      <p class="sub">${h.length ? `${h.length} ${plural(h.length, 'posiłek', 'posiłki', 'posiłków')}${h.length ? ` od ${fromLabel(h[h.length - 1].data)}` : ''}` : 'Jeszcze nic nie zapisaliście'}</p></header>
      <div class="page">${h.length ? cards + rows : '<p class="note">Po ugotowaniu otwórz przepis i naciśnij „Zrobione dziś”. Tutaj zobaczycie, co i kiedy jedliście.</p>'}</div>`;
  },
};
function fromLabel(iso) {
  const d = parseDate(iso);
  const gen = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  return `${d.getDate()} ${gen[d.getMonth()]}`;
}

// ---------------- Ustawienia ----------------
const SV = { basic: '', aFrom: '', aTo: '' };
export const settingsView = {
  mod: 'wiecej', nav: true, refresh: ['ustawienia'],
  render({ ctx }) {
    const s = st.settings();
    const demo = S.backend?.kind === 'demo';
    const aliases = Object.entries(s.aliasy || {});
    return `<header class="mod-head">${backTo('#/wiecej', 'Więcej')}<h1>Ustawienia</h1></header>
      <div class="page settings">
        <section><h2>Kolejność działów w sklepie</h2><p class="note">Tak ułożę listę zakupów – w kolejności, w jakiej chodzicie po sklepie.</p>
          <ol class="order">${s.dzialy.map((d, i) => `<li><span class="n">${i + 1}</span><span class="grow">${esc(d)}</span>
            <button class="sq" data-act="set-dept" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Wyżej">${icon('chevU')}</button>
            <button class="sq" data-act="set-dept" data-i="${i}" data-d="1" ${i === s.dzialy.length - 1 ? 'disabled' : ''} aria-label="Niżej">${icon('chevD')}</button></li>`).join('')}</ol></section>
        <section><h2>Losowanie</h2>
          <button class="switch-row${s.wykluczaj ? ' on' : ''}" data-act="set-excl" role="switch" aria-checked="${s.wykluczaj}"><span>Nie losuj tego, co jedliśmy w ostatnich ${s.dni} dniach</span><i class="switch"></i></button>
          <div class="seg${s.wykluczaj ? '' : ' dim'}">${[3, 7, 14].map(n => `<button class="${s.dni === n ? 'on' : ''}" data-act="set-days" data-n="${n}" aria-pressed="${s.dni === n}">${n} dni</button>`).join('')}</div></section>
        <section><h2>Podstawy</h2><p class="note">Zawsze są w domu. Nie trzymam ich w spiżarni i nie dodaję na listę.</p>
          <div class="chips">${s.podstawy.map((b, i) => `<button class="chip plain strong" data-act="set-basic-del" data-i="${i}" aria-label="Usuń ${esc(b)}">${esc(b)} ${icon('x')}</button>`).join('')}</div>
          <div class="add-line"><input class="field" placeholder="Dodaj, np. cukier" value="${esc(SV.basic)}" data-in="set-basic-in" data-enter="set-basic-add" aria-label="Nowa podstawa"><button class="btn ghost" data-act="set-basic-add">Dodaj</button></div></section>
        <section><h2>Aliasy nazw</h2><p class="note">Gdy w przepisie pojawi się nazwa z lewej, potraktuję ją jak tę z prawej – np. „pomidory” → „pomidor”.</p>
          ${aliases.map(([f, t]) => `<div class="alias"><span>${esc(f)}</span>${icon('chevR')}<b class="grow">${esc(t)}</b><button class="x" data-act="set-alias-del" data-f="${esc(f)}" aria-label="Usuń alias">${icon('x')}</button></div>`).join('')}
          <div class="alias-add"><input class="field" placeholder="pomidory" value="${esc(SV.aFrom)}" data-in="set-a-from" aria-label="Nazwa"><span>${icon('chevR')}</span><input class="field" placeholder="pomidor" value="${esc(SV.aTo)}" data-in="set-a-to" data-enter="set-alias-add" list="dl-set" aria-label="Zamień na"><button class="btn ghost" data-act="set-alias-add">Dodaj</button></div>
          <datalist id="dl-set">${st.knownIngredientNames().map(n => `<option value="${esc(n)}">`).join('')}</datalist></section>
        <section><h2>Konto</h2>
          <div class="card-soft"><p>Zalogowano jako <b>${esc(S.user?.email || '')}</b></p><p class="note">${demo ? 'Tryb demo – dane są tylko w tej przeglądarce.' : `Dane w folderze „Kuchnia” na Dysku Google${st.people().length ? `, wspólnym z ${esc(instrumental(st.people()[0]))}` : ''}.`}</p></div>
          ${demo ? '<button class="btn ghost" data-act="set-demo-reset">Przywróć przykładowe dane</button>' : ''}
          <button class="btn danger-o" data-act="set-logout">${icon('logout')} ${demo ? 'Zakończ tryb demo' : 'Wyloguj się'}</button>
          <p class="note">${demo ? '' : 'Wylogowanie nie usuwa niczego z Dysku.'}</p>
          ${ctx?.version ? `<p class="note">Wersja aplikacji: ${esc(ctx.version)}</p>` : ''}</section>
      </div>`;
  },
};
on('set-dept', el => {
  const a = [...st.settings().dzialy]; const i = +el.dataset.i, j = i + +el.dataset.d;
  [a[i], a[j]] = [a[j], a[i]]; st.setSetting('dzialy', a);
});
on('set-excl', () => st.setSetting('wykluczaj', !st.settings().wykluczaj));
on('set-days', el => { st.setSetting('dni', Number(el.dataset.n)); if (!st.settings().wykluczaj) st.setSetting('wykluczaj', true); });
onInput('set-basic-in', el => { SV.basic = el.value; });
on('set-basic-add', () => {
  const v = SV.basic.trim().toLowerCase(); if (!v) return;
  const b = st.settings().podstawy;
  if (!b.some(x => norm(x) === norm(v))) st.setSetting('podstawy', [...b, v]);
  SV.basic = '';
});
on('set-basic-del', el => { const b = [...st.settings().podstawy]; const [x] = b.splice(+el.dataset.i, 1); st.setSetting('podstawy', b); toast(`Usunięto „${x}” z podstaw.`); });
onInput('set-a-from', el => { SV.aFrom = el.value; });
onInput('set-a-to', el => { SV.aTo = el.value; });
on('set-alias-add', () => {
  const f = SV.aFrom.trim(), t = SV.aTo.trim();
  if (!f || !t || norm(f) === norm(t)) { toast('Wpisz dwie różne nazwy.'); return; }
  st.setSetting('aliasy', { ...st.settings().aliasy, [f]: t });
  SV.aFrom = SV.aTo = '';
});
on('set-alias-del', el => { const a = { ...st.settings().aliasy }; delete a[el.dataset.f]; st.setSetting('aliasy', a); });
