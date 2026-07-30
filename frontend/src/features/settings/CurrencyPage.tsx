import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Currency, CurrencyRate } from "@/lib/types";
import { PageTitle, Card, Spinner, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { formatMoney } from "@/components/ui/Money";
import { useAuth } from "@/lib/auth";

const inp =
  "w-full rounded-sm border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent";
const today = () => new Date().toISOString().slice(0, 10);

export function CurrencyPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canManage = can("settings", "manage");
  const [selId, setSelId] = useState<number | null>(null);

  const { data: currencies, isLoading } = useQuery({
    queryKey: ["currencies"],
    queryFn: () => api.get<Currency[]>("/api/settings/currencies"),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["currencies"] });

  const selected =
    currencies?.find((c) => c.id === selId) ?? currencies?.find((c) => c.is_default) ?? currencies?.[0] ?? null;

  const base = currencies?.find((c) => c.is_base);
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      api.patch(`/api/settings/currencies/${id}`, body),
    onSuccess: refresh,
  });
  const del = useMutation({
    mutationFn: (id: number) => api.del(`/api/settings/currencies/${id}`),
    onSuccess: () => { setSelId(null); refresh(); },
  });

  if (isLoading) return <div className="flex justify-center pt-10"><Spinner /></div>;

  return (
    <div>
      <PageTitle title="Valyuta" sub="Valyutalar va kunlik kurslar — barcha narxlar shu asosda ko‘rsatiladi" />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* ------------- currencies list ------------- */}
        <div className="space-y-3">
          <Card className="p-3">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
              Valyutalar
            </div>
            <div className="space-y-1.5">
              {currencies?.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelId(c.id)}
                  className={`flex w-full items-center gap-2 rounded-sm border px-3 py-2 text-left ${
                    selected?.id === c.id ? "border-accent bg-accent-bg" : "border-line-2 bg-surface hover:bg-surface-2"
                  }`}
                >
                  <span className="font-mono text-[13px] font-bold text-ink">{c.code}</span>
                  <span className="text-[12px] text-ink-3">{c.name}</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    {c.is_base && <StatusPill tone="info">Baza</StatusPill>}
                    {c.is_default && <StatusPill tone="ok">Tanlangan</StatusPill>}
                    {!c.is_active && <StatusPill tone="muted">Nofaol</StatusPill>}
                    <span className="font-mono text-[11px] tnum text-ink-2">
                      {c.is_base ? "1" : c.latest_rate ? formatMoney(c.latest_rate) : "—"}
                    </span>
                  </div>
                </button>
              ))}
              {!currencies?.length && <EmptyState>Valyuta yo‘q.</EmptyState>}
            </div>
          </Card>

          {canManage && <AddCurrencyCard onDone={(c) => { refresh(); setSelId(c.id); }} baseCode={base?.code} />}
        </div>

        {/* ------------- selected currency: rates by day ------------- */}
        {selected ? (
          <div className="space-y-3">
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <div>
                  <div className="text-lg font-bold text-ink">
                    {selected.code} <span className="text-ink-3">{selected.symbol}</span>
                  </div>
                  <div className="text-[12px] text-ink-3">{selected.name}</div>
                </div>
                {canManage && (
                  <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    <Button size="sm" variant={selected.is_default ? "secondary" : "ghost"}
                      onClick={() => patch.mutate({ id: selected.id, body: { is_default: true } })}
                      disabled={selected.is_default}>★ Tanlangan qilish</Button>
                    <Button size="sm" variant="ghost"
                      onClick={() => patch.mutate({ id: selected.id, body: { is_base: true } })}
                      disabled={selected.is_base}
                      title="Barcha narxlar shu valyutada saqlanadi">Baza qilish</Button>
                    <Button size="sm" variant="ghost"
                      onClick={() => patch.mutate({ id: selected.id, body: { is_active: !selected.is_active } })}>
                      {selected.is_active ? "Faolsizlantirish" : "Faollashtirish"}
                    </Button>
                    {!selected.is_base && (
                      <button onClick={() => confirm(`${selected.code} o‘chirilsinmi?`) && del.mutate(selected.id)}
                        className="px-1.5 font-mono text-ink-3 hover:text-crit">🗑</button>
                    )}
                  </div>
                )}
              </div>
              {selected.is_base && (
                <p className="mt-3 rounded-sm border border-accent/30 bg-accent-bg px-3 py-2 text-[12px] text-accent-ink">
                  Baza valyuta — barcha narxlar shu valyutada saqlanadi, kursi doim 1.
                </p>
              )}
            </Card>

            {!selected.is_base && (
              <RatesCard currency={selected} canManage={canManage} baseCode={base?.code} />
            )}
          </div>
        ) : (
          <EmptyState>Valyuta tanlang.</EmptyState>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ add currency ------------------------------ */
function AddCurrencyCard({ onDone, baseCode }: { onDone: (c: Currency) => void; baseCode?: string }) {
  const [f, setF] = useState({ code: "", name: "", symbol: "", rate: "" });
  const add = useMutation({
    mutationFn: () =>
      api.post<Currency>("/api/settings/currencies", {
        code: f.code.trim().toUpperCase(),
        name: f.name.trim(),
        symbol: f.symbol.trim(),
        rate: f.rate ? Number(f.rate) : null,
      }),
    onSuccess: (c) => { setF({ code: "", name: "", symbol: "", rate: "" }); onDone(c); },
  });
  return (
    <Card className="p-3">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
        + Yangi valyuta
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="Kod (USD)" className={`${inp} font-mono uppercase`} />
        <input value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })} placeholder="Belgi ($)" className={inp} />
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Nomi (US Dollar)" className={`${inp} col-span-2`} />
        <div className="col-span-2 flex items-center gap-2">
          <input value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value.replace(/[^\d.]/g, "") })}
            placeholder={`Kurs (1 birlik = ? ${baseCode ?? "baza"})`} className={`${inp} font-mono`} />
        </div>
      </div>
      <div className="mt-2 flex justify-end">
        <Button size="sm" onClick={() => add.mutate()} disabled={!f.code.trim() || !f.name.trim() || add.isPending}>
          + Qo‘shish
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------ daily rates ------------------------------ */
function RatesCard({ currency, canManage, baseCode }: { currency: Currency; canManage: boolean; baseCode?: string }) {
  const qc = useQueryClient();
  const key = ["rates", currency.id];
  const { data: rates } = useQuery({
    queryKey: key,
    queryFn: () => api.get<CurrencyRate[]>(`/api/settings/currencies/${currency.id}/rates`),
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["currencies"] }); };
  const [f, setF] = useState({ rate: "", day: today() });
  const add = useMutation({
    mutationFn: () => api.post(`/api/settings/currencies/${currency.id}/rates`, { rate: Number(f.rate), day: f.day }),
    onSuccess: () => { setF({ rate: "", day: today() }); refresh(); },
  });
  const del = useMutation({
    mutationFn: (id: number) => api.del(`/api/settings/rates/${id}`),
    onSuccess: refresh,
  });

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">Kurs — kun bo‘yicha</span>
        <span className="font-mono text-[10px] text-ink-4">1 {currency.code} = X {baseCode ?? "baza"}</span>
      </div>

      {canManage && (
        <div className="mb-3 flex flex-wrap items-end gap-2 border-b border-line pb-3">
          <label className="flex flex-col gap-0.5">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-3">Sana</span>
            <input type="date" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })}
              className="rounded-sm border border-line-strong bg-surface px-2 py-1.5 font-mono text-[13px] outline-none focus:border-accent" />
          </label>
          <label className="flex flex-1 flex-col gap-0.5">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-3">Kurs</span>
            <input value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value.replace(/[^\d.]/g, "") })}
              placeholder="12650" className={`${inp} font-mono`} />
          </label>
          <Button size="sm" onClick={() => add.mutate()} disabled={!f.rate || add.isPending}>+ Kurs qo‘shish</Button>
        </div>
      )}

      <div className="max-h-64 space-y-1 overflow-auto">
        {rates?.map((r, i) => (
          <div key={r.id} className={`flex items-center gap-3 rounded-sm border px-3 py-1.5 text-[13px] ${
            i === 0 ? "border-accent/40 bg-accent-bg" : "border-line-2 bg-surface"
          }`}>
            <span className="font-mono text-[12px] text-ink-2">{r.day}</span>
            {i === 0 && <StatusPill tone="ok">Joriy</StatusPill>}
            <span className="ml-auto font-mono tnum font-semibold text-ink">{formatMoney(r.rate)}</span>
            {canManage && (
              <button onClick={() => del.mutate(r.id)} className="font-mono text-ink-3 hover:text-crit">✕</button>
            )}
          </div>
        ))}
        {!rates?.length && <div className="rounded-sm border border-dashed border-line-2 py-3 text-center font-mono text-[11px] text-ink-4">kurs yo‘q</div>}
      </div>
    </Card>
  );
}
