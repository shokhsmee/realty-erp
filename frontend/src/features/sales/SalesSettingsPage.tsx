import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PaymentPlan, PaymentMethod } from "@/lib/types";
import { PageTitle, Card, Spinner, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { useAuth } from "@/lib/auth";

const inp = "rounded-sm border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent";
const DEAL_TYPES = [
  { v: "cash", l: "Naqd" }, { v: "installment", l: "Boʻlib toʻlash" }, { v: "mortgage", l: "Ipoteka" },
];
const DT_LABEL: Record<string, string> = Object.fromEntries(DEAL_TYPES.map((d) => [d.v, d.l]));

export function SalesSettingsPage() {
  const { can } = useAuth();
  const canManage = can("deals", "manage");
  if (!canManage) return <div><PageTitle title="Sotuv sozlamalari" /><EmptyState>Ruxsat yoʻq.</EmptyState></div>;
  return (
    <div>
      <PageTitle title="Sotuv sozlamalari" sub="Toʻlov turlari va usullari — naqd / boʻlib toʻlash / ipoteka" />
      <div className="grid gap-4 lg:grid-cols-2">
        <PlansCard />
        <MethodsCard />
      </div>
    </div>
  );
}

/* ------------------------------ plans ------------------------------ */
function PlansCard() {
  const qc = useQueryClient();
  const { data: plans, isLoading } = useQuery({ queryKey: ["plans"], queryFn: () => api.get<PaymentPlan[]>("/api/sales/plans") });
  const refresh = () => qc.invalidateQueries({ queryKey: ["plans"] });
  const blank = { name: "", deal_type: "installment", down_payment_percent: "30", term_months: "12", markup_percent: "0", day_of_month: "5" };
  const [f, setF] = useState(blank);
  const add = useMutation({
    mutationFn: () => api.post("/api/sales/plans", {
      name: f.name.trim(), deal_type: f.deal_type,
      down_payment_percent: Number(f.down_payment_percent) || 0, term_months: Number(f.term_months) || 0,
      markup_percent: Number(f.markup_percent) || 0, day_of_month: Number(f.day_of_month) || 5,
    }),
    onSuccess: () => { setF(blank); refresh(); },
  });
  const patch = useMutation({ mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => api.patch(`/api/sales/plans/${id}`, body), onSuccess: refresh });
  const del = useMutation({ mutationFn: (id: number) => api.del(`/api/sales/plans/${id}`), onSuccess: refresh });

  return (
    <Card className="p-3">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">Toʻlov turlari (planlar)</div>
      {isLoading ? <Spinner /> : (
        <div className="mb-3 overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead><tr className="border-b border-line text-left font-mono text-[9.5px] uppercase text-ink-3">
              <th className="px-2 py-1.5">Nomi</th><th className="px-2 py-1.5">Tur</th><th className="px-2 py-1.5 text-right">Boshlangʻich</th>
              <th className="px-2 py-1.5 text-right">Oy</th><th className="px-2 py-1.5 text-right">Ustama</th><th className="px-2 py-1.5 text-right">Kun</th>
              <th className="px-2 py-1.5">Holat</th><th></th>
            </tr></thead>
            <tbody>
              {plans?.map((p) => (
                <tr key={p.id} className="border-b border-line-2">
                  <td className="px-2 py-1.5 font-semibold text-ink">{p.name}</td>
                  <td className="px-2 py-1.5 text-ink-2">{DT_LABEL[p.deal_type] ?? p.deal_type}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{Number(p.down_payment_percent)}%</td>
                  <td className="px-2 py-1.5 text-right font-mono">{p.term_months}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{Number(p.markup_percent)}%</td>
                  <td className="px-2 py-1.5 text-right font-mono">{p.day_of_month}</td>
                  <td className="px-2 py-1.5">
                    <button onClick={() => patch.mutate({ id: p.id, body: { is_active: !p.is_active } })}>
                      <StatusPill tone={p.is_active ? "ok" : "muted"}>{p.is_active ? "Faol" : "Nofaol"}</StatusPill>
                    </button>
                  </td>
                  <td className="px-2 py-1.5 text-right"><button onClick={() => del.mutate(p.id)} className="font-mono text-ink-3 hover:text-crit">🗑</button></td>
                </tr>
              ))}
              {!plans?.length && <tr><td colSpan={8} className="py-4 text-center font-mono text-[11px] text-ink-4">plan yoʻq</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Nomi (12 oy 0%)" className={`${inp} flex-1`} />
        <select value={f.deal_type} onChange={(e) => setF({ ...f, deal_type: e.target.value })} className={inp}>
          {DEAL_TYPES.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
        </select>
        <NumF label="Bosh %" v={f.down_payment_percent} on={(v) => setF({ ...f, down_payment_percent: v })} />
        <NumF label="Oy" v={f.term_months} on={(v) => setF({ ...f, term_months: v })} />
        <NumF label="Ustama %" v={f.markup_percent} on={(v) => setF({ ...f, markup_percent: v })} />
        <NumF label="Kun" v={f.day_of_month} on={(v) => setF({ ...f, day_of_month: v })} />
        <Button size="sm" onClick={() => add.mutate()} disabled={!f.name.trim() || add.isPending}>+ Qoʻshish</Button>
      </div>
    </Card>
  );
}

/* ------------------------------ methods ------------------------------ */
function MethodsCard() {
  const qc = useQueryClient();
  const { data: methods, isLoading } = useQuery({ queryKey: ["payment-methods"], queryFn: () => api.get<PaymentMethod[]>("/api/sales/payment-methods") });
  const refresh = () => qc.invalidateQueries({ queryKey: ["payment-methods"] });
  const blank = { name: "", key: "", fee_percent: "0" };
  const [f, setF] = useState(blank);
  const add = useMutation({
    mutationFn: () => api.post("/api/sales/payment-methods", { name: f.name.trim(), key: f.key.trim() || f.name.trim().toLowerCase().replace(/\s+/g, "_"), fee_percent: Number(f.fee_percent) || 0 }),
    onSuccess: () => { setF(blank); refresh(); },
  });
  const patch = useMutation({ mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => api.patch(`/api/sales/payment-methods/${id}`, body), onSuccess: refresh });
  const del = useMutation({ mutationFn: (id: number) => api.del(`/api/sales/payment-methods/${id}`), onSuccess: refresh });

  return (
    <Card className="p-3">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">Toʻlov usullari</div>
      {isLoading ? <Spinner /> : (
        <div className="mb-3 space-y-1.5">
          {methods?.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-sm border border-line-2 bg-surface px-3 py-2 text-[13px]">
              <span className="font-semibold text-ink">{m.name}</span>
              <span className="font-mono text-[10px] text-ink-4">{m.key}</span>
              {Number(m.fee_percent) > 0 && <span className="font-mono text-[11px] text-warn">+{Number(m.fee_percent)}%</span>}
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => patch.mutate({ id: m.id, body: { is_active: !m.is_active } })}>
                  <StatusPill tone={m.is_active ? "ok" : "muted"}>{m.is_active ? "Faol" : "Nofaol"}</StatusPill>
                </button>
                <button onClick={() => del.mutate(m.id)} className="font-mono text-ink-3 hover:text-crit">🗑</button>
              </div>
            </div>
          ))}
          {!methods?.length && <EmptyState>usul yoʻq</EmptyState>}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Nomi (Naqd / Karta)" className={`${inp} flex-1`} />
        <input value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} placeholder="key (ixtiyoriy)" className={`${inp} w-28`} />
        <NumF label="Komissiya %" v={f.fee_percent} on={(v) => setF({ ...f, fee_percent: v })} />
        <Button size="sm" onClick={() => add.mutate()} disabled={!f.name.trim() || add.isPending}>+ Qoʻshish</Button>
      </div>
    </Card>
  );
}

function NumF({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-4">{label}</span>
      <input value={v} onChange={(e) => on(e.target.value.replace(/[^\d.]/g, ""))} className={`${inp} w-20 font-mono`} />
    </label>
  );
}
