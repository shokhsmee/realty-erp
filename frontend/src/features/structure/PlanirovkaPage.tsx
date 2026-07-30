import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Complex, ComplexTree, Unit, UnitType } from "@/lib/types";
import { PageTitle, Card, Spinner, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";

const inp = "w-full rounded-sm border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent";

/** Planirovkalar — the Flatris "building types" catalog: every apartment layout
 * with its plan image, room count, areas, how many apartments use it and the
 * cheapest one available. */
export function PlanirovkaPage() {
  const { can } = useAuth();
  const { fmt } = useCurrency();
  const qc = useQueryClient();
  const canManage = can("shaxmatka", "manage");
  const [edit, setEdit] = useState<UnitType | null | "new">(null);

  const { data: types, isLoading } = useQuery({ queryKey: ["unit-types"], queryFn: () => api.get<UnitType[]>("/api/structure/unit-types") });
  const { data: complexes } = useQuery({ queryKey: ["complexes"], queryFn: () => api.get<Complex[]>("/api/structure/complexes") });
  const complexId = complexes?.[0]?.id;
  const { data: tree } = useQuery({ queryKey: ["tree", complexId], queryFn: () => api.get<ComplexTree>(`/api/structure/complexes/${complexId}/tree`), enabled: complexId != null });

  // per-layout stats: apartment count + cheapest price (base)
  const stats = useMemo(() => {
    const m = new Map<number, { count: number; minPrice: number; free: number }>();
    const units: Unit[] = tree?.blocks.flatMap((b) => b.floors.flatMap((f) => f.units)) ?? [];
    units.forEach((u) => {
      if (u.type_id == null) return;
      const s = m.get(u.type_id) ?? { count: 0, minPrice: Infinity, free: 0 };
      s.count += 1;
      s.minPrice = Math.min(s.minPrice, Number(u.price));
      if (u.status === "free") s.free += 1;
      m.set(u.type_id, s);
    });
    return m;
  }, [tree]);

  const del = useMutation({ mutationFn: (id: number) => api.del(`/api/structure/unit-types/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["unit-types"] }) });

  if (isLoading) return <div className="flex justify-center pt-10"><Spinner /></div>;

  return (
    <div>
      <div className="flex items-center gap-3">
        <PageTitle title="Planirovkalar" sub="Xonadon turlari — planlar, maydonlar va narxlar" />
        {canManage && <Button className="ml-auto" size="sm" onClick={() => setEdit("new")}>+ Planirovka</Button>}
      </div>

      {!types?.length ? (
        <EmptyState>Planirovka yoʻq.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {types.map((t) => {
            const s = stats.get(t.id);
            return (
              <Card key={t.id} className="flex flex-col overflow-hidden">
                <div className="relative aspect-[4/3] border-b border-line bg-white">
                  {t.image ? (
                    <img src={`/api/structure/unit-types/${t.id}/image`} alt={t.name} className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full items-center justify-center font-mono text-[11px] text-ink-4">plan yoʻq</div>
                  )}
                  <span className="absolute right-2 top-2 rounded-sm bg-accent px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                    {t.default_rooms}-xona
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <div className="font-semibold text-ink">{t.name}</div>
                  <div className="mb-2 mt-1 grid grid-cols-3 gap-1 font-mono text-[11px]">
                    <Area l="Umumiy" v={t.total_m2} />
                    <Area l="Zal" v={t.living_m2} />
                    <Area l="Oshxona" v={t.kitchen_m2} />
                  </div>
                  <div className="mt-auto flex items-center justify-between border-t border-line pt-2 text-[11px]">
                    <span className="font-mono text-ink-3">
                      {s ? `${s.count} xonadon · ${s.free} boʻsh` : "0 xonadon"}
                    </span>
                    {s && s.minPrice !== Infinity && (
                      <span className="font-mono font-semibold text-ink">{fmt(s.minPrice)} dan</span>
                    )}
                  </div>
                  {canManage && (
                    <div className="mt-2 flex gap-1.5">
                      <Button size="sm" variant="secondary" className="flex-1" onClick={() => setEdit(t)}>Tahrirlash</Button>
                      <button onClick={() => confirm(`${t.name} oʻchirilsinmi?`) && del.mutate(t.id)}
                        className="rounded-sm border border-line-strong px-2 font-mono text-ink-3 hover:text-crit">🗑</button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {edit && <EditModal layout={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function Area({ l, v }: { l: string; v: string }) {
  return (
    <div className="rounded-sm bg-surface-2 px-1.5 py-1 text-center">
      <div className="text-[8.5px] uppercase tracking-[0.08em] text-ink-4">{l}</div>
      <div className="tnum text-ink">{Number(v).toFixed(0)}</div>
    </div>
  );
}

function EditModal({ layout, onClose }: { layout: UnitType | null; onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({
    name: layout?.name ?? "", default_rooms: String(layout?.default_rooms ?? 1),
    total_m2: layout ? String(layout.total_m2) : "", living_m2: layout ? String(layout.living_m2) : "",
    kitchen_m2: layout ? String(layout.kitchen_m2) : "", description: layout?.description ?? "",
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["unit-types"] });
  const body = () => ({
    name: f.name.trim(), default_rooms: Number(f.default_rooms) || 1,
    total_m2: Number(f.total_m2) || 0, living_m2: Number(f.living_m2) || 0, kitchen_m2: Number(f.kitchen_m2) || 0,
    description: f.description.trim() || null,
  });
  const save = useMutation({
    mutationFn: () => (layout ? api.patch(`/api/structure/unit-types/${layout.id}`, body()) : api.post("/api/structure/unit-types", body())),
    onSuccess: () => { refresh(); onClose(); },
  });
  const upload = useMutation({
    mutationFn: (file: File) => api.upload(`/api/structure/unit-types/${layout!.id}/image`, file),
    onSuccess: refresh,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-bold text-ink">{layout ? "Planirovka tahrirlash" : "Yangi planirovka"}</span>
          <button onClick={onClose} className="text-ink-3 hover:text-ink">✕</button>
        </div>

        {layout && (
          <div className="mb-3 flex items-center gap-3 rounded-sm border border-line-2 bg-surface-2 p-2">
            <div className="h-20 w-24 flex-none overflow-hidden rounded-sm border border-line-2 bg-white">
              {layout.image ? <img src={`/api/structure/unit-types/${layout.id}/image`} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center font-mono text-[10px] text-ink-4">plan</div>}
            </div>
            <div>
              <div className="mb-1 font-mono text-[10px] uppercase text-ink-3">Plan rasmi (SVG/PNG/JPG)</div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) upload.mutate(file); }} />
              <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
                {upload.isPending ? "Yuklanmoqda…" : "Rasm yuklash"}
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2"><Lbl>Nomi</Lbl><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="2-xonali" className={inp} /></label>
          <label><Lbl>Xona soni</Lbl><input value={f.default_rooms} onChange={(e) => setF({ ...f, default_rooms: e.target.value.replace(/\D/g, "") })} className={`${inp} font-mono`} /></label>
          <label><Lbl>Umumiy m²</Lbl><input value={f.total_m2} onChange={(e) => setF({ ...f, total_m2: e.target.value.replace(/[^\d.]/g, "") })} className={`${inp} font-mono`} /></label>
          <label><Lbl>Zal m²</Lbl><input value={f.living_m2} onChange={(e) => setF({ ...f, living_m2: e.target.value.replace(/[^\d.]/g, "") })} className={`${inp} font-mono`} /></label>
          <label><Lbl>Oshxona m²</Lbl><input value={f.kitchen_m2} onChange={(e) => setF({ ...f, kitchen_m2: e.target.value.replace(/[^\d.]/g, "") })} className={`${inp} font-mono`} /></label>
          <label className="col-span-2"><Lbl>Izoh</Lbl><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={inp} /></label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Bekor</Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={!f.name.trim() || save.isPending}>Saqlash</Button>
        </div>
      </div>
    </div>
  );
}
function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="mb-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-3">{children}</div>;
}
