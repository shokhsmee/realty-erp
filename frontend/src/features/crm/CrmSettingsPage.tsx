import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { Automation, Board, CrmField, LostReason, Pipeline } from "@/lib/types";
import { PageTitle, Card, Spinner } from "@/components/ui/misc";
import { Button } from "@/components/ui/Button";
import { ColorPicker } from "@/components/ui/ColorPicker";

function stageColorVar(c: string) { return `var(--${c === "muted" ? "line-strong" : c})`; }

type Tab = "voronka" | "fields" | "automations" | "create";
const TABS: { key: Tab; label: string }[] = [
  { key: "voronka", label: "Voronka" },
  { key: "fields", label: "Lead maydonlari" },
  { key: "automations", label: "Avtomatlar" },
  { key: "create", label: "Lead yaratish" },
];

export function CrmSettingsPage() {
  const [tab, setTab] = useState<Tab>("voronka");
  const [selId, setSelId] = useState<number | null>(null);

  const { data: pipelines } = useQuery({
    queryKey: ["crm-pipelines-all"],
    queryFn: () => api.get<Pipeline[]>("/api/crm/pipelines?include_archived=true"),
  });
  const activeId = selId ?? pipelines?.find((p) => !p.archived)?.id ?? pipelines?.[0]?.id ?? null;

  const { data: board } = useQuery({
    queryKey: ["crm-board", activeId],
    queryFn: () => api.get<Board>(`/api/crm/board?pipeline_id=${activeId}`),
    enabled: activeId != null,
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageTitle title="CRM sozlamalari" sub="Pipeline, maydonlar, avtomatlar" />
        <Link to="/crm"><Button variant="secondary" size="sm">← Voronkaga</Button></Link>
      </div>

      {tab === "voronka" && <PipelineBar pipelines={pipelines ?? []} activeId={activeId} onSelect={setSelId} />}

      <div className="mb-4 mt-3 inline-flex rounded-sm border border-line bg-surface-3 p-0.5">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`rounded-sm px-3.5 py-1.5 font-mono text-[11.5px] font-semibold ${tab === t.key ? "bg-surface text-ink shadow-sm" : "text-ink-3"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {!board ? <Spinner />
        : tab === "voronka" ? <Voronka board={board} />
        : tab === "fields" ? <Fields />
        : tab === "automations" ? <Automations board={board} />
        : <CreateSettings />}
    </div>
  );
}

/* --------------------------- Pipeline bar --------------------------- */
function PipelineBar({ pipelines, activeId, onSelect }: { pipelines: Pipeline[]; activeId: number | null; onSelect: (id: number) => void }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["crm-pipelines-all"] });
  const create = useMutation({
    mutationFn: (name: string) => api.post<Pipeline>("/api/crm/pipelines", { name }),
    onSuccess: (p) => { refresh(); onSelect(p.id); },
  });
  const archive = useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: boolean }) => api.post(`/api/crm/pipelines/${id}/archive?archived=${archived}`),
    onSuccess: refresh,
  });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pipelines.map((p) => (
        <button key={p.id} onClick={() => onSelect(p.id)}
          className={`flex items-center gap-1.5 rounded-sm border px-2.5 py-1 font-mono text-[11.5px] ${
            p.id === activeId ? "border-accent bg-accent-bg text-accent-ink" : "border-line bg-surface text-ink-3"
          } ${p.archived ? "opacity-50" : ""}`}>
          {p.name}{p.archived && " · arxiv"}
        </button>
      ))}
      <button onClick={() => { const n = prompt("Voronka nomi"); if (n?.trim()) create.mutate(n.trim()); }}
        className="rounded-sm border border-dashed border-line px-2.5 py-1 font-mono text-[11.5px] text-ink-3 hover:border-accent hover:text-accent">
        + Voronka
      </button>
      {activeId != null && (() => {
        const p = pipelines.find((x) => x.id === activeId);
        return p ? (
          <button onClick={() => archive.mutate({ id: p.id, archived: !p.archived })}
            className="ml-2 font-mono text-[11px] text-ink-3 hover:text-crit">
            {p.archived ? "arxivdan chiqarish" : "arxivlash"}
          </button>
        ) : null;
      })()}
    </div>
  );
}

/* --------------------------- Voronka (stages + lost reasons) --------------------------- */
function Voronka({ board }: { board: Board }) {
  const qc = useQueryClient();
  const pid = board.pipeline.id;
  const [name, setName] = useState("");
  const [color, setColor] = useState("info");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["crm-board"] });

  const patch = useMutation({ mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => api.patch(`/api/crm/stages/${id}`, body), onSuccess: refresh });
  const add = useMutation({ mutationFn: () => api.post(`/api/crm/pipelines/${pid}/stages`, { name: name.trim(), color, position: board.stages.length }), onSuccess: () => { setName(""); refresh(); } });
  const del = useMutation({ mutationFn: (id: number) => api.del(`/api/crm/stages/${id}`), onSuccess: refresh, onError: (e) => alert(e instanceof ApiError ? e.message : "Xatolik") });
  const reorder = useMutation({ mutationFn: ({ id, position }: { id: number; position: number }) => api.patch(`/api/crm/stages/${id}`, { position }), onSuccess: refresh });

  // Drag a column to a new index → renumber positions 0..n.
  const reorderTo = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const arr = [...board.stages];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    arr.forEach((s, i) => { if (s.position !== i) reorder.mutate({ id: s.id, position: i }); });
  };

  return (
    <div className="max-w-5xl space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">Bosqichlar — surib tartiblang</span>
          <span className="font-mono text-[10px] text-ink-4">✓ avtomatik saqlanadi</span>
        </div>

        {/* horizontal, drag-to-reorder stage columns */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {board.stages.map((st, idx) => {
            const system = st.is_won || st.is_lost;
            return (
              <div
                key={st.id}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                onDragOver={(e) => { e.preventDefault(); setOverIdx(idx); }}
                onDrop={() => { if (dragIdx != null) reorderTo(dragIdx, idx); setDragIdx(null); setOverIdx(null); }}
                className={`flex w-[190px] flex-none flex-col overflow-hidden rounded-md border bg-surface ${overIdx === idx && dragIdx !== idx ? "border-accent" : "border-line"} ${dragIdx === idx ? "opacity-50" : ""}`}
              >
                {/* colored top bar */}
                <div className="h-1.5 w-full" style={{ background: stageColorVar(st.color) }} />
                <div className="flex items-center gap-1 px-2 pt-2">
                  <span className="cursor-grab select-none font-mono text-[12px] text-ink-4" title="surib koʻchiring">⠿</span>
                  <input defaultValue={st.name} onBlur={(e) => e.target.value !== st.name && patch.mutate({ id: st.id, body: { name: e.target.value } })}
                    className="min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-1 py-0.5 text-[12.5px] font-semibold hover:border-line focus:border-accent focus:outline-none" />
                  {system
                    ? <span className="font-mono text-[11px] text-ink-4" title="tizim bosqichi">🔒</span>
                    : <button onClick={() => del.mutate(st.id)} className="font-mono text-[12px] text-ink-3 hover:text-crit">✕</button>}
                </div>
                <input defaultValue={st.description ?? ""} placeholder="+ Podskaza"
                  onBlur={(e) => (e.target.value !== (st.description ?? "")) && patch.mutate({ id: st.id, body: { description: e.target.value } })}
                  className="mx-2 mt-1 rounded-sm border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-ink-3 hover:border-line focus:border-accent focus:outline-none" />
                <div className="mt-auto border-t border-line-2 px-2 py-2">
                  <ColorPicker value={st.color} onChange={(c) => patch.mutate({ id: st.id, body: { color: c } })} size={14} />
                </div>
              </div>
            );
          })}

          {/* add-stage column */}
          <div className="flex w-[190px] flex-none flex-col justify-center gap-2 rounded-md border border-dashed border-line bg-surface-2 p-3">
            <input className="rounded-sm border border-line-strong bg-surface px-2 py-1.5 text-[12.5px] outline-none focus:border-accent" placeholder="Yangi bosqich" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && add.mutate()} />
            <ColorPicker value={color} onChange={setColor} size={14} />
            <Button size="sm" onClick={() => add.mutate()} disabled={!name.trim() || add.isPending}>+ Bosqich</Button>
          </div>
        </div>
      </Card>

      <LostReasons pipelineId={pid} />
    </div>
  );
}

function LostReasons({ pipelineId }: { pipelineId: number }) {
  const qc = useQueryClient();
  const key = ["lost-reasons", pipelineId];
  const { data: reasons } = useQuery({ queryKey: key, queryFn: () => api.get<LostReason[]>(`/api/crm/lost-reasons?pipeline_id=${pipelineId}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const [text, setText] = useState("");
  const add = useMutation({ mutationFn: () => api.post("/api/crm/lost-reasons", { pipeline_id: pipelineId, text: text.trim(), position: reasons?.length ?? 0 }), onSuccess: () => { setText(""); refresh(); } });
  const del = useMutation({ mutationFn: (id: number) => api.del(`/api/crm/lost-reasons/${id}`), onSuccess: refresh });

  return (
    <Card className="self-start p-4">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-crit">Rad etish sabablari</div>
      <p className="mb-3 text-[12px] text-ink-3">Sabablarni sozlab, sotuvdagi zaif joylarni aniqlang.</p>
      <div className="space-y-1.5">
        {reasons?.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-sm border border-line-2 bg-surface px-2.5 py-1.5 text-[13px]">
            <span className="flex-1 text-ink">{r.text}</span>
            <button onClick={() => del.mutate(r.id)} className="font-mono text-ink-3 hover:text-crit">🗑</button>
          </div>
        ))}
        {!reasons?.length && <div className="rounded-sm border border-dashed border-line-2 py-4 text-center font-mono text-[11px] text-ink-4">sabab yoʻq</div>}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input className="flex-1 rounded-sm border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
          placeholder="Sabab qoʻshish" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && text.trim() && add.mutate()} />
        <Button size="sm" onClick={() => add.mutate()} disabled={!text.trim()}>+</Button>
      </div>
    </Card>
  );
}

/* --------------------------- Custom fields --------------------------- */
function Fields() {
  const qc = useQueryClient();
  const { data: fields, isLoading } = useQuery({ queryKey: ["crm-fields-all"], queryFn: () => api.get<CrmField[]>("/api/crm/fields?active_only=false") });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["crm-fields-all"] }); qc.invalidateQueries({ queryKey: ["crm-fields"] }); };
  const [f, setF] = useState({ key: "", label: "", field_type: "text", options: "" });

  const patch = useMutation({ mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => api.patch(`/api/crm/fields/${id}`, body), onSuccess: refresh });
  const add = useMutation({
    mutationFn: () => api.post("/api/crm/fields", { key: f.key.trim(), label: f.label.trim(), field_type: f.field_type, options: f.field_type === "select" ? f.options.split(",").map((o) => o.trim()).filter(Boolean) : [] }),
    onSuccess: () => { setF({ key: "", label: "", field_type: "text", options: "" }); refresh(); },
    onError: (e) => alert(e instanceof ApiError ? e.message : "Xatolik"),
  });

  if (isLoading) return <Spinner />;
  return (
    <Card className="max-w-2xl p-4">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">Karta maydonlari (qoʻshish / oʻchirish)</div>
      <div className="mt-2 space-y-2">
        {fields?.map((fd) => (
          <div key={fd.id} className={`flex items-center gap-3 rounded-sm border border-line-2 bg-surface p-2.5 ${fd.active ? "" : "opacity-50"}`}>
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-4">{fd.field_type}</span>
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-ink">{fd.label}</div>
              <div className="font-mono text-[10px] text-ink-3">{fd.key}{fd.options.length ? ` · ${fd.options.join(", ")}` : ""}</div>
            </div>
            <label className="flex items-center gap-1 font-mono text-[10.5px] text-ink-3"><input type="checkbox" checked={fd.required} onChange={(e) => patch.mutate({ id: fd.id, body: { required: e.target.checked } })} /> majburiy</label>
            <label className="flex items-center gap-1 font-mono text-[10.5px] text-ink-3"><input type="checkbox" checked={fd.active} onChange={(e) => patch.mutate({ id: fd.id, body: { active: e.target.checked } })} /> faol</label>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4 md:grid-cols-4">
        <input className="rounded-sm border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent" placeholder="key (lotin)" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value.replace(/[^a-z0-9_]/g, "") })} />
        <input className="rounded-sm border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent" placeholder="Nomi" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
        <select className="rounded-sm border border-line-strong bg-surface px-2 py-1.5 text-[13px]" value={f.field_type} onChange={(e) => setF({ ...f, field_type: e.target.value })}>
          <option value="text">text</option><option value="number">number</option><option value="select">select</option><option value="date">date</option>
        </select>
        <Button size="sm" onClick={() => add.mutate()} disabled={!f.key || !f.label}>+ Maydon</Button>
        {f.field_type === "select" && (
          <input className="col-span-2 rounded-sm border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent md:col-span-4" placeholder="Variantlar (vergul bilan)" value={f.options} onChange={(e) => setF({ ...f, options: e.target.value })} />
        )}
      </div>
    </Card>
  );
}

/* --------------------------- Automations --------------------------- */
function Automations({ board }: { board: Board }) {
  const qc = useQueryClient();
  const pid = board.pipeline.id;
  const { data: autos, isLoading } = useQuery({ queryKey: ["crm-automations", pid], queryFn: () => api.get<Automation[]>(`/api/crm/automations?pipeline_id=${pid}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["crm-automations", pid] });
  const stageName = (id: number) => board.stages.find((s) => s.id === id)?.name ?? "?";
  const [a, setA] = useState({ trigger_stage_id: board.stages[0]?.id ?? 0, action: "create_task", text: "", due_days: "1" });

  const add = useMutation({
    mutationFn: () => api.post("/api/crm/automations", { pipeline_id: pid, trigger_stage_id: Number(a.trigger_stage_id), action: a.action, config: a.action === "create_task" ? { text: a.text, due_days: Number(a.due_days) || 1 } : { text: a.text } }),
    onSuccess: () => { setA({ ...a, text: "" }); refresh(); },
  });
  const del = useMutation({ mutationFn: (id: number) => api.del(`/api/crm/automations/${id}`), onSuccess: refresh });

  if (isLoading) return <Spinner />;
  return (
    <Card className="max-w-2xl p-4">
      <p className="mb-3 text-[12.5px] text-ink-3">Lead bosqichga kirganda avtomatik amal bajariladi (digital pipeline).</p>
      <div className="space-y-2">
        {autos?.length ? autos.map((au) => (
          <div key={au.id} className="flex items-center gap-2 rounded-sm border border-line-2 bg-surface p-2.5 text-[13px]">
            <span className="font-mono text-[10px] uppercase text-accent">{stageName(au.trigger_stage_id)}</span>
            <span className="text-ink-3">→</span>
            <span className="font-mono text-[11px] text-ink-2">{au.action === "create_task" ? "vazifa" : "eslatma"}</span>
            <span className="flex-1 truncate text-ink">"{au.config.text}"{au.action === "create_task" ? ` (${au.config.due_days} kun)` : ""}</span>
            <button onClick={() => del.mutate(au.id)} className="px-1.5 font-mono text-ink-3 hover:text-crit">✕</button>
          </div>
        )) : <div className="rounded-sm border border-dashed border-line-2 py-6 text-center font-mono text-[11px] text-ink-4">avtomat yoʻq</div>}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <select className="rounded-sm border border-line-strong bg-surface px-2 py-1.5 text-[12px]" value={a.trigger_stage_id} onChange={(e) => setA({ ...a, trigger_stage_id: Number(e.target.value) })}>
          {board.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="rounded-sm border border-line-strong bg-surface px-2 py-1.5 text-[12px]" value={a.action} onChange={(e) => setA({ ...a, action: e.target.value })}>
          <option value="create_task">Vazifa yaratish</option><option value="add_note">Eslatma qoʻshish</option>
        </select>
        <input className="flex-1 rounded-sm border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent" placeholder="Matn" value={a.text} onChange={(e) => setA({ ...a, text: e.target.value })} />
        {a.action === "create_task" && <input className="w-20 rounded-sm border border-line-strong bg-surface px-2.5 py-1.5 font-mono text-[13px]" placeholder="kun" value={a.due_days} onChange={(e) => setA({ ...a, due_days: e.target.value.replace(/[^\d]/g, "") })} />}
        <Button size="sm" onClick={() => add.mutate()} disabled={!a.text.trim()}>+ Avtomat</Button>
      </div>
    </Card>
  );
}

/* --------------------------- Create settings --------------------------- */
function CreateSettings() {
  const { data: fields } = useQuery({ queryKey: ["crm-fields-all"], queryFn: () => api.get<CrmField[]>("/api/crm/fields?active_only=false") });
  const required = fields?.filter((f) => f.required && f.active) ?? [];
  return (
    <Card className="max-w-2xl p-4">
      <p className="text-[13px] text-ink-2">Yangi lead standart <b>voronkaning birinchi bosqichida</b> yaratiladi. Majburiy maydonlar <Link to="/crm/settings" className="text-accent">Lead maydonlari</Link> boʻlimida belgilanadi.</p>
      <div className="mt-3">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">Majburiy maydonlar</div>
        {required.length
          ? <div className="flex flex-wrap gap-1.5">{required.map((f) => <span key={f.id} className="rounded-sm bg-warn-bg px-2 py-0.5 font-mono text-[11px] text-warn">{f.label} *</span>)}</div>
          : <div className="font-mono text-[12px] text-ink-4">majburiy maydon yoʻq</div>}
      </div>
    </Card>
  );
}
