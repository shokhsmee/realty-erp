import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { DealDetail, DealRow, DealPayment, PaymentMethod, Receipt, DealEvent, Unit, UnitType } from "@/lib/types";
import { PageTitle, Card, Spinner, EmptyState } from "@/components/ui/misc";
import { formatMoney } from "@/components/ui/Money";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { buildOfferHtml, buildReceiptHtml } from "@/features/deals/offer";
import { DealWizard } from "@/features/shaxmatka/DealWizard";
import { UnitPicker } from "@/features/shaxmatka/UnitPicker";

const STATE_TONE: Record<string, "ok" | "warn" | "info" | "crit" | "muted"> = {
  active: "ok", signed: "ok", reserved: "info", draft: "muted", cancelled: "crit", closed: "muted",
};
const STATE_L: Record<string, string> = {
  active: "Faol", signed: "Imzolangan", reserved: "Bron", draft: "Qoralama", cancelled: "Bekor", closed: "Yopilgan",
};
const DT_L: Record<string, string> = { cash: "Naqd", installment: "Boʻlib toʻlash", mortgage: "Ipoteka" };
const PAY_TONE: Record<string, "ok" | "warn" | "crit" | "muted"> = { paid: "ok", pending: "warn", planned: "muted", overdue: "crit" };
const FILTERS = [{ v: "", l: "Hammasi" }, { v: "reserved", l: "Bron" }, { v: "active", l: "Faol" }, { v: "cancelled", l: "Bekor" }];
const FLOW = ["draft", "reserved", "active", "closed"]; // status-bar order

export function DealsPage() {
  const [openId, setOpenId] = useState<number | null>(null);
  if (openId != null) return <DealForm dealId={openId} onBack={() => setOpenId(null)} />;
  return <DealList onOpen={setOpenId} />;
}

/* ============================== LIST VIEW ============================== */
function DealList({ onOpen }: { onOpen: (id: number) => void }) {
  const { fmt } = useCurrency();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [picking, setPicking] = useState(false);
  const [newUnit, setNewUnit] = useState<Unit | null>(null);
  const { data: rows, isLoading } = useQuery({ queryKey: ["deal-rows"], queryFn: () => api.get<DealRow[]>("/api/sales/deals/rows") });

  const shown = (rows ?? []).filter((r) => (filter ? r.state === filter : true));
  const stats = useMemo(() => {
    const all = rows ?? [];
    return {
      count: all.length,
      active: all.filter((r) => r.state === "active").length,
      reserved: all.filter((r) => r.state === "reserved").length,
      value: all.filter((r) => r.state !== "cancelled").reduce((s, r) => s + Number(r.total), 0),
      collected: all.reduce((s, r) => s + Number(r.paid), 0),
    };
  }, [rows]);

  return (
    <div>
      <div className="flex items-start justify-between">
        <PageTitle title="Bitimlar" sub="Sotuv bitimlari — bron, shartnoma, toʻlovlar" />
        {can("deals", "edit") && <Button size="sm" onClick={() => setPicking(true)}>+ Yangi bitim</Button>}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile l="Bitimlar" v={String(stats.count)} />
        <Tile l="Faol" v={String(stats.active)} tone="ok" />
        <Tile l="Bron" v={String(stats.reserved)} tone="info" />
        <Tile l="Shartnoma qiymati" v={fmt(stats.value)} />
      </div>
      <div className="mb-3 flex items-center gap-1.5">
        {FILTERS.map((f) => (
          <button key={f.v} onClick={() => setFilter(f.v)}
            className={`rounded-sm border px-2.5 py-1 font-mono text-[11.5px] font-semibold ${filter === f.v ? "border-accent bg-accent text-white" : "border-line-strong bg-surface text-ink-3 hover:bg-surface-2"}`}>
            {f.l}
          </button>
        ))}
        <span className="ml-auto font-mono text-[11px] text-ink-3">Yigʻilgan: <b className="text-ok">{fmt(stats.collected)}</b></span>
      </div>
      {isLoading ? <Spinner /> : !shown.length ? (
        <EmptyState>Bitim yoʻq. Shaxmatka orqali yangi bitim yarating.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-surface-2 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
                <th className="px-4 py-2.5">Xonadon / Mijoz</th><th className="px-4 py-2.5">Masʼul</th><th className="px-4 py-2.5">Tur</th>
                <th className="px-4 py-2.5 text-right">Summa</th><th className="px-4 py-2.5">Toʻlangan</th><th className="px-4 py-2.5">Holat</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => {
                const pct = Number(d.total) > 0 ? (Number(d.paid) / Number(d.total)) * 100 : 0;
                return (
                  <tr key={d.id} onClick={() => onOpen(d.id)} className="cursor-pointer border-t border-line-2 hover:bg-surface-2">
                    <td className="px-4 py-2.5"><div className="font-semibold text-ink">{d.unit_number}</div><div className="font-mono text-[11px] text-ink-3">{d.client_name}</div></td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-ink-2">{d.manager_name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-[11.5px] text-ink-2">{DT_L[d.deal_type] ?? d.deal_type}</td>
                    <td className="px-4 py-2.5 text-right font-mono tnum text-ink">{fmt(d.total)}</td>
                    <td className="px-4 py-2.5" style={{ minWidth: 150 }}>
                      <div className="h-1.5 overflow-hidden rounded-full border border-line-2 bg-surface-3"><span className="block h-full rounded-full bg-ok" style={{ width: `${pct}%` }} /></div>
                      <div className="mt-1 font-mono text-[10px] text-ink-3">{d.payments_paid}/{d.payments_total} · {fmt(d.paid)}</div>
                    </td>
                    <td className="px-4 py-2.5"><StatusPill tone={STATE_TONE[d.state] ?? "muted"}>{STATE_L[d.state] ?? d.state}</StatusPill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {picking && <UnitPicker onClose={() => setPicking(false)} onPick={(u) => { setPicking(false); setNewUnit(u); }} />}
      {newUnit && (
        <DealWizard unit={newUnit} onClose={() => setNewUnit(null)}
          onDone={() => { setNewUnit(null); qc.invalidateQueries({ queryKey: ["deal-rows"] }); }} />
      )}
    </div>
  );
}

function Tile({ l, v, tone }: { l: string; v: string; tone?: "ok" | "info" }) {
  return (
    <Card className="px-3 py-2">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-4">{l}</div>
      <div className={`mt-0.5 font-mono tnum text-[15px] font-bold ${tone === "ok" ? "text-ok" : tone === "info" ? "text-accent" : "text-ink"}`}>{v}</div>
    </Card>
  );
}

/* ============================== FORM VIEW ============================== */
type Tab = "payments" | "receipts" | "contract" | "note";

function DealForm({ dealId, onBack }: { dealId: number; onBack: () => void }) {
  const { can } = useAuth();
  const { fmt, fromBase, selected } = useCurrency();
  const qc = useQueryClient();
  const canEdit = can("deals", "edit");
  const [tab, setTab] = useState<Tab>("payments");
  const [wiz, setWiz] = useState<DealPayment | null>(null); // payment the wizard starts at
  const [unitOpen, setUnitOpen] = useState(false);
  const [rcpt, setRcpt] = useState<Receipt | null>(null);

  const { data: deal, isLoading } = useQuery({ queryKey: ["deal", dealId], queryFn: () => api.get<DealDetail>(`/api/sales/deals/${dealId}`) });
  const { data: methods } = useQuery({ queryKey: ["payment-methods"], queryFn: () => api.get<PaymentMethod[]>("/api/sales/payment-methods") });
  const { data: receipts } = useQuery({ queryKey: ["receipts", dealId], queryFn: () => api.get<Receipt[]>(`/api/sales/deals/${dealId}/receipts`) });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["deal", dealId] });
    qc.invalidateQueries({ queryKey: ["deal-rows"] });
    qc.invalidateQueries({ queryKey: ["tree"] });
    qc.invalidateQueries({ queryKey: ["receipts", dealId] });
    qc.invalidateQueries({ queryKey: ["deal-events", dealId] });
    ["acct-summary", "acct-debtors", "acct-register"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };
  const act = useMutation({ mutationFn: (a: string) => api.post(`/api/sales/deals/${dealId}/${a}`, {}), onSuccess: invalidateAll });

  if (isLoading || !deal) return <div className="flex justify-center pt-10"><Spinner /></div>;

  const paidCount = deal.payments.filter((p) => p.status === "paid").length;
  const collected = deal.payments.reduce((s, p) => s + Number(p.paid_amount), 0);
  const contractCount = deal.contract_no || deal.state === "active" || deal.state === "signed" || deal.state === "closed" ? 1 : 0;

  const openOffer = () => {
    const html = buildOfferHtml(deal, { code: selected?.code ?? "UZS", conv: (base) => formatMoney(fromBase(base)) });
    const w = window.open("", "_blank", "width=820,height=920");
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div>
      {/* breadcrumb */}
      <div className="mb-3 flex items-center gap-2 font-mono text-[12px] text-ink-3">
        <button onClick={onBack} className="hover:text-accent">← Bitimlar</button>
        <span className="text-ink-4">/</span>
        <span className="text-ink">{deal.unit_number}</span>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
       <Card className="min-w-0 flex-1 overflow-hidden">
        {/* header: status bar + actions */}
        <div className="border-b border-line bg-surface-2 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (deal.state === "draft" || deal.state === "reserved") && (
              <Button size="sm" onClick={() => act.mutate("sign")} disabled={act.isPending}>Shartnoma imzolash</Button>
            )}
            {canEdit && deal.state === "draft" && (
              <Button size="sm" variant="secondary" onClick={() => act.mutate("reserve")} disabled={act.isPending}>Bron qilish</Button>
            )}
            {canEdit && deal.state !== "cancelled" && deal.state !== "closed" && (
              <Button size="sm" variant="ghost" onClick={() => confirm("Bitim bekor qilinsinmi? Xonadon boʻshaydi.") && act.mutate("cancel")} disabled={act.isPending}>Bekor qilish</Button>
            )}
            {/* status ribbon (Odoo statusbar) */}
            <div className="ml-auto flex items-center gap-0.5 text-[11px] font-semibold">
              {deal.state === "cancelled" ? (
                <StatusPill tone="crit">Bekor qilingan</StatusPill>
              ) : FLOW.map((st, i) => {
                const ci = FLOW.indexOf(deal.state);
                const cur = i === ci;
                const done = i < ci;
                return (
                  <span key={st} className="flex items-center gap-0.5">
                    {i > 0 && <span className="text-ink-4">›</span>}
                    <span className={`rounded px-2.5 py-1 ${cur ? "bg-accent text-white" : done ? "text-accent-ink" : "text-ink-4"}`}>
                      {STATE_L[st]}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* smart buttons (Odoo statbuttons) */}
        <div className="flex flex-wrap items-stretch border-b border-line px-3 py-2">
          <SmartBtn active={false} onClick={() => setUnitOpen(true)} icon="🏠" big={deal.unit_number ?? "—"} label="Xonadon" sub="batafsil" />
          <SmartBtn active={tab === "payments"} onClick={() => setTab("payments")} icon="₮" big={`${paidCount}/${deal.payments.length}`} label="Toʻlov jadvali" sub={fmt(collected)} />
          <SmartBtn active={tab === "receipts"} onClick={() => setTab("receipts")} icon="🧾" big={String(receipts?.length ?? 0)} label="Toʻlovlar (kvitansiya)" sub={fmt(collected)} />
          <SmartBtn active={tab === "contract"} onClick={() => setTab("contract")} icon="📄" big={String(contractCount)} label="Shartnomalar" sub={deal.contract_no ?? "—"} />
          <SmartBtn active={false} onClick={openOffer} icon="📑" big="KP" label="Tijoriy taklif" sub="chop etish" />
        </div>

        {/* title block */}
        <div className="flex items-start justify-between px-5 py-4">
          <div>
            <div className="text-xl font-bold text-ink">{deal.unit_number} <span className="text-ink-3">· {deal.complex_name}</span></div>
            <div className="mt-0.5 font-mono text-[12px] text-ink-3">{DT_L[deal.deal_type] ?? deal.deal_type} · bitim #{deal.id}</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-4">Jami summa</div>
            <div className="font-mono tnum text-2xl font-bold text-ink">{fmt(deal.total)}</div>
          </div>
        </div>

        {/* field groups */}
        <div className="grid gap-x-8 gap-y-5 px-5 pb-5 md:grid-cols-2">
          <Group title="Mijoz">
            <F l="F.I.Sh" v={deal.client_name ?? "—"} link />
            <F l="Telefon" v={deal.client_phone ?? "—"} />
            <F l="Masʼul" v={deal.manager_name ?? "—"} link />
          </Group>
          <Group title="Obyekt">
            <F l="Majmua" v={deal.complex_name ?? "—"} link />
            <F l="Xonadon" v={deal.unit_number ?? "—"} link />
            <F l="Xonadon narxi" v={fmt(deal.price)} />
          </Group>
          <Group title="Toʻlov shartlari">
            <F l="Turi" v={DT_L[deal.deal_type] ?? deal.deal_type} />
            {(Number(deal.discount_percent) > 0 || Number(deal.discount_amount) > 0) &&
              <F l="Chegirma" v={`${Number(deal.discount_percent)}%${Number(deal.discount_amount) > 0 ? " + " + fmt(deal.discount_amount) : ""}`} tone="ok" />}
            {deal.deal_type !== "cash" && <F l="Boshlangʻich toʻlov" v={`${Number(deal.down_payment_percent)}%`} />}
            {deal.deal_type === "installment" && <F l="Muddat / ustama" v={`${deal.term_months} oy · +${Number(deal.markup_percent)}%`} />}
          </Group>
          <Group title="Holat">
            <F l="Bosqich" v={STATE_L[deal.state] ?? deal.state} />
            <F l="Yaratilgan" v={new Date(deal.created_at).toLocaleDateString()} />
            {deal.signed_at && <F l="Imzolangan" v={new Date(deal.signed_at).toLocaleDateString()} />}
            {deal.state === "reserved" && deal.booking_expires_at && <F l="Bron muddati" v={new Date(deal.booking_expires_at).toLocaleDateString()} tone="warn" />}
          </Group>
        </div>

        {/* notebook */}
        <div className="border-t border-line">
          <div className="flex gap-4 border-b border-line px-5">
            {([["payments", "Toʻlov jadvali"], ["receipts", "Kvitansiyalar"], ["contract", "Shartnoma"], ["note", "Izoh"]] as [Tab, string][]).map(([t, l]) => (
              <button key={t} onClick={() => setTab(t)}
                className={`-mb-px border-b-2 py-2.5 text-[13px] font-semibold ${tab === t ? "border-accent text-accent-ink" : "border-transparent text-ink-3 hover:text-ink"}`}>
                {l}
              </button>
            ))}
          </div>

          <div className="p-5">
            {tab === "payments" && (
              <PaymentsTab deal={deal} canEdit={canEdit} onOpenWizard={(p) => setWiz(p)} fmt={fmt} />
            )}
            {tab === "receipts" && <ReceiptsTab receipts={receipts ?? []} fmt={fmt} onOpen={(r) => setRcpt(r)} />}
            {tab === "contract" && <ContractTab deal={deal} canEdit={canEdit} onSaved={invalidateAll} onPrint={openOffer} />}
            {tab === "note" && <NoteTab deal={deal} canEdit={canEdit} onSaved={invalidateAll} />}
          </div>
        </div>
       </Card>

       {/* chatter */}
       <Chatter dealId={dealId} className="w-full lg:w-[340px] lg:flex-none" />
      </div>

      {wiz && (
        <PaymentWizard deal={deal} start={wiz} methods={methods ?? []} onClose={() => setWiz(null)}
          onDone={() => { setWiz(null); invalidateAll(); }} />
      )}
      {unitOpen && <UnitModal unitId={deal.unit_id} complexName={deal.complex_name} onClose={() => setUnitOpen(false)} />}
      {rcpt && <ReceiptModal receipt={rcpt} deal={deal} onClose={() => setRcpt(null)} />}
    </div>
  );
}

/* ------------------------------ receipts (paid invoices) ------------------------------ */
function ReceiptsTab({ receipts, fmt, onOpen }: { receipts: Receipt[]; fmt: (v: string | number) => string; onOpen: (r: Receipt) => void }) {
  if (!receipts.length) return <EmptyState>Hali toʻlov qabul qilinmagan.</EmptyState>;
  return (
    <div className="overflow-hidden rounded border border-line-2">
      <table className="w-full text-[12.5px]">
        <thead><tr className="bg-surface-2 text-left font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-3">
          <th className="px-3 py-2">Kvitansiya</th><th className="px-3 py-2">Sana</th><th className="px-3 py-2">Usul</th>
          <th className="px-3 py-2">Qoplaydi</th><th className="px-3 py-2">Kim</th><th className="px-3 py-2 text-right">Summa</th>
        </tr></thead>
        <tbody>
          {receipts.map((r) => (
            <tr key={r.id} onClick={() => onOpen(r)} className="cursor-pointer border-t border-line-2 hover:bg-surface-2">
              <td className="px-3 py-1.5 font-mono font-semibold text-accent-ink">{r.number}</td>
              <td className="px-3 py-1.5 font-mono text-ink-2">{new Date(r.paid_at).toLocaleDateString()}</td>
              <td className="px-3 py-1.5 text-ink-2">{r.method_name ?? "—"}</td>
              <td className="px-3 py-1.5 font-mono text-ink-3">{r.covers ?? "—"}</td>
              <td className="px-3 py-1.5 font-mono text-[11px] text-ink-3">{r.author_name ?? "—"}</td>
              <td className="px-3 py-1.5 text-right font-mono tnum font-semibold text-ok">{fmt(r.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------ receipt (kvitansiya) form view ------------------------------ */
function ReceiptModal({ receipt, deal, onClose }: { receipt: Receipt; deal: DealDetail; onClose: () => void }) {
  const { fmt, fromBase, selected } = useCurrency();
  const print = () => {
    const html = buildReceiptHtml(receipt, deal, { code: selected?.code ?? "UZS", conv: (base) => formatMoney(fromBase(base)) });
    const w = window.open("", "_blank", "width=760,height=860");
    if (w) { w.document.write(html); w.document.close(); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-line bg-surface shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line bg-surface-2 px-5 py-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">Toʻlov kvitansiyasi</div>
            <div className="text-lg font-bold text-ink">{receipt.number}</div>
          </div>
          <button onClick={onClose} className="text-ink-3 hover:text-ink">✕</button>
        </div>
        <div className="p-5">
          <div className="mb-4 rounded-md border border-ok-line bg-ok-bg px-4 py-3 text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">Qabul qilingan summa</div>
            <div className="font-mono tnum text-2xl font-bold text-ok">{fmt(receipt.amount)}</div>
          </div>
          <div className="space-y-1.5">
            <F l="Sana" v={new Date(receipt.paid_at).toLocaleString()} />
            <F l="Mijoz" v={deal.client_name ?? "—"} link />
            <F l="Obyekt" v={`${deal.complex_name ?? ""} · ${deal.unit_number ?? "—"}`} />
            <F l="Bitim" v={`#${deal.id}${deal.contract_no ? " · " + deal.contract_no : ""}`} />
            <F l="Toʻlov usuli" v={receipt.method_name ?? "—"} />
            <F l="Qoplaydi" v={receipt.covers ?? "—"} />
            <F l="Qabul qildi" v={receipt.author_name ?? "—"} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose}>Yopish</Button>
          <Button size="sm" variant="secondary" onClick={print}>🖨 Chop etish / PDF</Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ smart button (Odoo statbutton) ------------------------------ */
function SmartBtn({ active, onClick, icon, big, label, sub }: { active: boolean; onClick: () => void; icon: string; big: string; label: string; sub: string }) {
  return (
    <button onClick={onClick}
      className={`group flex items-center gap-2.5 border-l border-line px-3.5 py-1 text-left transition first:border-l-0 hover:bg-surface-2 ${active ? "bg-accent-bg" : ""}`}>
      <span className={`text-[18px] leading-none ${active ? "" : "opacity-80"}`}>{icon}</span>
      <span className="min-w-0 leading-tight">
        <span className="block font-mono tnum text-[14px] font-bold text-ink">{big}</span>
        <span className="block text-[11px] font-semibold text-accent-ink">{label}</span>
        <span className="block truncate font-mono text-[9.5px] text-ink-4">{sub}</span>
      </span>
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 border-b border-line pb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-accent-ink">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
function F({ l, v, tone, link }: { l: string; v: string; tone?: "ok" | "warn"; link?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line-2 pb-1 text-[13px]">
      <span className="text-ink-3">{l}</span>
      <span className={`text-right ${link ? "font-semibold text-accent-ink" : "font-mono"} ${tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : link ? "" : "text-ink"}`}>{v}</span>
    </div>
  );
}

/* ------------------------------ tabs ------------------------------ */
function PaymentsTab({ deal, canEdit, onOpenWizard, fmt }: {
  deal: DealDetail; canEdit: boolean; onOpenWizard: (p: DealPayment) => void; fmt: (v: string | number) => string;
}) {
  if (!deal.payments.length) return <EmptyState>Toʻlov jadvali yoʻq — bitim imzolangach shakllanadi.</EmptyState>;
  return (
    <div className="overflow-hidden rounded border border-line-2">
      <table className="w-full text-[12.5px]">
        <thead><tr className="bg-surface-2 text-left font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-3">
          <th className="px-3 py-2">Oy</th><th className="px-3 py-2">Sana</th><th className="px-3 py-2 text-right">Summa</th>
          <th className="px-3 py-2 text-right">Toʻlangan</th><th className="px-3 py-2 text-right">Qoldiq</th><th className="px-3 py-2">Holat</th><th></th>
        </tr></thead>
        <tbody>
          {deal.payments.map((p) => {
            const remaining = Number(p.amount) - Number(p.paid_amount);
            return (
              <tr key={p.id} className="border-t border-line-2">
                <td className="px-3 py-1.5 font-mono text-ink-3">{p.seq === 0 ? p.kind : p.seq}</td>
                <td className="px-3 py-1.5 font-mono text-ink-2">{p.due_date}</td>
                <td className="px-3 py-1.5 text-right font-mono tnum text-ink">{fmt(p.amount)}</td>
                <td className="px-3 py-1.5 text-right font-mono tnum text-ok">{Number(p.paid_amount) > 0 ? fmt(p.paid_amount) : "—"}</td>
                <td className="px-3 py-1.5 text-right font-mono tnum text-ink-2">{remaining > 0 ? fmt(remaining) : "—"}</td>
                <td className="px-3 py-1.5"><StatusPill tone={PAY_TONE[p.status] ?? "muted"}>{p.status}</StatusPill></td>
                <td className="px-3 py-1.5 text-right">
                  {canEdit && p.status !== "paid" && (
                    <Button size="sm" variant="secondary" onClick={() => onOpenWizard(p)}>Toʻlash</Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------ payment wizard ------------------------------ */
function PaymentWizard({ deal, start, methods, onClose, onDone }: {
  deal: DealDetail; start: DealPayment; methods: PaymentMethod[]; onClose: () => void; onDone: () => void;
}) {
  const { fmt, fromBase, toBase, selected } = useCurrency();
  const code = selected?.code ?? "";
  const startRemaining = Number(start.amount) - Number(start.paid_amount);
  const [amount, setAmount] = useState(String(Math.round(fromBase(startRemaining))));
  const [methodId, setMethodId] = useState<number | "">("");

  // Live fill-forward preview: distribute the entered amount from `start` onward.
  const preview = useMemo(() => {
    let left = toBase(Number(amount) || 0);
    const rows: { seq: number; kind: string; due: string; applied: number; fills: boolean }[] = [];
    const ordered = [...deal.payments].sort((a, b) => a.seq - b.seq).filter((p) => p.seq >= start.seq);
    for (const p of ordered) {
      if (left <= 0) break;
      const rem = Number(p.amount) - Number(p.paid_amount);
      if (rem <= 0) continue;
      const take = Math.min(rem, left);
      left -= take;
      rows.push({ seq: p.seq, kind: p.kind, due: p.due_date, applied: take, fills: take >= rem - 0.001 });
    }
    return { rows, leftover: left };
  }, [amount, deal.payments, start.seq, toBase]);

  const submit = useMutation({
    mutationFn: () => api.post(`/api/sales/deals/${deal.id}/distribute`, {
      start_payment_id: start.id, amount: toBase(Number(amount) || 0), method_id: methodId === "" ? null : methodId,
    }),
    onSuccess: onDone,
  });

  const quick = (mult: number) => setAmount(String(Math.round(fromBase(startRemaining * mult))));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-line bg-surface shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <div className="text-base font-bold text-ink">Toʻlov qabul qilish</div>
            <div className="font-mono text-[11px] text-ink-3">{start.seq === 0 ? start.kind : `${start.seq}-oy`} · {start.due_date} · qoldiq {fmt(startRemaining)}</div>
          </div>
          <button onClick={onClose} className="text-ink-3 hover:text-ink">✕</button>
        </div>

        <div className="space-y-4 p-5">
          {/* amount + method */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">Summa ({code})</span>
              <input autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                className="rounded-sm border border-line-strong bg-surface px-3 py-2 font-mono text-[15px] font-bold outline-none focus:border-accent" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">Toʻlov usuli</span>
              <select value={methodId} onChange={(e) => setMethodId(e.target.value ? Number(e.target.value) : "")}
                className="rounded-sm border border-line-strong bg-surface px-2 py-2 text-[13px] outline-none focus:border-accent">
                <option value="">—</option>
                {methods.filter((m) => m.is_active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
          </div>
          <div className="flex gap-1.5">
            {[["1 oy", 1], ["3 oy", 3], ["6 oy", 6], ["12 oy", 12]].map(([l, n]) => (
              <button key={l as string} onClick={() => quick(n as number)}
                className="rounded-sm border border-line-strong bg-surface px-2 py-1 font-mono text-[11px] text-ink-2 hover:bg-surface-2">{l}</button>
            ))}
          </div>

          {/* distribution preview */}
          <div>
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">Taqsimlanishi</div>
            <div className="max-h-52 overflow-auto rounded border border-line-2">
              <table className="w-full text-[12px]">
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.seq} className="border-b border-line-2 last:border-0">
                      <td className="px-3 py-1.5 font-mono text-ink-3">{r.seq === 0 ? r.kind : `${r.seq}-oy`}</td>
                      <td className="px-3 py-1.5 font-mono text-ink-4">{r.due}</td>
                      <td className="px-3 py-1.5 text-right font-mono tnum text-ink">{fmt(r.applied)}</td>
                      <td className="px-3 py-1.5 text-right">
                        <StatusPill tone={r.fills ? "ok" : "warn"}>{r.fills ? "toʻliq" : "qisman"}</StatusPill>
                      </td>
                    </tr>
                  ))}
                  {!preview.rows.length && <tr><td className="px-3 py-3 text-center font-mono text-[11px] text-ink-4">summani kiriting</td></tr>}
                </tbody>
              </table>
            </div>
            {preview.leftover > 0.5 && (
              <div className="mt-2 rounded-sm border border-warn-line bg-warn-bg px-3 py-1.5 font-mono text-[11px] text-warn">
                Ortiqcha {fmt(preview.leftover)} — jadvalga sigʻmadi (barcha oylar toʻlangan).
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3.5">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submit.isPending}>Bekor</Button>
          <Button size="sm" onClick={() => submit.mutate()} disabled={submit.isPending || !amount || Number(amount) <= 0}>
            {submit.isPending ? "…" : "Toʻlovni tasdiqlash"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ContractTab({ deal, canEdit, onSaved, onPrint }: { deal: DealDetail; canEdit: boolean; onSaved: () => void; onPrint: () => void }) {
  const [f, setF] = useState({ contract_no: deal.contract_no ?? "", contract_date: deal.contract_date ?? "" });
  const save = useMutation({
    mutationFn: () => api.patch(`/api/sales/deals/${deal.id}`, { contract_no: f.contract_no.trim() || null, contract_date: f.contract_date || null }),
    onSuccess: onSaved,
  });
  const inp = "rounded-sm border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent";
  return (
    <div className="max-w-lg space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">Shartnoma raqami</span>
          <input className={inp} value={f.contract_no} disabled={!canEdit} onChange={(e) => setF({ ...f, contract_no: e.target.value })} placeholder="SH-2026-001" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">Sana</span>
          <input type="date" className={`${inp} font-mono`} value={f.contract_date} disabled={!canEdit} onChange={(e) => setF({ ...f, contract_date: e.target.value })} />
        </label>
      </div>
      <div className="flex items-center gap-2">
        {canEdit && <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Saqlash</Button>}
        <Button size="sm" variant="secondary" onClick={onPrint}>🧾 Tijoriy taklif (KP)</Button>
      </div>
      <p className="text-[12px] text-ink-3">Shartnoma imzolangach toʻlov jadvali avtomatik shakllanadi. KP tugmasi mijoz uchun chop etiladigan taklifni ochadi.</p>
    </div>
  );
}

function NoteTab({ deal, canEdit, onSaved }: { deal: DealDetail; canEdit: boolean; onSaved: () => void }) {
  const [note, setNote] = useState(deal.note ?? "");
  const save = useMutation({ mutationFn: () => api.patch(`/api/sales/deals/${deal.id}`, { note: note.trim() || null }), onSuccess: onSaved });
  return (
    <div className="max-w-lg space-y-2">
      <textarea rows={5} value={note} disabled={!canEdit} onChange={(e) => setNote(e.target.value)} placeholder="Izoh…"
        className="w-full rounded-sm border border-line-strong bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent" />
      {canEdit && <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Saqlash</Button>}
    </div>
  );
}

/* ------------------------------ chatter (tracking) ------------------------------ */
const EVENT_ICON: Record<string, string> = {
  created: "🆕", reserved: "⏳", signed: "✍️", cancelled: "✖", payment: "💵", edit: "✏️", note: "💬",
};
const EVENT_SYS = (k: string) => k !== "note"; // system messages vs user notes

const AVA_COLORS = ["bg-[#c2410c]", "bg-[#2456C9]", "bg-[#0f766e]", "bg-[#7c3aed]", "bg-[#b91c1c]", "bg-[#0369a1]"];
function avatarFor(name: string) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "S";
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { initials, color: AVA_COLORS[h % AVA_COLORS.length] };
}
function dayLabel(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()} M${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}`;
}
function timeLabel(iso: string) {
  const d = new Date(iso);
  return `soat ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}da`;
}
const CTABS = [
  { v: "msg", l: "Xabar", ph: "Xabar yozing…" },
  { v: "note", l: "Izoh", ph: "Ichki eslatma…" },
  { v: "act", l: "Faoliyat", ph: "Rejalashtirilgan faoliyat / eslatma…" },
] as const;

function Chatter({ dealId, className = "" }: { dealId: number; className?: string }) {
  const qc = useQueryClient();
  const [ctab, setCtab] = useState<"msg" | "note" | "act">("msg");
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const { data: events } = useQuery({ queryKey: ["deal-events", dealId], queryFn: () => api.get<DealEvent[]>(`/api/sales/deals/${dealId}/events`) });
  const post = useMutation({
    mutationFn: () => api.post(`/api/sales/deals/${dealId}/events`, { text: (ctab === "act" ? "Eslatma: " : "") + text.trim() }),
    onSuccess: () => { setText(""); setOpen(false); qc.invalidateQueries({ queryKey: ["deal-events", dealId] }); },
  });
  const cur = CTABS.find((c) => c.v === ctab)!;

  let lastDay = "";
  return (
    <Card className={`flex flex-col ${className}`}>
      {/* tabs */}
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        {CTABS.map((c) => (
          <button key={c.v} onClick={() => { setCtab(c.v); setOpen(true); }}
            className={`rounded-sm px-3 py-1.5 text-[13px] font-semibold ${ctab === c.v && open ? "bg-accent-bg text-accent-ink" : "text-ink-3 hover:bg-surface-2"}`}>
            {c.l}
          </button>
        ))}
      </div>

      {/* composer */}
      {open ? (
        <div className="border-b border-line p-3">
          <textarea rows={2} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={cur.ph}
            className="w-full resize-none rounded-sm border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent" />
          <div className="mt-1.5 flex justify-end gap-2">
            <button onClick={() => { setOpen(false); setText(""); }} className="font-mono text-[11px] text-ink-3 hover:underline">bekor</button>
            <Button size="sm" onClick={() => post.mutate()} disabled={!text.trim() || post.isPending}>Yuborish</Button>
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="border-b border-line px-4 py-2 text-left text-[12.5px] text-ink-4 hover:bg-surface-2">
          {cur.ph}
        </button>
      )}

      {/* timeline */}
      <div className="max-h-[560px] flex-1 space-y-3 overflow-auto p-3">
        {!events?.length && <div className="py-6 text-center font-mono text-[11px] text-ink-4">hali yozuv yoʻq</div>}
        {events?.map((e) => {
          const d = dayLabel(e.created_at);
          const showDay = d !== lastDay;
          lastDay = d;
          const ava = avatarFor(e.author_name ?? "System");
          const isNote = !EVENT_SYS(e.kind);
          return (
            <div key={e.id}>
              {showDay && <div className="mb-2 mt-1 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-ink-4">{d}</div>}
              <div className="flex gap-2.5">
                <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-[11px] font-bold text-white ${ava.color}`}>{ava.initials}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[12.5px] font-semibold text-ink">{e.author_name ?? "System"}</span>
                    <span className="font-mono text-[10px] text-ink-4">{timeLabel(e.created_at)}</span>
                  </div>
                  <div className={`mt-0.5 flex items-start gap-1.5 text-[12.5px] ${isNote ? "rounded-md border border-warn-line bg-warn-bg px-2.5 py-1.5 text-ink" : "text-ink-2"}`}>
                    <span className="text-[12px] leading-5">{EVENT_ICON[e.kind] ?? "•"}</span>
                    <span>{e.text}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ------------------------------ unit (Xonadon) modal ------------------------------ */
const PART_LABEL: Record<string, string> = {
  living: "Zal", bedroom: "Yotoq", kitchen: "Oshxona", balcony: "Balkon", bathroom: "Hammom", corridor: "Koridor", terrace: "Terrasa",
};
const UNIT_STATE_TONE: Record<string, "ok" | "warn" | "info" | "crit" | "muted"> = { free: "ok", hold: "warn", reserved: "info", sold: "crit" };

function UnitModal({ unitId, complexName, onClose }: { unitId: number; complexName: string | null; onClose: () => void }) {
  const { fmt, selected } = useCurrency();
  const { data: unit } = useQuery({ queryKey: ["unit", unitId], queryFn: () => api.get<Unit>(`/api/structure/units/${unitId}`) });
  const { data: types } = useQuery({ queryKey: ["unit-types"], queryFn: () => api.get<UnitType[]>("/api/structure/unit-types") });
  const layout = types?.find((t) => t.id === unit?.type_id) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg border border-line bg-surface shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <div className="text-base font-bold text-ink">Xonadon {unit?.number ?? ""}</div>
            <div className="font-mono text-[11px] text-ink-3">{complexName ?? ""}</div>
          </div>
          <button onClick={onClose} className="text-ink-3 hover:text-ink">✕</button>
        </div>
        {!unit ? <div className="p-6"><Spinner /></div> : (
          <div className="space-y-4 p-5">
            {layout && (
              <div>
                <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                  <span>Planirovka</span><span className="text-ink-2">{layout.name}</span>
                </div>
                {layout.image
                  ? <img src={`/api/structure/unit-types/${layout.id}/image`} alt={layout.name} className="w-full rounded border border-line-2 bg-white" />
                  : <div className="rounded border border-dashed border-line-2 py-8 text-center font-mono text-[11px] text-ink-4">rasm yoʻq</div>}
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
              <F l="Xonalar" v={`${unit.rooms}-xona`} />
              <F l="Holat" v={unit.status} />
              <F l="Umumiy" v={`${Number(unit.total_m2).toFixed(1)} m²`} />
              <F l="Billable" v={`${Number(unit.billable_m2).toFixed(1)} m²`} />
              {unit.view && <F l="Manzara" v={unit.view} />}
              {unit.decoration && <F l="Tamir" v={unit.decoration} />}
            </div>
            <div>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">Maydonlar</div>
              <div className="overflow-hidden rounded border border-line-2">
                {unit.parts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between border-b border-line-2 px-3 py-1.5 text-[12.5px] last:border-0">
                    <span className="text-ink-2">{PART_LABEL[p.kind] ?? p.kind}</span>
                    <span className="font-mono tnum text-ink">{p.m2} m²{Number(p.price_factor) !== 1 && <span className="ml-1 text-ink-4">×{p.price_factor}</span>}</span>
                  </div>
                ))}
                {!unit.parts.length && <div className="px-3 py-2 font-mono text-[11px] text-ink-4">maydon yoʻq</div>}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border border-line bg-surface-2 px-4 py-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-4">Narx ({selected?.code})</div>
                <div className="font-mono text-[10.5px] text-ink-3">{fmt(unit.price_per_m2)} / m²</div>
              </div>
              <StatusPill tone={UNIT_STATE_TONE[unit.status] ?? "muted"}>{unit.status}</StatusPill>
              <div className="font-mono tnum text-lg font-bold text-ink">{fmt(unit.price)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
