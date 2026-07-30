import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Attachment, Contact, CrmField, CrmTag, LeadDetail, LeadEvent, LostReason, Stage, TaskType, Unit } from "@/lib/types";

type Assignee = { id: number; full_name: string };
import { Button } from "@/components/ui/Button";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { formatMoney } from "@/components/ui/Money";
import { StatusPill } from "@/components/ui/StatusPill";
import { Spinner } from "@/components/ui/misc";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { DealWizard } from "@/features/shaxmatka/DealWizard";
import { UnitPicker } from "@/features/shaxmatka/UnitPicker";

/* ----------------------------- helpers ----------------------------- */
const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
const SYSTEM_KINDS = new Set(["created", "stage_change", "system"]);
const TAG_COLORS = ["accent", "info", "ok", "warn", "crit"];
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
const KIND_ICON: Record<string, string> = { note: "✎", task: "◔", call: "☎", meeting: "◫", message_in: "↙", message_out: "↗" };
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join(""); }
function fmt(iso: string) { const d = new Date(iso), p = (n: number) => String(n).padStart(2, "0"); return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; }
function monthKey(iso: string) { const d = new Date(iso); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
function daysBetween(iso: string) { return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)); }
function kb(n: number) { return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`; }

/* ============================== main ============================== */
export function LeadCard({ leadId, stages, onClose }: { leadId: number; stages: Stage[]; onClose: () => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canEdit = can("crm", "edit");

  const { data: lead, isLoading } = useQuery({ queryKey: ["lead", leadId], queryFn: () => api.get<LeadDetail>(`/api/crm/leads/${leadId}`) });
  const { data: fields } = useQuery({ queryKey: ["crm-fields"], queryFn: () => api.get<CrmField[]>("/api/crm/fields") });
  const { data: tagCatalog } = useQuery({ queryKey: ["crm-tags"], queryFn: () => api.get<CrmTag[]>("/api/crm/tags") });
  const { data: taskTypes } = useQuery({ queryKey: ["crm-task-types"], queryFn: () => api.get<TaskType[]>("/api/crm/task-types") });
  const { data: users } = useQuery({ queryKey: ["assignable"], queryFn: () => api.get<Assignee[]>("/api/users/assignable"), retry: false });
  const { data: contacts } = useQuery({ queryKey: ["contacts"], queryFn: () => api.get<Contact[]>("/api/contacts"), retry: false });

  const usersMap = useMemo(() => Object.fromEntries((users ?? []).map((u) => [u.id, u.full_name])), [users]);
  const tagColor = useMemo(() => Object.fromEntries((tagCatalog ?? []).map((t) => [t.text, t.color])), [tagCatalog]);
  const contact = useMemo(() => (lead?.contact_id ? (contacts ?? []).find((c) => c.id === lead.contact_id) : undefined), [contacts, lead]);

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["lead", leadId] }); qc.invalidateQueries({ queryKey: ["crm-board"] }); };
  const patchLead = useMutation({ mutationFn: (b: Record<string, unknown>) => api.patch(`/api/crm/leads/${leadId}`, b), onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["crm-tags"] }); } });
  const move = useMutation({ mutationFn: (sid: number) => api.patch(`/api/crm/leads/${leadId}/move`, { stage_id: sid }), onSuccess: invalidate });
  const addEvent = useMutation({ mutationFn: (b: { kind: string; text: string; due_at?: string | null; meta?: Record<string, unknown> }) => api.post(`/api/crm/leads/${leadId}/events`, b), onSuccess: invalidate });
  const toggleTask = useMutation({ mutationFn: ({ id, done }: { id: number; done: boolean }) => api.post(`/api/crm/events/${id}/done?done=${done}`), onSuccess: invalidate });
  const patchContact = useMutation({ mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => api.patch(`/api/contacts/${id}`, body), onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }) });
  const createContact = useMutation({ mutationFn: (name: string) => api.post<Contact>("/api/contacts", { full_name: name }), onSuccess: async (c) => { await api.patch(`/api/crm/leads/${leadId}`, { contact_id: c.id }); qc.invalidateQueries({ queryKey: ["contacts"] }); invalidate(); } });
  const createTaskType = useMutation({ mutationFn: (name: string) => api.post<TaskType>("/api/crm/task-types", { name }), onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-task-types"] }) });
  const setInterest = useMutation({ mutationFn: (unit_id: number) => api.post(`/api/crm/leads/${leadId}/interest`, { unit_id }), onSuccess: invalidate });
  const linkDeal = useMutation({ mutationFn: (b: { deal_id: number; won: boolean }) => api.post(`/api/crm/leads/${leadId}/link-deal`, b), onSuccess: invalidate });
  const clearUnit = useMutation({ mutationFn: () => api.patch(`/api/crm/leads/${leadId}`, { unit_id: null }), onSuccess: invalidate });

  const { data: lostReasons } = useQuery({ queryKey: ["lost-reasons", lead?.pipeline_id], queryFn: () => api.get<LostReason[]>(`/api/crm/lost-reasons?pipeline_id=${lead!.pipeline_id}`), enabled: !!lead });
  const closeAndRefresh = () => { qc.invalidateQueries({ queryKey: ["crm-board"] }); onClose(); };
  const delLead = useMutation({ mutationFn: () => api.del(`/api/crm/leads/${leadId}`), onSuccess: closeAndRefresh });
  const lostLead = useMutation({ mutationFn: (reason: string | null) => api.post(`/api/crm/leads/${leadId}/lost`, { reason }), onSuccess: closeAndRefresh });

  return (
    <div className="fixed inset-0 z-50 bg-ink/25">
      <div className="grid h-full grid-cols-1 bg-surface md:grid-cols-[320px_1fr] lg:grid-cols-[320px_1fr_290px]">
        {isLoading || !lead ? (
          <div className="col-span-full flex items-center justify-center"><Spinner /></div>
        ) : (
          <>
            <LeftPanel
              lead={lead} stages={stages} fields={fields ?? []} contact={contact}
              users={users ?? []}
              canEdit={canEdit} lostReasons={lostReasons ?? []} tagColor={tagColor}
              onMove={(sid) => move.mutate(sid)} onPatch={(b) => patchLead.mutate(b)}
              onDelete={() => delLead.mutate()} onLost={(r) => lostLead.mutate(r)} onClose={onClose}
              onPatchContact={(id, body) => patchContact.mutate({ id, body })} onCreateContact={(n) => createContact.mutate(n)}
            />
            <Chatter
              lead={lead} usersMap={usersMap} canEdit={canEdit} taskTypes={taskTypes ?? []}
              onAdd={(b) => addEvent.mutate(b)} busy={addEvent.isPending}
              onToggleTask={(id, done) => toggleTask.mutate({ id, done })}
              onCreateTaskType={(n) => createTaskType.mutate(n)} onClose={onClose}
            />
            <SalesRail
              lead={lead} canEdit={canEdit}
              onInterest={(uid) => setInterest.mutate(uid)}
              onLinkDeal={(deal_id, won) => linkDeal.mutate({ deal_id, won })}
              onClearUnit={() => clearUnit.mutate()}
            />
          </>
        )}
      </div>
    </div>
  );
}

/* ============================ left panel ============================ */
function LeftPanel(props: {
  lead: LeadDetail; stages: Stage[]; fields: CrmField[]; contact?: Contact; users: Assignee[];
  canEdit: boolean; lostReasons: LostReason[]; tagColor: Record<string, string>;
  onMove: (sid: number) => void; onPatch: (b: Record<string, unknown>) => void; onDelete: () => void; onLost: (r: string | null) => void;
  onClose: () => void; onPatchContact: (id: number, body: Record<string, unknown>) => void; onCreateContact: (name: string) => void;
}) {
  const { lead, stages, fields, contact, users, canEdit, lostReasons, tagColor, onMove, onPatch, onDelete, onLost, onClose, onPatchContact, onCreateContact } = props;
  const lastStage = lead.events.find((e) => e.kind === "stage_change");
  const daysInStage = daysBetween(lastStage?.created_at ?? lead.created_at);
  const curIdx = stages.findIndex((s) => s.id === lead.stage_id);
  const [menu, setMenu] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [tab, setTab] = useState<"asosiy" | "fayllar">("asosiy");

  return (
    <aside className="flex flex-col overflow-auto border-r border-line bg-surface-2">
      <div className="flex items-center gap-2 px-4 pt-4">
        <button onClick={onClose} className="text-ink-3 hover:text-ink" aria-label="Orqaga">‹</button>
        <h2 className="flex-1 truncate text-[17px] font-bold text-ink">{lead.title}</h2>
        {lead.status === "lost" && <span className="rounded-sm bg-crit-bg px-1.5 py-0.5 font-mono text-[10px] text-crit">rad etilgan</span>}
        {canEdit && (
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} className="px-1 text-ink-3 hover:text-ink" aria-label="Amallar">⋯</button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-7 z-20 w-48 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-lg">
                  <button onClick={() => { setMenu(false); setLostOpen(true); }} className="block w-full px-3 py-2 text-left text-[13px] text-ink hover:bg-surface-2">Rad etish (yopish)</button>
                  <button onClick={() => { setMenu(false); if (confirm("Leadni butunlay oʻchirish?")) onDelete(); }} className="block w-full px-3 py-2 text-left text-[13px] text-crit hover:bg-crit-bg">Oʻchirish</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {lostOpen && <LostPicker reasons={lostReasons} onCancel={() => setLostOpen(false)} onConfirm={(r) => { setLostOpen(false); onLost(r); }} />}

      {/* stage bar */}
      <div className="px-4 pb-3 pt-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-ink">{lead.stage_name}</span>
          <span className="font-mono text-[11px] text-ink-3">{daysInStage} kun ▾</span>
        </div>
        <div className="flex gap-0.5">
          {stages.map((sg, i) => (
            <button key={sg.id} disabled={!canEdit} onClick={() => onMove(sg.id)} title={sg.name}
              className="h-1.5 flex-1 rounded-sm transition"
              style={{ background: curIdx >= 0 && i <= curIdx ? `var(--${sg.color === "muted" ? "line-strong" : sg.color})` : "var(--line)" }} />
          ))}
        </div>
      </div>

      {/* tabs (Statistika/Hujjatlar removed) */}
      <div className="flex gap-4 border-b border-line px-4 text-[13px]">
        {(["asosiy", "fayllar"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`pb-2 ${tab === t ? "border-b-2 border-accent font-semibold text-ink" : "text-ink-3"}`}>
            {t === "asosiy" ? "Asosiy" : "Fayllar"}
          </button>
        ))}
      </div>

      {tab === "asosiy" ? (
        <>
          <div className="px-4 py-3">
            <Row label="Masʼul">
              {canEdit ? (
                <select value={lead.manager_id ?? ""} onChange={(e) => onPatch({ manager_id: e.target.value ? Number(e.target.value) : null })}
                  className="w-full bg-transparent text-[13px] text-ink outline-none">
                  <option value="">—</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              ) : (users.find((u) => u.id === lead.manager_id)?.full_name ?? "…")}
            </Row>
            <Row label="Byudjet"><Inline value={String(Number(lead.budget) || "")} suffix=" soʻm" mono disabled={!canEdit} onSave={(v) => onPatch({ budget: Number(v.replace(/[^\d.]/g, "")) || 0 })} /></Row>
            <Row label="Manba"><Inline value={lead.source ?? ""} disabled={!canEdit} onSave={(v) => onPatch({ source: v })} /></Row>
            <div className="py-1.5">
              <div className="mb-1 text-[13px] text-ink-3">Teglar</div>
              <TagEditor tags={lead.tags ?? []} colorOf={tagColor} canEdit={canEdit} onChange={(t) => onPatch({ tags: t })} />
            </div>
            {fields.map((f) => (
              <Row key={f.id} label={f.label}>
                {f.field_type === "select" ? (
                  <select disabled={!canEdit} value={String(lead.custom?.[f.key] ?? "")} onChange={(e) => onPatch({ custom: { ...lead.custom, [f.key]: e.target.value } })} className="w-full bg-transparent text-[13px] text-ink outline-none">
                    <option value="">…</option>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <Inline value={String(lead.custom?.[f.key] ?? "")} type={f.field_type === "date" ? "date" : f.field_type === "number" ? "number" : "text"} disabled={!canEdit} onSave={(v) => onPatch({ custom: { ...lead.custom, [f.key]: v } })} />
                )}
              </Row>
            ))}
          </div>
          <ContactSection lead={lead} contact={contact} canEdit={canEdit} onPatchContact={onPatchContact} onCreateContact={onCreateContact} />
        </>
      ) : (
        <FileList leadId={lead.id} canEdit={canEdit} />
      )}
    </aside>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-baseline gap-2 py-1.5 text-[13px]"><span className="w-28 flex-none text-ink-3">{label}</span><span className="min-w-0 flex-1 text-ink">{children}</span></div>;
}

function Inline({ value, onSave, disabled, mono, suffix, type = "text" }: { value: string; onSave: (v: string) => void; disabled?: boolean; mono?: boolean; suffix?: string; type?: string }) {
  const [v, setV] = useState(value);
  const [editing, setEditing] = useState(false);
  if (disabled || !editing)
    return <span onClick={() => !disabled && setEditing(true)} className={`block cursor-text truncate ${value ? (mono ? "font-mono tnum" : "") : "text-ink-4"}`}>{value ? (mono ? formatMoney(value) : value) + (suffix ?? "") : "…"}</span>;
  return <input autoFocus type={type} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { setEditing(false); if (v !== value) onSave(v); }} className={`w-full rounded-sm border border-accent bg-surface px-1.5 py-0.5 text-[13px] outline-none ${mono ? "font-mono" : ""}`} />;
}

/* ---------------------------- tag editor ---------------------------- */
function TagEditor({ tags, colorOf, canEdit, onChange }: { tags: string[]; colorOf: Record<string, string>; canEdit: boolean; onChange: (t: string[]) => void }) {
  const [text, setText] = useState("");
  const [color, setColor] = useState("accent");
  const add = () => { const t = text.trim(); if (!t || tags.includes(t)) { setText(""); return; } onChange([...tags, t]); setText(""); };
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[11px]" style={tagStyle(colorOf[t] ?? color)}>
            {t}
            {canEdit && <button onClick={() => onChange(tags.filter((x) => x !== t))} className="opacity-60 hover:opacity-100">✕</button>}
          </span>
        ))}
        {tags.length === 0 && <span className="text-ink-4">…</span>}
      </div>
      {canEdit && (
        <div className="mt-1.5 flex items-center gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="+ teg" className="w-24 rounded-sm border border-line-strong bg-surface px-2 py-1 text-[12px] outline-none focus:border-accent" />
          <ColorPicker value={color} onChange={setColor} colors={TAG_COLORS} size={14} />
          <button onClick={add} className="font-mono text-[11px] text-accent hover:underline">qoʻshish</button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------- contact section ---------------------------- */
function ContactSection({ lead, contact, canEdit, onPatchContact, onCreateContact }: {
  lead: LeadDetail; contact?: Contact; canEdit: boolean; onPatchContact: (id: number, body: Record<string, unknown>) => void; onCreateContact: (name: string) => void;
}) {
  const [open, setOpen] = useState(true);
  if (!lead.contact_id) {
    return (
      <div className="border-t border-line px-4 py-3">
        {canEdit ? (
          <button onClick={() => { const n = prompt("Kontakt ismi"); if (n?.trim()) onCreateContact(n.trim()); }}
            className="flex w-full items-center gap-2 rounded-sm border border-dashed border-line py-2 text-[12.5px] text-ink-3 hover:border-accent hover:text-accent">
            <span className="grid h-5 w-5 place-items-center rounded-full border border-current">＋</span> Kontakt qoʻshish
          </button>
        ) : <div className="text-[12px] text-ink-4">Kontakt yoʻq</div>}
      </div>
    );
  }
  return (
    <div className="border-t border-line px-4 py-3">
      <button onClick={() => setOpen((o) => !o)} className="mb-2 flex w-full items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-accent font-mono text-[11px] font-bold text-white">{initials(contact?.full_name ?? lead.contact_name ?? "?")}</span>
        <span className="flex-1 truncate text-left text-[13px] font-semibold text-ink">{contact?.full_name ?? lead.contact_name}</span>
        <span className="text-ink-3">{open ? "▾" : "▸"}</span>
      </button>
      {open && contact && (
        <div className="pl-1">
          <Row label="Ism"><Inline value={contact.full_name} disabled={!canEdit} onSave={(v) => onPatchContact(contact.id, { full_name: v })} /></Row>
          <Row label="Tel"><Inline value={contact.phone ?? ""} disabled={!canEdit} onSave={(v) => onPatchContact(contact.id, { phone: v })} /></Row>
          <Row label="Email"><Inline value={contact.email ?? ""} disabled={!canEdit} onSave={(v) => onPatchContact(contact.id, { email: v })} /></Row>
          <Row label="Manba"><Inline value={contact.source ?? ""} disabled={!canEdit} onSave={(v) => onPatchContact(contact.id, { source: v })} /></Row>
        </div>
      )}
    </div>
  );
}

/* ---------------------------- files tab ---------------------------- */
function FileList({ leadId, canEdit }: { leadId: number; canEdit: boolean }) {
  const qc = useQueryClient();
  const key = ["attachments", leadId];
  const { data: files, isLoading } = useQuery({ queryKey: key, queryFn: () => api.get<Attachment[]>(`/api/crm/leads/${leadId}/files`) });
  const upload = useMutation({ mutationFn: (f: File) => api.upload(`/api/crm/leads/${leadId}/files`, f), onSuccess: () => qc.invalidateQueries({ queryKey: key }) });

  return (
    <div className="px-4 py-3">
      {canEdit && (
        <label className="mb-3 flex cursor-pointer items-center justify-center gap-2 rounded-sm border border-dashed border-line py-3 text-[12.5px] text-ink-3 hover:border-accent hover:text-accent">
          <span>＋ Fayl biriktirish</span>
          <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
        </label>
      )}
      {upload.isPending && <div className="mb-2"><Spinner label="Yuklanmoqda…" /></div>}
      {isLoading ? <Spinner /> : !files?.length ? (
        <div className="rounded-sm border border-dashed border-line-2 py-6 text-center font-mono text-[11px] text-ink-4">fayllar yoʻq</div>
      ) : (
        <div className="space-y-1.5">
          {files.map((f) => (
            <a key={f.id} href={`/api/crm/files/${f.id}/download`} target="_blank" rel="noreferrer"
              className="flex items-center gap-2.5 rounded-sm border border-line-2 bg-surface p-2.5 hover:border-accent">
              <span className="text-[15px]">📎</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] text-ink">{f.filename}</div>
                <div className="font-mono text-[10px] text-ink-3">{kb(f.size)} · {fmt(f.created_at)}</div>
              </div>
              <span className="font-mono text-[11px] text-accent">yuklab olish</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================== chatter ============================== */
function Chatter({ lead, usersMap, canEdit, taskTypes, onAdd, busy, onToggleTask, onCreateTaskType, onClose }: {
  lead: LeadDetail; usersMap: Record<number, string>; canEdit: boolean; taskTypes: TaskType[];
  onAdd: (b: { kind: string; text: string; due_at?: string | null; meta?: Record<string, unknown> }) => void; busy: boolean;
  onToggleTask: (id: number, done: boolean) => void; onCreateTaskType: (name: string) => void; onClose: () => void;
}) {
  const ordered = [...lead.events].reverse();
  const openTasks = lead.events.filter((e) => e.kind === "task" && !e.done).length;
  let lastMonth = "";
  return (
    <section className="flex min-h-0 flex-col bg-bg">
      <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2.5">
        <input placeholder="🔍 Qidiruv va filtr" className="flex-1 rounded-sm border border-line bg-surface-2 px-3 py-1.5 text-[13px] outline-none focus:border-accent" />
        <button onClick={onClose} className="text-ink-3 hover:text-ink" aria-label="Yopish">✕</button>
      </div>
      <div className="flex-1 space-y-1.5 overflow-auto px-4 py-4">
        {ordered.map((e) => {
          const mk = monthKey(e.created_at); const divider = mk !== lastMonth; lastMonth = mk;
          return (
            <div key={e.id}>
              {divider && <div className="my-3 flex items-center justify-center"><span className="rounded-full border border-line bg-surface px-3 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">{mk}</span></div>}
              {SYSTEM_KINDS.has(e.kind) ? <SystemLine event={e} usersMap={usersMap} /> : <FeedCard event={e} usersMap={usersMap} canEdit={canEdit} onToggle={(d) => onToggleTask(e.id, d)} />}
            </div>
          );
        })}
      </div>
      <div className="border-t border-line bg-warn-bg px-4 py-2 text-[12.5px] text-warn">{openTasks > 0 ? `⏱ ${openTasks} ta ochiq vazifa` : "⏱ Rejalashtirilgan vazifa yoʻq, qoʻshishni tavsiya qilamiz"}</div>
      {canEdit && <Composer taskTypes={taskTypes} onAdd={onAdd} busy={busy} onCreateType={onCreateTaskType} />}
      <div className="border-t border-line bg-surface px-4 py-1.5 text-right font-mono text-[10px] text-ink-4">Ishtirokchilar: 0</div>
    </section>
  );
}

function author(event: LeadEvent, usersMap: Record<number, string>) { if (event.meta?.auto || event.author_id == null) return "Robot"; return usersMap[event.author_id] ?? "Menejer"; }

function SystemLine({ event, usersMap }: { event: LeadEvent; usersMap: Record<number, string> }) {
  return (
    <div className="px-1 py-0.5 text-[12.5px] leading-relaxed text-ink-3">
      <span className="font-mono text-[11px] text-ink-4">{fmt(event.created_at)} </span>
      <span className="text-ink-2">{author(event, usersMap)} </span>
      {event.kind === "stage_change" ? <>Yangi bosqich: <span className="rounded-sm bg-warn-bg px-1.5 py-0.5 text-warn">{event.text.replace(/^Bosqich:\s*/, "")}</span></> : <span>{event.text}</span>}
    </div>
  );
}

function FeedCard({ event, usersMap, canEdit, onToggle }: { event: LeadEvent; usersMap: Record<number, string>; canEdit: boolean; onToggle: (done: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const long = event.text.length > 160;
  const body = long && !open ? event.text.slice(0, 160) + "…" : event.text;
  const isTask = event.kind === "task";
  const taskType = (event.meta?.task_type as string) || "";
  return (
    <div className="rounded-md border border-line bg-surface p-3 shadow-sm">
      <div className="flex items-start gap-2.5">
        <span className={`grid h-7 w-7 flex-none place-items-center rounded-full border border-line ${isTask && !event.done ? "text-warn" : "text-ink-3"}`}>{KIND_ICON[event.kind] ?? "•"}</span>
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-2">
            <span className="font-mono text-[11px] text-ink-4">{fmt(event.created_at)}</span>
            <span className="text-[12px] text-ink-2">{author(event, usersMap)}</span>
            {taskType && <span className="rounded-sm bg-accent-bg px-1.5 py-0.5 font-mono text-[9.5px] text-accent-ink">{taskType}</span>}
          </div>
          {body && <div className={`whitespace-pre-line text-[13px] text-ink ${isTask && event.done ? "line-through opacity-60" : ""}`}>{body}</div>}
          {long && <button onClick={() => setOpen((o) => !o)} className="mt-1 text-[12px] text-accent hover:underline">{open ? "yashirish" : "toʻliq koʻrsatish"}</button>}
          {isTask && (
            <div className="mt-1.5 flex items-center gap-3 font-mono text-[11px]">
              {event.due_at && <span className="text-warn">⏱ {fmt(event.due_at)}</span>}
              {canEdit && <label className="flex cursor-pointer items-center gap-1 text-ink-3"><input type="checkbox" checked={event.done} onChange={(e) => onToggle(e.target.checked)} /> bajarildi</label>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Composer({ taskTypes, onAdd, busy, onCreateType }: { taskTypes: TaskType[]; onAdd: (b: { kind: string; text: string; due_at?: string | null; meta?: Record<string, unknown> }) => void; busy: boolean; onCreateType: (name: string) => void }) {
  const [kind, setKind] = useState("note");
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [taskType, setTaskType] = useState(taskTypes[0]?.name ?? "");
  const submit = () => {
    if (!text.trim() && kind !== "task") return;
    onAdd({ kind, text: text.trim(), due_at: kind === "task" && due ? new Date(due).toISOString() : null, meta: kind === "task" && taskType ? { task_type: taskType } : {} });
    setText(""); setDue("");
  };
  return (
    <div className="border-t border-line bg-surface px-4 py-3">
      <div className="mb-2 flex gap-4 text-[12.5px]">
        {[{ k: "note", l: "Eslatma" }, { k: "call", l: "Qoʻngʻiroq" }, { k: "task", l: "Vazifa" }].map((c) => (
          <button key={c.k} onClick={() => setKind(c.k)} className={`pb-1 ${kind === c.k ? "border-b-2 border-accent font-semibold text-ink" : "text-ink-3"}`}>{c.l}</button>
        ))}
      </div>
      {kind === "task" && (
        <div className="mb-2 flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">Turi</span>
          <select value={taskType} onChange={(e) => setTaskType(e.target.value)} className="rounded-sm border border-line-strong bg-surface px-2 py-1 text-[12px]">
            {taskTypes.map((t) => <option key={t.id} value={t.name}>{t.icon} {t.name}</option>)}
          </select>
          <button onClick={() => { const n = prompt("Yangi vazifa turi"); if (n?.trim()) { onCreateType(n.trim()); setTaskType(n.trim()); } }} className="font-mono text-[11px] text-accent hover:underline">+ tur</button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === "task" ? "Vazifa matni…" : kind === "call" ? "Qoʻngʻiroq natijasi…" : "Eslatma: matn kiriting"} className="min-h-[38px] flex-1 resize-none rounded-sm border border-line-strong bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent" />
        {kind === "task" && <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="rounded-sm border border-line-strong bg-surface px-2 py-1.5 text-[12px] outline-none focus:border-accent" />}
        <Button size="sm" onClick={submit} disabled={busy}>Yuborish</Button>
      </div>
    </div>
  );
}

/* ============================== lost picker ============================== */
function LostPicker({ reasons, onConfirm, onCancel }: { reasons: LostReason[]; onConfirm: (r: string | null) => void; onCancel: () => void }) {
  const [sel, setSel] = useState("");
  const [custom, setCustom] = useState("");
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 text-[14px] font-bold text-ink">Rad etish sababi</div>
        <div className="space-y-0.5">
          {reasons.map((r) => (
            <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] hover:bg-surface-2">
              <input type="radio" name="lr" checked={sel === r.text} onChange={() => { setSel(r.text); setCustom(""); }} /> {r.text}
            </label>
          ))}
          {reasons.length === 0 && <div className="px-2 py-1 font-mono text-[11px] text-ink-4">sabablar sozlanmagan</div>}
        </div>
        <input className="mt-2 w-full rounded-sm border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent" placeholder="Boshqa sabab…" value={custom} onChange={(e) => { setCustom(e.target.value); setSel(""); }} />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>Bekor</Button>
          <Button variant="danger" size="sm" onClick={() => onConfirm(custom.trim() || sel || null)}>Rad etish</Button>
        </div>
      </div>
    </div>
  );
}

/* ============================== sales rail (shaxmatka / deal) ============================== */
const DEAL_STATE_L: Record<string, string> = { active: "Sotildi", signed: "Sotildi", reserved: "Bron", closed: "Yopilgan", draft: "Qoralama", cancelled: "Bekor" };

function SalesRail({ lead, canEdit, onInterest, onLinkDeal, onClearUnit }: {
  lead: LeadDetail; canEdit: boolean;
  onInterest: (unitId: number) => void; onLinkDeal: (dealId: number, won: boolean) => void; onClearUnit: () => void;
}) {
  const { fmt } = useCurrency();
  const [picking, setPicking] = useState(false);
  const [wizardUnit, setWizardUnit] = useState<Unit | null>(null);

  // Full unit (for the deal wizard) when a lead is interested but not yet sold.
  const { data: unit } = useQuery({
    queryKey: ["unit", lead.unit_id],
    queryFn: () => api.get<Unit>(`/api/structure/units/${lead.unit_id}`),
    enabled: !!lead.unit_id && !lead.deal_id,
  });

  const sold = !!lead.deal_id;
  const won = lead.deal_state === "active" || lead.deal_state === "signed";

  return (
    <aside className="hidden min-h-0 flex-col overflow-auto border-l border-line bg-surface-2 lg:flex">
      <div className="border-b border-line px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">Sotuv · Shaxmatka</div>
      <div className="space-y-3 p-3">
        {sold ? (
          /* linked deal */
          <div className="rounded-md border border-line bg-surface p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-4">Bogʻlangan bitim</span>
              <StatusPill tone={won ? "crit" : "info"}>{DEAL_STATE_L[lead.deal_state ?? ""] ?? lead.deal_state}</StatusPill>
            </div>
            <div className="text-[15px] font-bold text-ink">🏠 {lead.unit_number ?? "—"}</div>
            {lead.deal_total && <div className="mt-1 font-mono tnum text-[15px] font-bold text-ink">{fmt(lead.deal_total)}</div>}
            <a href="/deals" className="mt-2 inline-block font-mono text-[11px] text-accent-ink hover:underline">Bitimlarga oʻtish →</a>
            {won && <div className="mt-2 rounded-sm border border-crit-line bg-crit-bg px-2 py-1 text-center font-mono text-[11px] font-semibold text-crit">✓ Yutuq — sotildi</div>}
          </div>
        ) : lead.unit_id ? (
          /* interested unit, no deal yet */
          <div className="rounded-md border border-line bg-surface p-3">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-4">Qiziqqan xonadon</div>
            <div className="text-[15px] font-bold text-ink">🏠 {lead.unit_number ?? `#${lead.unit_id}`}</div>
            {unit && <div className="font-mono text-[11px] text-ink-3">{unit.rooms}x · {Math.round(Number(unit.total_m2))} m² · {fmt(unit.price)}</div>}
            {canEdit && (
              <div className="mt-3 space-y-1.5">
                <Button size="sm" className="w-full justify-center" disabled={!unit} onClick={() => unit && setWizardUnit(unit)}>Sotuv / Bron rasmiylashtirish</Button>
                <button onClick={onClearUnit} className="w-full font-mono text-[11px] text-ink-3 hover:text-crit">olib tashlash</button>
              </div>
            )}
          </div>
        ) : (
          /* nothing linked */
          <div className="rounded-md border border-dashed border-line-2 bg-surface p-4 text-center">
            <div className="mb-2 text-[26px]">▦</div>
            <div className="mb-3 text-[12.5px] text-ink-3">Xonadon biriktirilmagan. Shaxmatkadan tanlab, qiziqish yoki sotuv rasmiylashtiring.</div>
            {canEdit && <Button size="sm" className="w-full justify-center" onClick={() => setPicking(true)}>▦ Shaxmatkadan tanlash</Button>}
          </div>
        )}

        <div className="rounded-md border border-line-2 bg-surface p-2.5 text-[11.5px] text-ink-3">
          Sotuv rasmiylashtirilsa lead avtomatik <b className="text-crit">yutuq</b> boʻladi va xonadon maʼlumotlari bogʻlanadi. Bron qilinsa — qiziqish sifatida saqlanadi.
        </div>
      </div>

      {picking && (
        <UnitPicker onClose={() => setPicking(false)}
          onPick={(u) => { setPicking(false); onInterest(u.id); setWizardUnit(u); }} />
      )}
      {wizardUnit && (
        <DealWizard unit={wizardUnit} onClose={() => setWizardUnit(null)}
          onDone={() => setWizardUnit(null)}
          onCreated={(dealId, mode) => onLinkDeal(dealId, mode === "sign")} />
      )}
    </aside>
  );
}
