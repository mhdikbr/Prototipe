// Cek legalitas platform. Padanan core/checker.py.
// Nama MIRIP tidak pernah otomatis dianggap legal: bot minta konfirmasi dulu.

export const FUZZY_THRESHOLD = 0.82;
const NOISE = new Set(["pt", "tbk", "aplikasi", "app", "pinjaman", "pinjol", "pindar", "online"]);

export const Status = Object.freeze({
  LICENSED: "licensed",
  REPORTED_ILLEGAL: "reported_illegal",
  POSSIBLE_MATCH: "possible_match",
  NOT_LISTED: "not_listed",
});

/** 'Rupiah Cepat' / 'PT. RupiahCepat' -> 'rupiahcepat' */
export function normalize(text) {
  const tokens = String(text ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return tokens.filter((t) => !NOISE.has(t)).join("");
}

/**
 * Padanan difflib.SequenceMatcher(None, a, b).ratio() (tanpa junk; b pendek, <200 karakter),
 * dipakai agar daftar "nama mirip" sama dengan versi Python.
 */
export function similarity(a, b) {
  const total = a.length + b.length;
  if (total === 0) return 1.0;

  const b2j = new Map();
  for (let j = 0; j < b.length; j++) {
    if (!b2j.has(b[j])) b2j.set(b[j], []);
    b2j.get(b[j]).push(j);
  }

  function longestMatch(alo, ahi, blo, bhi) {
    let besti = alo;
    let bestj = blo;
    let bestsize = 0;
    let j2len = new Map();
    for (let i = alo; i < ahi; i++) {
      const next = new Map();
      for (const j of b2j.get(a[i]) ?? []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) ?? 0) + 1;
        next.set(j, k);
        if (k > bestsize) {
          besti = i - k + 1;
          bestj = j - k + 1;
          bestsize = k;
        }
      }
      j2len = next;
    }
    return [besti, bestj, bestsize];
  }

  let matches = 0;
  const queue = [[0, a.length, 0, b.length]];
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop();
    const [i, j, k] = longestMatch(alo, ahi, blo, bhi);
    if (k) {
      matches += k;
      if (alo < i && blo < j) queue.push([alo, i, blo, j]);
      if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
    }
  }
  return (2.0 * matches) / total;
}

export function makePlatform(p) {
  return { name: p.name, company: p.company ?? "", aliases: [...(p.aliases ?? [])] };
}

function keysOf(p) {
  const out = [];
  for (const raw of [p.name, p.company, ...p.aliases]) {
    const k = normalize(raw);
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

function buildIndex(platforms) {
  const idx = new Map();
  for (const p of platforms) {
    for (const k of keysOf(p)) if (!idx.has(k)) idx.set(k, p);
  }
  return idx;
}

export class Registry {
  constructor(licensed, illegal = [], meta = {}) {
    this.licensed = licensed;
    this.illegal = illegal;
    this.licensedAsOf = meta.licensedAsOf ?? null;
    this.licensedSource = meta.licensedSource ?? "";
    this.complete = Boolean(meta.complete);
    this.illegalAsOf = meta.illegalAsOf ?? null;
    this.illegalSource = meta.illegalSource ?? "";
    this._lic = buildIndex(licensed);
    this._ill = buildIndex(illegal);
  }

  /** Dari isi data/licensed_platforms.json dan data/illegal_platforms.json. */
  static fromData(licensedJson, illegalJson = {}) {
    return new Registry(
      (licensedJson.platforms ?? []).map(makePlatform),
      (illegalJson.platforms ?? []).map(makePlatform),
      {
        licensedAsOf: licensedJson.as_of ?? null,
        licensedSource: licensedJson.source ?? "",
        complete: licensedJson.complete,
        illegalAsOf: illegalJson.as_of ?? null,
        illegalSource: illegalJson.source ?? "",
      },
    );
  }

  check(query) {
    const q = normalize(query);
    if (!q) return { status: Status.NOT_LISTED, query, platform: null, suggestions: [] };

    // Daftar ilegal dicek duluan: kalau ada di dua daftar, peringatan yang menang.
    if (this._ill.has(q)) return { status: Status.REPORTED_ILLEGAL, query, platform: this._ill.get(q), suggestions: [] };
    if (this._lic.has(q)) return { status: Status.LICENSED, query, platform: this._lic.get(q), suggestions: [] };

    if (q.length >= 4) {
      const scored = [];
      for (const [status, idx] of [
        [Status.REPORTED_ILLEGAL, this._ill],
        [Status.LICENSED, this._lic],
      ]) {
        for (const [key, platform] of idx) {
          const r = similarity(q, key);
          if (r >= FUZZY_THRESHOLD) scored.push([r, platform, status]);
        }
      }
      scored.sort((x, y) => y[0] - x[0]); // sort stabil, sama seperti Python
      const seen = new Set();
      const suggestions = [];
      for (const [, platform, status] of scored) {
        const id = JSON.stringify([platform.name, status]);
        if (seen.has(id)) continue;
        seen.add(id);
        suggestions.push([platform, status]);
        if (suggestions.length === 3) break;
      }
      if (suggestions.length) return { status: Status.POSSIBLE_MATCH, query, platform: null, suggestions };
    }
    return { status: Status.NOT_LISTED, query, platform: null, suggestions: [] };
  }
}
