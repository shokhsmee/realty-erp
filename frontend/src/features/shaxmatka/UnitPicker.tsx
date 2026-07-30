import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Complex, ComplexTree, Unit } from "@/lib/types";
import { EmptyState } from "@/components/ui/misc";
import { StatusPill } from "@/components/ui/StatusPill";
import { useCurrency } from "@/lib/currency";

/** Shaxmatka-style picker: choose a complex, search, pick a sellable unit.
 * Shared by the deals list ("+ Yangi bitim") and the CRM lead sales widget. */
export function UnitPicker({ onPick, onClose }: { onPick: (u: Unit) => void; onClose: () => void }) {
  const { fmt } = useCurrency();
  const [cxId, setCxId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const { data: complexes } = useQuery({ queryKey: ["complexes"], queryFn: () => api.get<Complex[]>("/api/structure/complexes") });
  const complexId = cxId ?? complexes?.[0]?.id ?? null;
  const { data: tree } = useQuery({ queryKey: ["tree", complexId], queryFn: () => api.get<ComplexTree>(`/api/structure/complexes/${complexId}/tree`), enabled: complexId != null });

  const rows = (tree?.blocks ?? [])
    .flatMap((b) => b.floors.flatMap((f) => f.units.map((u) => ({ block: b.name, floor: f.number, u }))))
    .filter((r) => ["free", "hold", "reserved"].includes(r.u.status))
    .filter((r) => (q ? r.u.number.toLowerCase().includes(q.toLowerCase()) : true))
    .sort((a, b) => a.block.localeCompare(b.block) || a.u.number.localeCompare(b.u.number));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg border border-line bg-surface shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="text-base font-bold text-ink">Xonadon tanlash · Shaxmatka</div>
          <button onClick={onClose} className="text-ink-3 hover:text-ink">✕</button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <select value={complexId ?? ""} onChange={(e) => setCxId(Number(e.target.value))}
            className="rounded-sm border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] font-semibold outline-none focus:border-accent">
            {complexes?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qidirish (raqam)…"
            className="flex-1 rounded-sm border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent" />
          <span className="font-mono text-[11px] text-ink-3">{rows.length} boʻsh</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {!rows.length ? <EmptyState>Sotiladigan xonadon yoʻq.</EmptyState> : (
            <div className="space-y-1">
              {rows.map((r) => (
                <button key={r.u.id} onClick={() => onPick(r.u)}
                  className="flex w-full items-center gap-3 rounded-sm border border-line-2 bg-surface px-3 py-2 text-left hover:border-accent hover:bg-accent-bg">
                  <span className="font-mono text-[13px] font-bold text-ink">{r.u.number}</span>
                  <span className="font-mono text-[11px] text-ink-3">{r.u.rooms}x · {Math.round(Number(r.u.total_m2))} m²</span>
                  <StatusPill tone={r.u.status === "free" ? "ok" : r.u.status === "reserved" ? "info" : "warn"}>{r.u.status}</StatusPill>
                  <span className="ml-auto font-mono text-[12px] font-semibold text-ink">{fmt(r.u.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
