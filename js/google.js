// Logowanie Google (OAuth 2.0, tryb przekierowania) i dostęp do Drive / Sheets.
import { TABLES, colLetter, headers, rowFromValues, valuesFromRow } from './schema.js';
import { firstName, slugify, uid } from './util.js';

const CFG = window.KUCHNIA_CONFIG || {};
const SCOPE = 'https://www.googleapis.com/auth/drive';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const LS = {
  token: 'kuchnia.token', email: 'kuchnia.email', state: 'kuchnia.oauthState',
  route: 'kuchnia.returnRoute', folder: 'kuchnia.folderId', tried: 'kuchnia.autoLoginTried',
};

export class AuthError extends Error { constructor(m = 'Sesja wygasła') { super(m); this.auth = true; } }
export class OfflineError extends Error { constructor() { super('Brak internetu'); this.offline = true; } }

// ---------------- Auth ----------------
export const auth = {
  get configured() { return !!CFG.CLIENT_ID; },
  redirectUri() { return CFG.REDIRECT_URI || (location.origin + location.pathname); },
  token() {
    try {
      const t = JSON.parse(localStorage.getItem(LS.token) || 'null');
      return t && t.exp > Date.now() ? t.access : null;
    } catch { return null; }
  },
  hasStoredToken() { return !!localStorage.getItem(LS.token); },
  expiresAt() { try { return JSON.parse(localStorage.getItem(LS.token)).exp; } catch { return 0; } },
  rememberedEmail() { return localStorage.getItem(LS.email) || ''; },
  rememberEmail(e) { if (e) localStorage.setItem(LS.email, e); },

  login({ hint, route } = {}) {
    const state = uid(16);
    localStorage.setItem(LS.state, state);
    localStorage.setItem(LS.route, route ?? location.hash);
    const p = new URLSearchParams({
      client_id: CFG.CLIENT_ID,
      redirect_uri: this.redirectUri(),
      response_type: 'token',
      scope: SCOPE,
      include_granted_scopes: 'true',
      state,
    });
    const h = hint ?? this.rememberedEmail();
    if (h) p.set('login_hint', h);
    location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + p.toString());
  },

  /** Obsługa powrotu z Google. Zwraca {ok, error, route} albo null, jeśli to nie był powrót. */
  handleRedirect() {
    const h = location.hash;
    if (!/access_token=|error=/.test(h)) return null;
    const p = new URLSearchParams(h.slice(1));
    const route = localStorage.getItem(LS.route) || '#/losuj';
    const expected = localStorage.getItem(LS.state);
    localStorage.removeItem(LS.state);
    history.replaceState(null, '', location.pathname + location.search + (route.startsWith('#') ? route : '#/losuj'));
    if (p.get('error')) return { ok: false, error: p.get('error'), route };
    if (!expected || p.get('state') !== expected) return { ok: false, error: 'state_mismatch', route };
    const exp = Date.now() + (Number(p.get('expires_in') || 3600) - 60) * 1000;
    localStorage.setItem(LS.token, JSON.stringify({ access: p.get('access_token'), exp }));
    sessionStorage.removeItem(LS.tried);
    return { ok: true, route };
  },

  canAutoLogin() { return !sessionStorage.getItem(LS.tried); },
  markAutoLogin() { sessionStorage.setItem(LS.tried, '1'); },

  logout() {
    const t = this.token();
    localStorage.removeItem(LS.token);
    localStorage.removeItem(LS.email);
    localStorage.removeItem(LS.folder);
    if (t) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t), { method: 'POST', mode: 'no-cors' }).catch(() => {});
  },
};

async function api(url, opts = {}) {
  const tok = auth.token();
  if (!tok) throw new AuthError();
  let res;
  try {
    res = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + tok, ...(opts.headers || {}) } });
  } catch (e) {
    throw new OfflineError();
  }
  if (res.status === 401) { localStorage.removeItem(LS.token); throw new AuthError(); }
  if (!res.ok) {
    let msg = res.status + '';
    try { const j = await res.json(); msg = j.error?.message || msg; } catch {}
    const err = new Error('Google: ' + msg); err.status = res.status; throw err;
  }
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : res.text();
}
const jsonBody = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const q = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// ---------------- Backend ----------------
export class GoogleBackend {
  constructor() {
    this.kind = 'google';
    this.folderId = null; this.recipesId = null; this.sheetId = null; this.sheetIds = {};
  }

  async me() {
    const a = await api(`${DRIVE}/about?fields=user(displayName,emailAddress)`);
    const u = a.user || {};
    auth.rememberEmail(u.emailAddress);
    return { name: firstName(u.displayName, u.emailAddress), fullName: u.displayName || '', email: u.emailAddress || '' };
  }

  /** Szuka folderu „Kuchnia”. Zwraca {folderId} albo {choice: [...]}. */
  async locateFolder() {
    if (CFG.FOLDER_ID) return { folderId: CFG.FOLDER_ID };
    const saved = localStorage.getItem(LS.folder);
    if (saved) {
      try {
        const f = await api(`${DRIVE}/files/${saved}?fields=id,trashed&supportsAllDrives=true`);
        if (!f.trashed) return { folderId: saved };
      } catch (e) { if (e.auth || e.offline) throw e; }
      localStorage.removeItem(LS.folder);
    }
    const res = await api(`${DRIVE}/files?` + new URLSearchParams({
      q: `name='Kuchnia' and mimeType='${FOLDER_MIME}' and trashed=false`,
      fields: 'files(id,name,ownedByMe,owners(displayName,emailAddress),modifiedTime)',
      pageSize: '20', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
    }));
    const files = res.files || [];
    const own = files.filter(f => f.ownedByMe);
    const shared = files.filter(f => !f.ownedByMe);
    if (files.length === 1 && own.length === 1) return { folderId: own[0].id };
    if (!files.length) return { choice: [] };
    return {
      choice: [...shared, ...own].map(f => ({
        id: f.id, own: f.ownedByMe,
        owner: f.ownedByMe ? 'Twój folder' : `udostępnił(a): ${f.owners?.[0]?.displayName || f.owners?.[0]?.emailAddress || 'ktoś'}`,
      })),
    };
  }

  async createFolder() {
    const f = await api(`${DRIVE}/files?fields=id`, jsonBody('POST', { name: 'Kuchnia', mimeType: FOLDER_MIME }));
    return f.id;
  }

  async useFolder(id) {
    this.folderId = id;
    localStorage.setItem(LS.folder, id);
    const res = await api(`${DRIVE}/files?` + new URLSearchParams({
      q: `'${id}' in parents and trashed=false and (mimeType='${FOLDER_MIME}' or mimeType='${SHEET_MIME}')`,
      fields: 'files(id,name,mimeType)', pageSize: '50', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
    }));
    const files = res.files || [];
    let rec = files.find(f => f.mimeType === FOLDER_MIME && f.name === 'przepisy');
    let sh = files.find(f => f.mimeType === SHEET_MIME && f.name === 'Dane');
    if (!rec) rec = await api(`${DRIVE}/files?fields=id&supportsAllDrives=true`, jsonBody('POST', { name: 'przepisy', mimeType: FOLDER_MIME, parents: [id] }));
    let fresh = false;
    if (!sh) { sh = await api(`${DRIVE}/files?fields=id&supportsAllDrives=true`, jsonBody('POST', { name: 'Dane', mimeType: SHEET_MIME, parents: [id] })); fresh = true; }
    this.recipesId = rec.id;
    this.sheetId = sh.id;
    await this.ensureTabs(fresh);
  }

  async ensureTabs(fresh) {
    const meta = await api(`${SHEETS}/${this.sheetId}?fields=sheets.properties(sheetId,title)`);
    const existing = meta.sheets.map(s => s.properties);
    const want = Object.values(TABLES).map(t => t.sheet);
    const reqs = [];
    for (const title of want) {
      if (!existing.find(s => s.title === title)) reqs.push({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } });
    }
    if (fresh) for (const s of existing) if (!want.includes(s.title)) reqs.push({ deleteSheet: { sheetId: s.sheetId } });
    if (reqs.length) await api(`${SHEETS}/${this.sheetId}:batchUpdate`, jsonBody('POST', { requests: reqs }));
    const meta2 = reqs.length ? await api(`${SHEETS}/${this.sheetId}?fields=sheets.properties(sheetId,title)`) : meta;
    for (const s of meta2.sheets) this.sheetIds[s.properties.title] = s.properties.sheetId;
    // Nagłówki
    const tabs = Object.values(TABLES);
    const got = await api(`${SHEETS}/${this.sheetId}/values:batchGet?` +
      tabs.map(t => 'ranges=' + encodeURIComponent(`'${t.sheet}'!A1:${colLetter(t.cols.length)}1`)).join('&'));
    const data = [];
    tabs.forEach((t, i) => {
      const row = got.valueRanges?.[i]?.values?.[0] || [];
      if (row.join('|') !== headers(t).join('|')) data.push({ range: `'${t.sheet}'!A1:${colLetter(t.cols.length)}1`, values: [headers(t)] });
    });
    if (data.length) await api(`${SHEETS}/${this.sheetId}/values:batchUpdate`, jsonBody('POST', { valueInputOption: 'RAW', data }));
  }

  async sharedWith(myEmail) {
    try {
      const f = await api(`${DRIVE}/files/${this.folderId}?fields=owners(displayName,emailAddress),permissions(displayName,emailAddress,type)&supportsAllDrives=true`);
      const ppl = [...(f.owners || []), ...(f.permissions || []).filter(p => p.type === 'user')];
      const seen = new Set(), out = [];
      for (const p of ppl) {
        if (!p.emailAddress || p.emailAddress === myEmail || seen.has(p.emailAddress)) continue;
        seen.add(p.emailAddress);
        out.push(firstName(p.displayName, p.emailAddress));
      }
      return out;
    } catch (e) { if (e.auth) throw e; return null; }
  }

  folderUrl() { return this.folderId ? `https://drive.google.com/drive/folders/${this.folderId}` : null; }

  // ----- tabele -----
  async readTable(name) {
    const t = TABLES[name];
    const range = encodeURIComponent(`'${t.sheet}'!A2:${colLetter(t.cols.length)}`);
    const r = await api(`${SHEETS}/${this.sheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`);
    const out = [];
    (r.values || []).forEach((vals, i) => {
      if (!vals.some(v => v !== '' && v != null)) return;
      out.push({ ...rowFromValues(t, vals), _row: i + 2 });
    });
    return out;
  }

  async commitTable(name, { updates, appends, deletes }) {
    const t = TABLES[name];
    const last = colLetter(t.cols.length);
    if (updates.length) {
      await api(`${SHEETS}/${this.sheetId}/values:batchUpdate`, jsonBody('POST', {
        valueInputOption: 'RAW',
        data: updates.map(r => ({ range: `'${t.sheet}'!A${r._row}:${last}${r._row}`, values: [valuesFromRow(t, r)] })),
      }));
    }
    if (deletes.length) {
      const sid = this.sheetIds[t.sheet];
      const rows = [...new Set(deletes)].sort((a, b) => b - a);
      await api(`${SHEETS}/${this.sheetId}:batchUpdate`, jsonBody('POST', {
        requests: rows.map(r => ({ deleteDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: r - 1, endIndex: r } } })),
      }));
    }
    if (appends.length) {
      const range = encodeURIComponent(`'${t.sheet}'!A1:${last}1`);
      await api(`${SHEETS}/${this.sheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        jsonBody('POST', { values: appends.map(r => valuesFromRow(t, r)) }));
    }
  }

  // ----- przepisy -----
  async listRecipes() {
    let out = [], pageToken = '';
    do {
      const p = new URLSearchParams({
        q: `'${this.recipesId}' in parents and trashed=false and mimeType!='${FOLDER_MIME}'`,
        fields: 'nextPageToken,files(id,name,modifiedTime)', pageSize: '1000',
        supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
      });
      if (pageToken) p.set('pageToken', pageToken);
      const r = await api(`${DRIVE}/files?` + p);
      out = out.concat(r.files || []);
      pageToken = r.nextPageToken;
    } while (pageToken);
    return out.filter(f => /\.json$/i.test(f.name) || !/\.[a-z0-9]{2,5}$/i.test(f.name));
  }

  async getRecipe(id) {
    const txt = await api(`${DRIVE}/files/${id}?alt=media&supportsAllDrives=true`);
    return typeof txt === 'string' ? JSON.parse(txt) : txt;
  }

  async saveRecipe(id, data) {
    const b = 'kuchnia' + uid(12);
    const meta = { name: slugify(data.tytul) + '.json', mimeType: 'application/json' };
    if (!id) meta.parents = [this.recipesId];
    const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(data, null, 2)}\r\n--${b}--`;
    const url = id
      ? `${UPLOAD}/files/${id}?uploadType=multipart&fields=id,modifiedTime&supportsAllDrives=true`
      : `${UPLOAD}/files?uploadType=multipart&fields=id,modifiedTime&supportsAllDrives=true`;
    return api(url, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body });
  }

  async trashRecipe(id) {
    await api(`${DRIVE}/files/${id}?supportsAllDrives=true`, jsonBody('PATCH', { trashed: true }));
  }
}
