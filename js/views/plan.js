// Losuj i Plan tygodnia.
import * as st from '../store.js';
import { DAYS, DAYS_ACC, addDays, ddmm, esc, isoDate, norm, plural, weekLabel, weekStart } from '../util.js';
import { avgText, dot, empty, icon, on, onInput, sheet, tagChip, tagPill, toast } from '../ui.js';
import { ILLU_BOOK } from './recipes.js';
import { openPlanToList, openToPlan, spin } from './sheets.js';

// ---------------- wybór tagów (wspólny) ----------------
function tagPicker(sel, expanded, act, moreAct, limit = 8) {
  const all = st.tagUsage().map(t => t.tag);
  if (!all.length) return '';
  let shown = all;
  let hidden = 0;
  if (!expanded && all.length > limit + 1) {
    const top = all.slice(0, limit);
    shown = [...top, ...all.filter(t => sel.has(t) && !top.includes(t))];
    hidden = all.length - shown.length;
  }
  return `<div class="chips">${shown.map(t => tagChip(t, sel.has(t), act)).join('')}
    ${hidden ? `<button type="button" class="chip more" data-act="${moreAct}">Więcej tagów (${hidden}) ${icon('chevD')}</button>`
      : (expanded ? `<button type="button" class="chip more" data-act="${moreAct}">Mniej tagów ${icon('chevU')}</button>` : '')}</div>`;
}

function coupon(r, { spinning = false, actions = true } = {}) {
  if (!r) {
    return `<div class="coupon idle"><div class="coupon-top"><div class="slot"><span class="slot-title muted">Co wypadnie?</span></div>
      <p class="muted">Naciśnij „Losuj”, a wybiorę jeden przepis.</p></div></div>`;
  }
  const avg = st.avgRating(r.id);
  return `<div class="coupon"><div class="coupon-top">
      <div class="slot" id="slot" aria-live="polite"><span class="slot-title">${spinning ? '' : esc(r.tytul)}</span></div>
      <div class="meta">${r.tagi.map(t => tagPill(t)).join('')}${r.czas_min ? `<span class="m">${icon('clock')} ${r.czas_min} min</span>` : ''}</div>
      ${avg != null ? `<p class="m">${icon('star', 'st')} ${avgText(avg)} średnio</p>` : '<p class="m muted">jeszcze bez oceny</p>'}
    </div>
    ${actions ? `<div class="coupon-cut"></div><div class="coupon-bot">
      <a class="btn ghost" href="#/przepis/${encodeURIComponent(r.id)}">${icon('book')} Otwórz</a>
      <button class="btn ghost" data-act="dr-plan">${icon('calendar')} Do planu</button></div>` : ''}</div>`;
}

// ---------------- Losuj ----------------
const D = { tags: new Set(), expanded: false, result: null, note: '', seen: new Set(), spinning: false };

export const drawView = {
  mod: 'losuj', nav: true, refresh: ['historia', 'oceny'], recipes: true,
  skipRender: () => D.spinning,
  render() {
    const all = st.recipes();
    if (!all.length) {
      return `<header class="mod-head"><h1>Co dziś zjemy?</h1></header>
        ${st.S.recipesLoaded ? empty(ILLU_BOOK, 'Nie ma jeszcze z czego losować', 'Dodaj kilka przepisów, a tutaj wylosuję jeden z nich.', `<a class="btn ghost small-w" href="#/przepisy">${icon('book')} Przejdź do przepisów</a>`) : '<div class="loading">Wczytuję przepisy z Dysku…</div>'}`;
    }
    const pool = st.drawPool([...D.tags]);
    const r = D.result && st.recipe(D.result.id);
    return `<header class="mod-head flat"><h1>Co dziś zjemy?</h1>
      <p class="sub">Zaznacz, na co masz ochotę, i losuj. Bez zaznaczania losuję ze wszystkiego.</p>
      ${tagPicker(D.tags, D.expanded, 'dr-tag', 'dr-more')}
      <div class="counter"><span>${pool.length} ${plural(pool.length, 'przepis', 'przepisy', 'przepisów')} do losowania</span>${D.tags.size ? '<button class="link-btn u" data-act="dr-clear">Wyczyść</button>' : ''}</div>
      ${coupon(r, { spinning: D.spinning })}
      ${D.note ? `<p class="note">${esc(D.note)}</p>` : ''}
      </header>
      <div class="dock"><button class="btn primary grow" data-act="dr-go" ${pool.length ? '' : 'disabled'}>${icon('dice')} ${r ? 'Jeszcze raz' : 'Losuj'}</button></div>`;
  },
};
on('dr-tag', el => { const t = el.dataset.tag; D.tags.has(t) ? D.tags.delete(t) : D.tags.add(t); D.seen.clear(); st.emit(); });
on('dr-more', () => { D.expanded = !D.expanded; st.emit(); });
on('dr-clear', () => { D.tags.clear(); D.seen.clear(); st.emit(); });
on('dr-go', async () => {
  if (D.spinning) return;
  const res = st.draw([...D.tags], { seen: D.seen });
  if (!res) { toast('Nie ma przepisów z tymi tagami.'); return; }
  D.result = res.recipe; D.note = res.note;
  D.spinning = true;
  document.getElementById('view').innerHTML = drawView.render();
  const pool = st.drawPool([...D.tags]);
  await spin(document.getElementById('slot'), res.recipe.tytul, pool);
  D.spinning = false;
  st.emit();
});
on('dr-plan', () => { if (D.result) openToPlan(D.result.id); });

// ---------------- Plan ----------------
const Pl = { addOpen: null };
const curOffset = () => Number(location.hash.split('/')[2] || 0);
const curStart = () => addDays(weekStart(), curOffset() * 7);

export const planView = {
  mod: 'plan', nav: true, refresh: ['plan'], recipes: true,
  render() {
    const off = curOffset();
    const start = curStart();
    const today = isoDate();
    let days = '';
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i), iso = isoDate(d);
      const items = st.planFor(iso);
      const past = iso < today, isToday = iso === today;
      days += `<section class="day${past ? ' past' : ''}${isToday ? ' today' : ''}">
        <div class="day-h"><h2>${DAYS[d.getDay()]} <span class="dd">${ddmm(d)}</span>${isToday ? ' <span class="badge">Dziś</span>' : ''}</h2>
          <button class="btn add${Pl.addOpen === iso ? ' on' : ''}" data-act="pl-add" data-d="${iso}" aria-expanded="${Pl.addOpen === iso}">${icon('plus')} Dodaj</button></div>
        ${items.map(p => {
          const r = p.przepisId ? st.recipe(p.przepisId) : null;
          return `<div class="pitem"><button class="pi-main" data-act="pl-item" data-id="${p.id}">${p.przepisId ? dot(r?.tagi[0]) : dot(null)}<span class="grow">${esc(st.planLabel(p))}</span>${icon('chevR', 'chev')}</button>
            <button class="x" data-act="pl-del" data-id="${p.id}" aria-label="Usuń z planu">${icon('x')}</button></div>`;
        }).join('')}
        ${!items.length && !past && Pl.addOpen !== iso ? '<p class="note">Jeszcze nic. Dodaj coś albo wylosuj.</p>' : ''}
        ${Pl.addOpen === iso ? `<div class="add-card"><p><b>Co dodać na ${DAYS_ACC[d.getDay()]}?</b></p><div class="add-3">
          <button class="tile t-przepisy" data-act="pl-add-rec" data-d="${iso}">${icon('book')}<span>Przepis</span></button>
          <button class="tile t-neutral" data-act="pl-add-txt" data-d="${iso}">${icon('pencil')}<span>Wpisz</span></button>
          <button class="tile t-losuj" data-act="pl-add-draw" data-d="${iso}">${icon('dice')}<span>Losuj</span></button></div></div>` : ''}
      </section>`;
    }
    const entries = st.planRecipeEntries(start);
    const n = new Set(entries.map(e => e.przepisId)).size;
    const rangeTxt = off === 0 ? 'od dziś do niedzieli' : 'z całego tygodnia';
    return `<header class="mod-head"><h1>Plan tygodnia</h1>
      <div class="weeknav"><a class="sq" href="#/plan/${off - 1}" aria-label="Poprzedni tydzień">${icon('chevL')}</a>
        <div><b>${weekLabel(start)}</b><small>${off === 0 ? 'ten tydzień' : off === 1 ? 'przyszły tydzień' : off === -1 ? 'poprzedni tydzień' : (off > 0 ? `za ${off} tyg.` : `${-off} tyg. temu`)}</small></div>
        <a class="sq" href="#/plan/${off + 1}" aria-label="Następny tydzień">${icon('chevR')}</a></div></header>
      <div class="page days">${days}</div>
      <div class="dock col"><p class="note c">${n ? `Zbiorę składniki z ${n} ${plural(n, 'przepisu', 'przepisów', 'przepisów')} – ${rangeTxt}.` : `Brak przepisów w planie ${rangeTxt}.`}</p>
        <button class="btn primary grow" data-act="pl-list" ${n ? '' : 'disabled'}>${icon('list')} Zrób listę zakupów z tygodnia</button></div>`;
  },
};
on('pl-add', el => { Pl.addOpen = Pl.addOpen === el.dataset.d ? null : el.dataset.d; st.emit(); });
on('pl-del', el => {
  const p = st.S.t.plan.find(x => x.id === el.dataset.id);
  const id = st.planRemove(el.dataset.id);
  toast(`Usunięto „${st.planLabel(p)}” z planu.`, { undo: () => st.undo(id) });
});
on('pl-list', () => openPlanToList(curStart()));

// ----- okienko pozycji planu -----
let PI = null;
on('pl-item', el => {
  const p = st.S.t.plan.find(x => x.id === el.dataset.id);
  if (!p) return;
  PI = p;
  const day = st.planFor(p.data);
  const idx = day.findIndex(x => x.id === p.id);
  const start = weekStart(new Date(p.data + 'T12:00'));
  const moves = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i), iso = isoDate(d);
    if (iso !== p.data) moves.push(`<button class="chip plain" data-act="pl-move" data-d="${iso}">${DAYS[d.getDay()].slice(0, 3)}. ${ddmm(d)}</button>`);
  }
  const nd = addDays(start, 7);
  moves.push(`<button class="chip plain" data-act="pl-move" data-d="${isoDate(nd)}">Pon. ${ddmm(nd)}</button>`);
  const d = new Date(p.data + 'T12:00');
  sheet.open({
    title: st.planLabel(p), sub: `${DAYS[d.getDay()]}, ${ddmm(d)}`,
    body: `<div class="menu">
      ${p.przepisId && st.recipe(p.przepisId) ? `<a class="menu-row" href="#/przepis/${encodeURIComponent(p.przepisId)}" data-act="pl-open">${icon('book')} Otwórz przepis</a>` : ''}
      <button class="menu-row" data-act="pl-shift" data-d="-1" ${idx <= 0 ? 'disabled' : ''}>${icon('chevU')} Przesuń wyżej</button>
      <button class="menu-row" data-act="pl-shift" data-d="1" ${idx >= day.length - 1 ? 'disabled' : ''}>${icon('chevD')} Przesuń niżej</button>
      </div><h3 class="sheet-h3">Przenieś na inny dzień</h3><div class="chips">${moves.join('')}</div>
      <div class="menu"><button class="menu-row danger" data-act="pl-item-del">${icon('trash')} Usuń z planu</button></div>`,
  });
});
on('pl-open', () => { sheet.close(); location.hash = '#/przepis/' + encodeURIComponent(PI.przepisId); });
on('pl-shift', el => { st.planShift(PI.id, Number(el.dataset.d)); sheet.close(); });
on('pl-move', el => {
  st.planMove(PI.id, el.dataset.d); sheet.close();
  const d = new Date(el.dataset.d + 'T12:00');
  toast(`Przeniesiono na ${DAYS_ACC[d.getDay()]}, ${ddmm(d)}.`);
});
on('pl-item-del', () => { sheet.close(); const id = st.planRemove(PI.id); toast(`Usunięto „${st.planLabel(PI)}” z planu.`, { undo: () => st.undo(id) }); });

// ----- dodawanie: przepis -----
const PR = { date: null, q: '', sel: new Set() };
function prBody() {
  return `<label class="search soft">${icon('search')}<input type="search" placeholder="Szukaj po nazwie lub składniku" value="${esc(PR.q)}" data-in="pr-q" aria-label="Szukaj przepisu"></label>
    <div class="check-list" id="pr-list">${prList(prFilter())}</div>`;
}
function prFilter() {
  const q = norm(PR.q);
  return st.recipes().filter(r => !q || norm(r.tytul).includes(q) || r.skladniki.some(s => norm(s.nazwa).includes(q)));
}
function prList(list) {
  if (!list.length) return '<p class="note">Nic nie pasuje.</p>';
  return list.map(r => `<button class="check-row plan-c${PR.sel.has(r.id) ? ' on' : ''}" data-act="pr-toggle" data-id="${r.id}" role="checkbox" aria-checked="${PR.sel.has(r.id)}">
    <i class="box">${icon('check')}</i><span class="grow"><b>${esc(r.tytul)}</b><small>${dot(r.tagi[0])} ${esc(r.tagi.join(', '))}${r.czas_min ? ` · ${r.czas_min} min` : ''}</small></span></button>`).join('');
}
function prFoot() {
  const d = new Date(PR.date + 'T12:00');
  return `<button class="btn primary mod-plan" data-act="pr-save" ${PR.sel.size ? '' : 'disabled'}>Dodaj na ${DAYS_ACC[d.getDay()]}${PR.sel.size ? ` (${PR.sel.size})` : ''}</button>`;
}
on('pl-add-rec', el => {
  PR.date = el.dataset.d; PR.q = ''; PR.sel = new Set();
  const d = new Date(PR.date + 'T12:00');
  sheet.open({ title: `Przepisy na ${DAYS_ACC[d.getDay()]}`, sub: 'Możesz zaznaczyć kilka.', body: prBody(), footer: prFoot(), cls: 'tall' });
});
onInput('pr-q', el => {
  PR.q = el.value;
  document.getElementById('pr-list').innerHTML = prList(prFilter());
});
on('pr-toggle', el => {
  const id = el.dataset.id; PR.sel.has(id) ? PR.sel.delete(id) : PR.sel.add(id);
  el.classList.toggle('on', PR.sel.has(id)); el.setAttribute('aria-checked', PR.sel.has(id));
  sheet.update({ footer: prFoot() });
});
on('pr-save', () => {
  st.planAdd(PR.date, [...PR.sel].map(id => ({ przepisId: id })));
  Pl.addOpen = null; sheet.close();
  toast(`Dodano ${PR.sel.size} ${plural(PR.sel.size, 'przepis', 'przepisy', 'przepisów')} do planu.`);
});

// ----- dodawanie: tekst -----
let TX = null;
on('pl-add-txt', el => {
  TX = el.dataset.d;
  const d = new Date(TX + 'T12:00');
  sheet.open({
    title: `Wpisz na ${DAYS_ACC[d.getDay()]}`, sub: 'Np. kanapki, resztki, obiad u rodziców.',
    body: `<input class="field big" id="tx-in" placeholder="Co jecie?" autofocus data-enter="tx-save" enterkeyhint="done">`,
    footer: '<button class="btn primary mod-plan" data-act="tx-save">Dodaj do planu</button>',
  });
});
on('tx-save', () => {
  const v = document.getElementById('tx-in').value.trim();
  if (!v) { document.getElementById('tx-in').focus(); return; }
  st.planAdd(TX, [{ tekst: v }]);
  Pl.addOpen = null; sheet.close();
});

// ----- dodawanie: losuj -----
const PD = { date: null, tags: new Set(), expanded: false, result: null, note: '', seen: new Set(), spinning: false };
function pdExclude() {
  const s = weekStart(new Date(PD.date + 'T12:00'));
  const from = isoDate(s), to = isoDate(addDays(s, 6));
  return new Set(st.S.t.plan.filter(p => p.przepisId && p.data >= from && p.data <= to).map(p => p.przepisId));
}
function pdBody() {
  const pool = st.drawPool([...PD.tags]);
  const r = PD.result && st.recipe(PD.result.id);
  return `${tagPicker(PD.tags, PD.expanded, 'pd-tag', 'pd-more', 6)}
    <div class="counter"><span>${pool.length} ${plural(pool.length, 'przepis', 'przepisy', 'przepisów')} do losowania</span>${PD.tags.size ? '<button class="link-btn u" data-act="pd-clear">Wyczyść</button>' : ''}</div>
    ${coupon(r, { spinning: PD.spinning, actions: false })}${PD.note ? `<p class="note">${esc(PD.note)}</p>` : ''}`;
}
function pdFoot() {
  const d = new Date(PD.date + 'T12:00');
  return PD.result
    ? `<div class="two"><button class="btn ghost" data-act="pd-go">${icon('dice')} Jeszcze raz</button><button class="btn primary mod-plan" data-act="pd-save">${icon('plus')} Na ${DAYS_ACC[d.getDay()]}</button></div>`
    : `<button class="btn primary mod-losuj" data-act="pd-go">${icon('dice')} Losuj</button>`;
}
on('pl-add-draw', el => {
  Object.assign(PD, { date: el.dataset.d, result: null, note: '', seen: new Set(), spinning: false });
  const d = new Date(PD.date + 'T12:00');
  sheet.open({ title: `Losuj na ${DAYS_ACC[d.getDay()]}`, sub: 'Pomijam to, co już jest w planie na ten tydzień.', body: pdBody(), footer: pdFoot(), cls: 'tall' });
});
on('pd-tag', el => { const t = el.dataset.tag; PD.tags.has(t) ? PD.tags.delete(t) : PD.tags.add(t); PD.seen.clear(); sheet.update({ body: pdBody() }); });
on('pd-more', () => { PD.expanded = !PD.expanded; sheet.update({ body: pdBody() }); });
on('pd-clear', () => { PD.tags.clear(); PD.seen.clear(); sheet.update({ body: pdBody() }); });
on('pd-go', async () => {
  if (PD.spinning) return;
  const res = st.draw([...PD.tags], { seen: PD.seen, extraExclude: pdExclude() });
  if (!res) { toast('Nie ma przepisów z tymi tagami.'); return; }
  PD.result = res.recipe; PD.note = res.note; PD.spinning = true;
  sheet.update({ body: pdBody(), footer: pdFoot() });
  await spin(document.getElementById('slot'), res.recipe.tytul, st.drawPool([...PD.tags]));
  PD.spinning = false;
  if (sheet.current) sheet.update({ body: pdBody() });
});
on('pd-save', () => {
  st.planAdd(PD.date, [{ przepisId: PD.result.id }]);
  Pl.addOpen = null; sheet.close();
  toast(`${PD.result.tytul} – dodano do planu.`);
});
