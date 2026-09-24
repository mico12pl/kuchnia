// Tryb demo: te same operacje co GoogleBackend, ale dane w localStorage tej przeglądarki.
import { TABLES } from './schema.js';
import { addDays, isoDate, uid, weekStart } from './util.js';

const KEY = 'kuchnia.demo';
const R = (tytul, tagi, czas_min, porcje, skladniki, kroki, notatki = '') =>
  ({ wersja: 1, tytul, tagi, czas_min, porcje, zrodlo: '', skladniki, kroki, notatki, zdjecie: null });
const S = (ilosc, jednostka, nazwa) => (ilosc == null ? { nazwa } : { ilosc, jednostka, nazwa });

function seed() {
  const today = new Date();
  const ws = weekStart(today);
  const d = n => isoDate(addDays(today, n));
  const w = n => isoDate(addDays(ws, n));
  const recipes = {
    carbonara: R('Spaghetti carbonara', ['obiad', 'makaron'], 25, 2,
      [S(200, 'g', 'spaghetti'), S(100, 'g', 'boczek'), S(3, 'szt', 'żółtko'), S(1, 'szt', 'jajko'), S(50, 'g', 'pecorino'), S(null, null, 'pieprz'), S(null, null, 'sól')],
      ['Zagotuj osoloną wodę i ugotuj spaghetti al dente.', 'Boczek pokrój w paski i podsmaż na suchej patelni, aż będzie chrupiący.',
        'W misce wymieszaj żółtka, jajko i starte pecorino. Dopraw dużą ilością pieprzu.', 'Odlej szklankę wody z gotowania. Makaron przełóż na patelnię i zdejmij ją z ognia.',
        'Wlej masę jajeczną i energicznie mieszaj, dolewając wodę z makaronu, aż sos będzie kremowy.']),
    pomidorowa: R('Zupa pomidorowa', ['obiad', 'zupa'], 40, 4,
      [S(1, 'kg', 'pomidor'), S(2, 'szt', 'marchew'), S(1, 'szt', 'cebula'), S(1.5, 'l', 'bulion'), S(200, 'ml', 'śmietana'), S(100, 'g', 'ryż'), S(null, null, 'sól'), S(null, null, 'pieprz')],
      ['Cebulę i marchew pokrój w kostkę, podsmaż w garnku.', 'Dodaj pomidory i bulion, gotuj 20 minut.', 'Zmiksuj zupę na gładko. Ryż ugotuj osobno.', 'Zdejmij z ognia, dodaj śmietanę, dopraw solą i pieprzem.']),
    owsianka: R('Owsianka z jabłkiem', ['śniadanie'], 10, 1,
      [S(50, 'g', 'płatki owsiane'), S(200, 'ml', 'mleko'), S(1, 'szt', 'jabłko'), S(1, 'łyżeczka', 'miód'), S(1, 'szczypta', 'cynamon')],
      ['Zagotuj mleko i wsyp płatki. Gotuj 3 minuty, mieszając.', 'Jabłko zetrzyj na grubych oczkach i dodaj do owsianki.', 'Posyp cynamonem i polej miodem.']),
    szarlotka: R('Szarlotka', ['ciasto', 'deser'], 90, 8,
      [S(300, 'g', 'mąka'), S(200, 'g', 'masło'), S(100, 'g', 'cukier'), S(2, 'szt', 'jajko'), S(1.5, 'kg', 'jabłko'), S(1, 'łyżeczka', 'cynamon')],
      ['Zagnieć kruche ciasto z mąki, masła, cukru i jajek. Schłódź 30 minut.', 'Jabłka obierz, zetrzyj i podduś z cynamonem.', 'Połowę ciasta wyłóż do formy, dodaj jabłka, resztę ciasta zetrzyj na wierzch.', 'Piecz 50 minut w 180°C.']),
    leczo: R('Leczo', ['obiad', 'kolacja'], 45, 4,
      [S(3, 'szt', 'papryka'), S(1, 'szt', 'cukinia'), S(1, 'szt', 'cebula'), S(200, 'g', 'kiełbasa'), S(400, 'g', 'pomidor')],
      ['Cebulę i paprykę pokrój w kostkę, podsmaż na oleju.', 'Dodaj cukinię i pokrojoną kiełbasę, smaż 5 minut.', 'Wlej pomidory i duś pod przykryciem 20 minut.']),
  };
  const now = new Date().toISOString();
  const files = {};
  for (const [id, data] of Object.entries(recipes)) files[id] = { id, name: id + '.json', modifiedTime: now, data };
  const tables = {
    lista: [
      { id: uid(), nazwa: 'pomidor', ilosc: '500 g', dzial: 'Warzywa i owoce', kupione: false, dodal: 'Ola', dodano: now, zPrzepisu: '' },
      { id: uid(), nazwa: 'ogórek', ilosc: '', dzial: 'Warzywa i owoce', kupione: true, dodal: 'Kuba', dodano: now, zPrzepisu: '' },
      { id: uid(), nazwa: 'jajko', ilosc: '6 szt', dzial: 'Nabiał i jajka', kupione: false, dodal: 'Ola', dodano: now, zPrzepisu: '' },
      { id: uid(), nazwa: 'jogurt', ilosc: '', dzial: 'Nabiał i jajka', kupione: true, dodal: 'Kuba', dodano: now, zPrzepisu: '' },
      { id: uid(), nazwa: 'chleb', ilosc: '', dzial: 'Pieczywo', kupione: false, dodal: 'Kuba', dodano: now, zPrzepisu: '' },
      { id: uid(), nazwa: 'makaron', ilosc: '400 g', dzial: 'Makaron, ryż i kasze', kupione: false, dodal: 'Ola', dodano: now, zPrzepisu: '' },
    ],
    plan: [
      { id: uid(), data: w(0), kolejnosc: 1, przepisId: 'owsianka', tekst: '', zrobione: false },
      { id: uid(), data: w(0), kolejnosc: 2, przepisId: 'pomidorowa', tekst: '', zrobione: false },
      { id: uid(), data: w(1), kolejnosc: 1, przepisId: 'carbonara', tekst: '', zrobione: false },
      { id: uid(), data: w(1), kolejnosc: 2, przepisId: '', tekst: 'kanapki', zrobione: false },
      { id: uid(), data: w(2), kolejnosc: 1, przepisId: 'leczo', tekst: '', zrobione: false },
      { id: uid(), data: w(2), kolejnosc: 2, przepisId: 'szarlotka', tekst: '', zrobione: false },
      { id: uid(), data: w(3), kolejnosc: 1, przepisId: '', tekst: 'makaron pesto', zrobione: false },
      { id: uid(), data: w(5), kolejnosc: 1, przepisId: '', tekst: 'obiad u rodziców', zrobione: false },
      { id: uid(), data: w(6), kolejnosc: 1, przepisId: 'pomidorowa', tekst: '', zrobione: false },
    ],
    historia: [
      { data: d(-37), przepisId: 'leczo', tytul: 'Leczo', kto: 'Kuba' },
      { data: d(-14), przepisId: 'pomidorowa', tytul: 'Zupa pomidorowa', kto: 'Ola' },
      { data: d(-12), przepisId: 'carbonara', tytul: 'Spaghetti carbonara', kto: 'Kuba' },
      { data: d(-10), przepisId: 'owsianka', tytul: 'Owsianka z jabłkiem', kto: 'Kuba' },
      { data: d(-7), przepisId: 'pomidorowa', tytul: 'Zupa pomidorowa', kto: 'Kuba' },
      { data: d(-5), przepisId: 'szarlotka', tytul: 'Szarlotka', kto: 'Ola' },
      { data: d(-3), przepisId: 'owsianka', tytul: 'Owsianka z jabłkiem', kto: 'Ola' },
      { data: d(-3), przepisId: 'pomidorowa', tytul: 'Zupa pomidorowa', kto: 'Ola' },
      { data: d(-2), przepisId: 'carbonara', tytul: 'Spaghetti carbonara', kto: 'Kuba' },
    ],
    oceny: [
      { przepisId: 'carbonara', kto: 'Kuba', ocena: 5, data: d(-2) }, { przepisId: 'carbonara', kto: 'Ola', ocena: 4, data: d(-12) },
      { przepisId: 'pomidorowa', kto: 'Kuba', ocena: 4, data: d(-7) }, { przepisId: 'pomidorowa', kto: 'Ola', ocena: 4, data: d(-3) },
      { przepisId: 'owsianka', kto: 'Kuba', ocena: 3, data: d(-10) }, { przepisId: 'owsianka', kto: 'Ola', ocena: 4, data: d(-3) },
      { przepisId: 'szarlotka', kto: 'Kuba', ocena: 5, data: d(-5) }, { przepisId: 'szarlotka', kto: 'Ola', ocena: 5, data: d(-5) },
      { przepisId: 'leczo', kto: 'Kuba', ocena: 4, data: d(-37) },
    ],
    produkty: [
      ['cebula', 'Warzywa i owoce', 1, 3], ['jabłko', 'Warzywa i owoce', 1, 2], ['papryka', 'Warzywa i owoce', 1, 1],
      ['marchew', 'Warzywa i owoce', 0, 1], ['pomidor', 'Warzywa i owoce', 0, 5], ['cukinia', 'Warzywa i owoce', 0, 0],
      ['masło', 'Nabiał i jajka', 1, 1], ['mleko', 'Nabiał i jajka', 1, 2], ['jajko', 'Nabiał i jajka', 0, 4],
      ['śmietana', 'Nabiał i jajka', 0, 1], ['pecorino', 'Nabiał i jajka', 0, 0], ['jogurt', 'Nabiał i jajka', 0, 3],
      ['kiełbasa', 'Mięso i wędliny', 1, 1], ['boczek', 'Mięso i wędliny', 0, 1],
      ['spaghetti', 'Makaron, ryż i kasze', 1, 1], ['ryż', 'Makaron, ryż i kasze', 1, 0], ['płatki owsiane', 'Makaron, ryż i kasze', 1, 1],
      ['mąka', 'Mąka, cukier i przyprawy', 1, 0], ['cukier', 'Mąka, cukier i przyprawy', 1, 0], ['cynamon', 'Mąka, cukier i przyprawy', 1, 0],
      ['miód', 'Mąka, cukier i przyprawy', 0, 0], ['bulion', 'Mąka, cukier i przyprawy', 0, 0], ['chleb', 'Pieczywo', 0, 6],
    ].map(([nazwa, dzial, w, k]) => ({ nazwa, dzial, wDomu: !!w, kupiono: k, aktualizacja: now })),
    ustawienia: [],
  };
  return { files, tables };
}

export class DemoBackend {
  constructor() {
    this.kind = 'demo';
    try { this.db = JSON.parse(localStorage.getItem(KEY)); } catch { this.db = null; }
    if (!this.db) { this.db = seed(); this.save(); }
  }
  save() { localStorage.setItem(KEY, JSON.stringify(this.db)); }
  static reset() { localStorage.removeItem(KEY); }
  async me() { return { name: 'Kuba', fullName: 'Kuba (demo)', email: 'kuba@example.com' }; }
  async locateFolder() { return { folderId: 'demo' }; }
  async useFolder() {}
  async sharedWith() { return ['Ola']; }
  folderUrl() { return null; }
  async readTable(name) {
    return (this.db.tables[name] || []).map((r, i) => ({ ...r, _row: i + 2 }));
  }
  async commitTable(name, { updates, appends, deletes }) {
    const rows = this.db.tables[name] || (this.db.tables[name] = []);
    for (const u of updates) { const { _row, _dirty, ...r } = u; rows[_row - 2] = r; }
    for (const r of [...new Set(deletes)].sort((a, b) => b - a)) rows.splice(r - 2, 1);
    for (const a of appends) { const { _row, _dirty, ...r } = a; rows.push(r); }
    this.save();
  }
  async listRecipes() { return Object.values(this.db.files).map(({ id, name, modifiedTime }) => ({ id, name, modifiedTime })); }
  async getRecipe(id) { return structuredClone(this.db.files[id].data); }
  async saveRecipe(id, data) {
    id = id || uid(12);
    const modifiedTime = new Date().toISOString();
    this.db.files[id] = { id, name: id + '.json', modifiedTime, data };
    this.save();
    return { id, modifiedTime };
  }
  async trashRecipe(id) { delete this.db.files[id]; this.save(); }
}

export { TABLES };
