// Okienka od dołu używane w kilku miejscach.
import * as st from '../store.js';
import { S } from '../store.js';
import { DAYS, DAYS_ACC, addDays, ddmm, esc, isoDate, norm, weekLabel, weekStart } from '../util.js';
import { icon, on, sheet, stars, toast } from '../ui.js';

// ---------- animacja „maszyny losującej” ----------
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export function spin(el, finalTitle, pool) {
  return new Promise(resolve => {
    if (!el || reduced() || pool.length < 2) { resolve(); return; }
    const names = [];
    for (let i = 0; i < 18; i++) names.push(pool[Math.floor(Math.random() * pool.length)].tytul);
    names.push(finalTitle);
    el.classList.add('spinning');
    el.innerHTML = `<div class="reel">${names.map(n => `<div class="reel-item">${esc(n)}</div>`).join('')}</div>`;
    const reel = el.firstElementChild;
    const h = el.clientHeight;
    const anim = reel.animate(
      [{ transform: 'translateY(0)' }, { transform: `translateY(-${(names.length - 1) * h}px)` }],
      { duration: 2000, easing: 'cubic-bezier(.12,.72,.28,1.12)', fill: 'forwards' });
    anim.onfinish = () => { el.classList.remove('spinning'); resolve(); };
  });
}

// ---------- Do planu ----------
let toPlan = null;
export function openToPlan(recipeId, { weekOffset = 0 } = {}) {
  const today = new Date();
  toPlan = { recipeId, weekOffset, sel: null };
  renderToPlan(true);
  function days() {
    const start = addDays(weekStart(today), weekOffset * 7);
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      if (isoDate(d) < isoDate(today)) continue;
      out.push(d);
    }
    return out;
  }
  function renderToPlan(first) {
    const r = st.recipe(recipeId);
    const ds = days();
    if (!toPlan.sel || !ds.some(d => isoDate(d) === toPlan.sel)) toPlan.sel = isoDate(ds[Math.min(ds.length - 1, weekOffset === 0 ? 1 : 0)] || ds[0]);
    const body = `<div class="radio-list">${ds.map(d => {
      const iso = isoDate(d);
      const items = st.planFor(iso).map(st.planLabel);
      return `<button class="radio-row${toPlan.sel === iso ? ' on' : ''}" data-act="toplan-sel" data-d="${iso}" role="radio" aria-checked="${toPlan.sel === iso}">
        <span><b>${DAYS[d.getDay()]}</b> <span class="muted">${ddmm(d)}${iso === isoDate(today) ? ' · dziś' : ''}</span><br><small>${items.length ? esc(items.join(', ')) : 'Nic jeszcze'}</small></span><i class="radio"></i></button>`;
    }).join('')}</div>
    <div class="week-switch">${toPlan.weekOffset === 0
      ? `<button class="link-btn" data-act="toplan-week" data-w="1">Pokaż przyszły tydzień ${icon('chevR')}</button>`
      : `<button class="link-btn" data-act="toplan-week" data-w="0">${icon('chevL')} Wróć do tego tygodnia</button>`}</div>`;
    const selDate = new Date(toPlan.sel + 'T12:00');
    const footer = `<button class="btn primary mod-plan" data-act="toplan-save">${icon('plus')} Dodaj na ${DAYS_ACC[selDate.getDay()]}</button>`;
    const sub = `${esc(r?.tytul || '')} · ${weekLabel(addDays(weekStart(today), toPlan.weekOffset * 7))}`;
    if (first) sheet.open({ title: 'Do planu', sub, body, footer });
    else sheet.update({ body, footer, sub });
  }
  toPlan.render = renderToPlan;
}
on('toplan-sel', el => { toPlan.sel = el.dataset.d; toPlan.render(); });
on('toplan-week', el => { toPlan.weekOffset = Number(el.dataset.w); toPlan.sel = null; toPlan.render(); });
on('toplan-save', () => {
  const r = st.recipe(toPlan.recipeId);
  st.planAdd(toPlan.sel, [{ przepisId: toPlan.recipeId }]);
  const d = new Date(toPlan.sel + 'T12:00');
  sheet.close();
  toast(`${r?.tytul || 'Przepis'} – dodano na ${DAYS_ACC[d.getDay()]}.`);
});

// ---------- Składniki na listę (z przepisu) ----------
let toList = null;
export function openToList(recipeId, portions) {
  const r = st.recipe(recipeId);
  if (!r) return;
  const factor = r.porcje && portions ? portions / r.porcje : 1;
  const items = [], skipped = [];
  for (const s of r.skladniki) {
    if (st.isBasic(s.nazwa)) { skipped.push(s.nazwa); continue; }
    const qty = s.ilosc != null ? st.qtyText(s.ilosc * factor, s.jednostka) : '';
    const home = st.inHome(s.nazwa);
    items.push({ nazwa: s.nazwa, qty, home, on: !home });
  }
  items.sort((a, b) => a.home - b.home);
  toList = { r, items, skipped, portions };
  renderToList(true);
}
function renderToList(first) {
  const { r, items, skipped, portions } = toList;
  const n = items.filter(i => i.on).length;
  const body = items.length
    ? `<div class="check-list">${items.map((it, i) => checkRow(it, i, 'tolist-toggle')).join('')}</div>
       ${skipped.length ? `<p class="note">Pomijam podstawy, które zawsze są w domu: ${esc(skipped.join(', '))}.</p>` : ''}`
    : '<p class="note">Ten przepis nie ma składników do kupienia.</p>';
  const footer = `<button class="btn primary mod-lista" data-act="tolist-save" ${n ? '' : 'disabled'}>${icon('plus')} Dodaj ${n} ${plural(n)}</button>`;
  const sub = `${esc(r.tytul)}${portions ? ` · ${portions} ${portions === 1 ? 'porcja' : (portions < 5 ? 'porcje' : 'porcji')}` : ''}`;
  if (first) sheet.open({ title: 'Składniki na listę', sub, body, footer });
  else sheet.update({ body, footer });
}
function plural(n) { return n === 1 ? 'produkt' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'produkty' : 'produktów'); }
export function checkRow(it, i, act, from = '') {
  return `<button class="check-row${it.on ? ' on' : ''}${it.home ? ' home' : ''}" data-act="${act}" data-i="${i}" role="checkbox" aria-checked="${it.on}">
    <i class="box">${icon('check')}</i>
    <span class="grow"><span class="nm">${esc(it.nazwa)}</span> <span class="muted">${esc(it.qty)}</span>${from ? `<small>${esc(from)}</small>` : ''}</span>
    ${it.home ? `<span class="badge-home">${icon('home')} masz w domu</span>` : ''}</button>`;
}
on('tolist-toggle', el => { const it = toList.items[el.dataset.i]; it.on = !it.on; renderToList(); });
on('tolist-save', () => {
  const sel = toList.items.filter(i => i.on);
  const ids = st.listAdd(sel.map(i => ({ nazwa: i.nazwa, ilosc: i.qty, zPrzepisu: toList.r.tytul })));
  sheet.close();
  toast(`Dodano ${sel.length} ${plural(sel.length)} do listy.`, { undo: () => st.undo(ids) });
});

// ---------- Zrobione dziś ----------
let made = null;
export function openMadeToday(recipeId) {
  const r = st.recipe(recipeId);
  if (!r) return;
  const inHome = [];
  const seen = new Set();
  for (const s of r.skladniki) {
    const k = st.key(s.nazwa);
    if (seen.has(k) || st.isBasic(s.nazwa) || !st.product(s.nazwa)?.wDomu) continue;
    seen.add(k); inHome.push(st.canonical(s.nazwa));
  }
  made = { r, rating: st.myRating(recipeId), inHome, finished: new Set() };
  renderMade(true);
}
function renderMade(first) {
  const { r, rating, inHome, finished } = made;
  const others = st.ratingsFor(r.id).filter(o => norm(o.kto) !== norm(S.user.name));
  const today = new Date();
  const body = `<h3 class="sheet-h3">Jak wyszło, ${esc(S.user.name)}?</h3>
    ${stars(rating, { act: 'made-rate', size: 'big', label: 'Twoja ocena' })}
    ${others.length ? `<p class="note">${others.map(o => `${esc(o.kto)} ${/a$/i.test(o.kto) ? 'dała' : 'dał'} ${o.ocena}.`).join(' ')} ${others.length === 1 ? (/a$/i.test(others[0].kto) ? 'Jej ocenę zmienia tylko ona.' : 'Jego ocenę zmienia tylko on.') : ''}</p>` : ''}
    <hr class="dash">
    <h3 class="sheet-h3">Czy coś się skończyło?</h3>
    ${inHome.length ? `<p class="note">Dotknij, a zniknie ze spiżarni. To składniki tego przepisu, które są w domu.</p>
    <div class="chips">${inHome.map((n, i) => `<button class="chip fin${finished.has(n) ? ' gone' : ''}" data-act="made-fin" data-i="${i}" aria-pressed="${finished.has(n)}">${finished.has(n) ? icon('x') : icon('home')}<span>${esc(n)}</span></button>`).join('')}</div>
    ${finished.size ? `<p class="note">Skończyło się: ${esc([...finished].join(', '))}. Zaznaczę w spiżarni „nie ma”.</p>` : ''}`
    : '<p class="note">Żadnego składnika tego przepisu nie ma w spiżarni jako „jest”.</p>'}`;
  const footer = `<button class="btn primary mod-przepisy" data-act="made-save">${icon('check')} Zapisz w historii</button>`;
  const sub = `${esc(r.tytul)} · ${DAYS[today.getDay()].toLowerCase()}, ${today.getDate()} ${['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'][today.getMonth()]}`;
  if (first) sheet.open({ title: 'Zrobione dziś', sub, body, footer });
  else sheet.update({ body });
}
on('made-rate', el => { made.rating = Number(el.dataset.v); renderMade(); });
on('made-fin', el => { const n = made.inHome[el.dataset.i]; made.finished.has(n) ? made.finished.delete(n) : made.finished.add(n); renderMade(); });
on('made-save', () => {
  st.madeToday(made.r.id, made.rating, [...made.finished]);
  sheet.close();
  toast(`Zapisano: ${made.r.tytul}.`);
});

// ---------- Lista zakupów z planu ----------
let fromPlan = null;
export function openPlanToList(start) {
  const items = st.aggregatePlan(start).map(it => ({ ...it, on: !it.home }));
  const entries = st.planRecipeEntries(start);
  fromPlan = { items, n: new Set(entries.map(e => e.przepisId)).size, start };
  renderFromPlan(true);
}
function renderFromPlan(first) {
  const { items, n, start } = fromPlan;
  const { from, to } = st.planRange(start);
  const fd = new Date(from + 'T12:00'), td = new Date(to + 'T12:00');
  const sub = `Plan: ${DAYS[fd.getDay()].toLowerCase()} – ${DAYS[td.getDay()].toLowerCase()} · ${n} ${n === 1 ? 'przepis' : (n < 5 ? 'przepisy' : 'przepisów')}`;
  const cnt = items.filter(i => i.on).length;
  const body = items.length
    ? `<div class="check-list">${items.map((it, i) => checkRow(it, i, 'fromplan-toggle', it.from.join(', '))).join('')}</div>
       <p class="note">Podstawy (${esc(st.settings().podstawy.join(', '))}) pomijam.</p>`
    : '<p class="note">W tym zakresie nie ma przepisów ze składnikami. Dodaj przepisy do planu.</p>';
  const footer = `<button class="btn primary mod-lista" data-act="fromplan-save" ${cnt ? '' : 'disabled'}>${icon('plus')} Dodaj ${cnt} ${plural(cnt)}</button>`;
  if (first) sheet.open({ title: 'Składniki na listę', sub, body, footer });
  else sheet.update({ body, footer });
}
on('fromplan-toggle', el => { const it = fromPlan.items[el.dataset.i]; it.on = !it.on; renderFromPlan(); });
on('fromplan-save', () => {
  const sel = fromPlan.items.filter(i => i.on);
  const ids = st.listAdd(sel.map(i => ({ nazwa: i.nazwa, ilosc: i.qty, zPrzepisu: i.from.join(', ') })));
  sheet.close();
  toast(`Dodano ${sel.length} ${plural(sel.length)} do listy.`, { undo: () => st.undo(ids) });
});
