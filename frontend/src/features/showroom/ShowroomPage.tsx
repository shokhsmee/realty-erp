import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Complex, ComplexTree, Unit } from "@/lib/types";
import { PageTitle, Spinner, EmptyState, Card } from "@/components/ui/misc";
import { Money, formatMoney } from "@/components/ui/Money";
import { StatusPill, UNIT_TONE } from "@/components/ui/StatusPill";
import { Building3D } from "@/features/showroom/Building3D";

// Unit status → a CSS color token used to fill the "window".
const STATUS_TOKEN: Record<string, string> = {
  free: "ok",
  hold: "warn",
  reserved: "accent",
  sold: "crit",
};

// SVG geometry.
const CELL_W = 44;
const CELL_H = 26;
const GAP = 7;
const PAD = 22;
const LABEL_W = 26;
const ROOF_H = 34;

export function ShowroomPage() {
  const [selected, setSelected] = useState<Unit | null>(null);
  const [blockId, setBlockId] = useState<number | null>(null);
  const [view, setView] = useState<"3d" | "2d">("3d");

  const { data: complexes, isLoading: l1 } = useQuery({
    queryKey: ["complexes"],
    queryFn: () => api.get<Complex[]>("/api/structure/complexes"),
  });
  const complexId = complexes?.[0]?.id;

  const { data: tree, isLoading: l2 } = useQuery({
    queryKey: ["tree", complexId],
    queryFn: () => api.get<ComplexTree>(`/api/structure/complexes/${complexId}/tree`),
    enabled: complexId != null,
  });

  const block = useMemo(() => {
    if (!tree?.blocks.length) return null;
    return tree.blocks.find((b) => b.id === blockId) ?? tree.blocks[0];
  }, [tree, blockId]);

  // Floors top-first for a building elevation.
  const floors = useMemo(
    () => (block ? [...block.floors].sort((a, b) => b.number - a.number) : []),
    [block],
  );
  const maxUnits = useMemo(
    () => floors.reduce((m, f) => Math.max(m, f.units.length), 0),
    [floors],
  );

  if (l1 || l2)
    return (
      <div className="flex justify-center pt-10">
        <Spinner label="Showroom yuklanmoqda…" />
      </div>
    );
  if (!complexes?.length || !block)
    return (
      <div>
        <PageTitle title="Showroom" />
        <EmptyState>Majmua topilmadi — demo seed ishga tushiring.</EmptyState>
      </div>
    );

  const svgW = LABEL_W + PAD * 2 + maxUnits * (CELL_W + GAP);
  const svgH = ROOF_H + PAD * 2 + floors.length * (CELL_H + GAP);

  return (
    <div className="flex h-full min-h-0 gap-4">
      <div className="flex min-w-0 flex-1 flex-col">
        <PageTitle title={`Showroom · ${tree?.name}`} sub={`Blok ${block.name} — bino koʻrinishi`} />

        <div className="mb-3 flex items-center gap-2">
          <div className="inline-flex rounded-sm border border-line bg-surface-3 p-0.5">
            {tree?.blocks.map((b) => (
              <button
                key={b.id}
                onClick={() => {
                  setBlockId(b.id);
                  setSelected(null);
                }}
                className={`rounded-sm px-3 py-1 font-mono text-[11.5px] font-semibold ${
                  b.id === block.id ? "bg-surface text-ink shadow-sm" : "text-ink-3"
                }`}
              >
                Blok {b.name}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-sm border border-line bg-surface-3 p-0.5">
            {(["3d", "2d"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-sm px-3 py-1 font-mono text-[11.5px] font-semibold uppercase ${
                  view === v ? "bg-surface text-ink shadow-sm" : "text-ink-3"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <StatusPill tone="ok">Boʻsh</StatusPill>
            <StatusPill tone="info">Bron</StatusPill>
            <StatusPill tone="warn">Band</StatusPill>
            <StatusPill tone="crit">Sotilgan</StatusPill>
          </div>
        </div>

        {/* Building — 3D scene or 2D elevation */}
        <Card className="relative min-h-[460px] flex-1 overflow-hidden p-0">
          {view === "3d" ? (
            <Building3D block={block} selectedId={selected?.id ?? null} onSelect={setSelected} />
          ) : (
          <div className="h-full overflow-auto p-4">
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            width="100%"
            style={{ maxWidth: svgW, display: "block", margin: "0 auto" }}
            role="img"
            aria-label="Building elevation"
          >
            {/* Roof */}
            <polygon
              points={`${LABEL_W + PAD - 6},${ROOF_H + 2} ${svgW / 2},4 ${svgW - PAD + 6},${ROOF_H + 2}`}
              fill="var(--ink)"
              opacity="0.85"
            />
            {/* Building body */}
            <rect
              x={LABEL_W + PAD - 8}
              y={ROOF_H}
              width={svgW - LABEL_W - PAD * 2 + 16}
              height={svgH - ROOF_H - PAD + 4}
              rx="4"
              fill="var(--surface-2)"
              stroke="var(--line-strong)"
            />
            {floors.map((floor, i) => {
              const y = ROOF_H + PAD + i * (CELL_H + GAP);
              return (
                <g key={floor.id}>
                  <text
                    x={LABEL_W - 4}
                    y={y + CELL_H / 2 + 3}
                    textAnchor="end"
                    fontSize="10"
                    fontFamily="ui-monospace, monospace"
                    fill="var(--ink-3)"
                  >
                    {floor.number}
                  </text>
                  {floor.units.map((u, j) => {
                    const token = STATUS_TOKEN[u.status] ?? "line";
                    const x = LABEL_W + PAD + j * (CELL_W + GAP);
                    const isSel = selected?.id === u.id;
                    return (
                      <g
                        key={u.id}
                        onClick={() => setSelected(u)}
                        style={{ cursor: "pointer" }}
                      >
                        <title>{`${u.number} · ${u.status} · ${formatMoney(u.price)} UZS`}</title>
                        <rect
                          x={x}
                          y={y}
                          width={CELL_W}
                          height={CELL_H}
                          rx="3"
                          fill={`var(--${token}-bg)`}
                          stroke={isSel ? "var(--ink)" : `var(--${token}-line)`}
                          strokeWidth={isSel ? 2 : 1}
                        />
                        {/* window mullions for a "glazed" look */}
                        <line x1={x + CELL_W / 2} y1={y + 3} x2={x + CELL_W / 2} y2={y + CELL_H - 3} stroke={`var(--${token})`} strokeWidth="0.75" opacity="0.5" />
                        <text
                          x={x + CELL_W / 2}
                          y={y + CELL_H / 2 + 3}
                          textAnchor="middle"
                          fontSize="8.5"
                          fontFamily="ui-monospace, monospace"
                          fill={`var(--${token})`}
                          style={{ fontWeight: 700 }}
                        >
                          {u.number.replace(/^.*-/, "")}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
          </div>
          )}
        </Card>
      </div>

      {/* Unit detail */}
      {selected && (
        <aside className="flex w-full max-w-[320px] flex-col rounded-lg border border-line bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-3">
            <div>
              <div className="text-base font-bold">{selected.number}</div>
              <div className="font-mono text-[11px] text-ink-3">
                {selected.rooms}-xona · {selected.total_m2} m²
              </div>
            </div>
            <StatusPill tone={UNIT_TONE[selected.status] ?? "muted"}>{selected.status}</StatusPill>
          </div>
          <div className="flex-1 p-4">
            <div className="rounded border border-line bg-surface-2 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] text-ink-2">Narx</span>
                <Money value={selected.price} className="text-lg" />
              </div>
              <div className="mt-1 text-right font-mono text-[10.5px] text-ink-3">
                {formatMoney(selected.price_per_m2)} / m²
              </div>
            </div>
            {selected.view && (
              <div className="mt-3 font-mono text-[11px] text-ink-3">Manzara: {selected.view}</div>
            )}
          </div>
          <div className="border-t border-line px-4 py-3 text-right">
            <button
              onClick={() => setSelected(null)}
              className="font-mono text-[11px] text-ink-3 hover:text-ink"
            >
              Yopish
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
