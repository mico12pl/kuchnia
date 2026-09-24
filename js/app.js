// Start aplikacji: logowanie, wybór folderu, router, odświeżanie.
import { GoogleBackend, auth } from './google.js';
import { DemoBackend } from './demo.js';
import * as st from './store.js';
import { S } from './store.js';
import { esc } from './util.js';
import { GOOGLE_G, icon, on, sheet, toast } from './ui.js';
import { recipesView, recipeView } from './views/recipes.js';
import { formView, importView } from './views/form.js';
import { drawView, planView } from './views/plan.js';
import { listView } from './views/list.js';
import { historyView, makeView, moreView, pantryView, settingsView } from './views/more.js';

const VERSION = '1.0.0';
const MODE_KEY = 'kuchnia.mode';
const $view = () => document.getElementById('view');

// ---------------- router ----------------
const dec = decodeURIComponent;
const ROUTES = [
  [/^#\/losuj$/, drawView],
  [/^#\/przepisy$/, recipesView],
  [/^#\/przepis\/([^/]+)$/, recipeView, m => ({ id: dec(m[1]) })],
  [/^#\/przepis\/([^/]+)\/edytuj$/, formView, m => ({ mode: 'edit', id: dec(m[1]) })],
  [/^#\/nowy$/, formView, () => ({ mode: 'new' })],
  [/^#\/import$/, importView],
  [/^#\/import\/sprawdz$/, formView, () => ({ mode: 'import' })],
  [/^#\/plan(?:\/(-?\d+))?$/, planView],
  [/^#\/lista$/, listView],
  [/^#\/wiecej$/, moreView],
  [/^#\/spizarnia$/, pantryView],
  [/^#\/co-zrobie$/, makeView],
  [/^#\/historia$/, historyView],
  [/^#\/ustawienia$/, settingsView],
];
const TABS = [
  ['przepisy', 'Przepisy', 'book', '#/przepisy', ['przepisy', 'przepis', 'nowy', 'import']],
  ['plan', 'Plan', 'calendar', '#/plan', ['plan']],
  ['losuj', 'Losuj', 'dice', '#/losuj', ['losuj']],
  ['lista', 'Lista', 'list', '#/lista', ['lista']],
  ['wiecej', 'Więcej', 'more', '#/wiecej', ['wiecej', 'spizarnia', 'co-zrobie', 'historia', 'ustawienia']],
];

let current = null; // { view, params, hash }
function match(hash) {
  for (const [re, view, fn] of ROUTES) {
    const m = hash.match(re);
    if (m) return { view, params: fn ? fn(m) : {} };
  }
  return null;
}

function ctx() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let installHint = '';
  if (!standalone) installHint = ios
    ? 'Na iPhonie: w Safari naciśnij „Udostępnij”, potem „Dodaj do ekranu początkowego”, żeby mieć aplikację jak zwykłą ikonę.'
    : 'Możesz zainstalować aplikację: w menu przeglądarki wybierz „Zainstaluj aplikację” albo „Dodaj do ekranu głównego”.';
  return { installHint, version: VERSION };
}

function renderTabbar(view) {
  const nav = document.getElementById('tabbar');
  const seg = (location.hash.split('/')[1] || '');
  nav.hidden = !view?.nav;
  nav.innerHTML = TABS.map(([id, label, ic, href, segs]) => {
    const active = segs.includes(seg);
    return `<a href="${href}" class="tab tab-${id}${active ? ' active' : ''}" ${active ? 'aria-current="page"' : ''}><span class="tab-ic">${icon(ic)}</span><span class="tab-l">${label}</span></a>`;
  }).join('');
}

function renderBanner() {
  const b = document.getElementById('banner');
  let html = '';
  if (S.sessionExpired && S.backend?.kind === 'google') {
    html = `<div class="topbanner">${icon('user')}<span>Sesja Google wygasła. Zmiany poczekają.</span><button class="btn small" data-act="relogin">Odśwież sesję</button></div>`;
  } else if (!S.online && current?.view !== listView) {
    html = `<div class="topbanner soft">${icon('cloudOff')}<span>Brak internetu – pokazuję zapisane dane.</span></div>`;
  }
  if (b.innerHTML !== html) b.innerHTML = html;
}

function focusKey(el) {
  if (!el || !$view().contains(el)) return null;
  return { id: el.id, in: el.dataset.in, i: el.dataset.i, f: el.dataset.f, s: el.selectionStart, e: el.selectionEnd };
}
function restoreFocus(k) {
  if (!k) return;
  let el = k.id ? document.getElementById(k.id) : null;
  if (!el && k.in) el = $view().querySelector(`[data-in="${k.in}"]${k.i != null ? `[data-i="${k.i}"]` : ''}${k.f ? `[data-f="${k.f}"]` : ''}`);
  if (!el) return;
  el.focus({ preventScroll: true });
  try { if (k.s != null) el.setSelectionRange(k.s, k.e); } catch {}
}

function render(full = false) {
  if (!current) return;
  const { view, params } = current;
  document.body.dataset.mod = view.mod;
  renderBanner();
  renderTabbar(view);
  if (!full && (view.static || view.skipRender?.())) return;
  const fk = focusKey(document.activeElement);
  const y = window.scrollY;
  $view().innerHTML = view.render({ ...params, ctx: ctx() });
  view.mount?.($view(), params);
  if (!full) { window.scrollTo(0, y); restoreFocus(fk); }
}

let pollTimer = null;
function route() {
  if (!S.user) return;
  let hash = location.hash;
  let m = match(hash);
  if (!m) { history.replaceState(null, '', '#/losuj'); hash = '#/losuj'; m = match(hash); }
  const changed = !current || current.hash !== hash;
  current = { ...m, hash };
  if (sheet.current) sheet.close(true);
  render(true);
  if (changed) window.scrollTo(0, 0);
  if (m.view.refresh) st.refresh(m.view.refresh);
  if (m.view.recipes) st.syncRecipes();
  clearInterval(pollTimer);
  if (m.view.poll) pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') st.refresh(m.view.refresh, { minGap: m.view.poll - 1000 });
  }, m.view.poll);
}

// ---------------- ekrany startowe ----------------
const STICKERS = `<div class="stickers" aria-hidden="true">
  <span class="stk s1">${icon('book')}</span><span class="stk s2">${icon('calendar')}</span><span class="stk s3">${icon('dice')}</span>
  <span class="stk s4">${icon('list')}</span><span class="stk s5">${icon('pantry')}</span></div>`;

function showWelcome(err = '') {
  document.body.dataset.mod = 'welcome';
  document.getElementById('tabbar').hidden = true;
  const cfg = auth.configured;
  $view().innerHTML = `<div class="welcome">${STICKERS}
    <h1 class="display">Wspólna kuchnia</h1>
    <p class="lead">Przepisy, plan tygodnia i jedna lista zakupów dla Was dwojga.</p>
    <p class="fine">${icon('folder')}<span>Przepisy i lista są trzymane w folderze „Kuchnia” na Twoim Dysku Google – aplikacja nie ma własnego serwera.</span></p>
    ${err ? `<div class="result bad">${icon('xCircle')}<div><b>Nie udało się zalogować</b><p>${esc(err)}</p></div></div>` : ''}
    <div class="welcome-foot">
    ${cfg ? `<button class="gbtn" data-act="login">${GOOGLE_G}<span>Zaloguj się przez Google</span></button>
      <p class="fine c">Druga osoba loguje się swoim kontem – aplikacja zaproponuje wspólny folder.</p>`
      : `<div class="card-soft"><p><b>Najpierw konfiguracja</b></p><p class="note">Wpisz swój identyfikator klienta Google (CLIENT_ID) w pliku <code>config.js</code>. Instrukcja krok po kroku jest w pliku README.</p></div>`}
    <button class="link-btn" data-act="demo">Wypróbuj na przykładowych danych</button></div></div>`;
}

function showMessage(title, text, btn = '') {
  document.body.dataset.mod = 'welcome';
  document.getElementById('tabbar').hidden = true;
  $view().innerHTML = `<div class="welcome">${STICKERS}<h1 class="display sm">${esc(title)}</h1><p class="lead">${text}</p><div class="welcome-foot">${btn}</div></div>`;
}

function showFolderChoice(choice) {
  return new Promise(resolve => {
    document.body.dataset.mod = 'welcome';
    document.getElementById('tabbar').hidden = true;
    $view().innerHTML = `<div class="welcome">${STICKERS}<h1 class="display sm">Znalazłem folder „Kuchnia”</h1>
      <p class="lead">${choice.length === 1 ? 'Użyć go? Wtedy będziecie mieć wspólne przepisy i listę.' : 'Jest ich kilka. Wybierz ten, którego używacie razem.'}</p>
      <div class="welcome-foot">${choice.map(c => `<button class="navcard" data-act="folder-pick" data-id="${esc(c.id)}"><span class="ic c-peach">${icon('folder')}</span><span class="grow"><b>Kuchnia</b><small>${esc(c.owner)}</small></span>${icon('chevR', 'chev')}</button>`).join('')}
      <button class="link-btn" data-act="folder-pick" data-id="">Utwórz nowy, osobny folder</button></div></div>`;
    on('folder-pick', el => resolve(el.dataset.id || null));
  });
}

// ---------------- połączenie z danymi ----------------
async function connect() {
  const b = S.backend;
  const user = await b.me();
  S.user = user;
  let loc = await b.locateFolder();
  let folderId = loc.folderId;
  if (!folderId) {
    if (loc.choice.length) folderId = await showFolderChoice(loc.choice);
    if (!folderId) { showMessage('Chwileczkę…', 'Tworzę folder „Kuchnia” na Twoim Dysku.'); folderId = await b.createFolder(); }
  }
  if (!current) showMessage('Chwileczkę…', 'Łączę się z folderem „Kuchnia”.');
  await b.useFolder(folderId);
  const ppl = await b.sharedWith(user.email);
  if (ppl) S.people = ppl;
  S.ready = true;
  S.online = true;
}

async function connectAndSync() {
  try {
    await connect();
  } catch (e) {
    if (e.offline) { S.online = false; }
    else if (e.auth) { S.sessionExpired = true; }
    else { console.error(e); toast('Problem z Dyskiem Google: ' + e.message, { error: true, ms: 8000 }); }
    if (!S.user) {
      showMessage(e.offline ? 'Brak internetu' : 'Nie udało się połączyć', e.offline
        ? 'Za pierwszym razem aplikacja potrzebuje internetu, żeby pobrać dane z Dysku.'
        : esc(e.message), '<button class="btn primary grow" data-act="reload">Spróbuj ponownie</button>');
      return;
    }
    if (!current) route();
    st.emit();
    return;
  }
  if (!current) route(); else render();
  await Promise.all([st.refresh(Object.keys(S.t), { force: true }), st.syncRecipes({ force: true })]);
  st.flush();
}

async function start(backend) {
  S.backend = backend;
  await st.loadCache();
  if (S.user) route(); // szybki start z pamięci podręcznej
  else showMessage('Chwileczkę…', 'Łączę się z Twoim Dyskiem Google.');
  await connectAndSync();
}

// ---------------- akcje globalne ----------------
on('login', () => auth.login({ route: '#/losuj' }));
on('relogin', () => auth.login({ route: location.hash }));
on('reload', () => location.reload());
on('demo', () => { localStorage.setItem(MODE_KEY, 'demo'); location.hash = '#/losuj'; location.reload(); });
on('set-logout', async () => {
  if (S.backend?.kind === 'demo') localStorage.removeItem(MODE_KEY);
  else auth.logout();
  await st.kvClear();
  location.hash = '';
  location.reload();
});
on('set-demo-reset', async () => { DemoBackend.reset(); await st.kvClear(); location.reload(); });

st.subscribe(() => render());
st.setErrorHandler(msg => toast(msg, { error: true, ms: 7000 }));
window.addEventListener('hashchange', route);
window.addEventListener('online', () => { S.online = true; if (!S.ready && S.backend) connectAndSync(); else { st.flush(); if (current?.view.refresh) st.refresh(current.view.refresh); } st.emit(); });
window.addEventListener('offline', () => { S.online = false; st.emit(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !S.ready) return;
  st.flush();
  if (current?.view.refresh) st.refresh(current.view.refresh, { minGap: 3000 });
  if (current?.view.recipes) st.syncRecipes();
  if (S.backend?.kind === 'google' && !auth.token()) { S.sessionExpired = true; st.emit(); }
});
setInterval(() => {
  if (S.backend?.kind === 'google' && S.ready && !auth.token() && !S.sessionExpired) { S.sessionExpired = true; st.emit(); }
  if (S.queue.length && S.online) st.flush();
}, 30000);

// ---------------- start ----------------
(function boot() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  const redirect = auth.handleRedirect();
  const mode = localStorage.getItem(MODE_KEY);
  if (mode === 'demo') { start(new DemoBackend()); return; }
  if (!auth.configured) { showWelcome(); return; }
  if (redirect && !redirect.ok) {
    showWelcome(redirect.error === 'access_denied' ? 'Logowanie zostało anulowane. Spróbuj jeszcze raz.' : `Google zwrócił błąd: ${redirect.error}.`);
    return;
  }
  if (auth.token()) { start(new GoogleBackend()); return; }
  if (auth.rememberedEmail()) {
    // Token wygasł: przy starcie z internetem logujemy ponownie automatycznie.
    if (navigator.onLine && auth.canAutoLogin()) { auth.markAutoLogin(); auth.login(); return; }
    S.sessionExpired = true;
    S.backend = new GoogleBackend();
    st.loadCache().then(() => { if (S.user) route(); else showWelcome(); });
    return;
  }
  showWelcome();
})();
