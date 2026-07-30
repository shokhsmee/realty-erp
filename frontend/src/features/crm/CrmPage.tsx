import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Board, CrmTag, Pipeline, Stage } from "@/lib/types";
import { PageTitle, Spinner } from "@/components/ui/misc";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/components/ui/Money";
import { useAuth } from "@/lib/auth";
import { LeadCard } from "@/features/crm/LeadCard";

const HEAD_COLOR: Record<string, string> = { info: "text-accent", accent: "text-accent-ink", warn: "text-warn", ok: "text-ok", crit: "text-crit", muted: "text-ink-3" };
const TAG_STYLE: Record<string, { bg: string; fg: string; bd: string }> = {
  accent: { bg: "--accent-bg", fg: "--accent-ink", bd: "--accent" },
  info: { bg: "--info-bg", fg: "--info", bd: "--info-line" },
  ok: { bg: "--ok-bg", fg: "--ok", bd: "--ok-line" },
  warn: { bg: "--warn-bg", fg: "--warn", bd: "--warn-line" },
  crit: { bg: "--crit-bg", fg: "--crit", bd: "--crit-line" },
};
function tagStyle(color: string): React.CSSProperties {
  const s = TAG_STYLE[color] ?? TAG_STYLE.accent;
  return { background: `var(${s.bg})`, color: `var(${s.fg})`, borderColor: `var(${s.bd})` };
}
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join(""); }

interface Filters { q: string; source: string; minBudget: string; maxBudget: string; preset: "" | "no_task" | "overdue"; }
const EMPTY: Filters = { q: "", source: "", minBudget: "", maxBudget: "", preset: "" };

export function CrmPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canEdit = can("crm", "edit");
  const canManage = can("crm", "manage");

  const [dragLead, setDragLead] = useState<number | null>(null);
  const [dropStage, setDropStage] = useState<number | null>(null);
  const [openLead, setOpenLead] = useState<number | null>(null);
  const [quickAdd, setQuickAdd] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [pipelineId, setPipelineId] = useState<number | null>(null);

  const { data: pipelines } = useQuery({ queryKey: ["crm-pipelines"], queryFn: () => api.get<Pipeline[]>("/api/crm/pipelines") });
  const { data: tagCatalog } = useQuery({ queryKey: ["crm-tags"], queryFn: () => api.get<CrmTag[]>("/api/crm/tags") });
  const tagColor = Object.fromEntries((tagCatalog ?? []).map((t) => [t.text, t.color]));
  const { data: assignees } = useQuery({ queryKey: ["assignable"], queryFn: () => api.get<{ id: number; full_name: string }[]>("/api/users/assignable"), retry: false });
  const managerName = Object.fromEntries((assignees ?? []).map((u) => [u.id, u.full_name]));

  const params = new URLSearchParams();
  if (pipelineId) params.set("pipeline_id", String(pipelineId));
  if (filters.q) params.set("q", filters.q);
  if (filters.source) params.set("source", filters.source);
  if (filters.minBudget) params.set("min_budget", filters.minBudget);
  if (filters.maxBudget) params.set("max_budget", filters.maxBudget);
  if (filters.preset === "no_task") params.set("no_task", "true");
  if (filters.preset === "overdue") params.set("overdue", "true");
  const qs = params.toString();

  const { data: board, isLoading } = useQuery({ queryKey: ["crm-board", qs], queryFn: () => api.get<Board>(`/api/crm/board${qs ? `?${qs}` : ""}`) });

  const move = useMutation({ mutationFn: ({ leadId, stageId }: { leadId: number; stageId: number }) => api.patch(`/api/crm/leads/${leadId}/move`, { stage_id: stageId }), onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-board"] }) });
  const create = useMutation({ mutationFn: (body: Record<string, unknown>) => api.post("/api/crm/leads", body), onSuccess: () => { setQuickAdd(false); qc.invalidateQueries({ queryKey: ["crm-board"] }); } });

  const onDrop = (stage: Stage) => {
    setDropStage(null);
    if (dragLead != null && board) {
      const from = board.stages.find((s) => s.leads.some((l) => l.id === dragLead));
      if (from?.id !== stage.id) move.mutate({ leadId: dragLead, stageId: stage.id });
    }
    setDragLead(null);
  };
  const activeFilters = filters.q || filters.source || filters.minBudget || filters.maxBudget || filters.preset;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3">
        <PageTitle title="CRM" sub="Voronka" />
        {/* Voronka switcher */}
        <select
          value={pipelineId ?? board?.pipeline.id ?? ""}
          onChange={(e) => setPipelineId(Number(e.target.value))}
          className="rounded-sm border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-semibold outline-none focus:border-accent"
        >
          {pipelines?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2">
          {canEdit && <Button size="sm" onClick={() => setQuickAdd((v) => !v)}>+ Yangi lead</Button>}
          <Button size="sm" variant={activeFilters ? "primary" : "secondary"} onClick={() => setFilterOpen(true)}>
            ⛭ Filtr{activeFilters ? " •" : ""}
          </Button>
          {canManage && <Link to="/crm/settings"><Button variant="secondary" size="sm">⚙</Button></Link>}
        </div>
      </div>

      {isLoading || !board ? (
        <div className="flex justify-center pt-10"><Spinner label="Voronka yuklanmoqda…" /></div>
      ) : (
        <div className="mt-3 flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
          {board.stages.map((stage, stageIdx) => (
            <div key={stage.id}
              onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDropStage(stage.id); } }}
              onDragLeave={() => setDropStage((s) => (s === stage.id ? null : s))}
              onDrop={() => onDrop(stage)}
              className={`flex w-64 flex-none flex-col rounded border bg-surface-2 ${dropStage === stage.id ? "border-accent" : "border-line"}`}>
              <div className="px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className={`font-mono text-[11px] font-semibold uppercase tracking-[0.06em] ${HEAD_COLOR[stage.color] ?? "text-ink-2"}`}>{stage.name}</span>
                  <span className="rounded-full border border-line bg-surface px-2 py-0.5 font-mono text-[10px] text-ink-3">{stage.count} · {formatMoney(stage.total_budget)}</span>
                </div>
                {stage.description && <div className="mt-0.5 truncate font-mono text-[10px] text-ink-4">{stage.description}</div>}
              </div>
              <div className="flex-1 space-y-2 overflow-auto px-2 pb-2">
                {stageIdx === 0 && quickAdd && <QuickAdd busy={create.isPending} onCancel={() => setQuickAdd(false)} onSubmit={(b) => create.mutate({ ...b, stage_id: stage.id })} />}
                {stage.leads.map((lead) => (
                  <div key={lead.id} draggable={canEdit} onDragStart={() => setDragLead(lead.id)} onDragEnd={() => setDragLead(null)} onClick={() => setOpenLead(lead.id)}
                    className={`cursor-pointer rounded-sm border border-line border-l-[3px] bg-surface p-2.5 shadow-sm hover:border-accent ${dragLead === lead.id ? "opacity-50" : ""}`}
                    style={{ borderLeftColor: `var(--${stage.color === "muted" ? "line-strong" : stage.color})` }}>
                    <div className="text-[13px] font-semibold text-ink">{lead.title}</div>
                    {lead.tags?.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {lead.tags.slice(0, 4).map((t) => <span key={t} className="rounded-sm border px-1.5 py-0.5 font-mono text-[9px]" style={tagStyle(tagColor[t] ?? "accent")}>{t}</span>)}
                      </div>
                    )}
                    <div className="mt-1.5 flex items-center gap-2 font-mono text-[10.5px] text-ink-3">
                      <span>{lead.source ?? "—"}</span>
                      <span className="tnum ml-auto text-ink-2">{formatMoney(lead.budget)}</span>
                      {lead.manager_id != null && managerName[lead.manager_id] && (
                        <span title={managerName[lead.manager_id]} className="grid h-5 w-5 flex-none place-items-center rounded-full bg-accent text-[8px] font-bold text-white">
                          {initials(managerName[lead.manager_id])}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {stage.leads.length === 0 && <div className="rounded-sm border border-dashed border-line-2 py-6 text-center font-mono text-[10px] text-ink-4">boʻsh</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {filterOpen && <FilterPanel filters={filters} onChange={setFilters} onClose={() => setFilterOpen(false)} onClear={() => setFilters(EMPTY)} />}
      {openLead != null && board && <LeadCard leadId={openLead} stages={board.stages} onClose={() => setOpenLead(null)} />}
    </div>
  );
}

/* --------------------------- filter panel --------------------------- */
function FilterPanel({ filters, onChange, onClose, onClear }: { filters: Filters; onChange: (f: Filters) => void; onClose: () => void; onClear: () => void }) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const PRESETS: { key: Filters["preset"]; label: string; dot?: string }[] = [
    { key: "", label: "Barcha leadlar" },
    { key: "no_task", label: "Vazifasiz", dot: "var(--warn)" },
    { key: "overdue", label: "Muddati oʻtgan", dot: "var(--crit)" },
  ];
  return (
    <div className="fixed inset-0 z-40 flex bg-ink/30" onClick={onClose}>
      <div className="ml-auto flex h-full w-full max-w-md flex-col bg-surface shadow-lg md:grid md:grid-cols-[200px_1fr] md:max-w-2xl" onClick={(e) => e.stopPropagation()}>
        {/* presets */}
        <div className="border-r border-line bg-surface-2 p-3">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">Tez saralash</div>
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => set({ preset: p.key })}
              className={`flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-[13px] ${filters.preset === p.key ? "bg-accent-bg font-semibold text-accent-ink" : "text-ink-2 hover:bg-surface-3"}`}>
              {p.dot && <span className="h-2 w-2 rounded-full" style={{ background: p.dot }} />}{p.label}
            </button>
          ))}
        </div>
        {/* properties */}
        <div className="flex flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[15px] font-bold text-ink">Filtr</span>
            <button onClick={onClose} className="text-ink-3 hover:text-ink">✕</button>
          </div>
          <div className="space-y-3">
            <Field label="Qidiruv"><input value={filters.q} onChange={(e) => set({ q: e.target.value })} className="w-full rounded-sm border border-line-strong bg-surface px-3 py-1.5 text-[13px] outline-none focus:border-accent" placeholder="Lead nomi" /></Field>
            <Field label="Manba"><input value={filters.source} onChange={(e) => set({ source: e.target.value })} className="w-full rounded-sm border border-line-strong bg-surface px-3 py-1.5 text-[13px] outline-none focus:border-accent" placeholder="instagram, telegram…" /></Field>
            <Field label="Byudjet">
              <div className="flex items-center gap-2">
                <input value={filters.minBudget} onChange={(e) => set({ minBudget: e.target.value.replace(/[^\d]/g, "") })} className="w-full rounded-sm border border-line-strong bg-surface px-3 py-1.5 font-mono text-[13px] outline-none focus:border-accent" placeholder="dan" />
                <span className="text-ink-3">—</span>
                <input value={filters.maxBudget} onChange={(e) => set({ maxBudget: e.target.value.replace(/[^\d]/g, "") })} className="w-full rounded-sm border border-line-strong bg-surface px-3 py-1.5 font-mono text-[13px] outline-none focus:border-accent" placeholder="gacha" />
              </div>
            </Field>
          </div>
          <div className="mt-auto flex justify-between border-t border-line pt-3">
            <button onClick={onClear} className="font-mono text-[12px] text-ink-3 hover:text-crit">Tozalash</button>
            <Button size="sm" onClick={onClose}>Qoʻllash</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">{label}</div>{children}</div>;
}

/* --------------------------- quick add --------------------------- */
function QuickAdd({ onSubmit, onCancel, busy }: { onSubmit: (b: Record<string, unknown>) => void; onCancel: () => void; busy: boolean }) {
  const [f, setF] = useState({ title: "", budget: "", cname: "", cphone: "", cemail: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = () => {
    if (!f.title.trim() && !f.cname.trim()) return;
    onSubmit({ title: f.title.trim() || f.cname.trim(), budget: f.budget ? Number(f.budget) : 0, contact_name: f.cname.trim() || null, contact_phone: f.cphone.trim() || null, contact_email: f.cemail.trim() || null });
  };
  const inp = "w-full border-0 border-b border-line bg-transparent px-1 py-1.5 text-[13px] outline-none placeholder:text-ink-4 focus:border-accent";
  return (
    <div className="rounded-md border border-accent bg-surface p-2 shadow-sm">
      <input className={inp} placeholder="Nomi" value={f.title} onChange={set("title")} autoFocus />
      <input className={`${inp} font-mono`} placeholder="0 soʻm" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value.replace(/[^\d]/g, "") })} />
      <input className={inp} placeholder="Kontakt: Ism" value={f.cname} onChange={set("cname")} />
      <input className={inp} placeholder="Kontakt: Telefon" value={f.cphone} onChange={set("cphone")} />
      <input className={inp} placeholder="Kontakt: Email" value={f.cemail} onChange={set("cemail")} />
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" onClick={submit} disabled={busy}>Qoʻshish</Button>
        <button onClick={onCancel} className="font-mono text-[11px] text-ink-3 hover:text-ink">Bekor</button>
      </div>
    </div>
  );
}
