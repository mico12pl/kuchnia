// Formularz przepisu (nowy / edycja / sprawdzenie importu) i ekran importu JSON.
import * as st from '../store.js';
import { CLAUDE_PROMPT, UNITS, cleanTag, esc, fmtNum, norm, parseNum, similar, plural, tagColor } from '../util.js';
import { autoGrow, copyText, icon, on, onInput, toast } from '../ui.js';

let F = null;
const draftKey = f => `kuchnia.draft.${f.mode}.${f.id || ''}`;
const saveDraft = () => { if (F) try { localStorage.setItem(draftKey(F), JSON.stringify(F.data)); } catch {} };
const clearDraft = () => { if (F) localStorage.removeItem(draftKey(F)); };

function blank() { return { tytul: '', tagi: [], czas_min: '', porcje: '', zrodlo: '', skladniki: [{ ilosc: '', jednostka: '', nazwa: '' }], kroki: [''], notatki: '' }; }
function fromRecipe(r) {
  return {
    tytul: r.tytul, tagi: [...r.tagi], czas_min: r.czas_min ?? '', porcje: r.porcje ?? '', zrodlo: r.zrodlo || '',
    skladniki: r.skladniki.length ? r.skladniki.map(s => ({ ilosc: s.ilosc != null ? fmtNum(s.ilosc) : '', jednostka: s.jednostka || '', nazwa: s.nazwa })) : [{ ilosc: '', jednostka: '', nazwa: '' }],
    kroki: r.kroki.length ? [...r.kroki] : [''], notatki: r.notatki || '',
  };
}

function setup(mode, id) {
  const key = `${mode}:${id || ''}`;
  if (F && F.key === key) return;
  F = { key, mode, id, data: null, reorder: { ing: false, steps: false }, tagInput: '', tagAsk: null, error: '' };
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(draftKey(F)) || 'null'); } catch {}
  if (mode === 'import') F.data = draft || pendingImport || blank();
  else if (draft) F.data = draft;
  else if (mode === 'edit') { const r = st.recipe(id); F.data = r ? fromRecipe(r) : null; }
  else F.data = blank();
  if (draft) F.restored = true;
}

// ---------------- render ----------------
function tagsHtml() {
  const d = F.data;
  const usage = st.tagUsage().map(t => t.tag).filter(t => !d.tagi.includes(t));
  const q = norm(F.tagInput);
  const sugg = (q ? usage.filter(t => norm(t).includes(q)).sort((a, b) => norm(b).startsWith(q) - norm(a).startsWith(q)) : usage).slice(0, 8);
  return `${d.tagi.length ? `<div class="chips">${d.tagi.map((t, i) => `<button type="button" class="chip on tagx" style="--tag:${tagColor(t)}" data-act="f-tag-del" data-i="${i}" aria-label="Usuń tag ${esc(t)}"><i></i>${esc(t)} ${icon('x')}</button>`).join('')}</div>` : ''}
    <input class="field" id="f-tag" placeholder="Wpisz tag, np. szybkie" value="${esc(F.tagInput)}" data-in="f-tag-in" data-enter="f-tag-add" autocomplete="off" enterkeyhint="done">
    ${F.tagAsk ? `<div class="ask">Czy chodziło o „${esc(F.tagAsk.existing)}”?
      <div class="ask-btns"><button type="button" class="btn small" data-act="f-tag-ask" data-v="old">Tak, ${esc(F.tagAsk.existing)}</button><button type="button" class="link-btn" data-act="f-tag-ask" data-v="new">Nie, dodaj „${esc(F.tagAsk.typed)}”</button></div></div>` : ''}
    ${sugg.length ? `<p class="lbl-s">Podpowiedzi</p><div class="chips">${sugg.map(t => `<button type="button" class="chip sugg" style="--tag:${tagColor(t)}" data-act="f-tag-pick" data-tag="${esc(t)}">${icon('plus')}${esc(t)}</button>`).join('')}</div>` : ''}
    ${F.tagInput.trim() && !F.tagAsk && !usage.some(t => norm(t) === q) && !d.tagi.some(t => norm(t) === q) ? `<button type="button" class="link-btn" data-act="f-tag-add">${icon('plus')} Dodaj nowy tag „${esc(cleanTag(F.tagInput))}”</button>` : ''}`;
}

function hintHtml(i) {
  const s = F.data.skladniki[i];
  if (!s.nazwa.trim() || s._keep) return '';
  const sug = st.suggestKnown(s.nazwa);
  if (!sug) return '';
  return `Nie znam „${esc(s.nazwa)}”. Czy chodziło o: <button type="button" class="pill-btn" data-act="f-ing-sug" data-i="${i}" data-v="${esc(sug)}">${esc(sug)} ?</button> <button type="button" class="link-btn" data-act="f-ing-keep" data-i="${i}">zostaw jako nowy</button>`;
}

function ingsHtml() {
  const list = F.data.skladniki;
  if (F.reorder.ing) {
    return `<div class="reorder">${list.map((s, i) => `<div class="ro-row"><span class="grow">${esc([s.ilosc, s.jednostka, s.nazwa].filter(Boolean).join(' ') || '(pusty)')}</span>
      <button type="button" class="sq" data-act="f-ing-mv" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Wyżej">${icon('chevU')}</button>
      <button type="button" class="sq" data-act="f-ing-mv" data-i="${i}" data-d="1" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Niżej">${icon('chevD')}</button></div>`).join('')}</div>
      <button type="button" class="btn dashed" data-act="f-reorder" data-k="ing">${icon('check')} Gotowe</button>`;
  }
  return `<div class="ing-head"><span>Ilość</span><span>Jednostka</span><span>Nazwa</span></div>
    ${list.map((s, i) => {
      const hint = hintHtml(i);
      return `<div class="ing-row${hint ? ' warn' : ''}" id="ir-${i}">
      <input class="field qty" inputmode="decimal" value="${esc(s.ilosc)}" data-in="f-ing" data-f="ilosc" data-i="${i}" aria-label="Ilość">
      <select class="field unit" data-change="f-ing" data-f="jednostka" data-i="${i}" aria-label="Jednostka"><option value="">–</option>${UNITS.map(u => `<option ${s.jednostka === u ? 'selected' : ''}>${u}</option>`).join('')}</select>
      <input class="field nm" list="dl-ing" value="${esc(s.nazwa)}" placeholder="np. cebula" data-in="f-ing" data-change="f-ing-name" data-f="nazwa" data-i="${i}" aria-label="Nazwa składnika" autocomplete="off">
      <button type="button" class="x" data-act="f-ing-del" data-i="${i}" aria-label="Usuń składnik">${icon('x')}</button>
      </div><div class="hint" id="ih-${i}">${hint}</div>`;
    }).join('')}
    <div class="two-btn"><button type="button" class="btn dashed" data-act="f-ing-add">${icon('plus')} Dodaj składnik</button>
    ${list.length > 1 ? `<button type="button" class="btn dashed narrow" data-act="f-reorder" data-k="ing">${icon('move')} Kolejność</button>` : ''}</div>`;
}

function stepsHtml() {
  const list = F.data.kroki;
  if (F.reorder.steps) {
    return `<div class="reorder">${list.map((s, i) => `<div class="ro-row"><span class="num sm">${i + 1}</span><span class="grow clamp">${esc(s || '(pusty)')}</span>
      <button type="button" class="sq" data-act="f-step-mv" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Wyżej">${icon('chevU')}</button>
      <button type="button" class="sq" data-act="f-step-mv" data-i="${i}" data-d="1" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Niżej">${icon('chevD')}</button></div>`).join('')}</div>
      <button type="button" class="btn dashed" data-act="f-reorder" data-k="steps">${icon('check')} Gotowe</button>`;
  }
  return `${list.map((s, i) => `<div class="step-row"><span class="num${s.trim() ? '' : ' off'}">${i + 1}</span>
      <textarea class="field grow" rows="2" placeholder="Opisz ${i ? 'kolejny ' : ''}krok…" data-in="f-step" data-i="${i}" aria-label="Krok ${i + 1}">${esc(s)}</textarea>
      <button type="button" class="x" data-act="f-step-del" data-i="${i}" aria-label="Usuń krok">${icon('x')}</button></div>`).join('')}
    <div class="two-btn"><button type="button" class="btn dashed" data-act="f-step-add">${icon('plus')} Dodaj krok</button>
    ${list.length > 1 ? `<button type="button" class="btn dashed narrow" data-act="f-reorder" data-k="steps">${icon('move')} Kolejność</button>` : ''}</div>`;
}

function unknownCount() { return F.data.skladniki.filter((s, i) => s.nazwa.trim() && hintHtml(i)).length; }

export const formView = {
  mod: 'przepisy', nav: false, static: true,
  render({ mode, id }) {
    setup(mode, id);
    if (!F.data) return `<header class="mod-head"><nav class="topnav"><a href="#/przepisy">${icon('chevL')} Przepisy</a></nav><h1>Nie ma takiego przepisu</h1></header>`;
    const d = F.data;
    const title = mode === 'edit' ? 'Edytuj przepis' : mode === 'import' ? 'Sprawdź przepis' : 'Nowy przepis';
    const sub = mode === 'import' ? 'Zaimportowano z JSON. Popraw, co trzeba, i zapisz.' : mode === 'edit' ? 'Zmiany zobaczy też druga osoba.' : 'Wystarczy tytuł. Resztę możesz dopisać później.';
    const unk = unknownCount();
    return `<header class="mod-head"><nav class="topnav"><button class="link-btn plain" data-act="f-cancel">Anuluj</button></nav><h1>${title}</h1><p class="sub">${sub}</p></header>
      <form class="page form" onsubmit="return false" autocomplete="off">
        ${F.restored ? `<div class="banner info">${icon('history')}<span>Przywróciłem niezapisaną wersję. <button type="button" class="link-btn" data-act="f-discard">Odrzuć zmiany</button></span></div>` : ''}
        <div id="f-unk">${unk ? `<div class="banner warn">${icon('alert')}<span>${unk} ${plural(unk, 'składnik wymaga', 'składniki wymagają', 'składników wymaga')} sprawdzenia – nie ma ich jeszcze w bazie.</span></div>` : ''}</div>
        <label class="lbl" for="f-title">Tytuł <em class="req">wymagane</em></label>
        <input class="field big" id="f-title" value="${esc(d.tytul)}" data-in="f-field" data-f="tytul" placeholder="np. Leczo" enterkeyhint="next">
        <p class="err" id="f-err">${esc(F.error)}</p>
        <label class="lbl" for="f-tag">Tagi <em>opcjonalnie</em></label>
        <div id="f-tags">${tagsHtml()}</div>
        <div class="grid2">
          <div><label class="lbl" for="f-time">Czas <em>min</em></label><input class="field" id="f-time" inputmode="numeric" value="${esc(d.czas_min)}" data-in="f-field" data-f="czas_min"></div>
          <div><label class="lbl" for="f-por">Porcje</label><input class="field" id="f-por" inputmode="numeric" value="${esc(d.porcje)}" data-in="f-field" data-f="porcje"></div>
        </div>
        <label class="lbl">Składniki <em>opcjonalnie</em></label>
        <div id="f-ings">${ingsHtml()}</div>
        <datalist id="dl-ing">${st.knownIngredientNames().map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        <label class="lbl">Kroki <em>opcjonalnie</em></label>
        <div id="f-steps">${stepsHtml()}</div>
        <label class="lbl" for="f-notes">Notatki <em>opcjonalnie</em></label>
        <textarea class="field grow" id="f-notes" rows="2" data-in="f-field" data-f="notatki" placeholder="np. lepsze na drugi dzień">${esc(d.notatki)}</textarea>
        <label class="lbl" for="f-src">Źródło <em>opcjonalnie</em></label>
        <input class="field" id="f-src" type="url" inputmode="url" value="${esc(d.zrodlo)}" data-in="f-field" data-f="zrodlo" placeholder="https://…">
      </form>
      <div class="dock"><button class="btn primary grow" data-act="f-save" id="f-save">${icon('check')} Zapisz przepis</button></div>`;
  },
  mount(root) { root.querySelectorAll('textarea.grow').forEach(autoGrow); },
};

const reTags = () => { document.getElementById('f-tags').innerHTML = tagsHtml(); };
const reIngs = () => { document.getElementById('f-ings').innerHTML = ingsHtml(); reUnk(); saveDraft(); };
const reSteps = () => { const el = document.getElementById('f-steps'); el.innerHTML = stepsHtml(); el.querySelectorAll('textarea.grow').forEach(autoGrow); saveDraft(); };
const reUnk = () => {
  const el = document.getElementById('f-unk'); if (!el) return;
  const unk = unknownCount();
  el.innerHTML = unk ? `<div class="banner warn">${icon('alert')}<span>${unk} ${plural(unk, 'składnik wymaga', 'składniki wymagają', 'składników wymaga')} sprawdzenia – nie ma ich jeszcze w bazie.</span></div>` : '';
};

onInput('f-field', el => { F.data[el.dataset.f] = el.value; if (el.dataset.f === 'tytul' && F.error) { F.error = ''; document.getElementById('f-err').textContent = ''; } saveDraft(); });
onInput('f-ing', el => {
  const s = F.data.skladniki[el.dataset.i];
  s[el.dataset.f] = el.value;
  if (el.dataset.f === 'nazwa') s._keep = false;
  if (el.dataset.f === 'ilosc' && el.value && !s.jednostka) { /* jednostka zostaje do wyboru */ }
  saveDraft();
});
onInput('f-ing-name', el => {
  const i = el.dataset.i;
  const h = hintHtml(i);
  document.getElementById('ih-' + i).innerHTML = h;
  document.getElementById('ir-' + i)?.classList.toggle('warn', !!h);
  reUnk();
});
onInput('f-step', el => { F.data.kroki[el.dataset.i] = el.value; saveDraft(); });

on('f-ing-add', () => {
  F.data.skladniki.push({ ilosc: '', jednostka: '', nazwa: '' }); reIngs();
  const i = F.data.skladniki.length - 1;
  document.querySelector(`#ir-${i} .qty`)?.focus();
});
on('f-ing-del', el => { F.data.skladniki.splice(el.dataset.i, 1); if (!F.data.skladniki.length) F.data.skladniki.push({ ilosc: '', jednostka: '', nazwa: '' }); reIngs(); });
on('f-ing-sug', el => { const s = F.data.skladniki[el.dataset.i]; s.nazwa = el.dataset.v; reIngs(); });
on('f-ing-keep', el => { F.data.skladniki[el.dataset.i]._keep = true; reIngs(); });
on('f-ing-mv', el => { const a = F.data.skladniki, i = +el.dataset.i, j = i + +el.dataset.d; [a[i], a[j]] = [a[j], a[i]]; reIngs(); });
on('f-step-add', () => { F.data.kroki.push(''); reSteps(); document.querySelectorAll('#f-steps textarea')[F.data.kroki.length - 1]?.focus(); });
on('f-step-del', el => { F.data.kroki.splice(el.dataset.i, 1); if (!F.data.kroki.length) F.data.kroki.push(''); reSteps(); });
on('f-step-mv', el => { const a = F.data.kroki, i = +el.dataset.i, j = i + +el.dataset.d; [a[i], a[j]] = [a[j], a[i]]; reSteps(); });
on('f-reorder', el => { const k = el.dataset.k; F.reorder[k] = !F.reorder[k]; k === 'ing' ? reIngs() : reSteps(); });

// ----- tagi -----
onInput('f-tag-in', el => {
  if (/,/.test(el.value)) { F.tagInput = el.value.replace(/,/g, ''); addTag(); return; }
  F.tagInput = el.value; F.tagAsk = null;
  const pos = el.selectionStart; reTags();
  const n = document.getElementById('f-tag'); n.focus(); n.setSelectionRange(pos, pos);
});
function pushTag(t) {
  t = cleanTag(t);
  if (t && !F.data.tagi.some(x => norm(x) === norm(t))) F.data.tagi.push(t);
  F.tagInput = ''; F.tagAsk = null; reTags(); saveDraft();
  document.getElementById('f-tag')?.focus();
}
function addTag() {
  const t = cleanTag(F.tagInput);
  if (!t) return;
  const usage = st.tagUsage().map(x => x.tag);
  const exact = usage.find(x => norm(x) === norm(t));
  if (exact) return pushTag(exact);
  const sim = usage.find(x => similar(x, t) && !F.data.tagi.includes(x));
  if (sim) { F.tagAsk = { existing: sim, typed: t }; reTags(); return; }
  pushTag(t);
}
on('f-tag-add', addTag);
on('f-tag-pick', el => pushTag(el.dataset.tag));
on('f-tag-del', el => { F.data.tagi.splice(el.dataset.i, 1); reTags(); saveDraft(); });
on('f-tag-ask', el => pushTag(el.dataset.v === 'old' ? F.tagAsk.existing : F.tagAsk.typed));

// ----- zapis -----
function leave() {
  const { mode, id } = F;
  clearDraft(); F = null;
  if (mode === 'import') pendingImport = null;
  location.hash = mode === 'edit' ? '#/przepis/' + encodeURIComponent(id) : mode === 'import' ? '#/import' : '#/przepisy';
}
on('f-cancel', leave);
on('f-discard', () => { const { mode, id } = F; clearDraft(); F = null; setup(mode, id); st.emit(); window.dispatchEvent(new Event('hashchange')); });
on('f-save', async el => {
  const d = F.data;
  if (F.tagInput.trim()) { const t = cleanTag(F.tagInput); if (!d.tagi.includes(t)) d.tagi.push(t); F.tagInput = ''; }
  if (!d.tytul.trim()) {
    F.error = 'Wpisz tytuł – to jedyne wymagane pole.';
    document.getElementById('f-err').textContent = F.error;
    document.getElementById('f-title').focus();
    return;
  }
  const data = {
    wersja: 1,
    tytul: d.tytul.trim(), tagi: d.tagi, czas_min: parseNum(d.czas_min), porcje: parseNum(d.porcje), zrodlo: d.zrodlo.trim(),
    skladniki: d.skladniki.filter(s => s.nazwa.trim()).map(s => {
      const q = parseNum(s.ilosc);
      return q != null ? { ilosc: q, jednostka: s.jednostka || '', nazwa: s.nazwa.trim() } : { nazwa: s.nazwa.trim() };
    }),
    kroki: d.kroki.map(s => s.trim()).filter(Boolean), notatki: d.notatki.trim(),
    zdjecie: F.mode === 'edit' ? (st.recipe(F.id)?.zdjecie ?? null) : null,
  };
  el.disabled = true; el.innerHTML = 'Zapisuję…';
  try {
    const id = await st.saveRecipe(F.mode === 'edit' ? F.id : null, data);
    // Nowe nazwy składników trafiają do katalogu produktów (z działem), żeby następnym razem były podpowiadane.
    for (const s of data.skladniki) if (!st.product(s.nazwa) && !st.isBasic(s.nazwa)) {
      st.op({ t: 'upsert', table: 'produkty', row: { nazwa: st.canonical(s.nazwa), dzial: st.deptFor(s.nazwa), wDomu: false, kupiono: 0, aktualizacja: new Date().toISOString() } });
    }
    clearDraft(); F = null; pendingImport = null;
    location.hash = '#/przepis/' + encodeURIComponent(id);
    toast('Zapisano przepis.');
  } catch (e) {
    el.disabled = false; el.innerHTML = `${icon('check')} Zapisz przepis`;
    toast(e.offline ? 'Brak internetu. Przepis czeka w formularzu – zapisz, gdy wróci sieć.' : e.auth ? 'Sesja wygasła. Odśwież sesję – formularz zostanie zachowany.' : 'Nie udało się zapisać: ' + e.message, { error: true, ms: 7000 });
  }
});

// ---------------- Import ----------------
let pendingImport = null;
const I = { text: '', res: null };

function lineInfo(text, pos) {
  const before = text.slice(0, pos);
  const line = before.split('\n').length;
  return { line, content: (text.split('\n')[line - 1] || '').trim() };
}

export function validateImport(raw) {
  let text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  if (!text) return { errors: [{ t: 'Pole jest puste', h: 'Wklej tutaj JSON przepisu przygotowany przez Claude.' }] };
  let j;
  try { j = JSON.parse(text); } catch (e) {
    const m = String(e.message).match(/position (\d+)/);
    const lm = String(e.message).match(/line (\d+)/);
    let h = 'Najczęstsze przyczyny: przecinek po ostatnim elemencie, brak cudzysłowu albo tekst przed { lub po }.';
    if (m) { const li = lineInfo(text, +m[1]); h = `Problem w linii ${lm ? lm[1] : li.line}: ${li.content.slice(0, 60)}. ` + h; }
    return { errors: [{ t: 'To nie jest poprawny JSON', h }] };
  }
  if (Array.isArray(j)) {
    if (j.length === 1 && typeof j[0] === 'object') j = j[0];
    else return { errors: [{ t: 'Wklejono listę zamiast jednego przepisu', h: 'Importuję jeden przepis naraz: obiekt zaczynający się od { i kończący na }.' }] };
  }
  if (!j || typeof j !== 'object') return { errors: [{ t: 'To nie wygląda na przepis', h: 'Przepis to obiekt w nawiasach { }, z polem "tytul".' }] };
  const errors = [];
  if (typeof j.tytul !== 'string' || !j.tytul.trim()) {
    errors.push({ t: 'Brakuje pola „tytul”', h: 'Tylko tytuł jest wymagany. Dodaj na początku, zaraz po {, linię:', code: '"tytul": "Nazwa przepisu",' });
  }
  if (j.tagi != null && (!Array.isArray(j.tagi) || j.tagi.some(t => typeof t !== 'string'))) errors.push({ t: 'Pole „tagi” musi być listą tekstów', h: 'Na przykład:', code: '"tagi": ["obiad", "zupa"],' });
  for (const f of ['czas_min', 'porcje']) if (j[f] != null && j[f] !== '' && typeof j[f] !== 'number') errors.push({ t: `Pole „${f}” musi być liczbą`, h: 'Bez cudzysłowu i bez jednostki, na przykład:', code: `"${f}": ${f === 'porcje' ? 4 : 40},` });
  if (j.skladniki != null) {
    if (!Array.isArray(j.skladniki)) errors.push({ t: 'Pole „skladniki” musi być listą', h: 'Każdy składnik to obiekt, na przykład:', code: '{ "ilosc": 200, "jednostka": "g", "nazwa": "makaron" }' });
    else j.skladniki.forEach((s, i) => {
      const lbl = `Składnik ${i + 1}${s && s.nazwa ? ` („${s.nazwa}”)` : ''}`;
      if (!s || typeof s !== 'object' || typeof s.nazwa !== 'string' || !s.nazwa.trim()) { errors.push({ t: `${lbl}: brakuje nazwy`, h: 'Każdy składnik potrzebuje pola "nazwa".' }); return; }
      if (s.ilosc != null && typeof s.ilosc !== 'number') errors.push({ t: `${lbl}: ilość musi być liczbą`, h: 'Z kropką zamiast przecinka i bez cudzysłowu, np.', code: '"ilosc": 1.5' });
      if (s.ilosc != null && !UNITS.includes(s.jednostka)) errors.push({ t: `${lbl}: jednostka „${s.jednostka ?? ''}” nie jest na liście`, h: `Użyj jednej z: ${UNITS.join(', ')}.` });
    });
  }
  if (j.kroki != null && (!Array.isArray(j.kroki) || j.kroki.some(k => typeof k !== 'string'))) errors.push({ t: 'Pole „kroki” musi być listą tekstów', h: 'Na przykład:', code: '"kroki": ["Pokrój cebulę.", "Podsmaż."]' });
  if (errors.length) return { errors };
  const r = st.normalizeRecipe(j);
  const known = new Set(st.knownIngredientNames().map(norm));
  const unknown = r.skladniki.filter(s => !known.has(norm(s.nazwa)) && st.suggestKnown(s.nazwa)).map(s => s.nazwa);
  return { ok: true, r, unknown };
}

export const importView = {
  mod: 'przepisy', nav: false,
  render() {
    const res = I.res;
    const r = res?.r;
    return `<header class="mod-head"><nav class="topnav"><a href="#/przepisy">${icon('chevL')} Przepisy</a></nav><h1>Importuj przepis</h1>
      <p class="sub">Wklej przepis w formacie JSON, np. taki, który przygotował dla Ciebie Claude.</p></header>
      <div class="page">
        <div class="card-soft"><p>Nie masz JSON? Skopiuj polecenie i wklej je w rozmowę z Claude razem z linkiem do przepisu.</p><button class="btn ghost small" data-act="imp-copy">${icon('copy')} Kopiuj polecenie</button></div>
        <label class="lbl" for="imp-t">JSON przepisu</label>
        <textarea id="imp-t" class="field code${res ? (res.ok ? ' ok' : ' bad') : ''}" rows="12" spellcheck="false" autocapitalize="off" data-in="imp-in" placeholder='{ "tytul": "…", "skladniki": [ … ] }'>${esc(I.text)}</textarea>
        ${res && !res.ok ? `<div class="result bad">${icon('xCircle')}<div>${res.errors.slice(0, 4).map(e => `<b>${esc(e.t)}</b><p>${esc(e.h)}${e.code ? `<br><code>${esc(e.code)}</code>` : ''}</p>`).join('')}${res.errors.length > 4 ? `<p>…i ${res.errors.length - 4} więcej.</p>` : ''}</div></div>` : ''}
        ${res && res.ok ? `<div class="result ok"><p class="okh">${icon('check')} Wszystko się zgadza</p><h2>${esc(r.tytul)}</h2>
          <p class="muted">${r.tagi.length} ${plural(r.tagi.length, 'tag', 'tagi', 'tagów')} · ${r.skladniki.length} ${plural(r.skladniki.length, 'składnik', 'składniki', 'składników')} · ${r.kroki.length} ${plural(r.kroki.length, 'krok', 'kroki', 'kroków')}</p>
          ${res.unknown.length ? `<p>Do sprawdzenia w następnym kroku: ${res.unknown.map(n => `„${esc(n)}”`).join(', ')} – nie ma ich w bazie składników.</p>` : ''}</div>` : ''}
      </div>
      <div class="dock">${res && res.ok
        ? `<button class="btn primary grow" data-act="imp-next">Dalej: sprawdź i zapisz ${icon('chevR')}</button>`
        : `<button class="btn primary grow" data-act="imp-check">${icon('check')} Sprawdź</button>`}</div>`;
  },
};
onInput('imp-in', el => { I.text = el.value; if (I.res) { I.res = null; const p = el.selectionStart; st.emit(); requestAnimationFrame(() => { const t = document.getElementById('imp-t'); t?.focus(); t?.setSelectionRange(p, p); }); } });
on('imp-copy', async () => { toast(await copyText(CLAUDE_PROMPT) ? 'Skopiowano polecenie. Wklej je w rozmowę z Claude.' : 'Nie udało się skopiować.'); });
on('imp-check', () => { I.res = validateImport(I.text); st.emit(); });
on('imp-next', () => {
  const r = I.res.r;
  pendingImport = fromRecipe(r);
  localStorage.removeItem('kuchnia.draft.import.');
  F = null;
  I.text = ''; I.res = null;
  location.hash = '#/import/sprawdz';
});
