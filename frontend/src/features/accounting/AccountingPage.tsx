import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AcctSummary, DebtorRow, PaymentRow } from "@/lib/types";
import { PageTitle, Card, Spinner, EmptyState } from "@/components/ui/misc";
import { formatMoney } from "@/components/ui/Money";
import { StatusPill } from "@/components/ui/StatusPill";

type Tab = "dashboard" | "debtors" | "register";

const TABS: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "debtors", label: "Qarzdorlar" },
  { key: "register", label: "Rassrochka" },
];

// Payment status → pill tone.
const PAY_TONE: Record<string, "ok" | "warn" | "crit" | "muted"> = {
  paid: "ok",
  pending: "warn",
  overdue: "crit",
  planned: "muted",
};

export function AccountingPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  return (
    <div>
      <PageTitle title="Buxgalteriya" sub="Accounting" />
      <div className="mb-4 inline-flex rounded-sm border border-line bg-surface-3 p-0.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-sm px-3.5 py-1.5 font-mono text-[11.5px] font-semibold ${
              tab === t.key ? "bg-surface text-ink shadow-sm" : "text-ink-3"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "dashboard" && <Dashboard />}
      {tab === "debtors" && <Debtors />}
      {tab === "register" && <Register />}
    </div>
  );
}

function Tile({ label, value, tone, cur = true }: { label: string; value: string; tone?: string; cur?: boolean }) {
  return (
    <Card className="p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">{label}</div>
      <div className={`mt-1 font-mono tnum text-xl font-bold ${tone ?? "text-ink"}`}>
        {formatMoney(value)}
        {cur && <span className="ml-1 text-[0.6em] font-medium text-ink-3">UZS</span>}
      </div>
    </Card>
  );
}

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["acct-summary"],
    queryFn: () => api.get<AcctSummary>("/api/accounting/summary"),
  });
  if (isLoading) return <Spinner />;
  if (!data) return <EmptyState>Maʼlumot yoʻq.</EmptyState>;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <Tile label="Reja (jami)" value={data.planned_total} />
      <Tile label="Yigʻilgan (jami)" value={data.collected_total} tone="text-ok" />
      <Tile label="Qoldiq" value={data.outstanding_total} />
      <Tile label="Bu oy reja" value={data.planned_month} />
      <Tile label="Bu oy yigʻildi" value={data.collected_month} tone="text-ok" />
      <Card className="p-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">Qarzdorlik</div>
        <div className="mt-1 font-mono tnum text-xl font-bold text-crit">
          {formatMoney(data.overdue_total)}
          <span className="ml-1 text-[0.6em] font-medium text-ink-3">UZS</span>
        </div>
        <div className="mt-1 font-mono text-[11px] text-ink-3">{data.overdue_count} ta toʻlov</div>
      </Card>
    </div>
  );
}

function Debtors() {
  const { data, isLoading } = useQuery({
    queryKey: ["acct-debtors"],
    queryFn: () => api.get<DebtorRow[]>("/api/accounting/debtors"),
  });
  if (isLoading) return <Spinner />;
  if (!data?.length) return <EmptyState>Qarzdorlar yoʻq — hammasi muddatida. 🎉</EmptyState>;
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-surface-2 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
            <th className="px-4 py-2.5">Mijoz</th>
            <th className="px-4 py-2.5">Xonadon</th>
            <th className="px-4 py-2.5 text-right">Qarz</th>
            <th className="px-4 py-2.5 text-right">Toʻlovlar</th>
            <th className="px-4 py-2.5 text-right">Kechikish</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.client_id} className="border-t border-line-2" style={{ background: "linear-gradient(90deg,var(--crit-bg),transparent 30%)" }}>
              <td className="px-4 py-2.5 font-semibold text-ink">{d.client_name}</td>
              <td className="px-4 py-2.5 font-mono text-ink-2">{d.unit_number}</td>
              <td className="px-4 py-2.5 text-right font-mono tnum font-semibold text-crit">{formatMoney(d.overdue_amount)}</td>
              <td className="px-4 py-2.5 text-right font-mono tnum text-ink-2">{d.overdue_count}</td>
              <td className="px-4 py-2.5 text-right font-mono tnum text-crit">{d.days_overdue} kun</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Register() {
  const [status, setStatus] = useState("all");
  const { data, isLoading } = useQuery({
    queryKey: ["acct-register", status],
    queryFn: () => api.get<PaymentRow[]>(`/api/accounting/payments?status=${status}`),
  });
  return (
    <div>
      <div className="mb-3">
        <select
          className="rounded-sm border border-line-strong bg-surface px-2 py-1 text-[12px] outline-none focus:border-accent"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">Barcha toʻlovlar</option>
          <option value="overdue">Kechikkan</option>
          <option value="pending">Bugun</option>
          <option value="planned">Rejada</option>
          <option value="paid">Toʻlangan</option>
        </select>
      </div>
      {isLoading ? (
        <Spinner />
      ) : !data?.length ? (
        <EmptyState>Toʻlovlar yoʻq.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0">
                <tr className="bg-surface-2 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
                  <th className="px-4 py-2.5">Mijoz</th>
                  <th className="px-4 py-2.5">Xonadon</th>
                  <th className="px-4 py-2.5">Sana</th>
                  <th className="px-4 py-2.5 text-right">Summa</th>
                  <th className="px-4 py-2.5 text-right">Qoldiq</th>
                  <th className="px-4 py-2.5">Holat</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id} className="border-t border-line-2">
                    <td className="px-4 py-2 text-ink">{p.client_name}</td>
                    <td className="px-4 py-2 font-mono text-ink-2">{p.unit_number}</td>
                    <td className="px-4 py-2 font-mono text-ink-2">{p.due_date}</td>
                    <td className="px-4 py-2 text-right font-mono tnum text-ink">{formatMoney(p.amount)}</td>
                    <td className="px-4 py-2 text-right font-mono tnum text-ink-2">{formatMoney(p.remaining)}</td>
                    <td className="px-4 py-2">
                      <StatusPill tone={PAY_TONE[p.status] ?? "muted"}>
                        {p.status}
                        {p.overdue_days > 0 ? ` ${p.overdue_days}k` : ""}
                      </StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
