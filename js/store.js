// Stan aplikacji, cache lokalny, synchronizacja, kolejka offline i logika domenowa.
import { TABLES, applyOp, cleanRows } from './schema.js';
import {
  DEFAULT_DEPTS, addDays, bestSimilar, cleanTag, daysBetween, fmtNum, guessDept, isoDate, norm, parseNum, uid, weekStart,
} from './util.js';

// ---------- IndexedDB (klucz–wartość) ----------
let dbp;
function idb() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open('kuchnia', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function kvGet(k) {
  try {
    const db = await idb();
    return await new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  } catch { return undefined; }
}
async function kvSet(k, v) {
  try {
    const db = await idb();
    await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  } catch {}
}
export async function kvClear() {
  try {
    const db = await idb();
    await new Promise(res => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').clear(); tx.oncomplete = res; tx.onerror = res; });
  } catch {}
}

// ---------- stan ----------
const TNAMES = Object.keys(TABLES);
export const S = {
  backend: null,
  user: null, people: null,
  recipes: {},                  // id -> { id, modifiedTime, data }
  hiddenRecipes: new Set(),
  base: Object.fromEntries(TNAMES.map(n => [n, []])),  // ostatni stan z serwera
  t: Object.fromEntries(TNAMES.map(n => [n, []])),     // stan widoczny (serwer + kolejka)
  queue: [],
  lastSync: 0,
  online: navigator.onLine,
  sessionExpired: false,
  ready: false,                 // backend połączony (folder i arkusz gotowe)
  loadedTables: new Set(),
  recipesLoaded: false,
  errors: [],
};

const listeners = new Set();
let emitQueued = false;
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit() {
  if (emitQueued) return;
  emitQueued = true;
  requestAnimationFrame(() => { emitQueued = false; listeners.forEach(f => f()); });
}

let onError = () => {};
export function setErrorHandler(fn) { onError = fn; }

function ck(k) { return (S.backend?.kind || 'x') + ':' + k; }
async function persist() {
  await kvSet(ck('base'), S.base);
  await kvSet(ck('queue'), S.queue);
  await kvSet(ck('meta'), { lastSync: S.lastSync, user: S.user, people: S.people });
}
async function persistRecipes() { await kvSet(ck('recipes'), S.recipes); }

export async function loadCache() {
  const [base, queue, meta, recipes] = await Promise.all([kvGet(ck('base')), kvGet(ck('queue')), kvGet(ck('meta')), kvGet(ck('recipes'))]);
  if (base) for (const n of TNAMES) S.base[n] = base[n] || [];
  S.queue = queue || [];
  if (meta) { S.lastSync = meta.lastSync || 0; S.user = S.user || meta.user; S.people = meta.people; }
  if (recipes) { S.recipes = recipes; S.recipesLoaded = true; }
  for (const n of TNAMES) recompute(n);
  if (base) TNAMES.forEach(n => S.loadedTables.add(n));
}

function recompute(name) {
  const rows = S.base[name].map(r => ({ ...r }));
  for (const op of S.queue) if (op.table === name) applyOp(rows, op);
  S.t[name] = cleanRows(rows);
}

// ---------- kolejka operacji ----------
let flushTimer = null;
export function op(o, { hold = 0 } = {}) {
  const full = { ...o, id: uid(10), ts: Date.now(), holdUntil: hold ? Date.now() + hold : 0 };
  S.queue.push(full);
  recompute(o.table);
  persist(); emit();
  scheduleFlush(hold ? hold + 300 : 250);
  return full.id;
}
export function undo(ids) {
  const set = new Set([].concat(ids));
  const tables = new Set(S.queue.filter(o => set.has(o.id)).map(o => o.table));
  S.queue = S.queue.filter(o => !set.has(o.id));
  tables.forEach(recompute);
  persist(); emit();
}
export function scheduleFlush(ms = 250) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => flush(), ms);
}
export function pendingCount() { return S.queue.length; }

// Wszystkie operacje na arkuszu wykonujemy po kolei.
let chain = Promise.resolve();
function serial(fn) { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; }

function handleErr(e, what) {
  if (e?.offline) { S.online = false; emit(); return; }
  if (e?.auth) { S.sessionExpired = true; emit(); return; }
  console.error(what, e);
  onError(`${what}: ${e?.message || e}`);
}

export function flush() {
  return serial(async () => {
    if (!S.ready || !S.queue.length || S.sessionExpired) return;
    const now = Date.now();
    const firstHeld = S.queue.findIndex(o => o.holdUntil && o.holdUntil > now);
    const batch = firstHeld === -1 ? [...S.queue] : S.queue.slice(0, firstHeld);
    if (firstHeld !== -1) scheduleFlush(S.queue[firstHeld].holdUntil - now + 300);
    if (!batch.length) return;
    const tables = [...new Set(batch.map(o => o.table))];
    for (const name of tables) {
      const ops = batch.filter(o => o.table === name);
      try {
        const rows = await S.backend.readTable(name);
        const origRows = new Set(rows.map(r => r._row));
        const work = rows.map(r => ({ ...r }));
        for (const o of ops) applyOp(work, o);
        const left = new Set(work.filter(r => r._row).map(r => r._row));
        const deletes = [...origRows].filter(r => !left.has(r));
        const updates = work.filter(r => r._row && r._dirty);
        const appends = work.filter(r => !r._row);
        await S.backend.commitTable(name, { updates, appends, deletes });
        S.base[name] = cleanRows(work);
        S.online = true;
      } catch (e) {
        handleErr(e, 'Nie udało się zapisać zmian');
        if (e?.offline || e?.auth) { persist(); return; }
        // Błąd po stronie Google – porzucamy te operacje, żeby nie blokować kolejki.
      }
      const done = new Set(ops.map(o => o.id));
      S.queue = S.queue.filter(o => !done.has(o.id));
      recompute(name);
    }
    S.lastSync = Date.now();
    await persist(); emit();
    if (S.queue.length && S.queue.every(o => !o.holdUntil || o.holdUntil <= Date.now())) scheduleFlush(200);
  });
}

const lastRefresh = {};
export function refresh(names, { force = false, minGap = 8000 } = {}) {
  names = [].concat(names).filter(n => force || !lastRefresh[n] || Date.now() - lastRefresh[n] > minGap);
  if (!names.length || !S.ready) return Promise.resolve();
  names.forEach(n => lastRefresh[n] = Date.now());
  return serial(async () => {
    if (S.sessionExpired) return;
    try {
      for (const n of names) {
        const rows = await S.backend.readTable(n);
        S.base[n] = cleanRows(rows);
        recompute(n);
        S.loadedTables.add(n);
      }
      S.online = true;
      S.lastSync = Date.now();
      await persist(); emit();
    } catch (e) { names.forEach(n => delete lastRefresh[n]); handleErr(e, 'Nie udało się pobrać danych'); }
  }).then(() => { if (S.queue.length) scheduleFlush(100); });
}

let recipeSync = null, lastRecipeSync = 0;
export function syncRecipes({ force = false } = {}) {
  if (recipeSync) return recipeSync;
  if (!S.ready) return Promise.resolve();
  if (!force && Date.now() - lastRecipeSync < 60000) return Promise.resolve();
  recipeSync = (async () => {
    try {
      const files = await S.backend.listRecipes();
      const ids = new Set(files.map(f => f.id));
      let changed = false;
      for (const id of Object.keys(S.recipes)) if (!ids.has(id)) { delete S.recipes[id]; changed = true; }
      const todo = files.filter(f => !S.recipes[f.id] || S.recipes[f.id].modifiedTime !== f.modifiedTime);
      let i = 0;
      const worker = async () => {
        while (i < todo.length) {
          const f = todo[i++];
          try {
            const data = normalizeRecipe(await S.backend.getRecipe(f.id));
            S.recipes[f.id] = { id: f.id, modifiedTime: f.modifiedTime, data };
          } catch (e) {
            if (e?.auth || e?.offline) throw e;
            S.recipes[f.id] = { id: f.id, modifiedTime: f.modifiedTime, data: null, broken: f.name };
          }
          changed = true;
        }
      };
      await Promise.all(Array.from({ length: Math.min(6, todo.length) }, worker));
      lastRecipeSync = Date.now();
      S.recipesLoaded = true;
      S.online = true;
      if (changed) await persistRecipes();
      emit();
    } catch (e) { handleErr(e, 'Nie udało się pobrać przepisów'); }
    finally { recipeSync = null; }
  })();
  return recipeSync;
}

// ---------- przepisy ----------
export function normalizeRecipe(r) {
  r = r && typeof r === 'object' ? r : {};
  return {
    wersja: r.wersja || 1,
    tytul: String(r.tytul || 'Bez tytułu'),
    tagi: Array.isArray(r.tagi) ? [...new Set(r.tagi.map(cleanTag).filter(Boolean))] : [],
    czas_min: parseNum(r.czas_min),
    porcje: parseNum(r.porcje),
    zrodlo: r.zrodlo || '',
    skladniki: Array.isArray(r.skladniki) ? r.skladniki.filter(s => s && s.nazwa).map(s => ({
      ...(parseNum(s.ilosc) != null ? { ilosc: parseNum(s.ilosc), jednostka: s.jednostka || '' } : {}),
      nazwa: String(s.nazwa).trim(),
    })) : [],
    kroki: Array.isArray(r.kroki) ? r.kroki.map(String).filter(s => s.trim()) : [],
    notatki: r.notatki || '',
    zdjecie: r.zdjecie ?? null,
  };
}

export function recipe(id) { const r = S.recipes[id]; return r && r.data && !S.hiddenRecipes.has(id) ? { id, ...r.data } : null; }
export function recipes() {
  return Object.values(S.recipes).filter(r => r.data && !S.hiddenRecipes.has(r.id))
    .map(r => ({ id: r.id, ...r.data }))
    .sort((a, b) => a.tytul.localeCompare(b.tytul, 'pl'));
}
export function brokenRecipes() { return Object.values(S.recipes).filter(r => !r.data).map(r => r.broken); }

export async function saveRecipe(id, data) {
  const clean = normalizeRecipe(data);
  const res = await S.backend.saveRecipe(id, clean);
  S.recipes[res.id] = { id: res.id, modifiedTime: res.modifiedTime, data: clean };
  await persistRecipes(); emit();
  return res.id;
}

export function deleteRecipe(id) {
  S.hiddenRecipes.add(id); emit();
  let cancelled = false;
  const timer = setTimeout(async () => {
    if (cancelled) return;
    try {
      await S.backend.trashRecipe(id);
      delete S.recipes[id]; S.hiddenRecipes.delete(id);
      await persistRecipes(); emit();
    } catch (e) {
      S.hiddenRecipes.delete(id); emit();
      handleErr(e, 'Nie udało się usunąć przepisu');
      if (e?.offline) onError('Brak internetu – przepis nie został usunięty.');
    }
  }, 5000);
  return () => { cancelled = true; clearTimeout(timer); S.hiddenRecipes.delete(id); emit(); };
}

// ---------- ustawienia ----------
const DEFAULTS = { dzialy: DEFAULT_DEPTS, wykluczaj: true, dni: 7, podstawy: ['sól', 'pieprz', 'olej', 'woda'], aliasy: {} };
export function settings() {
  const o = { ...DEFAULTS };
  for (const r of S.t.ustawienia) { try { o[r.klucz] = JSON.parse(r.wartosc); } catch {} }
  // Działy: dopisz brakujące domyślne na koniec (np. po aktualizacji)
  o.dzialy = [...o.dzialy.filter(Boolean), ...DEFAULT_DEPTS.filter(d => !o.dzialy.includes(d))];
  return o;
}
export function setSetting(klucz, value) {
  op({ t: 'upsert', table: 'ustawienia', row: { klucz, wartosc: JSON.stringify(value) } });
}

// ---------- nazwy, podstawy, spiżarnia ----------
export function canonical(name) {
  const a = settings().aliasy || {};
  const n = norm(name);
  for (const [from, to] of Object.entries(a)) if (norm(from) === n) return to;
  return String(name).trim();
}
export function key(name) { return norm(canonical(name)); }
export function isBasic(name) { const k = key(name); return settings().podstawy.some(b => norm(b) === k); }
export function product(name) { const k = key(name); return S.t.produkty.find(p => norm(p.nazwa) === k); }
export function inHome(name) { return isBasic(name) || !!product(name)?.wDomu; }
export function deptFor(name) {
  const p = product(name);
  if (p?.dzial) return p.dzial;
  return guessDept(canonical(name));
}
export function knownIngredientNames() {
  const set = new Map();
  for (const p of S.t.produkty) set.set(norm(p.nazwa), p.nazwa);
  for (const r of recipes()) for (const s of r.skladniki) if (!set.has(norm(s.nazwa))) set.set(norm(s.nazwa), s.nazwa);
  return [...set.values()].sort((a, b) => a.localeCompare(b, 'pl'));
}
export function suggestKnown(name) {
  const known = knownIngredientNames();
  if (known.some(k => norm(k) === norm(name))) return null;
  const a = settings().aliasy || {};
  for (const [from, to] of Object.entries(a)) if (norm(from) === norm(name)) return to;
  return bestSimilar(name, known);
}

// ---------- tagi ----------
export function tagUsage() {
  const m = new Map();
  for (const r of recipes()) for (const t of r.tagi) m.set(t, (m.get(t) || 0) + 1);
  return [...m.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'pl'));
}

// ---------- oceny i historia ----------
export function ratingsFor(id) { return S.t.oceny.filter(o => o.przepisId === id && o.ocena); }
export function avgRating(id) {
  const r = ratingsFor(id);
  if (!r.length) return null;
  return r.reduce((s, x) => s + Number(x.ocena), 0) / r.length;
}
export function myRating(id) { return ratingsFor(id).find(o => norm(o.kto) === norm(S.user?.name))?.ocena || 0; }
export function rate(id, ocena) {
  op({ t: 'upsert', table: 'oceny', row: { przepisId: id, kto: S.user.name, ocena, data: isoDate() } });
}
export function lastMade(id) {
  const h = S.t.historia.filter(x => x.przepisId === id).map(x => x.data).sort();
  return h.length ? h[h.length - 1] : null;
}
export function madeToday(id, ocena, finished) {
  const r = recipe(id);
  op({ t: 'append', table: 'historia', rows: [{ data: isoDate(), przepisId: id, tytul: r?.tytul || '', kto: S.user.name }] });
  if (ocena) rate(id, ocena);
  for (const name of finished) setInHome(name, false);
}
export function people() {
  const me = norm(S.user?.name);
  const set = new Map();
  for (const n of S.people || []) if (norm(n) !== me) set.set(norm(n), n);
  for (const r of [...S.t.oceny, ...S.t.historia]) if (r.kto && norm(r.kto) !== me && !set.has(norm(r.kto))) set.set(norm(r.kto), r.kto);
  return [...set.values()];
}

// ---------- spiżarnia ----------
export function setInHome(name, value) {
  const n = canonical(name);
  op({ t: 'upsert', table: 'produkty', row: { nazwa: n, dzial: deptFor(n), wDomu: value, kupiono: 0, aktualizacja: new Date().toISOString() },
    patch: { wDomu: value, aktualizacja: new Date().toISOString() } });
}
export function removeProduct(name) {
  return op({ t: 'remove', table: 'produkty', keys: [key(name)] }, { hold: 5000 });
}

export function pantryMatches() {
  const out = [];
  for (const r of recipes()) {
    const ings = r.skladniki.filter(s => !isBasic(s.nazwa));
    if (!ings.length) continue;
    const have = ings.map(s => !!product(s.nazwa)?.wDomu);
    const n = have.filter(Boolean).length;
    out.push({ r, total: ings.length, have: n, flags: have, missing: ings.filter((_, i) => !have[i]).map(s => s.nazwa) });
  }
  return out.sort((a, b) => (b.have / b.total) - (a.have / a.total) || b.have - a.have || a.missing.length - b.missing.length);
}

// ---------- lista zakupów ----------
function parseQty(s) {
  const m = String(s || '').trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  return m ? { n: parseNum(m[1]), u: m[2].trim() } : null;
}
export function combineQty(a, b) {
  if (!a) return b || '';
  if (!b) return a;
  const x = parseQty(a), y = parseQty(b);
  if (x && y && x.u === y.u) return `${fmtNum(x.n + y.n)}${x.u ? ' ' + x.u : ''}`;
  return `${a} + ${b}`;
}
export function qtyText(ilosc, jednostka) {
  if (ilosc == null || ilosc === '') return '';
  if (jednostka === 'g' && ilosc >= 1000) { ilosc /= 1000; jednostka = 'kg'; }
  if (jednostka === 'ml' && ilosc >= 1000) { ilosc /= 1000; jednostka = 'l'; }
  if (jednostka === 'szt') ilosc = Math.ceil(ilosc - 1e-9);
  return `${fmtNum(ilosc)}${jednostka ? ' ' + jednostka : ''}`;
}

/** items: [{nazwa, ilosc (tekst), dzial?, zPrzepisu?, manual?}] */
export function listAdd(items) {
  const ids = [];
  for (const it of items) {
    const nazwa = canonical(it.nazwa);
    const k = norm(nazwa);
    const dzial = it.dzial || deptFor(nazwa);
    const existing = S.t.lista.find(x => !x.kupione && norm(x.nazwa) === k);
    if (existing) {
      const patch = { ilosc: combineQty(existing.ilosc, it.ilosc) };
      if (it.zPrzepisu) patch.zPrzepisu = [existing.zPrzepisu, it.zPrzepisu].filter(Boolean).join(', ');
      ids.push(op({ t: 'patch', table: 'lista', key: existing.id, patch }));
    } else {
      ids.push(op({ t: 'append', table: 'lista', rows: [{ id: uid(), nazwa, ilosc: it.ilosc || '', dzial, kupione: false, dodal: S.user.name, dodano: new Date().toISOString(), zPrzepisu: it.zPrzepisu || '' }] }));
    }
    const p = product(nazwa);
    if (!p) op({ t: 'upsert', table: 'produkty', row: { nazwa, dzial, wDomu: false, kupiono: 0, aktualizacja: new Date().toISOString() } });
    else if (it.manual && p.dzial !== dzial) op({ t: 'patch', table: 'produkty', key: norm(p.nazwa), patch: { dzial } });
  }
  return ids;
}
export function listToggle(id) {
  const it = S.t.lista.find(x => x.id === id);
  if (it) op({ t: 'patch', table: 'lista', key: id, patch: { kupione: !it.kupione } });
}
export function listRemoveBought() {
  const bought = S.t.lista.filter(x => x.kupione);
  if (!bought.length) return [];
  const ids = [op({ t: 'remove', table: 'lista', keys: bought.map(b => b.id) }, { hold: 5000 })];
  for (const b of bought) {
    if (isBasic(b.nazwa)) continue;
    const now = new Date().toISOString();
    ids.push(op({ t: 'upsert', table: 'produkty', row: { nazwa: canonical(b.nazwa), dzial: b.dzial || deptFor(b.nazwa), wDomu: true, kupiono: 0, aktualizacja: now },
      patch: { wDomu: true, $inc: { kupiono: 1 }, aktualizacja: now } }, { hold: 5000 }));
  }
  return ids;
}
export function frequent(limit = 8) {
  const onList = new Set(S.t.lista.map(x => norm(x.nazwa)));
  return S.t.produkty.filter(p => p.kupiono > 0 && !onList.has(norm(p.nazwa)))
    .sort((a, b) => b.kupiono - a.kupiono).slice(0, limit);
}

// ---------- plan ----------
export function planFor(dateIso) {
  return S.t.plan.filter(p => p.data === dateIso).sort((a, b) => (a.kolejnosc || 0) - (b.kolejnosc || 0));
}
export function planAdd(dateIso, entries) {
  let k = Math.max(0, ...planFor(dateIso).map(p => p.kolejnosc || 0));
  op({ t: 'append', table: 'plan', rows: entries.map(e => ({ id: uid(), data: dateIso, kolejnosc: ++k, przepisId: e.przepisId || '', tekst: e.tekst || '', zrobione: false })) });
}
export function planRemove(id) { return op({ t: 'remove', table: 'plan', keys: [id] }, { hold: 5000 }); }
export function planMove(id, dateIso) {
  const k = Math.max(0, ...planFor(dateIso).map(p => p.kolejnosc || 0)) + 1;
  op({ t: 'patch', table: 'plan', key: id, patch: { data: dateIso, kolejnosc: k } });
}
export function planShift(id, dir) {
  const item = S.t.plan.find(p => p.id === id);
  if (!item) return;
  const day = planFor(item.data);
  const i = day.findIndex(p => p.id === id), j = i + dir;
  if (j < 0 || j >= day.length) return;
  [day[i], day[j]] = [day[j], day[i]];
  day.forEach((p, idx) => { if (p.kolejnosc !== idx + 1) op({ t: 'patch', table: 'plan', key: p.id, patch: { kolejnosc: idx + 1 } }); });
}
export function planLabel(p) { return p.przepisId ? (recipe(p.przepisId)?.tytul || 'Usunięty przepis') : p.tekst; }

/** Zakres dat do listy zakupów z planu: bieżący tydzień od dziś, inne tygodnie w całości. */
export function planRange(start) {
  const today = new Date();
  const ws = weekStart(today);
  const from = isoDate(start) === isoDate(ws) ? today : start;
  return { from: isoDate(from), to: isoDate(addDays(start, 6)) };
}
export function planRecipeEntries(start) {
  const { from, to } = planRange(start);
  return S.t.plan.filter(p => p.przepisId && p.data >= from && p.data <= to && recipe(p.przepisId));
}
export function aggregatePlan(start) {
  const entries = planRecipeEntries(start);
  const map = new Map();
  for (const e of entries) {
    const r = recipe(e.przepisId);
    for (const s of r.skladniki) {
      const name = canonical(s.nazwa);
      if (isBasic(name)) continue;
      const hasQty = s.ilosc != null;
      // kg i l sumujemy razem z g i ml
      let unit = s.jednostka || '', qty = Number(s.ilosc);
      if (unit === 'kg') { unit = 'g'; qty *= 1000; }
      if (unit === 'l') { unit = 'ml'; qty *= 1000; }
      const k = norm(name) + '|' + (hasQty ? unit : '-');
      if (!map.has(k)) map.set(k, { nazwa: name, ilosc: 0, jednostka: unit, hasQty, from: [] });
      const it = map.get(k);
      if (hasQty) it.ilosc += qty;
      if (!it.from.includes(r.tytul)) it.from.push(r.tytul);
    }
  }
  return [...map.values()].map(it => ({ ...it, qty: it.hasQty ? qtyText(it.ilosc, it.jednostka) : '', home: inHome(it.nazwa) }))
    .sort((a, b) => a.home - b.home);
}

// ---------- losowanie ----------
function weight(avg) {
  if (avg == null) return 1.5;
  if (avg >= 4.5) return 3;
  if (avg >= 3.5) return 2;
  if (avg >= 2.5) return 1;
  return 0.5;
}
export function drawPool(tags) {
  const sel = new Set(tags);
  return recipes().filter(r => !sel.size || r.tagi.some(t => sel.has(t)));
}
/** Zwraca { recipe, note } albo null. */
export function draw(tags, { seen = new Set(), extraExclude = new Set() } = {}) {
  let pool = drawPool(tags);
  if (!pool.length) return null;
  const st = settings();
  let note = '';
  const recent = new Set();
  if (st.wykluczaj) {
    const today = new Date();
    for (const h of S.t.historia) if (daysBetween(h.data, today) < st.dni && daysBetween(h.data, today) >= 0) recent.add(h.przepisId);
  }
  const excluded = new Set([...recent, ...extraExclude]);
  let cand = pool.filter(r => !excluded.has(r.id));
  if (!cand.length) { cand = pool; note = excluded.size && recent.size ? `Wszystko z tych tagów jedliście w ostatnich ${st.dni} dniach – losuję mimo to.` : 'Wszystko już jest w planie – losuję mimo to.'; }
  let fresh = cand.filter(r => !seen.has(r.id));
  if (!fresh.length) { seen.clear(); fresh = cand; if (cand.length > 1) note = note || 'Wszystkie pasujące już wypadły – zaczynam od nowa.'; }
  const ws = fresh.map(r => weight(avgRating(r.id)));
  let x = Math.random() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < fresh.length; i++) { x -= ws[i]; if (x <= 0) { seen.add(fresh[i].id); return { recipe: fresh[i], note }; } }
  seen.add(fresh[fresh.length - 1].id);
  return { recipe: fresh[fresh.length - 1], note };
}

// ---------- scalanie działów przy imporcie itp. ----------
export function orderedDepts() { return settings().dzialy; }
