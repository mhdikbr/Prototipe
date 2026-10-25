// Aritmetika, format angka, dan parser: hasil JS harus sama persis dengan Python.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { similarity } from "../core/checker.js";
import { fmtPct, fmtRp } from "../core/formatting.js";
import { parseDays, parseRupiah, parseYesNo } from "../core/parsing.js";
import { pyFixed, pyFloorDiv, pyRound } from "../core/pynum.js";

const file = fileURLToPath(new URL("./.generated/numeric.json", import.meta.url));
if (!existsSync(file)) throw new Error("Data acuan belum ada. Jalankan: python tools/check_web.py");
const g = JSON.parse(readFileSync(file, "utf8"));

const same = (a, b, msg) => assert.ok(Object.is(a, b) || a === b, `${msg}: JS=${a} Python=${b}`);

test("pyFixed == f'{x:.Nf}' di Python (termasuk nilai persis-seri)", () => {
  for (const c of g.fixed) assert.equal(pyFixed(c.x, c.d), c.out, `x=${c.x} d=${c.d}`);
});

test("pyRound == round() di Python (setengah ke genap)", () => {
  for (const c of g.rounds) same(pyRound(c.x), c.out, `round(${c.x})`);
});

test("pyFloorDiv == a // b di Python", () => {
  for (const c of g.floordivs) same(pyFloorDiv(c.a, c.b), c.out, `${c.a} // ${c.b}`);
});

test("fmtRp dan fmtPct == versi Python", () => {
  for (const c of g.rp) assert.equal(fmtRp(c.n), c.out, `fmtRp(${c.n})`);
  for (const c of g.pct) assert.equal(fmtPct(c.x, c.d), c.out, `fmtPct(${c.x}, ${c.d})`);
});

test("skor kemiripan nama == difflib.SequenceMatcher.ratio() Python", () => {
  assert.ok(g.similarity.length >= 4000);
  for (const c of g.similarity) {
    assert.equal(similarity(c.a, c.b), c.out, `similarity(${JSON.stringify(c.a)}, ${JSON.stringify(c.b)})`);
  }
});

test("parser angka/hari/ya-tidak == versi Python", () => {
  for (const c of g.parse) {
    same(parseRupiah(c.text), c.rupiah, `parseRupiah(${JSON.stringify(c.text)})`);
    same(parseDays(c.text), c.days, `parseDays(${JSON.stringify(c.text)})`);
    same(parseYesNo(c.text), c.yesno, `parseYesNo(${JSON.stringify(c.text)})`);
  }
});
