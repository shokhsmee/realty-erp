import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PaymentPlan, SchedulePreview, Unit, UnitType } from "@/lib/types";
import { formatMoney } from "@/components/ui/Money";
import { StatusPill, UNIT_TONE } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/misc";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { DealWizard } from "@/features/shaxmatka/DealWizard";

const KIND_LABEL: Record<string, string> = {
  living: "Zal",
  bedroom: "Yotoq",
  kitchen: "Oshxona",
  balcony: "Balkon",
  bathroom: "Hammom",
  corridor: "Koridor",
  terrace: "Terrasa",
};

export function UnitPanel({
  unit,
  layout,
  onClose,
}: {
  unit: Unit;
  layout?: UnitType | null;
  onClose: () => void;
}) {
  const { can } = useAuth();
  const { fmt, selected } = useCurrency();
  const [planId, setPlanId] = useState<number | "">("");
  const [preview, setPreview] = useState<SchedulePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const { data: plans } = useQuery({
    queryKey: ["plans"],
    queryFn: () => api.get<PaymentPlan[]>("/api/sales/plans"),
    enabled: can("deals", "view"),
  });

  async function runPreview() {
    if (planId === "") return;
    setLoadingPreview(true);
    setPreview(null);
    try {
      setPreview(
        await api.post<SchedulePreview>("/api/sales/schedule-preview", {
          unit_id: unit.id,
          plan_id: planId,
        }),
      );
    } finally {
      setLoadingPreview(false);
    }
  }

  return (
    <aside className="flex h-full w-full max-w-[360px] flex-col border-l border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-3">
        <div>
          <div className="text-base font-bold">{unit.number}</div>
          <div className="font-mono text-[11px] text-ink-3">
            {unit.rooms}-xona · {unit.total_m2} m²
          </div>
        </div>
        <StatusPill tone={UNIT_TONE[unit.status] ?? "muted"}>{unit.status}</StatusPill>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* planirovka (layout) image */}
        {layout && (
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
              <span>Planirovka</span>
              <span className="text-ink-2">{layout.name}</span>
            </div>
            {layout.image ? (
              <img
                src={`/api/structure/unit-types/${layout.id}/image`}
                alt={layout.name}
                className="w-full rounded border border-line-2 bg-white"
              />
            ) : (
              <div className="rounded border border-dashed border-line-2 py-8 text-center font-mono text-[11px] text-ink-4">
                rasm yoʻq
              </div>
            )}
          </div>
        )}

        {/* m² breakdown */}
        <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
          Maydon boʻyicha
        </div>
        <div className="mb-4 overflow-hidden rounded border border-line-2">
          {unit.parts.length === 0 && (
            <div className="px-3 py-2 text-[12px] text-ink-3">Qismlar kiritilmagan</div>
          )}
          {unit.parts.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between border-b border-line-2 px-3 py-1.5 text-[12.5px] last:border-0"
            >
              <span className="text-ink-2">{KIND_LABEL[p.kind] ?? p.kind}</span>
              <span className="font-mono tnum text-ink">
                {p.m2} m²
                {Number(p.price_factor) !== 1 && (
                  <span className="ml-1 text-ink-4">×{p.price_factor}</span>
                )}
              </span>
            </div>
          ))}
        </div>

        {/* price */}
        <div className="mb-4 rounded border border-line bg-surface-2 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] text-ink-2">Narx</span>
            <span className="font-mono tnum text-lg font-semibold text-ink">{fmt(unit.price)}</span>
          </div>
          <div className="mt-1 text-right font-mono text-[10.5px] text-ink-3">
            {fmt(unit.price_per_m2)} / m² · billable {unit.billable_m2} m²
            {selected && !selected.is_base && (
              <span className="ml-1 text-ink-4">· {formatMoney(unit.price)} soʻm</span>
            )}
          </div>
        </div>

        {/* schedule preview */}
        {can("deals", "view") && (
          <div>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
              Toʻlov jadvali (preview)
            </div>
            <div className="flex gap-2">
              <select
                className="flex-1 rounded-sm border border-line-strong bg-surface px-2 py-1.5 text-[12.5px] outline-none focus:border-accent"
                value={planId}
                onChange={(e) => setPlanId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">Plan tanlang…</option>
                {plans?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={runPreview} disabled={planId === ""}>
                Hisoblash
              </Button>
            </div>

            {loadingPreview && (
              <div className="mt-3">
                <Spinner />
              </div>
            )}

            {preview && (
              <div className="mt-3">
                <div className="mb-2 flex items-center justify-between rounded-sm bg-accent-bg px-3 py-1.5 text-[12px] text-accent-ink">
                  <span>Umumiy</span>
                  <span className="font-mono tnum font-semibold">{fmt(preview.total)}</span>
                </div>
                <div className="max-h-52 overflow-auto rounded border border-line-2">
                  {preview.lines.map((l) => (
                    <div
                      key={l.seq}
                      className="flex items-center justify-between border-b border-line-2 px-3 py-1.5 text-[12px] last:border-0"
                    >
                      <span className="font-mono text-ink-3">
                        {l.seq === 0 ? l.kind : `#${l.seq}`} · {l.due_date}
                      </span>
                      <span className="font-mono tnum text-ink">{formatMoney(l.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-line bg-surface-2 px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Yopish
        </Button>
        {can("deals", "edit") && (
          <Button size="sm" disabled={unit.status === "sold"} onClick={() => setWizardOpen(true)}>
            Deal boshlash
          </Button>
        )}
      </div>

      {wizardOpen && (
        <DealWizard
          unit={unit}
          onClose={() => setWizardOpen(false)}
          onDone={() => {
            setWizardOpen(false);
            onClose(); // unit status changed — close the (now stale) panel
          }}
        />
      )}
    </aside>
  );
}
