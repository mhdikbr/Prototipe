// Parser input chat. Padanan core/parsing.py (perilaku harus identik).
import { pyRound } from "./pynum.js";

const SUFFIX = { jt: 1_000_000, juta: 1_000_000, rb: 1_000, ribu: 1_000, k: 1_000 };
const WITH_SUFFIX = /^(\d+(?:[.,]\d+)?)(jt|juta|rb|ribu|k)$/;
const PLAIN = /^(?:\d{1,3}(?:[.,]\d{3})+|\d+)$/;
const DAYS = /^(\d+)[ \t\n\r\f\v]*(hari|hr|minggu|mgg|bulan|bln)?$/;
export const MAX_RUPIAH = 10 ** 12;

const YES = new Set(["ya", "y", "iya", "yes", "ok", "oke", "okay", "lanjut", "boleh", "yoi", "sip", "betul", "benar"]);
const NO = new Set(["tidak", "tdk", "nggak", "ngga", "gak", "ga", "enggak", "engga", "no", "n", "nope", "bukan", "skip"]);

/** '5jt' -> 5000000, '2,5 juta' -> 2500000, 'Rp 5.000.000' -> 5000000. Tidak paham -> null. */
export function parseRupiah(text) {
  let s = String(text ?? "").trim().toLowerCase();
  s = s.replace(/^rp\.?/, "").replaceAll(" ", "");
  if (!s) return null;
  let n;
  let m = WITH_SUFFIX.exec(s);
  if (m) {
    n = pyRound(parseFloat(m[1].replace(",", ".")) * SUFFIX[m[2]]);
  } else if (PLAIN.test(s)) {
    n = Number(s.replace(/[.,]/g, ""));
  } else {
    return null;
  }
  return n <= MAX_RUPIAH ? n : null;
}

/** '14 hari' -> 14, '2 minggu' -> 14, '3 bulan' -> 90. Batas 1..3650. */
export function parseDays(text) {
  const s = String(text ?? "").trim().toLowerCase();
  const m = DAYS.exec(s);
  if (!m) return null;
  const mult = { minggu: 7, mgg: 7, bulan: 30, bln: 30 }[m[2]] ?? 1;
  const days = Number(m[1]) * mult;
  return days >= 1 && days <= 3650 ? days : null;
}

export function parseYesNo(text) {
  const s = String(text ?? "").trim().toLowerCase().replace(/^[!.?]+|[!.?]+$/g, "");
  if (YES.has(s)) return true;
  if (NO.has(s)) return false;
  return null;
}
