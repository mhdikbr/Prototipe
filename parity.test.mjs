// Memastikan versi web (JS) membalas PERSIS sama dengan versi Python.
// Data acuan dibuat oleh `python tools/make_golden.py` (atau jalankan `python tools/check_web.py`).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Registry } from "../core/checker.js";
import { Bot, Session } from "../core/conversation.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const generated = (name) => fileURLToPath(new URL(`./.generated/${name}`, import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(`${root}tests/golden/${name}`, "utf8"));

for (const f of ["curated.json", "fuzz.json"]) {
  if (!existsSync(generated(f))) {
    throw new Error("Data acuan belum ada. Jalankan: python tools/check_web.py (atau python tools/make_golden.py)");
  }
}

const licensed = fixture("licensed.json");
const illegal = fixture("illegal.json");

function replay(complete, inputs) {
  const reg = Registry.fromData(licensed, illegal);
  reg.complete = complete;
  const bot = new Bot(reg);
  const session = new Session();
  return inputs.map((text) => bot.handle(session, text));
}

function compare(label, scenarios) {
  let steps = 0;
  for (const [n, sc] of scenarios.entries()) {
    const actual = replay(sc.complete, sc.inputs);
    for (let i = 0; i < sc.inputs.length; i++) {
      steps++;
      assert.deepStrictEqual(
        actual[i],
        sc.expected[i],
        `${label} #${n}${sc.name ? ` (${sc.name})` : ""}, langkah ${i + 1}, input ${JSON.stringify(sc.inputs[i])}\n` +
          `Seluruh input: ${JSON.stringify(sc.inputs.slice(0, i + 1))}`,
      );
    }
  }
  return steps;
}

test("skenario tulisan tangan: balasan JS == Python", () => {
  const scenarios = JSON.parse(readFileSync(generated("curated.json"), "utf8"));
  assert.ok(scenarios.length >= 20);
  console.log(`  ${compare("curated", scenarios)} langkah identik`);
});

test("percakapan acak (seed tetap): balasan JS == Python", () => {
  const scenarios = JSON.parse(readFileSync(generated("fuzz.json"), "utf8"));
  assert.ok(scenarios.length >= 100);
  console.log(`  ${compare("fuzz", scenarios)} langkah identik`);
});

test("data asli di data/ bisa dimuat dan dipakai", () => {
  const reg = Registry.fromData(
    JSON.parse(readFileSync(`${root}data/licensed_platforms.json`, "utf8")),
    JSON.parse(readFileSync(`${root}data/illegal_platforms.json`, "utf8")),
  );
  assert.ok(reg.licensed.length > 0);
  assert.equal(reg.check("Danamas").status, "licensed");
});
