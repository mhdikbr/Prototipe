// Format angka gaya Indonesia (titik ribuan, koma desimal). Padanan core/formatting.py.
import { pyFixed, pyRound } from "./pynum.js";

export function fmtRp(n) {
  const sign = n < 0 ? "-" : "";
  const digits = BigInt(pyRound(Math.abs(n))).toString();
  return `${sign}Rp ${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

export function fmtPct(x, digits = 1) {
  return pyFixed(x, digits).replace(".", ",") + "%";
}
