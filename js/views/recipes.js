// Przepisy: lista i widok przepisu.
import * as st from '../store.js';
import { S } from '../store.js';
import { DAYS_LOC, MONTHS_GEN, esc, fmtNum, instrumental, norm, parseDate, plural } from '../util.js';
import { avgText, empty, icon, on, onInput, stars, tagChip, tagPill, toast } from '../ui.js';
import { openMadeToday, openToList, openToPlan } from './sheets.js';

export const ILLU_BOOK = `<svg class="illu" viewBox="0 0 120 110" aria-hidden="true"><path d="M30 18h52a8 8 0 0 1 8 8v70H38a8 8 0 0 1-8-8Z" fill="var(--mod-accent)" stroke="var(--ink)" stroke-width="2.5"/><path d="M30 80a8 8 0 0 1 8-8h52" fill="none" stroke="var(--ink)" stroke-width="2.5"/><path d="M44 36h30M44 46h20" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round"/><circle cx="92" cy="20" r="11" fill="#FFD23F" stroke="var(--ink)" stroke-width="2.5"/><path d="M92 14v12M86 20h12" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round"/></svg>`;
const ILLU_SEARCH = `<svg class="illu" viewBox="0 0 120 110" aria-hidden="true"><circle cx="52" cy="46" r="26" fill="var(--mod-bg)" stroke="var(--ink)" stroke-width="2.5"/><path d="M42 46h20M71 65l20 20" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round"/></svg>`;

export function sharedWithText() {
  const p = st.people();
  return p.length ? `wspólne z ${esc(instrumental(p[0]))}` : '';
}

// ---------------- lista ----------------
const L = { q: '', tags: new Set() };

function filtered() {
  const q = norm(L.q);
  return st.recipes().filter(r =>
    (!L.tags.size || r.tagi.some(t => L.tags.has(t))) &&
    (!q || norm(r.tytul).includes(q) || r.skladniki.some(s => norm(s.nazwa).includes(q))));
}

function rowHtml(r) {
  const avg = st.avgRating(r.id);
  return `<a class="rrow" href="#/przepis/${encodeURIComponent(r.id)}">
    <span class="grow"><b class="rtitle">${esc(r.tytul)}</b>
      <span class="meta">${r.tagi.map(t => tagPill(t)).join('')}${r.czas_min ? `<span class="m">${icon('clock')} ${r.czas_min} min</span>` : ''}${avg != null ? `<span class="m">${icon('star', 'st')} ${avgText(avg)}</span>` : ''}</span>
    </span>${icon('chevR', 'chev')}</a>`;
}

function resultsHtml() {
  const all = st.recipes();
  if (!all.length) {
    if (!S.recipesLoaded) return '<div class="loading">Wczytuję przepisy z Dysku…</div>';
    return empty(ILLU_BOOK, 'Nie macie jeszcze przepisów', 'Dodaj pierwszy ręcznie albo poproś Claude o przepis w formacie JSON i go zaimportuj.');
  }
  const f = filtered();
  if (!f.length) {
    return empty(ILLU_SEARCH, L.q ? `Nic nie pasuje do „${L.q}”` : 'Nic nie pasuje do tych tagów',
      'Szukam po tytułach i składnikach. Spróbuj innego słowa albo dodaj nowy przepis.',
      '<button class="btn ghost small-w" data-act="rl-clear">Wyczyść wyszukiwanie</button>');
  }
  const broken = st.brokenRecipes();
  return `<div class="rlist">${f.map(rowHtml).join('')}</div>` +
    (broken.length ? `<p class="note pad">Nie udało się odczytać ${broken.length} ${plural(broken.length, 'pliku', 'plików', 'plików')} w folderze „przepisy”: ${esc(broken.join(', '))}.</p>` : '');
}
function subText() {
  const all = st.recipes();
  if (!all.length) return 'Tu będą Wasze przepisy';
  const f = filtered();
  const shared = sharedWithText();
  if (L.q || L.tags.size) return `${f.length} z ${all.length} ${plural(all.length, 'przepisu', 'przepisów', 'przepisów')}`;
  return `${all.length} ${plural(all.length, 'przepis', 'przepisy', 'przepisów')}${shared ? ' · ' + shared : ''}`;
}

export const recipesView = {
  mod: 'przepisy', nav: true, refresh: ['oceny', 'historia'], recipes: true,
  render() {
    const tags = st.tagUsage().map(t => t.tag);
    const any = st.recipes().length;
    return `<header class="mod-head"><h1>Przepisy</h1><p class="sub" id="rl-sub">${subText()}</p>
      ${any ? `<label class="search">${icon('search')}<input type="search" placeholder="Szukaj przepisu" value="${esc(L.q)}" data-in="rl-q" aria-label="Szukaj po nazwie lub składniku">${L.q ? `<button class="clear" data-act="rl-clear-q" aria-label="Wyczyść">${icon('x')}</button>` : ''}</label>
      ${tags.length ? `<div class="chips">${tags.map(t => tagChip(t, L.tags.has(t), 'rl-tag')).join('')}</div>` : ''}` : ''}
      </header>
      <div id="rl-results">${resultsHtml()}</div>
      <div class="dock"><a class="btn primary grow" href="#/nowy">${icon('plus')} Nowy przepis</a><a class="btn ghost stack" href="#/import">${icon('download')}<span>Importuj</span></a></div>`;
  },
};
onInput('rl-q', el => {
  L.q = el.value;
  document.getElementById('rl-results').innerHTML = resultsHtml();
  document.getElementById('rl-sub').innerHTML = subText();
  const lbl = el.closest('.search');
  const has = lbl.querySelector('.clear');
  if (L.q && !has) lbl.insertAdjacentHTML('beforeend', `<button class="clear" data-act="rl-clear-q" aria-label="Wyczyść">${icon('x')}</button>`);
  if (!L.q && has) has.remove();
});
on('rl-tag', el => { const t = el.dataset.tag; L.tags.has(t) ? L.tags.delete(t) : L.tags.add(t); st.emit(); });
on('rl-clear', () => { L.q = ''; L.tags.clear(); st.emit(); });
on('rl-clear-q', () => { L.q = ''; st.emit(); });

// ---------------- widok przepisu ----------------
const portions = {};
function lastMadeText(iso) {
  if (!iso) return 'Jeszcze nie zapisaliście, że go robiliście.';
  const d = parseDate(iso);
  const diff = Math.round((new Date().setHours(0, 0, 0, 0) - d) / 86400000);
  if (diff === 0) return 'Ostatnio robione dziś.';
  if (diff === 1) return 'Ostatnio robione wczoraj.';
  if (diff < 7) return `Ostatnio robione ${DAYS_LOC[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}.`;
  return `Ostatnio robione ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}.`;
}
function portionWord(n) { return n === 1 ? 'porcja' : plural(n, 'porcja', 'porcje', 'porcji'); }

export const recipeView = {
  mod: 'przepisy', nav: true, refresh: ['oceny', 'historia', 'produkty'],
  render({ id }) {
    const r = st.recipe(id);
    if (!r) {
      return `<header class="mod-head"><nav class="topnav"><a href="#/przepisy">${icon('chevL')} Przepisy</a></nav><h1>Nie ma takiego przepisu</h1>
        <p class="sub">${S.recipesLoaded ? 'Mógł zostać usunięty przez drugą osobę.' : 'Wczytuję przepisy…'}</p></header>`;
    }
    const base = r.porcje || null;
    const n = portions[id] || base;
    const factor = base ? n / base : 1;
    const avg = st.avgRating(id);
    const mine = st.myRating(id);
    const others = st.people();
    const ratings = st.ratingsFor(id);
    const otherRows = others.map(p => {
      const o = ratings.find(x => norm(x.kto) === norm(p));
      return `<div class="rate-row"><span>${esc(p)}</span>${o ? stars(o.ocena, { label: `${p}: ${o.ocena} z 5` }) : '<span class="muted">brak oceny</span>'}</div>`;
    }).join('');
    const ings = r.skladniki.map(s => {
      const q = s.ilosc != null ? `${fmtNum(s.ilosc * factor)}${s.jednostka ? ' ' + esc(s.jednostka) : ''}` : '<span class="muted">do smaku</span>';
      return `<div class="ing"><span class="q">${q}</span><span>${esc(s.nazwa)}</span></div>`;
    }).join('');
    return `<header class="mod-head">
      <nav class="topnav"><a href="#/przepisy">${icon('chevL')} Przepisy</a><a href="#/przepis/${encodeURIComponent(id)}/edytuj">${icon('pencil')} Edytuj</a></nav>
      <h1>${esc(r.tytul)}</h1>
      ${r.tagi.length ? `<div class="meta">${r.tagi.map(t => tagPill(t)).join('')}</div>` : ''}
      <div class="head-row">${r.czas_min ? `<span class="m">${icon('clock')} ${r.czas_min} min</span>` : '<span></span>'}
        ${base ? `<div class="stepper" role="group" aria-label="Liczba porcji"><button data-act="rv-por" data-d="-1" aria-label="Mniej porcji" ${n <= 1 ? 'disabled' : ''}>−</button><span>${n} ${portionWord(n)}</span><button data-act="rv-por" data-d="1" aria-label="Więcej porcji">+</button></div>` : ''}
      </div></header>
      <div class="page">
        <section class="block">
          <div class="block-h"><h2>Oceny</h2>${avg != null ? `<span class="avg"><b>${avgText(avg)}</b> średnia</span>` : ''}</div>
          <div class="rate-row"><span>${esc(S.user?.name || 'Ty')} <span class="muted">(Ty)</span></span>${stars(mine, { act: 'rv-rate', label: 'Twoja ocena' })}</div>
          ${otherRows}
          <div class="two"><button class="btn ghost" data-act="rv-plan">${icon('calendar')} Do planu</button><button class="btn ghost" data-act="rv-made">${icon('check')} Zrobione dziś</button></div>
          <p class="note">${lastMadeText(st.lastMade(id))}</p>
        </section>
        ${ings ? `<section class="block"><div class="block-h"><h2>Składniki</h2>${base ? `<span class="muted">na ${n} ${portionWord(n)}</span>` : ''}</div><div class="ings">${ings}</div></section>` : ''}
        ${r.kroki.length ? `<section class="block"><h2>Kroki</h2><ol class="steps">${r.kroki.map((k, i) => `<li><span class="num">${i + 1}</span><span>${esc(k)}</span></li>`).join('')}</ol></section>` : ''}
        ${r.notatki ? `<section class="block"><h2>Notatki</h2><p class="notes">${esc(r.notatki)}</p></section>` : ''}
        ${r.zrodlo ? `<section class="block"><a class="src" href="${esc(/^https?:/i.test(r.zrodlo) ? r.zrodlo : '#')}" target="_blank" rel="noopener">${icon('link')} Źródło przepisu</a></section>` : ''}
        <section class="block"><button class="link-btn danger" data-act="rv-del">${icon('trash')} Usuń przepis</button></section>
      </div>
      ${r.skladniki.length ? `<div class="dock"><button class="btn primary grow" data-act="rv-list">${icon('list')} Składniki na listę</button></div>` : ''}`;
  },
};
const curId = () => decodeURIComponent(location.hash.split('/')[2] || '');
on('rv-por', el => {
  const id = curId(); const r = st.recipe(id);
  portions[id] = Math.max(1, (portions[id] || r.porcje) + Number(el.dataset.d));
  st.emit();
});
on('rv-rate', el => {
  const id = curId(); const v = Number(el.dataset.v);
  st.rate(id, v);
  toast(`Twoja ocena: ${v} z 5.`);
});
on('rv-plan', () => openToPlan(curId()));
on('rv-made', () => openMadeToday(curId()));
on('rv-list', () => { const id = curId(); const r = st.recipe(id); openToList(id, portions[id] || r.porcje); });
on('rv-del', () => {
  const id = curId(); const r = st.recipe(id);
  const cancel = st.deleteRecipe(id);
  location.hash = '#/przepisy';
  toast(`Usunięto „${r.tytul}”. Plik trafi do kosza na Dysku.`, { undo: () => { cancel(); location.hash = '#/przepis/' + encodeURIComponent(id); } });
});
