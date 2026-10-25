// Alur percakapan bot. Padanan core/conversation.py (teks balasan harus identik).
// Tidak tahu apa-apa soal tampilan: UI web cukup memanggil bot.handle(session, teks).
import { assess, defaultPolicy, Verdict } from "./affordability.js";
import { normalize, Status } from "./checker.js";
import { fmtPct, fmtRp } from "./formatting.js";
import { parseDays, parseRupiah, parseYesNo } from "./parsing.js";

const OJK_CONTACT = "OJK 157 (telepon) atau WhatsApp 081 157 157 157";

const GREETING =
  "Halo! 👋 Aku *PinjolGuard* (versi prototype). Aku bisa bantu:\n" +
  "1️⃣ Cek pinjol/pindar itu berizin OJK atau tidak\n" +
  "2️⃣ Hitung apakah penghasilanmu cukup untuk ambil pinjaman\n" +
  "3️⃣ Dua-duanya\n\n" +
  "Balas angka 1, 2, atau 3. Ketik *menu* kapan saja untuk mulai dari awal.\n" +
  "Data yang kamu ketik hanya dipakai untuk hitungan di chat ini.";
const HELP =
  "Perintah: *menu* (mulai ulang), *bantuan* (pesan ini).\n" +
  "Angka bisa ditulis bebas: 5jt, 2,5 juta, 750rb, atau 5.000.000.\n\n" +
  GREETING;
const ASK_NAME = "Tulis nama aplikasi/platform pinjamannya ya. Contoh: RupiahCepat";
const BAD_NUMBER = "Aku belum paham angkanya 😅 Coba tulis seperti: 5jt, 750rb, atau 5.000.000";
const INCOME_PROMPT =
  "💰 Berapa *penghasilan bersih per bulan* kamu? Isi yang benar-benar masuk, rata-rata 3 bulan terakhir.\n" +
  "Contoh: 5jt atau 5.000.000\n\n" +
  "Isi jujur ya. Angka ini cuma untuk hitunganmu, bukan untuk diajukan ke aplikasi.";
const EXPENSES_PROMPT =
  "🏠 Berapa *pengeluaran wajib per bulan*? (makan, kos/rumah, listrik, transport, sekolah, dll, " +
  "di luar cicilan utang)";
const INSTALLMENTS_PROMPT =
  "💳 Berapa total *cicilan/utang yang sedang berjalan* per bulan? (KPR, motor, paylater, pinjol lain). " +
  "Kalau tidak ada, ketik 0.";
const PRINCIPAL_PROMPT = "💵 Berapa *jumlah pinjaman* yang mau kamu ambil (uang yang kamu terima)?";
const TOTAL_REPAY_PROMPT =
  "🧾 Berapa *total yang harus dikembalikan* (pokok + bunga + biaya admin)? " +
  "Lihat di halaman konfirmasi aplikasi sebelum klik setuju.";
const TENOR_PROMPT = "📅 Tenornya berapa lama? Contoh: 14 hari, 30 hari, atau 3 bulan.";
const OTHER_DEBT_PROMPT = "Terakhir: pinjaman ini untuk *menutup utang/cicilan lain*? (ya/tidak)";

const RESET_WORDS = new Set(["menu", "batal", "reset", "ulang", "mulai", "/start", "/menu"]);
const HELP_WORDS = new Set(["bantuan", "help", "/help", "?"]);
const MENU_CHOICES = new Map([
  ["1", "check"], ["cek", "check"], ["cek legalitas", "check"],
  ["2", "calc"], ["hitung", "calc"], ["simulasi", "calc"],
  ["3", "both"], ["keduanya", "both"], ["semua", "both"],
]);

export const State = Object.freeze({
  MENU: "menu",
  CHECK_NAME: "check_name",
  CONFIRM_MATCH: "confirm_match",
  ASK_CONTINUE: "ask_continue",
  INCOME: "income",
  EXPENSES: "expenses",
  INSTALLMENTS: "installments",
  PRINCIPAL: "principal",
  TOTAL_REPAY: "total_repay",
  TENOR: "tenor",
  OTHER_DEBT: "other_debt",
  AFTER_RESULT: "after_result",
});

export class Session {
  constructor() {
    this.state = State.MENU;
    this.data = {};
    this.started = false;
    this.lastSeen = Date.now();
  }
  touch() {
    this.lastSeen = Date.now();
  }
  reset() {
    this.state = State.MENU;
    this.data = {};
  }
}

export class Bot {
  constructor(registry, policy = defaultPolicy) {
    this.registry = registry;
    this.policy = policy;
  }

  /** Mengembalikan daftar balasan (string). */
  handle(session, text) {
    session.touch();
    const raw = String(text ?? "").trim();
    const low = raw.toLowerCase();
    if (!session.started || RESET_WORDS.has(low)) {
      session.reset();
      session.started = true;
      return [GREETING];
    }
    if (HELP_WORDS.has(low)) return [HELP];
    return this["_on_" + session.state](session, raw);
  }

  // ------------------------------------------------------------------ menu
  _on_menu(s, raw) {
    const choice = MENU_CHOICES.get(raw.toLowerCase());
    if (choice === "calc") {
      s.data.chain = false;
      return this._startCalc(s);
    }
    if (choice === "check" || choice === "both") {
      s.data.chain = choice === "both";
      s.state = State.CHECK_NAME;
      return [ASK_NAME];
    }
    return ["Pilih angka 1, 2, atau 3 ya 🙂", GREETING];
  }

  _startCalc(s) {
    s.state = State.INCOME;
    return [INCOME_PROMPT];
  }

  // ------------------------------------------------------------------ cek legalitas
  _on_check_name(s, raw) {
    if (!normalize(raw)) return [ASK_NAME];
    const res = this.registry.check(raw);
    if (res.status === Status.POSSIBLE_MATCH) {
      s.data.query = raw;
      s.data.suggestions = res.suggestions;
      s.state = State.CONFIRM_MATCH;
      const lines = [`Aku nggak nemu persis *${raw}*, tapi ada yang mirip:`];
      res.suggestions.forEach(([p, st], i) => {
        const tag = st === Status.LICENSED ? "berizin OJK" : "masuk daftar ILEGAL";
        lines.push(`${i + 1}. ${p.name} (${tag})`);
      });
      lines.push(
        "Balas nomor yang kamu maksud, atau *bukan* kalau bukan salah satunya. " +
          "(Aplikasi tiruan sering memakai nama yang mirip, jadi aku tanya dulu.)",
      );
      return [lines.join("\n")];
    }
    return this._report(s, res.status, res.platform, raw);
  }

  _on_confirm_match(s, raw) {
    const suggestions = s.data.suggestions ?? [];
    const yn = parseYesNo(raw);
    if (yn === false) return this._report(s, Status.NOT_LISTED, null, s.data.query ?? "");
    if (/^[0-9]+$/.test(raw)) {
      const idx = Number(raw);
      if (idx >= 1 && idx <= suggestions.length) {
        const [platform, status] = suggestions[idx - 1];
        return this._report(s, status, platform, s.data.query ?? "");
      }
    }
    if (yn === true && suggestions.length === 1) {
      const [platform, status] = suggestions[0];
      return this._report(s, status, platform, s.data.query ?? "");
    }
    return [`Balas nomor pilihan (1-${suggestions.length}) atau *bukan*.`];
  }

  _report(s, status, platform, query) {
    const chain = Boolean(s.data.chain);
    const r = this.registry;

    if (status === Status.LICENSED && platform) {
      const company = platform.company ? ` (${platform.company})` : "";
      const asOf = r.licensedAsOf ? ` (data per ${r.licensedAsOf})` : "";
      const text =
        `✅ *${platform.name}*${company} tercatat *berizin OJK*${asOf}.\n\n` +
        "Berizin belum tentu cocok untuk kondisi keuanganmu, dan nama resmi sering ditiru aplikasi palsu. " +
        `Unduh hanya dari tautan resmi di situs perusahaannya, dan cek ke ${OJK_CONTACT} kalau ragu.`;
      if (chain) {
        s.state = State.INCOME;
        return [text, "Lanjut ke hitungan ya.", INCOME_PROMPT];
      }
      s.state = State.ASK_CONTINUE;
      return [text, "Mau lanjut hitung apakah penghasilanmu cukup untuk pinjaman ini? (ya/tidak)"];
    }

    if (status === Status.REPORTED_ILLEGAL && platform) {
      const source = r.illegalSource ? ` (${r.illegalSource})` : "";
      s.reset();
      return [
        `🚫 *${platform.name}* masuk daftar layanan pinjaman *ILEGAL*${source}.\n\n` +
          "Jangan pinjam, jangan beri akses kontak/galeri/lokasi, dan jangan klik tautan pencairan. " +
          `Kalau sudah terlanjur atau diteror penagih, lapor ke Satgas PASTI atau ${OJK_CONTACT}.`,
        "Ketik *menu* untuk cek platform lain.",
      ];
    }

    // NOT_LISTED
    let head;
    if (r.complete) {
      head =
        `⚠️ *${query}* tidak ada di daftar pindar berizin OJK${r.licensedAsOf ? ` (data per ${r.licensedAsOf})` : ""}. ` +
        "Anggap *belum terbukti legal*.";
    } else {
      head =
        `❓ *${query}* tidak ketemu di data yang kupunya (daftar di prototype ini belum lengkap), ` +
        "jadi aku *belum bisa bilang legal*.";
    }
    s.reset();
    return [
      head +
        `\n\nCek status izinnya ke ${OJK_CONTACT}. Catatan: paylater/kredit dari bank atau perusahaan ` +
        "pembiayaan memang tidak masuk daftar pindar, tapi tetap bisa dicek ke OJK.\n\n" +
        "Selama belum terkonfirmasi, jangan beri akses kontak/galeri dan jangan transfer biaya apa pun di muka.",
      "Ketik *menu* untuk cek platform lain.",
    ];
  }

  _on_ask_continue(s, raw) {
    const yn = parseYesNo(raw);
    if (yn === true) return this._startCalc(s);
    if (yn === false) {
      s.reset();
      return ["Siap 👍 Ketik *menu* kalau mau lanjut nanti."];
    }
    return ["Mau lanjut hitung kemampuan bayar? Jawab *ya* atau *tidak*."];
  }

  // ------------------------------------------------------------------ hitung kemampuan bayar
  _numberStep(s, raw, key, nextState, prompt, allowZero = false) {
    const n = parseRupiah(raw);
    if (n === null) return [BAD_NUMBER];
    if (n === 0 && !allowZero) return ["Angkanya harus lebih dari 0 ya."];
    s.data[key] = n;
    s.state = nextState;
    return [prompt];
  }

  _on_income(s, raw) {
    return this._numberStep(s, raw, "income", State.EXPENSES, EXPENSES_PROMPT);
  }
  _on_expenses(s, raw) {
    return this._numberStep(s, raw, "expenses", State.INSTALLMENTS, INSTALLMENTS_PROMPT, true);
  }
  _on_installments(s, raw) {
    return this._numberStep(s, raw, "installments", State.PRINCIPAL, PRINCIPAL_PROMPT, true);
  }
  _on_principal(s, raw) {
    return this._numberStep(s, raw, "principal", State.TOTAL_REPAY, TOTAL_REPAY_PROMPT);
  }

  _on_total_repay(s, raw) {
    const n = parseRupiah(raw);
    if (n === null) return [BAD_NUMBER];
    const principal = s.data.principal;
    if (n < principal) {
      return [`Total yang dikembalikan tidak mungkin lebih kecil dari pinjaman (${fmtRp(principal)}). Cek lagi ya.`];
    }
    s.data.total_repay = n;
    s.state = State.TENOR;
    return [TENOR_PROMPT];
  }

  _on_tenor(s, raw) {
    const days = parseDays(raw);
    if (days === null) return ["Tenornya belum kebaca. Tulis seperti: 14 hari, 30 hari, atau 3 bulan."];
    s.data.tenor_days = days;
    s.state = State.OTHER_DEBT;
    return [OTHER_DEBT_PROMPT];
  }

  _on_other_debt(s, raw) {
    const yn = parseYesNo(raw);
    if (yn === null) return ["Jawab *ya* atau *tidak* ya."];
    const d = s.data;
    const profile = { income: d.income, expenses: d.expenses, existingInstallments: d.installments };
    const offer = { principal: d.principal, totalRepay: d.total_repay, tenorDays: d.tenor_days, toPayOtherDebt: yn };
    const result = assess(profile, offer, this.policy);
    s.state = State.AFTER_RESULT;
    return [this.formatResult(profile, offer, result)];
  }

  _on_after_result(s, raw) {
    if (["lagi", "coba lagi", "lagi dong"].includes(raw.toLowerCase())) {
      for (const k of ["principal", "total_repay", "tenor_days"]) delete s.data[k];
      s.state = State.PRINCIPAL;
      return ["Oke, penghasilan & pengeluaranmu tetap kupakai.", PRINCIPAL_PROMPT];
    }
    return [
      "Ketik *lagi* untuk coba angka pinjaman lain (data penghasilanmu tetap dipakai), " +
        "atau *menu* untuk mulai dari awal.",
    ];
  }

  // ------------------------------------------------------------------ tampilan hasil
  formatResult(p, o, a) {
    const pol = this.policy;
    const lines = [
      "📊 *Hasil hitungan*",
      `Penghasilan: ${fmtRp(p.income)}`,
      `Pengeluaran wajib: ${fmtRp(p.expenses)}`,
      `Cicilan berjalan: ${fmtRp(p.existingInstallments)}`,
      `Sisa per bulan sekarang: ${fmtRp(a.freeBefore)}`,
      "",
      `Pinjaman ${fmtRp(o.principal)} → bayar balik ${fmtRp(o.totalRepay)} dalam ${o.tenorDays} hari`,
    ];
    if (a.nInstallments === 1) {
      lines.push(`Dibayar sekali: ${fmtRp(a.monthlyInstallment)}`);
    } else {
      lines.push(`Cicilan baru: ${a.nInstallments}× ${fmtRp(a.monthlyInstallment)} per bulan`);
    }
    lines.push(
      `Biaya pinjaman: ${fmtPct(a.costPct)} (±${fmtPct(a.dailyCostPct, 2)} per hari)`,
      "",
      `Beban cicilan: ${fmtPct(a.dsrBefore * 100, 0)} → ${fmtPct(a.dsrAfter * 100, 0)} dari penghasilan ` +
        `(batas aman ±${fmtPct(pol.maxDsr * 100, 0)})`,
      `Sisa uang setelah cicilan: ${fmtRp(a.freeAfter)}`,
      "",
    );
    const head = {
      [Verdict.SAFE]: "✅ *Relatif aman*",
      [Verdict.CAUTION]: "⚠️ *Hati-hati*",
      [Verdict.AVOID]: "🛑 *Sebaiknya jangan diambil*",
    }[a.verdict];
    lines.push(head);
    for (const r of a.reasons) lines.push(`• ${r}`);
    lines.push("");
    if (a.maxSafePrincipal > 0) {
      lines.push(
        `Plafon aman untuk kondisimu (dengan biaya & tenor yang sama): ± ${fmtRp(a.maxSafePrincipal)}. ` +
          "Ambil sebesar kebutuhanmu, bukan sebesar limit yang ditawarkan aplikasi.",
      );
    } else {
      lines.push("Plafon aman untuk kondisimu saat ini: Rp 0. Sebaiknya tidak menambah pinjaman dulu.");
    }
    lines.push("");
    lines.push(
      "Ini hitungan bantu-bantu dengan patokan umum (cicilan ≤30% penghasilan), bukan nasihat keuangan resmi.",
    );
    lines.push("Ketik *lagi* untuk coba angka pinjaman lain, atau *menu*.");
    return lines.join("\n");
  }
}
