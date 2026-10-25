// Kalkulator kemampuan bayar. Padanan core/affordability.py.
// Patokan = heuristik umum perencana keuangan (BUKAN aturan OJK, bukan nasihat keuangan resmi).
import { fmtPct, fmtRp } from "./formatting.js";
import { pyFloorDiv } from "./pynum.js";

export const defaultPolicy = Object.freeze({
  maxDsr: 0.3, // total cicilan <= 30% penghasilan = batas aman
  avoidDsr: 0.4, // di atas ini: sebaiknya jangan
  minBufferRatio: 0.1, // sisa uang setelah cicilan minimal 10% penghasilan
  highDailyCostPct: 0.4, // biaya > 0,4%/hari dianggap mahal
  roundTo: 50_000, // pembulatan plafon aman ke bawah
});

export const Verdict = Object.freeze({ SAFE: "safe", CAUTION: "caution", AVOID: "avoid" });

/** profile: {income, expenses, existingInstallments}; offer: {principal, totalRepay, tenorDays, toPayOtherDebt} */
export function assess(profile, offer, policy = defaultPolicy) {
  if (profile.income <= 0) throw new Error("Penghasilan harus lebih dari 0.");
  if (Math.min(profile.expenses, profile.existingInstallments) < 0) throw new Error("Pengeluaran dan cicilan tidak boleh negatif.");
  if (offer.principal <= 0) throw new Error("Jumlah pinjaman harus lebih dari 0.");
  if (offer.totalRepay < offer.principal) throw new Error("Total pengembalian tidak boleh lebih kecil dari jumlah pinjaman.");
  if (offer.tenorDays < 1) throw new Error("Tenor minimal 1 hari.");

  const income = profile.income;
  const existing = profile.existingInstallments;
  const n = Math.max(1, Math.ceil(offer.tenorDays / 30));
  const monthly = Math.ceil(offer.totalRepay / n);

  const freeBefore = income - profile.expenses - existing;
  const freeAfter = freeBefore - monthly;
  const dsrBefore = existing / income;
  const dsrAfter = (existing + monthly) / income;
  const costPct = ((offer.totalRepay - offer.principal) / offer.principal) * 100;
  const dailyCost = costPct / offer.tenorDays;

  const buffer = policy.minBufferRatio * income;
  const capDsr = policy.maxDsr * income - existing;
  const capCash = freeBefore - buffer;
  const maxInst = Math.max(0, Math.min(capDsr, capCash));
  const ratio = offer.totalRepay / offer.principal;
  const maxPrincipal = Math.trunc(pyFloorDiv((maxInst * n) / ratio, policy.roundTo) * policy.roundTo);

  const avoid = freeAfter < 0 || dsrAfter > policy.avoidDsr;
  const caution =
    dsrAfter > policy.maxDsr || freeAfter < buffer || dailyCost > policy.highDailyCostPct || Boolean(offer.toPayOtherDebt);
  const verdict = avoid ? Verdict.AVOID : caution ? Verdict.CAUTION : Verdict.SAFE;

  const reasons = [];
  if (freeBefore <= 0) {
    reasons.push("Penghasilanmu sudah habis untuk pengeluaran + cicilan yang ada, bahkan sebelum pinjaman baru.");
  } else if (dsrBefore > policy.maxDsr) {
    reasons.push(
      `Cicilan berjalan sudah ${fmtPct(dsrBefore * 100, 0)} dari penghasilan, di atas batas aman ${fmtPct(policy.maxDsr * 100, 0)}.`,
    );
  }
  if (freeAfter < 0) {
    reasons.push(
      `Setelah cicilan baru, uangmu minus ${fmtRp(-freeAfter)} per bulan: hampir pasti berujung gali lubang tutup lubang.`,
    );
  } else if (freeAfter < buffer) {
    reasons.push(
      `Sisa uang setelah cicilan cuma ${fmtRp(freeAfter)} (kurang dari ${fmtRp(buffer)}, ${fmtPct(policy.minBufferRatio * 100, 0)} penghasilan): tipis kalau ada kebutuhan mendadak.`,
    );
  }
  if (dsrAfter > policy.avoidDsr) {
    reasons.push(`Total cicilan jadi ${fmtPct(dsrAfter * 100, 0)} dari penghasilan, jauh di atas batas aman.`);
  } else if (dsrAfter > policy.maxDsr) {
    reasons.push(
      `Total cicilan jadi ${fmtPct(dsrAfter * 100, 0)} dari penghasilan, di atas batas aman ${fmtPct(policy.maxDsr * 100, 0)}.`,
    );
  }
  if (dailyCost > policy.highDailyCostPct) {
    reasons.push(`Biaya sekitar ${fmtPct(dailyCost, 2)} per hari tergolong mahal. Bandingkan dengan opsi lain.`);
  }
  if (offer.toPayOtherDebt) {
    reasons.push(
      "Pinjaman untuk menutup utang lain berisiko menumpuk. Bicarakan dulu keringanan atau penjadwalan ulang dengan pemberi pinjaman awal.",
    );
  }
  if (!reasons.length) reasons.push("Cicilan masih di bawah batas aman dan sisa uangmu cukup.");

  return {
    verdict,
    nInstallments: n,
    monthlyInstallment: monthly,
    freeBefore,
    freeAfter,
    dsrBefore,
    dsrAfter,
    costPct,
    dailyCostPct: dailyCost,
    maxSafeInstallment: Math.trunc(maxInst),
    maxSafePrincipal: maxPrincipal,
    reasons,
  };
}
