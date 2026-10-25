// UI chat PinjolGuard. Seluruh logika ada di ./core (identik dengan versi Python); file ini hanya tampilan.
// Tidak memakai innerHTML sama sekali: semua teks dimasukkan sebagai teks, jadi aman dari XSS.
import { Registry } from "./core/checker.js";
import { Bot, Session, State } from "./core/conversation.js";

window.__pinjolBooted = true;

const $ = (id) => document.getElementById(id);
const log = $("log");
const form = $("form");
const input = $("input");
const chipsEl = $("chips");
const fatal = $("fatal");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms) => (reducedMotion || ms <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));

let bot = null;
let bannerText = "";
let session = new Session();
let queue = Promise.resolve(); // pesan diproses berurutan, walau user menekan cepat

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function loadRegistry() {
  const [licensed, illegal] = await Promise.all([
    fetchJson("./data/licensed_platforms.json"),
    fetchJson("./data/illegal_platforms.json").catch(() => ({})),
  ]);
  return Registry.fromData(licensed, illegal);
}

// ---------------------------------------------------------------- tampilan
function scrollDown() {
  log.scrollTop = log.scrollHeight;
}

/** *tebal* ala WhatsApp -> <strong>, tanpa innerHTML. */
function renderRich(el, text) {
  for (const part of text.split(/(\*[^*\n]+\*)/)) {
    if (/^\*[^*\n]+\*$/.test(part)) {
      const b = document.createElement("strong");
      b.textContent = part.slice(1, -1);
      el.append(b);
    } else if (part) {
      el.append(document.createTextNode(part));
    }
  }
}

function addBubble(text, who) {
  const el = document.createElement("div");
  el.className = `msg ${who}`;
  if (who === "bot") renderRich(el, text);
  else el.textContent = text;
  log.append(el);
  scrollDown();
}

function showTyping() {
  const el = document.createElement("div");
  el.className = "msg bot typing";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = "<i></i><i></i><i></i>"; // markup tetap (tanpa data user)
  log.append(el);
  scrollDown();
  return el;
}

async function showReplies(replies) {
  for (const [i, text] of replies.entries()) {
    const dots = showTyping();
    await sleep(i === 0 ? 350 : 250);
    dots.remove();
    addBubble(text, "bot");
  }
}

function chipsFor() {
  const s = session;
  const yesNo = [["ya", "Ya"], ["tidak", "Tidak"]];
  switch (s.state) {
    case State.MENU:
      return [["1", "1 · Cek legalitas"], ["2", "2 · Hitung kemampuan bayar"], ["3", "3 · Dua-duanya"]];
    case State.ASK_CONTINUE:
    case State.OTHER_DEBT:
      return yesNo;
    case State.AFTER_RESULT:
      return [["lagi", "Coba angka lain"], ["menu", "Menu"]];
    case State.CONFIRM_MATCH:
      return [
        ...(s.data.suggestions ?? []).map(([p], i) => [String(i + 1), `${i + 1} · ${p.name}`]),
        ["bukan", "Bukan itu"],
      ];
    default:
      return [["menu", "Mulai ulang"]];
  }
}

function renderChips() {
  chipsEl.replaceChildren();
  for (const [value, label] of chipsFor()) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = label;
    b.addEventListener("click", () => send(value, label));
    chipsEl.append(b);
  }
  // Chip mengecilkan area chat; gulir ulang supaya baris terakhir pesan tidak terpotong.
  requestAnimationFrame(scrollDown);
}

// ---------------------------------------------------------------- alur
function send(value, shownAs) {
  const text = String(value).trim();
  if (!text || !bot) return;
  queue = queue.then(async () => {
    addBubble(shownAs ?? text, "user");
    const replies = bot.handle(session, text);
    chipsEl.replaceChildren();
    await showReplies(replies);
    renderChips();
  });
}

async function start() {
  log.replaceChildren();
  chipsEl.replaceChildren();
  if (bannerText) {
    // Catatan data ada di dalam area chat (ikut tergulung), supaya tidak memakan layar HP terus-menerus.
    const note = document.createElement("div");
    note.className = "banner-inline";
    note.id = "banner";
    note.setAttribute("role", "note");
    note.textContent = bannerText;
    log.append(note);
  }
  await showReplies(bot.handle(session, "")); // pesan pertama = sapaan
  renderChips();
}

function makeBannerText(registry) {
  if (registry.complete) {
    return registry.licensedAsOf ? `Data izin OJK per ${registry.licensedAsOf}.` : "";
  }
  return (
    `Mode prototype: daftar platform berizin di sini baru contoh (${registry.licensed.length} nama), belum lengkap. ` +
    "Hasil “tidak ketemu” artinya belum bisa dipastikan, bukan berarti ilegal."
  );
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value;
  input.value = "";
  send(text);
  input.focus();
});

$("clear").addEventListener("click", () => {
  queue = queue.then(() => {
    session = new Session(); // buang seluruh data yang pernah diketik
    return start();
  });
});

(async () => {
  try {
    const registry = await loadRegistry();
    bot = new Bot(registry);
    bannerText = makeBannerText(registry);
    await start();
    input.focus();
  } catch (err) {
    console.error(err);
    fatal.hidden = false;
    fatal.textContent =
      "Data platform gagal dimuat. Muat ulang halaman; kalau masih gagal, pastikan folder data/ ikut ter-deploy.";
  }
})();
