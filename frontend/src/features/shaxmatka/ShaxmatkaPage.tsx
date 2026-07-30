import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Complex, ComplexTree, Unit, UnitType } from "@/lib/types";
import { PageTitle, Spinner, EmptyState } from "@/components/ui/misc";
import { useCurrency } from "@/lib/currency";
import { UnitPanel } from "@/features/shaxmatka/UnitPanel";

const CELL_STYLE: Record<string, string> = {
  free: "border-ok-line bg-ok-bg",
  hold: "border-warn-line bg-warn-bg",
  reserved: "border-accent bg-accent-bg",
  sold: "border-crit-line bg-crit-bg",
};
const STRIPE: Record<string, string> = { free: "bg-ok", hold: "bg-warn", reserved: "bg-accent", sold: "bg-crit" };
const ROOM_CHIPS = [
  { v: "studio", l: "Studiya" }, { v: "1", l: "1" }, { v: "2", l: "2" }, { v: "3", l: "3" }, { v: "4", l: "4+" },
];
const STATUS_CHIPS = [
  { v: "free", l: "Boʻsh", tone: "ok" }, { v: "reserved", l: "Bron", tone: "info" },
  { v: "hold", l: "Band", tone: "warn" }, { v: "sold", l: "Sotilgan", tone: "crit" },
];
const emptyF = { rooms: new Set<string>(), status: new Set<string>(), areaMin: "", areaMax: "", priceMin: "", priceMax: "", floorMin: "", floorMax: "" };

export function ShaxmatkaPage() {
  const { fmt, fromBase, selected } = useCurrency();
  const [blockId, setBlockId] = useState<number | null>(null);
  const [selUnit, setSelUnit] = useState<Unit | null>(null);
  const [showPrice, setShowPrice] = useState(false);
  const [f, setF] = useState({ ...emptyF });

  const { data: complexes, isLoading: loadingCx } = useQuery({ queryKey: ["complexes"], queryFn: () => api.get<Complex[]>("/api/structure/complexes") });
  const complexId = complexes?.[0]?.id;
  const { data: tree, isLoading: loadingTree } = useQuery({ queryKey: ["tree", complexId], queryFn: () => api.get<ComplexTree>(`/api/structure/complexes/${complexId}/tree`), enabled: complexId != null });
  const { data: types } = useQuery({ queryKey: ["unit-types"], queryFn: () => api.get<UnitType[]>("/api/structure/unit-types") });
  const typeMap = useMemo(() => new Map((types ?? []).map((t) => [t.id, t])), [types]);

  const block = useMemo(() => (tree?.blocks.length ? tree.blocks.find((b) => b.id === blockId) ?? tree.blocks[0] : null), [tree, blockId]);
  const allUnits = useMemo(() => block?.floors.flatMap((fl) => fl.units) ?? [], [block]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { free: 0, hold: 0, reserved: 0, sold: 0 };
    let totalValue = 0, freeValue = 0;
    allUnits.forEach((u) => { c[u.status] = (c[u.status] ?? 0) + 1; totalValue += Number(u.price); if (u.status === "free") freeValue += Number(u.price); });
    return { c, totalValue, freeValue };
  }, [allUnits]);

  const toggle = (key: "rooms" | "status", v: string) => setF((prev) => {
    const next = new Set(prev[key]); next.has(v) ? next.delete(v) : next.add(v);
    return { ...prev, [key]: next };
  });

  const matches = (u: Unit, floorNo: number): boolean => {
    if (f.rooms.size) {
      const name = typeMap.get(u.type_id ?? -1)?.name?.toLowerCase() ?? "";
      const ok = [...f.rooms].some((r) => (r === "studio" ? name.includes("studiya") : r === "4" ? u.rooms >= 4 : u.rooms === Number(r)));
      if (!ok) return false;
    }
    if (f.status.size && !f.status.has(u.status)) return false;
    const area = Number(u.total_m2);
    if (f.areaMin && area < Number(f.areaMin)) return false;
    if (f.areaMax && area > Number(f.areaMax)) return false;
    const priceSel = fromBase(u.price);
    if (f.priceMin && priceSel < Number(f.priceMin)) return false;
    if (f.priceMax && priceSel > Number(f.priceMax)) return false;
    if (f.floorMin && floorNo < Number(f.floorMin)) return false;
    if (f.floorMax && floorNo > Number(f.floorMax)) return false;
    return true;
  };
  const anyFilter = f.rooms.size || f.status.size || f.areaMin || f.areaMax || f.priceMin || f.priceMax || f.floorMin || f.floorMax;
  const matchedCount = useMemo(() => {
    let n = 0;
    block?.floors.forEach((fl) => fl.units.forEach((u) => { if (matches(u, fl.number)) n++; }));
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block, f, typeMap, selected]);

  if (loadingCx || loadingTree) return <div className="flex justify-center pt-10"><Spinner label="Shaxmatka yuklanmoqda…" /></div>;
  if (!complexes?.length) return <div><PageTitle title="Shaxmatka" /><EmptyState>Majmua topilmadi. <code>python -m scripts.seed_demo</code>.</EmptyState></div>;

  const rangeInp = "w-16 rounded-sm border border-line-strong bg-surface px-1.5 py-1 font-mono text-[11px] outline-none focus:border-accent";

  return (
    <div className="flex h-full min-h-0 gap-4">
      <div className="flex min-w-0 flex-1 flex-col">
        <PageTitle title={`Shaxmatka · ${tree?.name ?? ""}`} sub={`Blok ${block?.name ?? "—"} · ${allUnits.length} xonadon`} />

        {/* block tabs + legend */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-sm border border-line bg-surface-3 p-0.5">
            {tree?.blocks.map((b) => (
              <button key={b.id} onClick={() => { setBlockId(b.id); setSelUnit(null); }}
                className={`rounded-sm px-3 py-1 font-mono text-[11.5px] font-semibold ${b.id === block?.id ? "bg-surface text-ink shadow-sm" : "text-ink-3"}`}>
                Blok {b.name}
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
            <Legend tone="ok" n={counts.c.free} l="Boʻsh" />
            <Legend tone="info" n={counts.c.reserved} l="Bron" />
            <Legend tone="warn" n={counts.c.hold} l="Band" />
            <Legend tone="crit" n={counts.c.sold} l="Sotilgan" />
          </div>
        </div>

        {/* value summary */}
        <div className="mb-2 flex flex-wrap items-center gap-4 rounded-sm border border-line bg-surface px-3 py-1.5 text-[12px]">
          <span className="text-ink-3">Jami qiymat <b className="ml-1 font-mono text-ink">{fmt(counts.totalValue)}</b></span>
          <span className="text-ink-3">Boʻsh qiymat <b className="ml-1 font-mono text-ok">{fmt(counts.freeValue)}</b></span>
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-ink-3">
            <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> Narxni koʻrsatish
          </label>
        </div>

        {/* filter bar */}
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-sm border border-line bg-surface-2 px-3 py-2">
          <div className="flex items-center gap-1">
            <span className="mr-1 font-mono text-[10px] uppercase text-ink-4">Xona</span>
            {ROOM_CHIPS.map((r) => (
              <Chip key={r.v} active={f.rooms.has(r.v)} onClick={() => toggle("rooms", r.v)}>{r.l}</Chip>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="mr-1 font-mono text-[10px] uppercase text-ink-4">Holat</span>
            {STATUS_CHIPS.map((s) => (
              <Chip key={s.v} active={f.status.has(s.v)} tone={s.tone} onClick={() => toggle("status", s.v)}>{s.l}</Chip>
            ))}
          </div>
          <div className="flex items-center gap-1 font-mono text-[10px] text-ink-4">
            <span className="uppercase">m²</span>
            <input value={f.areaMin} onChange={(e) => setF({ ...f, areaMin: e.target.value.replace(/[^\d.]/g, "") })} placeholder="min" className={rangeInp} />
            <span>–</span>
            <input value={f.areaMax} onChange={(e) => setF({ ...f, areaMax: e.target.value.replace(/[^\d.]/g, "") })} placeholder="max" className={rangeInp} />
          </div>
          <div className="flex items-center gap-1 font-mono text-[10px] text-ink-4">
            <span className="uppercase">Narx {selected?.code}</span>
            <input value={f.priceMin} onChange={(e) => setF({ ...f, priceMin: e.target.value.replace(/[^\d.]/g, "") })} placeholder="min" className={rangeInp} />
            <span>–</span>
            <input value={f.priceMax} onChange={(e) => setF({ ...f, priceMax: e.target.value.replace(/[^\d.]/g, "") })} placeholder="max" className={rangeInp} />
          </div>
          <div className="flex items-center gap-1 font-mono text-[10px] text-ink-4">
            <span className="uppercase">Qavat</span>
            <input value={f.floorMin} onChange={(e) => setF({ ...f, floorMin: e.target.value.replace(/\D/g, "") })} placeholder="min" className={rangeInp} />
            <span>–</span>
            <input value={f.floorMax} onChange={(e) => setF({ ...f, floorMax: e.target.value.replace(/\D/g, "") })} placeholder="max" className={rangeInp} />
          </div>
          {anyFilter ? (
            <button onClick={() => setF({ rooms: new Set(), status: new Set(), areaMin: "", areaMax: "", priceMin: "", priceMax: "", floorMin: "", floorMax: "" })}
              className="font-mono text-[11px] text-accent hover:underline">
              Tozalash · {matchedCount} ta
            </button>
          ) : null}
        </div>

        {/* grid */}
        <div className="min-h-0 flex-1 overflow-auto rounded border border-line bg-surface-2 p-3">
          {!block || allUnits.length === 0 ? (
            <EmptyState>Bu blokda xonadonlar yoʻq.</EmptyState>
          ) : (
            <div className="flex flex-col gap-1">
              {[...block.floors].sort((a, b) => b.number - a.number).map((floor) => (
                <div key={floor.id} className="flex items-stretch gap-1">
                  <div className="flex w-7 flex-none items-center justify-center rounded-sm bg-surface-3 font-mono text-[10px] font-semibold text-ink-3">
                    {floor.number}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {floor.units.map((u) => {
                      const dim = !!anyFilter && !matches(u, floor.number);
                      return (
                        <button key={u.id} onClick={() => setSelUnit(u)}
                          title={`${u.number} · ${u.rooms}-xona · ${Number(u.total_m2).toFixed(1)} m² · ${fmt(u.price)}`}
                          style={{ opacity: dim ? 0.18 : undefined }}
                          className={`relative ${showPrice ? "w-[96px]" : "w-[70px]"} rounded-sm border py-1 pl-2.5 pr-1.5 text-left transition
                            hover:-translate-y-px hover:shadow-md ${CELL_STYLE[u.status] ?? "border-line bg-surface"}
                            ${selUnit?.id === u.id ? "outline outline-2 outline-accent" : ""}`}>
                          <span className={`absolute left-0 top-0 h-full w-[3px] rounded-l-sm ${STRIPE[u.status] ?? "bg-ink-4"}`} />
                          <div className="font-mono text-[11px] font-bold text-ink">{u.number}</div>
                          <div className="font-mono text-[9px] text-ink-3">{u.rooms}x · {Math.round(Number(u.total_m2))}m²</div>
                          {showPrice && <div className="truncate font-mono text-[9px] font-semibold text-ink-2">{fmt(u.price)}</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selUnit && <UnitPanel unit={selUnit} layout={typeMap.get(selUnit.type_id ?? -1) ?? null} onClose={() => setSelUnit(null)} />}
    </div>
  );
}

function Legend({ tone, n, l }: { tone: string; n: number; l: string }) {
  const dot: Record<string, string> = { ok: "bg-ok", info: "bg-accent", warn: "bg-warn", crit: "bg-crit" };
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5">
      <i className={`h-[7px] w-[7px] rounded-sm ${dot[tone]}`} /> {l} <b className="text-ink">{n}</b>
    </span>
  );
}

function Chip({ active, tone, onClick, children }: { active: boolean; tone?: string; onClick: () => void; children: React.ReactNode }) {
  const toneBg: Record<string, string> = { ok: "border-ok-line bg-ok-bg text-ok", info: "border-accent bg-accent-bg text-accent-ink", warn: "border-warn-line bg-warn-bg text-warn", crit: "border-crit-line bg-crit-bg text-crit" };
  return (
    <button onClick={onClick}
      className={`rounded-sm border px-2 py-0.5 font-mono text-[11px] font-semibold transition ${
        active ? (tone ? toneBg[tone] : "border-accent bg-accent text-white") : "border-line-strong bg-surface text-ink-3 hover:bg-surface-2"
      }`}>
      {children}
    </button>
  );
}
