import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Additional, Block, ComplexTree, Complex, Floor, Unit, UnitType } from "@/lib/types";
import { PageTitle, Card, Spinner, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/components/ui/Money";
import { StatusPill, UNIT_TONE } from "@/components/ui/StatusPill";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";

const CELL: Record<string, string> = { free: "border-ok-line bg-ok-bg", hold: "border-warn-line bg-warn-bg", reserved: "border-accent bg-accent-bg", sold: "border-crit-line bg-crit-bg" };
const STATUS = [{ v: "free", l: "Boʻsh" }, { v: "hold", l: "Band" }, { v: "reserved", l: "Bron" }, { v: "sold", l: "Sotilgan" }];
const STATUS_L: Record<string, string> = Object.fromEntries(STATUS.map((s) => [s.v, s.l]));
const KINDS = [
  { v: "living", l: "Zal" }, { v: "bedroom", l: "Yotoq" }, { v: "kitchen", l: "Oshxona" },
  { v: "balcony", l: "Balkon" }, { v: "bathroom", l: "Hammom" }, { v: "corridor", l: "Koridor" }, { v: "terrace", l: "Terrasa" },
];
const ADD_KINDS = [{ v: "parking", l: "Parking" }, { v: "storeroom", l: "Sklad" }, { v: "commercial", l: "Tijorat" }, { v: "park", l: "Park" }];

type View = "grid" | "units" | "buildings";
const VIEWS: { v: View; l: string }[] = [
  { v: "grid", l: "▦ Grid" }, { v: "units", l: "▤ Xonadonlar" }, { v: "buildings", l: "▥ Binolar" },
];

export function StructurePage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canManage = can("shaxmatka", "manage");
  const [cxId, setCxId] = useState<number | null>(null);
  const [unitId, setUnitId] = useState<number | null>(null);
  const [scaffoldBlock, setScaffoldBlock] = useState<Block | null>(null);
  const [typesOpen, setTypesOpen] = useState(false);
  const [view, setView] = useState<View>("grid");

  const { data: complexes } = useQuery({ queryKey: ["complexes"], queryFn: () => api.get<Complex[]>("/api/structure/complexes") });
  const complexId = cxId ?? complexes?.[0]?.id ?? null;
  const { data: tree, isLoading } = useQuery({ queryKey: ["tree", complexId], queryFn: () => api.get<ComplexTree>(`/api/structure/complexes/${complexId}/tree`), enabled: complexId != null });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["tree"] });

  const addComplex = useMutation({ mutationFn: (name: string) => api.post<Complex>("/api/structure/complexes", { name }), onSuccess: (c) => { qc.invalidateQueries({ queryKey: ["complexes"] }); setCxId(c.id); } });
  const addBlock = useMutation({ mutationFn: (name: string) => api.post("/api/structure/blocks", { complex_id: complexId, name }), onSuccess: invalidate });
  const delBlock = useMutation({ mutationFn: (id: number) => api.del(`/api/structure/blocks/${id}`), onSuccess: invalidate });
  const addFloor = useMutation({ mutationFn: ({ block_id, number }: { block_id: number; number: number }) => api.post("/api/structure/floors", { block_id, number }), onSuccess: invalidate });
  const addUnit = useMutation({ mutationFn: (b: Record<string, unknown>) => api.post("/api/structure/units", b), onSuccess: invalidate });

  const findUnit = (): Unit | undefined => tree?.blocks.flatMap((b) => b.floors).flatMap((f) => f.units).find((u) => u.id === unitId);

  if (!complexes) return <div className="flex justify-center pt-10"><Spinner /></div>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3">
        <PageTitle title="Obyektlar" sub="Majmua tuzilmasi" />
        <select value={complexId ?? ""} onChange={(e) => setCxId(Number(e.target.value))} className="rounded-sm border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-semibold outline-none focus:border-accent">
          {complexes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          {!complexes.length && <option>—</option>}
        </select>

        {/* view switcher */}
        <div className="flex overflow-hidden rounded-sm border border-line-strong">
          {VIEWS.map((v) => (
            <button key={v.v} onClick={() => setView(v.v)}
              className={`px-3 py-1.5 text-[12px] font-semibold ${view === v.v ? "bg-accent text-white" : "bg-surface text-ink-2 hover:bg-surface-2"}`}>
              {v.l}
            </button>
          ))}
        </div>

        {canManage && (
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => { const n = prompt("Majmua nomi"); if (n?.trim()) addComplex.mutate(n.trim()); }}>+ Majmua</Button>
            <Button size="sm" variant="secondary" onClick={() => setTypesOpen(true)}>Xonadon turlari</Button>
            {complexId && <Button size="sm" onClick={() => { const n = prompt("Blok nomi (masalan: A)"); if (n?.trim()) addBlock.mutate(n.trim()); }}>+ Blok</Button>}
          </div>
        )}
      </div>

      {isLoading ? <Spinner /> : !tree ? <EmptyState>Majmua tanlang yoki yarating.</EmptyState> : (
        <div className="mt-3 min-h-0 flex-1 space-y-4 overflow-auto pb-4">
          {view === "grid" && (
            <>
              {tree.blocks.length === 0 && <EmptyState>Blok yoʻq. "+ Blok" bilan qoʻshing.</EmptyState>}
              {tree.blocks.map((block) => (
                <BlockSection key={block.id} block={block} canManage={canManage}
                  onScaffold={() => setScaffoldBlock(block)} onDelete={() => confirm(`Blok ${block.name} oʻchirilsinmi?`) && delBlock.mutate(block.id)}
                  onAddFloor={() => { const maxN = Math.max(0, ...block.floors.map((f) => f.number)); addFloor.mutate({ block_id: block.id, number: maxN + 1 }); }}
                  onAddUnit={(floor) => addUnit.mutate({ floor_id: floor.id, number: `${block.name}-${floor.number}${String(floor.units.length + 1).padStart(2, "0")}`, rooms: 1, price_per_m2: 0, status: "free", parts: [] })}
                  onOpenUnit={(u) => setUnitId(u.id)} />
              ))}
              <AdditionalsCard complexId={complexId!} canManage={canManage} />
            </>
          )}

          {view === "units" && <UnitsTable tree={tree} onOpenUnit={(id) => setUnitId(id)} />}
          {view === "buildings" && (
            <BuildingsTable tree={tree} canManage={canManage}
              onScaffold={(b) => setScaffoldBlock(b)}
              onDelete={(b) => confirm(`Blok ${b.name} oʻchirilsinmi?`) && delBlock.mutate(b.id)} />
          )}
        </div>
      )}

      {unitId != null && findUnit() && <UnitDrawer unit={findUnit()!} onClose={() => setUnitId(null)} canManage={canManage} />}
      {scaffoldBlock && <ScaffoldModal block={scaffoldBlock} onClose={() => setScaffoldBlock(null)} />}
      {typesOpen && <TypesModal onClose={() => setTypesOpen(false)} />}
    </div>
  );
}

/* ------------------------------ units list view ------------------------------ */
function UnitsTable({ tree, onOpenUnit }: { tree: ComplexTree; onOpenUnit: (id: number) => void }) {
  const { fmt, selected } = useCurrency();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const rows = tree.blocks.flatMap((b) =>
    b.floors.flatMap((f) => f.units.map((u) => ({ block: b.name, floor: f.number, u }))),
  );
  const filtered = rows
    .filter((r) => (status ? r.u.status === status : true))
    .filter((r) => (q ? r.u.number.toLowerCase().includes(q.toLowerCase()) : true))
    .sort((a, b) => a.block.localeCompare(b.block) || a.floor - b.floor || a.u.number.localeCompare(b.u.number));

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qidirish (raqam)…"
          className="w-48 rounded-sm border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-sm border border-line-strong bg-surface px-2 py-1.5 text-[12px]">
          <option value="">Barcha holat</option>
          {STATUS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
        </select>
        <span className="ml-auto font-mono text-[11px] text-ink-3">{filtered.length} ta · {selected?.code}</span>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
              <th className="px-3 py-2">Blok</th><th className="px-3 py-2">Qavat</th><th className="px-3 py-2">Xonadon</th>
              <th className="px-3 py-2">Xona</th><th className="px-3 py-2 text-right">Umumiy m²</th>
              <th className="px-3 py-2 text-right">Narx</th><th className="px-3 py-2">Holat</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ block, floor, u }) => (
              <tr key={u.id} onClick={() => onOpenUnit(u.id)} className="cursor-pointer border-b border-line-2 hover:bg-surface-2">
                <td className="px-3 py-2 font-semibold text-ink">{block}</td>
                <td className="px-3 py-2 font-mono text-ink-2">{floor}</td>
                <td className="px-3 py-2 font-mono font-bold text-ink">{u.number}</td>
                <td className="px-3 py-2 font-mono text-ink-2">{u.rooms}x</td>
                <td className="px-3 py-2 text-right font-mono tnum text-ink-2">{Number(u.total_m2).toFixed(1)}</td>
                <td className="px-3 py-2 text-right font-mono tnum font-semibold text-ink">{fmt(u.price)}</td>
                <td className="px-3 py-2"><StatusPill tone={UNIT_TONE[u.status] ?? "muted"}>{STATUS_L[u.status] ?? u.status}</StatusPill></td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={7} className="px-3 py-6 text-center font-mono text-[11px] text-ink-4">xonadon topilmadi</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------ buildings list view ------------------------------ */
function BuildingsTable({ tree, canManage, onScaffold, onDelete }: {
  tree: ComplexTree; canManage: boolean; onScaffold: (b: Block) => void; onDelete: (b: Block) => void;
}) {
  const { fmt, selected } = useCurrency();
  const stats = tree.blocks.map((b) => {
    const units = b.floors.flatMap((f) => f.units);
    const value = units.reduce((s, u) => s + Number(u.price), 0);
    const count = (st: string) => units.filter((u) => u.status === st).length;
    return { b, floors: b.floors.length, units: units.length, value, free: count("free"), sold: count("sold"), reserved: count("reserved") + count("hold") };
  });
  const totalUnits = stats.reduce((s, x) => s + x.units, 0);
  const totalValue = stats.reduce((s, x) => s + x.value, 0);

  return (
    <Card className="p-0">
      <div className="flex items-center gap-3 border-b border-line p-3">
        <span className="text-[15px] font-bold text-ink">{tree.name}</span>
        <span className="font-mono text-[11px] text-ink-3">{tree.blocks.length} blok · {totalUnits} xonadon</span>
        <span className="ml-auto font-mono text-[12px] font-semibold text-ink">{fmt(totalValue)}</span>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
              <th className="px-3 py-2">Blok</th><th className="px-3 py-2 text-right">Qavat</th><th className="px-3 py-2 text-right">Xonadon</th>
              <th className="px-3 py-2 text-right">Boʻsh</th><th className="px-3 py-2 text-right">Bron/Band</th><th className="px-3 py-2 text-right">Sotilgan</th>
              <th className="px-3 py-2 text-right">Umumiy qiymat ({selected?.code})</th>
              {canManage && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {stats.map(({ b, floors, units, value, free, sold, reserved }) => (
              <tr key={b.id} className="border-b border-line-2 hover:bg-surface-2">
                <td className="px-3 py-2 font-bold text-ink">Blok {b.name}</td>
                <td className="px-3 py-2 text-right font-mono tnum text-ink-2">{floors}</td>
                <td className="px-3 py-2 text-right font-mono tnum text-ink-2">{units}</td>
                <td className="px-3 py-2 text-right font-mono tnum text-ok">{free}</td>
                <td className="px-3 py-2 text-right font-mono tnum text-warn">{reserved}</td>
                <td className="px-3 py-2 text-right font-mono tnum text-crit">{sold}</td>
                <td className="px-3 py-2 text-right font-mono tnum font-semibold text-ink">{fmt(value)}</td>
                {canManage && (
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => onScaffold(b)}>⚙</Button>
                      <button onClick={() => onDelete(b)} className="px-1.5 font-mono text-ink-3 hover:text-crit">🗑</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {!stats.length && <tr><td colSpan={canManage ? 8 : 7} className="px-3 py-6 text-center font-mono text-[11px] text-ink-4">blok yoʻq</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function BlockSection({ block, canManage, onScaffold, onDelete, onAddFloor, onAddUnit, onOpenUnit }: {
  block: Block; canManage: boolean; onScaffold: () => void; onDelete: () => void; onAddFloor: () => void; onAddUnit: (f: Floor) => void; onOpenUnit: (u: Unit) => void;
}) {
  const floors = [...block.floors].sort((a, b) => b.number - a.number);
  const total = block.floors.reduce((s, f) => s + f.units.length, 0);
  return (
    <Card className="p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[15px] font-bold text-ink">Blok {block.name}</span>
        <span className="font-mono text-[11px] text-ink-3">{block.floors.length} qavat · {total} xonadon</span>
        {canManage && (
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={onAddFloor}>+ Qavat</Button>
            <Button size="sm" variant="secondary" onClick={onScaffold}>⚙ Generatsiya</Button>
            <button onClick={onDelete} className="px-1.5 font-mono text-ink-3 hover:text-crit">🗑</button>
          </div>
        )}
      </div>
      {floors.length === 0 ? <div className="rounded-sm border border-dashed border-line-2 py-4 text-center font-mono text-[11px] text-ink-4">qavat yoʻq</div> : (
        <div className="space-y-1.5">
          {floors.map((floor) => (
            <div key={floor.id} className="flex items-start gap-2">
              <div className="mt-1 w-8 flex-none text-center font-mono text-[11px] text-ink-3">{floor.number}</div>
              <div className="flex flex-wrap gap-1.5">
                {floor.units.map((u) => (
                  <button key={u.id} onClick={() => onOpenUnit(u)} className={`w-[74px] rounded-sm border px-2 py-1 text-left hover:-translate-y-px hover:shadow-md ${CELL[u.status] ?? "border-line bg-surface"}`}>
                    <div className="font-mono text-[11px] font-bold text-ink">{u.number}</div>
                    <div className="font-mono text-[9px] text-ink-3">{u.rooms}x · {Math.round(Number(u.total_m2))}m²</div>
                  </button>
                ))}
                {canManage && <button onClick={() => onAddUnit(floor)} className="w-[74px] rounded-sm border border-dashed border-line py-1 font-mono text-[11px] text-ink-3 hover:border-accent hover:text-accent">＋</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------ unit drawer ------------------------------ */
function UnitDrawer({ unit, onClose, canManage }: { unit: Unit; onClose: () => void; canManage: boolean }) {
  const qc = useQueryClient();
  const { selected, rate, fromBase, toBase } = useCurrency();
  const code = selected?.code ?? "";
  const r2 = (n: number) => Math.round(n * 100) / 100; // 2-dp display in selected currency
  const { data: types } = useQuery({ queryKey: ["unit-types"], queryFn: () => api.get<UnitType[]>("/api/structure/unit-types") });
  // Price inputs are held in the SELECTED currency; converted to base on save.
  const [f, setF] = useState({
    number: unit.number, rooms: unit.rooms, type_id: unit.type_id ?? "",
    price_per_m2: String(r2(fromBase(unit.price_per_m2))),
    price_override: unit.price_override ? String(r2(fromBase(unit.price_override))) : "",
    view: unit.view ?? "", status: unit.status,
  });
  const [parts, setParts] = useState(unit.parts.map((p) => ({ kind: p.kind, m2: p.m2, is_summable: p.is_summable, price_factor: p.price_factor })));
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["tree"] }); onClose(); };
  const save = useMutation({
    mutationFn: () => api.patch(`/api/structure/units/${unit.id}`, {
      number: f.number, view: f.view, status: f.status,
      type_id: f.type_id === "" ? null : Number(f.type_id),
      rooms: Number(f.rooms) || 1,
      price_per_m2: toBase(Number(f.price_per_m2) || 0),
      price_override: f.price_override === "" ? null : toBase(Number(f.price_override) || 0),
      parts: parts.map((p) => ({ kind: p.kind, m2: Number(p.m2) || 0, is_summable: p.is_summable, price_factor: Number(p.price_factor) || 1 })),
    }),
    onSuccess: invalidate,
  });
  const del = useMutation({ mutationFn: () => api.del(`/api/structure/units/${unit.id}`), onSuccess: invalidate });

  const totalM2 = parts.reduce((s, p) => s + (Number(p.m2) || 0), 0);
  const billable = parts.reduce((s, p) => s + (Number(p.m2) || 0) * (Number(p.price_factor) || 1), 0);
  // Selected-currency price for the preview; base value shown alongside.
  const priceSel = f.price_override !== "" ? Number(f.price_override) : billable * (Number(f.price_per_m2) || 0);
  const priceBase = priceSel * rate();

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col bg-surface shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="text-base font-bold text-ink">Xonadon {unit.number}</div>
          <button onClick={onClose} className="text-ink-3 hover:text-ink">✕</button>
        </div>
        <div className="flex-1 space-y-3 overflow-auto p-5">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Raqam"><input value={f.number} disabled={!canManage} onChange={(e) => setF({ ...f, number: e.target.value })} className={inp} /></Field>
            <Field label="Xona"><input type="number" value={f.rooms} disabled={!canManage} onChange={(e) => setF({ ...f, rooms: Number(e.target.value) })} className={inp} /></Field>
            <Field label="Turi"><select value={f.type_id} disabled={!canManage} onChange={(e) => setF({ ...f, type_id: e.target.value })} className={inp}><option value="">—</option>{types?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
            <Field label="Holat"><select value={f.status} disabled={!canManage} onChange={(e) => setF({ ...f, status: e.target.value })} className={inp}>{STATUS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select></Field>
            <Field label={`Narx / m² (${code})`}><input value={f.price_per_m2} disabled={!canManage} onChange={(e) => setF({ ...f, price_per_m2: e.target.value })} className={`${inp} font-mono`} /></Field>
            <Field label={`Narx override (${code})`}><input value={f.price_override} disabled={!canManage} onChange={(e) => setF({ ...f, price_override: e.target.value })} placeholder="avto" className={`${inp} font-mono`} /></Field>
            <Field label="Manzara"><input value={f.view} disabled={!canManage} onChange={(e) => setF({ ...f, view: e.target.value })} className={inp} /></Field>
          </div>

          {/* space parts */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">Maydonlar (m²)</span>
              {canManage && <button onClick={() => setParts([...parts, { kind: "living", m2: "0", is_summable: true, price_factor: "1" }])} className="font-mono text-[11px] text-accent hover:underline">+ maydon</button>}
            </div>
            <div className="space-y-1.5">
              {parts.map((p, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <select value={p.kind} disabled={!canManage} onChange={(e) => setParts(parts.map((x, j) => j === i ? { ...x, kind: e.target.value } : x))} className="flex-1 rounded-sm border border-line-strong bg-surface px-2 py-1 text-[12px]">
                    {KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}
                  </select>
                  <input value={p.m2} disabled={!canManage} onChange={(e) => setParts(parts.map((x, j) => j === i ? { ...x, m2: e.target.value } : x))} className="w-16 rounded-sm border border-line-strong bg-surface px-2 py-1 font-mono text-[12px]" placeholder="m²" />
                  <input value={p.price_factor} disabled={!canManage} onChange={(e) => setParts(parts.map((x, j) => j === i ? { ...x, price_factor: e.target.value } : x))} className="w-12 rounded-sm border border-line-strong bg-surface px-1 py-1 font-mono text-[11px]" title="koeffitsient" />
                  {canManage && <button onClick={() => setParts(parts.filter((_, j) => j !== i))} className="px-1 font-mono text-ink-3 hover:text-crit">✕</button>}
                </div>
              ))}
              {parts.length === 0 && <div className="rounded-sm border border-dashed border-line-2 py-3 text-center font-mono text-[11px] text-ink-4">maydon yoʻq</div>}
            </div>
          </div>

          <div className="rounded-sm border border-line bg-surface-2 p-3 text-[12.5px]">
            <div className="flex justify-between"><span className="text-ink-3">Umumiy</span><span className="font-mono tnum">{totalM2.toFixed(2)} m²</span></div>
            <div className="flex justify-between"><span className="text-ink-3">Billable</span><span className="font-mono tnum">{billable.toFixed(2)} m²</span></div>
            <div className="mt-1 flex justify-between border-t border-line pt-1"><span className="text-ink-2 font-semibold">Narx</span><span className="font-mono tnum font-bold">{formatMoney(priceSel)} {code}</span></div>
            {selected && !selected.is_base && (
              <div className="flex justify-between text-[11px]"><span className="text-ink-4">Bazada</span><span className="font-mono tnum text-ink-3">{formatMoney(priceBase)} soʻm</span></div>
            )}
          </div>
        </div>
        {canManage && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3.5">
            <button onClick={() => confirm("Xonadon oʻchirilsinmi?") && del.mutate()} className="font-mono text-[12px] text-crit hover:underline">Oʻchirish</button>
            <div className="flex gap-2"><Button variant="ghost" size="sm" onClick={onClose}>Bekor</Button><Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Saqlash</Button></div>
          </div>
        )}
      </div>
    </div>
  );
}
const inp = "w-full rounded-sm border border-line-strong bg-surface px-2 py-1.5 text-[13px] outline-none focus:border-accent";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="mb-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-3">{label}</div>{children}</div>;
}

/* ------------------------------ scaffold modal ------------------------------ */
function ScaffoldModal({ block, onClose }: { block: Block; onClose: () => void }) {
  const qc = useQueryClient();
  const { selected, toBase, fromBase } = useCurrency();
  const code = selected?.code ?? "";
  // Default 12M soʻm expressed in the selected currency.
  const [f, setF] = useState({ floors: "9", units_per_floor: "6", start_floor: "1", rooms: "2", price_per_m2: String(Math.round(fromBase(12000000))) });
  const gen = useMutation({
    mutationFn: () => api.post(`/api/structure/blocks/${block.id}/scaffold`, { floors: Number(f.floors), units_per_floor: Number(f.units_per_floor), start_floor: Number(f.start_floor), rooms: Number(f.rooms), price_per_m2: toBase(Number(f.price_per_m2) || 0) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tree"] }); onClose(); },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 text-base font-bold text-ink">Blok {block.name} — generatsiya</div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Qavatlar soni"><input value={f.floors} onChange={(e) => setF({ ...f, floors: e.target.value.replace(/\D/g, "") })} className={inp} /></Field>
          <Field label="Har qavatda"><input value={f.units_per_floor} onChange={(e) => setF({ ...f, units_per_floor: e.target.value.replace(/\D/g, "") })} className={inp} /></Field>
          <Field label="Boshlangʻich qavat"><input value={f.start_floor} onChange={(e) => setF({ ...f, start_floor: e.target.value.replace(/\D/g, "") })} className={inp} /></Field>
          <Field label="Xona (default)"><input value={f.rooms} onChange={(e) => setF({ ...f, rooms: e.target.value.replace(/\D/g, "") })} className={inp} /></Field>
          <Field label={`Narx / m² (${code})`}><input value={f.price_per_m2} onChange={(e) => setF({ ...f, price_per_m2: e.target.value.replace(/[^\d.]/g, "") })} className={`${inp} font-mono`} /></Field>
        </div>
        <p className="mt-2 text-[12px] text-ink-3">{Number(f.floors) * Number(f.units_per_floor) || 0} ta xonadon yaratiladi.</p>
        <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={onClose}>Bekor</Button><Button size="sm" onClick={() => gen.mutate()} disabled={gen.isPending}>Yaratish</Button></div>
      </div>
    </div>
  );
}

/* ------------------------------ additionals ------------------------------ */
function AdditionalsCard({ complexId, canManage }: { complexId: number; canManage: boolean }) {
  const qc = useQueryClient();
  const { selected, toBase, fmt } = useCurrency();
  const code = selected?.code ?? "";
  const key = ["additionals", complexId];
  const { data: items } = useQuery({ queryKey: key, queryFn: () => api.get<Additional[]>(`/api/structure/complexes/${complexId}/additionals`) });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const [f, setF] = useState({ kind: "parking", number: "", m2: "0", price: "0" });
  const add = useMutation({ mutationFn: () => api.post("/api/structure/additionals", { complex_id: complexId, kind: f.kind, number: f.number.trim(), m2: Number(f.m2) || 0, price: toBase(Number(f.price) || 0), status: "free" }), onSuccess: () => { setF({ ...f, number: "" }); refresh(); } });
  const del = useMutation({ mutationFn: (id: number) => api.del(`/api/structure/additionals/${id}`), onSuccess: refresh });
  const label = (k: string) => ADD_KINDS.find((x) => x.v === k)?.l ?? k;

  return (
    <Card className="p-3">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">Qoʻshimchalar — parking, sklad, tijorat, park</div>
      {items?.length ? (
        <div className="mb-3 grid gap-1.5 md:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-sm border border-line-2 bg-surface px-3 py-2 text-[13px]">
              <span className="rounded-sm bg-surface-3 px-1.5 py-0.5 font-mono text-[9px] uppercase text-ink-3">{label(a.kind)}</span>
              <span className="font-semibold text-ink">{a.number}</span>
              <span className="ml-auto font-mono text-[11px] text-ink-2">{fmt(a.price)}</span>
              <StatusPill tone={UNIT_TONE[a.status] ?? "muted"}>{a.status}</StatusPill>
              {canManage && <button onClick={() => del.mutate(a.id)} className="font-mono text-ink-3 hover:text-crit">✕</button>}
            </div>
          ))}
        </div>
      ) : <div className="mb-3 rounded-sm border border-dashed border-line-2 py-3 text-center font-mono text-[11px] text-ink-4">qoʻshimcha yoʻq</div>}
      {canManage && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className="rounded-sm border border-line-strong bg-surface px-2 py-1.5 text-[12px]">{ADD_KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}</select>
          <input value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} placeholder="Raqam (P-01)" className="w-28 rounded-sm border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent" />
          <input value={f.m2} onChange={(e) => setF({ ...f, m2: e.target.value.replace(/[^\d.]/g, "") })} placeholder="m²" className="w-16 rounded-sm border border-line-strong bg-surface px-2 py-1.5 font-mono text-[13px]" />
          <input value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^\d.]/g, "") })} placeholder={`narx (${code})`} className="w-32 rounded-sm border border-line-strong bg-surface px-2 py-1.5 font-mono text-[13px]" />
          <Button size="sm" onClick={() => add.mutate()} disabled={!f.number.trim()}>+ Qoʻshish</Button>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------ unit types ------------------------------ */
function TypesModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: types } = useQuery({ queryKey: ["unit-types"], queryFn: () => api.get<UnitType[]>("/api/structure/unit-types") });
  const [f, setF] = useState({ name: "", default_rooms: "1" });
  const add = useMutation({ mutationFn: () => api.post("/api/structure/unit-types", { name: f.name.trim(), default_rooms: Number(f.default_rooms) || 1 }), onSuccess: () => { setF({ name: "", default_rooms: "1" }); qc.invalidateQueries({ queryKey: ["unit-types"] }); } });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><span className="text-base font-bold text-ink">Xonadon turlari</span><button onClick={onClose} className="text-ink-3 hover:text-ink">✕</button></div>
        <div className="mb-3 space-y-1">
          {types?.map((t) => <div key={t.id} className="flex justify-between rounded-sm border border-line-2 bg-surface px-3 py-1.5 text-[13px]"><span className="text-ink">{t.name}</span><span className="font-mono text-[11px] text-ink-3">{t.default_rooms}-xona</span></div>)}
          {!types?.length && <div className="font-mono text-[11px] text-ink-4">tur yoʻq</div>}
        </div>
        <div className="flex items-center gap-2 border-t border-line pt-3">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Nomi (Studio, 2-xona…)" className="flex-1 rounded-sm border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent" />
          <input value={f.default_rooms} onChange={(e) => setF({ ...f, default_rooms: e.target.value.replace(/\D/g, "") })} className="w-14 rounded-sm border border-line-strong bg-surface px-2 py-1.5 font-mono text-[13px]" />
          <Button size="sm" onClick={() => add.mutate()} disabled={!f.name.trim()}>+</Button>
        </div>
      </div>
    </div>
  );
}
