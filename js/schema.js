// Schemat zakładek arkusza „Dane” i wspólna logika operacji na wierszach.
import { norm } from './util.js';

const B = 'bool', N = 'num';

export const TABLES = {
  lista: {
    sheet: 'Lista zakupów',
    cols: [['id', 'id'], ['nazwa', 'nazwa'], ['ilosc', 'ilość'], ['dzial', 'dział'], ['kupione', 'kupione', B],
      ['dodal', 'dodał'], ['dodano', 'dodano'], ['zPrzepisu', 'z przepisu']],
    key: r => r.id,
  },
  plan: {
    sheet: 'Plan',
    cols: [['id', 'id'], ['data', 'data'], ['kolejnosc', 'kolejność', N], ['przepisId', 'id przepisu'], ['tekst', 'tekst'], ['zrobione', 'zrobione', B]],
    key: r => r.id,
  },
  historia: {
    sheet: 'Historia',
    cols: [['data', 'data'], ['przepisId', 'id przepisu'], ['tytul', 'tytuł'], ['kto', 'kto']],
    key: null,
  },
  oceny: {
    sheet: 'Oceny',
    cols: [['przepisId', 'id przepisu'], ['kto', 'kto'], ['ocena', 'ocena', N], ['data', 'data']],
    key: r => r.przepisId + '|' + norm(r.kto),
  },
  produkty: {
    sheet: 'Produkty',
    cols: [['nazwa', 'nazwa'], ['dzial', 'dział'], ['wDomu', 'w domu', B], ['kupiono', 'ile razy kupione', N], ['aktualizacja', 'aktualizacja']],
    key: r => norm(r.nazwa),
  },
  ustawienia: {
    sheet: 'Ustawienia',
    cols: [['klucz', 'klucz'], ['wartosc', 'wartość']],
    key: r => r.klucz,
  },
};

export function colLetter(n) { // 1 -> A
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

export function rowFromValues(t, vals) {
  const o = {};
  t.cols.forEach(([k, , type], i) => {
    let v = vals[i];
    if (type === B) v = v === true || String(v ?? '').trim().toLowerCase() === 'tak';
    else if (type === N) v = v === '' || v == null ? null : Number(String(v).replace(',', '.'));
    else v = v == null ? '' : String(v);
    o[k] = v;
  });
  return o;
}

export function valuesFromRow(t, r) {
  return t.cols.map(([k, , type]) => {
    const v = r[k];
    if (type === B) return v ? 'tak' : 'nie';
    if (type === N) return v == null || isNaN(v) ? '' : Number(v);
    return v == null ? '' : String(v);
  });
}

export function headers(t) { return t.cols.map(c => c[1]); }

function mergePatch(row, patch) {
  const out = { ...row };
  for (const [k, v] of Object.entries(patch || {})) {
    if (k === '$inc') for (const [f, d] of Object.entries(v)) out[f] = (Number(out[f]) || 0) + d;
    else out[k] = v;
  }
  return out;
}

/**
 * Operacje:
 *  { t:'append', table, rows }
 *  { t:'patch', table, key, patch }          – pomija, jeśli wiersza już nie ma
 *  { t:'upsert', table, row, patch }         – gdy istnieje: patch (lub row), gdy nie: row
 *  { t:'remove', table, keys }               – pomija brakujące
 * Działa na tablicy obiektów; oznacza zmienione wiersze polem _dirty.
 */
export function applyOp(rows, op) {
  const t = TABLES[op.table];
  if (op.t === 'append') {
    for (const r of op.rows) rows.push({ ...r, _dirty: true });
    return rows;
  }
  if (op.t === 'patch') {
    const i = rows.findIndex(r => t.key(r) === op.key);
    if (i >= 0) rows[i] = { ...mergePatch(rows[i], op.patch), _dirty: true };
    return rows;
  }
  if (op.t === 'upsert') {
    const k = t.key(op.row);
    const i = rows.findIndex(r => t.key(r) === k);
    if (i >= 0) rows[i] = { ...mergePatch(rows[i], op.patch || op.row), _dirty: true };
    else {
      const fresh = { ...op.row };
      if (op.patch && op.patch.$inc) for (const [f, d] of Object.entries(op.patch.$inc)) fresh[f] = (Number(fresh[f]) || 0) + d;
      rows.push({ ...fresh, _dirty: true });
    }
    return rows;
  }
  if (op.t === 'remove') {
    const ks = new Set(op.keys);
    for (let i = rows.length - 1; i >= 0; i--) if (ks.has(t.key(rows[i]))) rows.splice(i, 1);
    return rows;
  }
  return rows;
}

export function cleanRows(rows) { return rows.map(({ _dirty, _row, ...r }) => r); }
