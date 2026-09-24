// Wspólne narzędzia: normalizacja nazw, daty, liczby, działy, tagi.

const PL_MAP = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };

/** Do porównań: małe litery, bez spacji na końcach, bez polskich znaków. */
export function norm(s) {
  return (s ?? '').toString().trim().toLowerCase()
    .replace(/[ąćęłńóśźż]/g, c => PL_MAP[c])
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function esc(s) {
  return (s ?? '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function uid(len = 8) {
  const a = 'abcdefghijkmnopqrstuvwxyz23456789';
  const buf = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(buf, b => a[b % a.length]).join('');
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Czy dwie nazwy są „bardzo podobne” (pomidory ~ pomidor, makarony ~ makaron). */
export function similar(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y || x === y) return false;
  const short = Math.min(x.length, y.length);
  if (short >= 4 && (x.startsWith(y) || y.startsWith(x)) && Math.abs(x.length - y.length) <= 3) return true;
  const stem = n => n.slice(0, Math.max(4, n.length - 2));
  if (short >= 5 && stem(x) === stem(y)) return true;
  return levenshtein(x, y) <= (short > 6 ? 2 : 1);
}

export function bestSimilar(name, candidates) {
  const n = norm(name);
  let best = null, bestD = Infinity;
  for (const c of candidates) {
    if (!similar(name, c)) continue;
    const d = levenshtein(n, norm(c));
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

// ---------- liczby ----------
export function fmtNum(n) {
  if (n == null || n === '' || isNaN(n)) return '';
  const v = Number(n);
  let r;
  if (Math.abs(v) >= 10) r = Math.round(v);
  else if (Math.abs(v) >= 1) r = Math.round(v * 10) / 10;
  else r = Math.round(v * 100) / 100;
  return String(r).replace('.', ',');
}

export function parseNum(s) {
  if (s == null || s === '') return null;
  if (typeof s === 'number') return s;
  const v = parseFloat(String(s).replace(',', '.').replace(/\s/g, ''));
  return isNaN(v) ? null : v;
}

// ---------- daty ----------
export const DAYS = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
export const DAYS_SHORT = ['nd', 'pn', 'wt', 'śr', 'czw', 'pt', 'sob'];
export const DAYS_LOC = ['w niedzielę', 'w poniedziałek', 'we wtorek', 'w środę', 'w czwartek', 'w piątek', 'w sobotę'];
export const DAYS_ACC = ['niedzielę', 'poniedziałek', 'wtorek', 'środę', 'czwartek', 'piątek', 'sobotę'];
export const MONTHS_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
export const MONTHS_NOM = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
export const MONTHS_LOC = ['styczniu', 'lutym', 'marcu', 'kwietniu', 'maju', 'czerwcu', 'lipcu', 'sierpniu', 'wrześniu', 'październiku', 'listopadzie', 'grudniu'];

export function isoDate(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function parseDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function weekStart(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = (x.getDay() + 6) % 7; // pn = 0
  return addDays(x, -wd);
}
export function daysBetween(a, b) {
  const d = x => parseDate(typeof x === 'string' ? x : isoDate(x));
  return Math.round((d(b) - d(a)) / 86400000);
}
export function ddmm(d) { return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`; }
export function weekLabel(start) {
  const end = addDays(start, 6);
  if (start.getMonth() === end.getMonth()) return `${start.getDate()}–${end.getDate()} ${MONTHS_GEN[end.getMonth()]}`;
  return `${start.getDate()} ${MONTHS_GEN[start.getMonth()]} – ${end.getDate()} ${MONTHS_GEN[end.getMonth()]}`;
}
export function relTime(ts) {
  if (!ts) return 'jeszcze nie';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return 'przed chwilą';
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? 'minutę temu' : `${m} ${plural(m, 'minutę', 'minuty', 'minut')} temu`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? 'godzinę temu' : `${h} ${plural(h, 'godzinę', 'godziny', 'godzin')} temu`;
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

export function plural(n, one, few, many) {
  if (n === 1) return one;
  const d = n % 10, dd = n % 100;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}

/** „z Olą”, „z Kubą”, „z Tomkiem” – prosta odmiana imienia w narzędniku. */
export function instrumental(name) {
  if (!name) return '';
  if (/a$/i.test(name)) return name.slice(0, -1) + 'ą';
  if (/ek$/i.test(name)) return name.slice(0, -2) + 'kiem';
  if (/[kg]$/i.test(name)) return name + 'iem';
  return name + 'em';
}

export function firstName(displayName, email) {
  const n = (displayName || '').trim().split(/\s+/)[0];
  if (n) return n;
  const e = (email || '').split('@')[0];
  return e ? e.charAt(0).toUpperCase() + e.slice(1) : 'Ja';
}

export function slugify(s) {
  return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'przepis';
}

// ---------- jednostki ----------
export const UNITS = ['g', 'kg', 'ml', 'l', 'szt', 'łyżka', 'łyżeczka', 'szklanka', 'szczypta', 'opak'];

// ---------- działy sklepu ----------
export const DEFAULT_DEPTS = [
  'Warzywa i owoce', 'Nabiał i jajka', 'Pieczywo', 'Mięso i wędliny', 'Makaron, ryż i kasze',
  'Mąka, cukier i przyprawy', 'Mrożonki', 'Napoje', 'Chemia', 'Inne'
];

const DEPT_KEYWORDS = {
  'Warzywa i owoce': 'pomidor ogorek cebul czosn marchew marchw ziemniak papryk cukini baklazan salat kapust brokul kalafior szpinak por seler pietruszk koper szczypior bazyli natk rukol burak rzodkiew fasolka szparagowa dyni grzyb pieczark awokado jablk jablek grusz banan cytryn limonk pomarancz mandaryn trusk malin borowk jagod sliwk winogron arbuz melon ananas kiwi imbir rabarbar jarmuz szalotk kolendr mieta rozmaryn swiez wisni czeresn brzoskwin nektaryn szparag',
  'Nabiał i jajka': 'mleko smietan jogurt kefir maslank maslo ser twarog mozzarell parmezan pecorino feta jaj jajk zoltk bialk mascarpone ricott serek gouda cheddar grana halloumi',
  'Pieczywo': 'chleb bulk bulek bagietk tortill pita rogal grzank chalk bajgl',
  'Mięso i wędliny': 'kurczak kurcz piers udk udziec wolow wieprzow mieso miesa boczek kielbas szynk salami parowk indyk mielon schab karkowk zeberk losos ryb dorsz krewetk pancetta guanciale chorizo kaczk watrob pstrag',
  'Makaron, ryż i kasze': 'makaron spaghetti penne tagliatelle lasagne fusilli farfalle ryz kasz platki owsiane platki kuskus quinoa komos bulgur gnocchi noodle orzo pierogi',
  'Mąka, cukier i przyprawy': 'maka cukier sol pieprz cynamon drozdz proszek do pieczenia soda wanili kakao czekolad miod olej oliw ocet bulion sos sojowy przypraw oregano tymianek kmin kurkum curry galk ziele angielskie lisc laurowy musztard ketchup majonez koncentrat passata bulka tarta papryka slodka papryka wedzona papryka ostra chili zelatyn rodzynk orzech migdal pestk sezam kukurydza konserwowa ciecierzyc fasola czerwona mleko kokosowe przecier',
  'Mrożonki': 'mrozon lody frytki',
  'Napoje': 'sok kawa kawy herbat piwo wino napoj cola woda gazowana woda mineralna',
  'Chemia': 'plyn papier toaletowy recznik papierowy worki gabk proszek do prania mydl szampon pasta do zebow folia tabletki do zmywarki',
};
const DEPT_INDEX = [];
for (const [dept, words] of Object.entries(DEPT_KEYWORDS)) {
  // Rozdzielamy frazy: słowa pojedyncze i znane frazy wielowyrazowe
  const phrases = words.match(/(proszek do pieczenia|sos sojowy|ziele angielskie|lisc laurowy|bulka tarta|papryka slodka|papryka wedzona|papryka ostra|kukurydza konserwowa|fasola czerwona|mleko kokosowe|woda gazowana|woda mineralna|papier toaletowy|recznik papierowy|proszek do prania|pasta do zebow|tabletki do zmywarki|fasolka szparagowa|platki owsiane|[^\s]+)/g);
  for (const p of phrases) DEPT_INDEX.push([norm(p), dept]);
}

export function guessDept(name) {
  const n = ' ' + norm(name);
  let best = null, len = 0;
  for (const [kw, dept] of DEPT_INDEX) {
    if (kw.length > len && n.includes(' ' + kw)) { best = dept; len = kw.length; }
  }
  return best || 'Inne';
}

// ---------- tagi i kolory ----------
// Paleta (kolor kropki). Tło chipa liczone w CSS przez color-mix – działa w obu motywach.
export const TAG_PALETTE = [
  '#E2582F', '#1F8A7A', '#B8860B', '#4E8A2E', '#2F7BD1', '#D0457A', '#8A5AD0', '#C9920E',
  '#5E9A1E', '#3569A8', '#D07A1E', '#2E9A5A', '#9A5A30', '#B0402E', '#B04A8A', '#D03A2E',
  '#7A6048', '#5A48C0', '#1E7A8A', '#4A78B0', '#8A8A1E', '#C0602E', '#6A7A8A'
];
const KNOWN_TAGS = ['obiad', 'kolacja', 'makaron', 'zupa', 'sniadanie', 'ciasto', 'deser', 'szybkie', 'wege', 'ryba', 'kurczak', 'salatka', 'pieczenie', 'grill', 'wloskie', 'azjatyckie', 'jednogarnkowe', 'dla gosci', 'lunchbox', 'na zimno'];

export function tagColor(tag) {
  const n = norm(tag);
  const i = KNOWN_TAGS.indexOf(n);
  if (i >= 0) return TAG_PALETTE[i];
  let h = 0;
  for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}
export function cleanTag(t) { return (t || '').toString().trim().toLowerCase().replace(/\s+/g, ' '); }

// ---------- polecenie dla Claude ----------
export const CLAUDE_PROMPT = `Spisz przepis z podanej strony jako JSON w dokładnie takim formacie:

{
  "wersja": 1,
  "tytul": "...",
  "tagi": ["..."],
  "czas_min": 0,
  "porcje": 0,
  "zrodlo": "<link do strony>",
  "skladniki": [
    { "ilosc": 0, "jednostka": "...", "nazwa": "..." }
  ],
  "kroki": ["..."],
  "notatki": ""
}

Zasady:
- Nazwy składników w mianowniku liczby pojedynczej ("pomidor", "żółtko").
- Usuń przymiotniki opisujące stan lub przygotowanie ("dojrzały",
  "świeży", "drobno posiekany", "krojony").
- Zostaw przymiotniki określające, jaki to produkt ("płatki owsiane",
  "mleko kokosowe", "chleb żytni").
- Słowa występujące tylko w liczbie mnogiej zostaw w tej formie
  ("płatki", "drożdże").
- Jednostki tylko z listy: g, kg, ml, l, szt, łyżka, łyżeczka, szklanka,
  szczypta, opak. Przelicz inne jednostki na te z listy.
- Jeśli ilość jest "do smaku", podaj sam obiekt z nazwą,
  np. { "nazwa": "pieprz" }.
- czas_min to łączny czas przygotowania w minutach, jako liczba.
- Tagi małymi literami, 1–3 sztuki, np. śniadanie, obiad, kolacja,
  zupa, makaron, ciasto, deser.
- Kroki krótkie, jedno działanie na krok.
- Zwróć wyłącznie JSON, bez komentarzy i bez bloku kodu.`;

export function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
