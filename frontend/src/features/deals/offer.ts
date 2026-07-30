import type { DealDetail, Receipt } from "@/lib/types";

const DT_L: Record<string, string> = { cash: "Naqd toʻlov", installment: "Boʻlib toʻlash", mortgage: "Ipoteka" };

/** Printable payment receipt / kvitansiya for one recorded payment. */
export function buildReceiptHtml(r: Receipt, deal: DealDetail, opts: { code: string; conv: (base: string | number) => string }): string {
  const { code, conv } = opts;
  const money = (v: string | number) => `${conv(v)} ${code}`;
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><title>Kvitansiya ${r.number}</title>
<style>
  :root{--accent:#2456C9;--ink:#1f2937;--muted:#6b7280;--line:#e5e7eb}
  *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);margin:0;padding:32px;background:#fff}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid var(--accent);padding-bottom:14px;margin-bottom:20px}
  .logo{display:flex;align-items:center;gap:8px;font-weight:800;font-size:18px}
  .logo i{width:22px;height:22px;border:2px solid var(--accent);border-radius:4px;display:inline-block}
  h1{font-size:20px;margin:0 0 2px} .sub{color:var(--muted);font-size:13px}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px} td{padding:7px 8px;border-bottom:1px solid var(--line)}
  td:first-child{color:var(--muted)} .r{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
  .total{display:flex;justify-content:space-between;align-items:center;background:#ecfdf5;border:1px solid #10b981;border-radius:8px;padding:14px 18px}
  .total b{font-size:24px;color:#047857} .foot{margin-top:28px;color:var(--muted);font-size:12px;border-top:1px solid var(--line);padding-top:12px}
  .sign{margin-top:36px;display:flex;justify-content:space-between;font-size:13px;color:var(--muted)}
  @media print{body{padding:0}.noprint{display:none}}
  .btn{background:var(--accent);color:#fff;border:0;border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer}
</style></head><body>
  <div class="head">
    <div><div class="logo"><i></i> Blueprint OS</div><div class="sub">Toʻlov kvitansiyasi</div></div>
    <div style="text-align:right"><h1>${r.number}</h1><div class="sub">${new Date(r.paid_at).toLocaleString()}</div></div>
  </div>
  <table>
    <tr><td>Mijoz</td><td class="r">${deal.client_name ?? "—"}</td></tr>
    <tr><td>Obyekt</td><td class="r">${deal.complex_name ?? ""} · ${deal.unit_number ?? "—"}</td></tr>
    <tr><td>Bitim</td><td class="r">#${deal.id}${deal.contract_no ? " · " + deal.contract_no : ""}</td></tr>
    <tr><td>Toʻlov usuli</td><td class="r">${r.method_name ?? "—"}</td></tr>
    <tr><td>Qoplaydi</td><td class="r">${r.covers ?? "—"}</td></tr>
    <tr><td>Qabul qildi</td><td class="r">${r.author_name ?? "—"}</td></tr>
  </table>
  <div class="total"><span>Qabul qilingan summa</span><b>${money(r.amount)}</b></div>
  <div class="sign"><span>Toʻlovchi: __________________</span><span>Qabul qildi: __________________</span></div>
  <div class="foot">Ushbu kvitansiya toʻlov qabul qilinganini tasdiqlaydi.</div>
  <div class="noprint" style="margin-top:20px;text-align:center"><button class="btn" onclick="window.print()">🖨 Chop etish / PDF</button></div>
</body></html>`;
}

/** Build a self-contained, printable commercial offer (kommercheskoe
 * predlozheniye) for a deal — the client-facing summary Profitbase-style tools
 * generate on one click. `conv` formats a base-currency amount into the
 * chosen display currency. */
export function buildOfferHtml(deal: DealDetail, opts: { code: string; conv: (base: string | number) => string }): string {
  const { code, conv } = opts;
  const money = (v: string | number) => `${conv(v)} ${code}`;
  const rows = deal.payments.length
    ? deal.payments.map((p) => `<tr><td>${p.seq === 0 ? p.kind : "#" + p.seq}</td><td>${p.due_date}</td><td class="r">${money(p.amount)}</td></tr>`).join("")
    : `<tr><td colspan="3" class="muted">Toʻlov jadvali shartnoma imzolangach shakllanadi</td></tr>`;
  const discount = Number(deal.discount_percent) > 0 || Number(deal.discount_amount) > 0
    ? `<tr><td>Chegirma</td><td class="r">${Number(deal.discount_percent)}%${Number(deal.discount_amount) > 0 ? " + " + money(deal.discount_amount) : ""}</td></tr>` : "";
  const terms = deal.deal_type === "installment"
    ? `<tr><td>Boshlangʻich toʻlov</td><td class="r">${Number(deal.down_payment_percent)}%</td></tr>
       <tr><td>Muddat</td><td class="r">${deal.term_months} oy${Number(deal.markup_percent) > 0 ? " · ustama " + Number(deal.markup_percent) + "%" : ""}</td></tr>`
    : deal.deal_type === "mortgage"
    ? `<tr><td>Boshlangʻich toʻlov</td><td class="r">${Number(deal.down_payment_percent)}%</td></tr>` : "";

  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><title>Tijoriy taklif · ${deal.unit_number ?? ""}</title>
<style>
  :root{--accent:#2456C9;--ink:#1f2937;--muted:#6b7280;--line:#e5e7eb}
  *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);margin:0;padding:32px;background:#fff}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid var(--accent);padding-bottom:14px;margin-bottom:20px}
  .logo{display:flex;align-items:center;gap:8px;font-weight:800;font-size:18px}
  .logo i{width:22px;height:22px;border:2px solid var(--accent);border-radius:4px;display:inline-block}
  h1{font-size:20px;margin:0 0 2px} .sub{color:var(--muted);font-size:13px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;font-size:13px} td{padding:6px 8px;border-bottom:1px solid var(--line)}
  td:first-child{color:var(--muted)} .r{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
  .muted{color:var(--muted);text-align:center}
  .sched th{text-align:left;padding:6px 8px;border-bottom:2px solid var(--line);font-size:11px;text-transform:uppercase;color:var(--muted)}
  .total{margin-top:16px;display:flex;justify-content:space-between;align-items:center;background:#eef3ff;border:1px solid var(--accent);border-radius:8px;padding:14px 18px}
  .total b{font-size:22px} .foot{margin-top:28px;color:var(--muted);font-size:12px;border-top:1px solid var(--line);padding-top:12px}
  @media print{body{padding:0}.noprint{display:none}}
  .btn{background:var(--accent);color:#fff;border:0;border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer}
</style></head><body>
  <div class="head">
    <div><div class="logo"><i></i> Blueprint OS</div><div class="sub">Quruvchi kompaniya · Tijoriy taklif</div></div>
    <div style="text-align:right"><h1>№ ${deal.contract_no ?? deal.id}</h1><div class="sub">${deal.contract_date ?? new Date().toISOString().slice(0, 10)}</div></div>
  </div>
  <div class="grid">
    <table>
      <tr><td colspan="2" style="font-weight:700;color:var(--ink)">Mijoz</td></tr>
      <tr><td>F.I.Sh</td><td class="r">${deal.client_name ?? "—"}</td></tr>
      <tr><td>Telefon</td><td class="r">${deal.client_phone ?? "—"}</td></tr>
      <tr><td>Masʼul</td><td class="r">${deal.manager_name ?? "—"}</td></tr>
    </table>
    <table>
      <tr><td colspan="2" style="font-weight:700;color:var(--ink)">Obyekt</td></tr>
      <tr><td>Majmua</td><td class="r">${deal.complex_name ?? "—"}</td></tr>
      <tr><td>Xonadon</td><td class="r">${deal.unit_number ?? "—"}</td></tr>
      <tr><td>Narx</td><td class="r">${money(deal.price)}</td></tr>
    </table>
  </div>
  <table style="margin-bottom:16px">
    <tr><td colspan="2" style="font-weight:700;color:var(--ink)">Shartlar</td></tr>
    <tr><td>Toʻlov turi</td><td class="r">${DT_L[deal.deal_type] ?? deal.deal_type}</td></tr>
    ${discount}${terms}
  </table>
  <table class="sched">
    <thead><tr><th>Toʻlov</th><th>Sana</th><th style="text-align:right">Summa</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="total"><span>Jami summa</span><b>${money(deal.total)}</b></div>
  <div class="foot">Ushbu taklif ma'lumot uchun mo'ljallangan va ommaviy oferta hisoblanmaydi. Narxlar o'zgarishi mumkin.</div>
  <div class="noprint" style="margin-top:20px;text-align:center"><button class="btn" onclick="window.print()">🖨 Chop etish / PDF</button></div>
</body></html>`;
}
