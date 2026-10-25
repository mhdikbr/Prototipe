// Aritmetika yang meniru Python PERSIS, supaya balasan web identik dengan versi Python.
// (Python membulatkan setengah-ke-genap, JS Math.round / toFixed membulatkan setengah-ke-atas.)

/** Python round(x) -> int: setengah dibulatkan ke genap. round(12.5) = 12, round(13.5) = 14. */
export function pyRound(x) {
  const f = Math.floor(x);
  const diff = x - f; // eksak untuk |x| < 2^52
  if (diff < 0.5) return f;
  if (diff > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

const view = new DataView(new ArrayBuffer(8));

/**
 * Python f"{x:.{digits}f}". Dihitung eksak dengan BigInt dari nilai biner double,
 * lalu dibulatkan setengah-ke-genap (sama seperti Python).
 */
export function pyFixed(x, digits) {
  if (Number.isNaN(x)) return "nan";
  if (!Number.isFinite(x)) return x < 0 ? "-inf" : "inf";
  view.setFloat64(0, x);
  const bits = view.getBigUint64(0);
  const neg = bits >> 63n === 1n;
  const expBits = Number((bits >> 52n) & 0x7ffn);
  let mant = bits & 0xfffffffffffffn;
  let exp;
  if (expBits === 0) {
    exp = -1074;
  } else {
    mant |= 1n << 52n;
    exp = expBits - 1075;
  }
  const scaled = mant * 10n ** BigInt(digits); // nilai = scaled * 2^exp
  let q;
  if (exp >= 0) {
    q = scaled << BigInt(exp);
  } else {
    const den = 1n << BigInt(-exp);
    q = scaled / den;
    const twice = (scaled % den) * 2n;
    if (twice > den || (twice === den && (q & 1n) === 1n)) q += 1n;
  }
  let s = q.toString();
  if (digits > 0) {
    s = s.padStart(digits + 1, "0");
    s = s.slice(0, -digits) + "." + s.slice(-digits);
  }
  return (neg ? "-" : "") + s;
}

/** Python a // b untuk float (port dari CPython float_floor_div). */
export function pyFloorDiv(a, b) {
  const mod = a % b;
  let div = (a - mod) / b;
  let adj = mod;
  if (adj !== 0 && b < 0 !== adj < 0) {
    adj += b;
    div -= 1;
  }
  if (div) {
    let fd = Math.floor(div);
    if (div - fd > 0.5) fd += 1;
    return fd;
  }
  return div * 0 * (a / b < 0 ? -1 : 1);
}
