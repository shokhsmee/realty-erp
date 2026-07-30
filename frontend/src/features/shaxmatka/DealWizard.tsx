import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { Client, PaymentPlan, SchedulePreview, Unit, User } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/misc";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";

type Mode = "reserve" | "sign";
const DEAL_TYPES = [
  { v: "cash", l: "Naqd" }, { v: "installment", l: "Boʻlib toʻlash" }, { v: "mortgage", l: "Ipoteka" },
];

/** Profitbase-style deal builder: client + manager, a ready plan OR custom
 * terms (down/months/markup), a discount, and a booking expiry — with a live,
 * multi-currency payment schedule. Reserve (hold) or sign (sell). */
export function DealWizard({ unit, onClose, onDone, onCreated }: {
  unit: Unit; onClose: () => void; onDone: () => void;
  onCreated?: (dealId: number, mode: Mode) => void | Promise<void>;
}) {
  const qc = useQueryClient();
  const { me } = useAuth();
  const { fmt, toBase, selected } = useCurrency();
  const code = selected?.code ?? "";

  const [newClient, setNewClient] = useState(false);
  const [clientId, setClientId] = useState<number | "">("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [managerId, setManagerId] = useState<number | "">(me?.user.id ?? "");

  const [dealType, setDealType] = useState("installment");
  const [planId, setPlanId] = useState<number | null>(null);
  const [terms, setTerms] = useState({ down: "30", months: "12", markup: "0", day: "5" });
  const [disc, setDisc] = useState({ pct: "0", amt: "" });
  const [bookingDays, setBookingDays] = useState("3");
  const [error, setError] = useState<string | null>(null);

  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: () => api.get<Client[]>("/api/clients") });
  const { data: managers } = useQuery({ queryKey: ["assignable"], queryFn: () => api.get<User[]>("/api/users/assignable") });
  const { data: plans } = useQuery({ queryKey: ["plans"], queryFn: () => api.get<PaymentPlan[]>("/api/sales/plans") });
  const plansForType = (plans ?? []).filter((p) => p.deal_type === dealType && p.is_active);

  // Effective terms sent to the backend (discount amount entered in selected currency).
  const effective = useMemo(() => ({
    unit_id: unit.id,
    plan_id: planId,
    deal_type: dealType,
    down_payment_percent: Number(terms.down) || 0,
    term_months: Number(terms.months) || 0,
    markup_percent: Number(terms.markup) || 0,
    day_of_month: Number(terms.day) || 5,
    discount_percent: Number(disc.pct) || 0,
    discount_amount: disc.amt ? toBase(Number(disc.amt) || 0) : 0,
  }), [unit.id, planId, dealType, terms, disc, toBase]);

  const { data: preview, isFetching } = useQuery({
    queryKey: ["preview", effective],
    queryFn: () => api.post<SchedulePreview>("/api/sales/schedule-preview", effective),
  });

  const choosePlan = (id: number | null) => {
    setPlanId(id);
    if (id != null) {
      const p = plans?.find((x) => x.id === id);
      if (p) setTerms({ down: String(Number(p.down_payment_percent)), months: String(p.term_months), markup: String(Number(p.markup_percent)), day: String(p.day_of_month) });
    }
  };
  // Editing a term field switches to "custom" (drops the plan reference).
  const editTerm = (patch: Partial<typeof terms>) => { setTerms((t) => ({ ...t, ...patch })); setPlanId(null); };

  const mutation = useMutation({
    mutationFn: async (mode: Mode) => {
      let cid = clientId;
      if (newClient) {
        if (!name.trim()) throw new ApiError(400, "Mijoz ismini kiriting");
        cid = (await api.post<Client>("/api/clients", { full_name: name.trim(), phone: phone.trim() || null })).id;
      }
      if (cid === "") throw new ApiError(400, "Mijozni tanlang");
      const deal = await api.post<{ id: number }>("/api/sales/deals", {
        ...effective, client_id: cid, manager_id: managerId === "" ? null : managerId,
      });
      if (mode === "reserve") await api.post(`/api/sales/deals/${deal.id}/reserve`, { booking_days: Number(bookingDays) || 3 });
      else await api.post(`/api/sales/deals/${deal.id}/sign`, {});
      return { dealId: deal.id, mode };
    },
    onSuccess: async (res) => {
      if (res && onCreated) await onCreated(res.dealId, res.mode);
      await qc.invalidateQueries({ queryKey: ["tree"] });
      await qc.invalidateQueries({ queryKey: ["clients"] });
      await qc.invalidateQueries({ queryKey: ["deal-rows"] });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Xatolik yuz berdi"),
  });
  const run = (mode: Mode) => { setError(null); mutation.mutate(mode); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg border border-line bg-surface shadow-lg">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <div className="text-base font-bold">Yangi bitim · {unit.number}</div>
            <div className="font-mono text-[11px] text-ink-3">{unit.rooms}-xona · {unit.total_m2} m² · {fmt(unit.price)}</div>
          </div>
          <button onClick={onClose} className="text-ink-3 hover:text-ink">✕</button>
        </div>

        <div className="flex-1 space-y-4 overflow-auto p-5">
          {/* Client + manager */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Lbl>Mijoz</Lbl>
                <button className="font-mono text-[11px] text-accent hover:underline" onClick={() => { setNewClient((v) => !v); setError(null); }}>
                  {newClient ? "← Mavjud" : "+ Yangi"}
                </button>
              </div>
              {newClient ? (
                <div className="space-y-1.5">
                  <input className={FLD} placeholder="F.I.Sh" value={name} onChange={(e) => setName(e.target.value)} />
                  <input className={FLD} placeholder="Telefon" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              ) : (
                <select className={FLD} value={clientId} onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">Tanlang…</option>
                  {clients?.map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
                </select>
              )}
            </div>
            <div>
              <Lbl>Masʼul</Lbl>
              <select className={`${FLD} mt-1.5`} value={managerId} onChange={(e) => setManagerId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">—</option>
                {managers?.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
          </div>

          {/* Deal type */}
          <div>
            <Lbl>Toʻlov turi</Lbl>
            <div className="mt-1.5 flex gap-1.5">
              {DEAL_TYPES.map((d) => (
                <button key={d.v} onClick={() => { setDealType(d.v); setPlanId(null); }}
                  className={`flex-1 rounded-sm border px-3 py-1.5 text-[12.5px] font-semibold ${dealType === d.v ? "border-accent bg-accent text-white" : "border-line-strong bg-surface text-ink-2 hover:bg-surface-2"}`}>
                  {d.l}
                </button>
              ))}
            </div>
          </div>

          {/* Ready plan */}
          {plansForType.length > 0 && (
            <div>
              <Lbl>Tayyor shablon</Lbl>
              <select className={`${FLD} mt-1.5`} value={planId ?? ""} onChange={(e) => choosePlan(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Custom (qoʻlda sozlash)</option>
                {plansForType.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          {/* Terms — depend on deal type */}
          {dealType !== "cash" && (
            <div className="grid grid-cols-4 gap-2">
              <NumF label="Boshlangʻich %" v={terms.down} on={(v) => editTerm({ down: v })} />
              {dealType === "installment" && <NumF label="Muddat (oy)" v={terms.months} on={(v) => editTerm({ months: v })} />}
              {dealType === "installment" && <NumF label="Ustama %" v={terms.markup} on={(v) => editTerm({ markup: v })} />}
              {dealType === "installment" && <NumF label="Toʻlov kuni" v={terms.day} on={(v) => editTerm({ day: v })} />}
            </div>
          )}

          {/* Discount + booking */}
          <div className="grid grid-cols-3 gap-2">
            <NumF label="Chegirma %" v={disc.pct} on={(v) => setDisc({ ...disc, pct: v })} />
            <NumF label={`Chegirma (${code})`} v={disc.amt} on={(v) => setDisc({ ...disc, amt: v })} />
            <NumF label="Bron (kun)" v={bookingDays} on={setBookingDays} />
          </div>

          {/* Live schedule */}
          <div className="rounded-sm border border-line bg-surface-2 p-3">
            {isFetching && !preview ? <Spinner /> : preview ? (
              <>
                <div className="mb-2 grid grid-cols-3 gap-2 text-center text-[11px]">
                  <Stat l="Narx" v={fmt(preview.unit_price)} />
                  <Stat l="Chegirmadan keyin" v={fmt(preview.net_price)} tone={preview.net_price !== preview.unit_price ? "ok" : undefined} />
                  <Stat l="Jami (ustama b-n)" v={fmt(preview.total)} strong />
                </div>
                <div className="max-h-40 overflow-auto rounded border border-line-2 bg-surface">
                  {preview.lines.map((l) => (
                    <div key={l.seq} className="flex items-center justify-between border-b border-line-2 px-3 py-1.5 text-[12px] last:border-0">
                      <span className="font-mono text-ink-3">{l.seq === 0 ? l.kind : `#${l.seq}`} · {l.due_date}</span>
                      <span className="font-mono tnum text-ink">{fmt(l.amount)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <div className="font-mono text-[11px] text-ink-4">jadval hisoblanmadi</div>}
          </div>

          {error && <div className="rounded-sm border border-crit-line bg-crit-bg px-3 py-2 text-[12.5px] text-crit">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3.5">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={mutation.isPending}>Bekor</Button>
          <Button variant="secondary" size="sm" onClick={() => run("reserve")} disabled={mutation.isPending}>Bron qilish</Button>
          <Button size="sm" onClick={() => run("sign")} disabled={mutation.isPending}>{mutation.isPending ? "…" : "Shartnoma imzolash"}</Button>
        </div>
      </div>
    </div>
  );
}

const FLD = "w-full rounded-sm border border-line-strong bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent";
function Lbl({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">{children}</span>;
}
function NumF({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-4">{label}</span>
      <input value={v} onChange={(e) => on(e.target.value.replace(/[^\d.]/g, ""))} className="w-full rounded-sm border border-line-strong bg-surface px-2 py-1.5 font-mono text-[12.5px] outline-none focus:border-accent" />
    </label>
  );
}
function Stat({ l, v, strong, tone }: { l: string; v: string; strong?: boolean; tone?: "ok" }) {
  return (
    <div className="rounded-sm bg-surface px-1.5 py-1">
      <div className="text-[8.5px] uppercase tracking-[0.08em] text-ink-4">{l}</div>
      <div className={`font-mono tnum ${strong ? "text-[12px] font-bold text-ink" : tone === "ok" ? "text-ok" : "text-ink-2"}`}>{v}</div>
    </div>
  );
}
