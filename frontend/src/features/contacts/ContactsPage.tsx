import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Contact, ContactAttachment, Lead } from "@/lib/types";
import { PageTitle, Card, Spinner, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/components/ui/Money";
import { StatusPill } from "@/components/ui/StatusPill";
import { useAuth } from "@/lib/auth";

const LEAD_TONE: Record<string, "ok" | "warn" | "crit" | "muted"> = { open: "warn", won: "ok", lost: "crit" };
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join(""); }
function kb(n: number) { return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`; }
function photoUrl(c: Contact) { return c.photo ? `/api/contacts/${c.id}/photo?v=${encodeURIComponent(c.photo)}` : null; }

function Avatar({ contact, size = 32 }: { contact: Contact; size?: number }) {
  const url = photoUrl(contact);
  return url ? (
    <img src={url} alt="" className="flex-none rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid flex-none place-items-center rounded-full bg-accent font-mono font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials(contact.full_name)}
    </span>
  );
}

export function ContactsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canEdit = can("clients", "edit");
  const [view, setView] = useState<"form" | "list">("form");
  const [selId, setSelId] = useState<number | null>(null);
  const [q, setQ] = useState("");

  const { data: contacts, isLoading } = useQuery({ queryKey: ["contacts"], queryFn: () => api.get<Contact[]>("/api/contacts") });
  const filtered = useMemo(
    () => (contacts ?? []).filter((c) => !q || c.full_name.toLowerCase().includes(q.toLowerCase()) || (c.phone ?? "").includes(q) || (c.company ?? "").toLowerCase().includes(q.toLowerCase())),
    [contacts, q],
  );
  const selected = (contacts ?? []).find((c) => c.id === selId) ?? filtered[0];

  const create = useMutation({ mutationFn: (name: string) => api.post<Contact>("/api/contacts", { full_name: name }), onSuccess: (c) => { qc.invalidateQueries({ queryKey: ["contacts"] }); setSelId(c.id); setView("form"); } });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* view toggle — list / form (left side) */}
          <div className="inline-flex rounded-sm border border-line bg-surface-3 p-0.5">
            <button title="Roʻyxat koʻrinishi" onClick={() => setView("list")} className={`rounded-sm px-2.5 py-1.5 text-[14px] ${view === "list" ? "bg-surface text-ink shadow-sm" : "text-ink-3"}`}>☰</button>
            <button title="Karta koʻrinishi" onClick={() => setView("form")} className={`rounded-sm px-2.5 py-1.5 text-[14px] ${view === "form" ? "bg-surface text-ink shadow-sm" : "text-ink-3"}`}>▤</button>
          </div>
          <PageTitle title="Kontaktlar" sub="Contacts" />
        </div>
        {canEdit && <Button size="sm" onClick={() => { const n = prompt("Kontakt ismi"); if (n?.trim()) create.mutate(n.trim()); }}>+ Kontakt</Button>}
      </div>

      {isLoading ? <Spinner /> : !contacts?.length ? (
        <EmptyState>Kontaktlar yoʻq. CRMда lead yaratganingizda kontakt qoʻshiladi.</EmptyState>
      ) : view === "list" ? (
        <ListView contacts={filtered} q={q} setQ={setQ} onOpen={(id) => { setSelId(id); setView("form"); }} />
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[300px_1fr]">
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <div className="border-b border-line p-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Qidiruv" className="w-full rounded-sm border border-line bg-surface-2 px-3 py-1.5 text-[13px] outline-none focus:border-accent" />
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {filtered.map((c) => (
                <button key={c.id} onClick={() => setSelId(c.id)} className={`flex w-full items-center gap-2.5 border-b border-line-2 px-3 py-2.5 text-left ${selected?.id === c.id ? "bg-accent-bg" : "hover:bg-surface-2"}`}>
                  <Avatar contact={c} />
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-ink">{c.full_name}</div>
                    <div className="truncate font-mono text-[11px] text-ink-3">{c.phone ?? c.email ?? "—"}</div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
          {selected ? <ContactDetail contact={selected} canEdit={canEdit} /> : <EmptyState>Kontaktni tanlang</EmptyState>}
        </div>
      )}
    </div>
  );
}

/* --------------------------- list view --------------------------- */
function ListView({ contacts, q, setQ, onOpen }: { contacts: Contact[]; q: string; setQ: (v: string) => void; onOpen: (id: number) => void }) {
  return (
    <Card className="min-h-0 flex-1 overflow-hidden">
      <div className="border-b border-line p-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Qidiruv (ism, telefon, kompaniya)" className="w-72 max-w-full rounded-sm border border-line bg-surface-2 px-3 py-1.5 text-[13px] outline-none focus:border-accent" />
      </div>
      <div className="overflow-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0">
            <tr className="bg-surface-2 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
              <th className="px-3 py-2.5">Ism</th>
              <th className="px-3 py-2.5">Telefon</th>
              <th className="px-3 py-2.5">Email</th>
              <th className="px-3 py-2.5">Kompaniya</th>
              <th className="px-3 py-2.5">Lavozim</th>
              <th className="px-3 py-2.5">Manba</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} onClick={() => onOpen(c.id)} className="cursor-pointer border-t border-line-2 hover:bg-surface-2">
                <td className="px-3 py-2"><div className="flex items-center gap-2"><Avatar contact={c} size={26} /><span className="font-semibold text-ink">{c.full_name}</span></div></td>
                <td className="px-3 py-2 font-mono text-ink-2">{c.phone ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-ink-2">{c.email ?? "—"}</td>
                <td className="px-3 py-2 text-ink-2">{c.company ?? "—"}</td>
                <td className="px-3 py-2 text-ink-2">{c.position ?? "—"}</td>
                <td className="px-3 py-2 text-ink-3">{c.source ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* --------------------------- detail (form) --------------------------- */
const FIELDS: { key: keyof Contact; label: string; type?: string }[] = [
  { key: "full_name", label: "Ism" },
  { key: "phone", label: "Telefon" },
  { key: "phone2", label: "Qoʻshimcha tel" },
  { key: "email", label: "Email" },
  { key: "telegram", label: "Telegram" },
  { key: "source", label: "Manba" },
  { key: "company", label: "Kompaniya" },
  { key: "position", label: "Lavozim" },
  { key: "passport", label: "Passport" },
  { key: "birthday", label: "Tugʻilgan sana", type: "date" },
  { key: "address", label: "Manzil" },
];

function ContactDetail({ contact, canEdit }: { contact: Contact; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: leads } = useQuery({ queryKey: ["contact-leads", contact.id], queryFn: () => api.get<Lead[]>(`/api/crm/contacts/${contact.id}/leads`) });
  const { data: files } = useQuery({ queryKey: ["contact-files", contact.id], queryFn: () => api.get<ContactAttachment[]>(`/api/contacts/${contact.id}/files`) });
  const patch = useMutation({ mutationFn: (body: Record<string, unknown>) => api.patch(`/api/contacts/${contact.id}`, body), onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }) });
  const uploadPhoto = useMutation({ mutationFn: (f: File) => api.upload(`/api/contacts/${contact.id}/photo`, f), onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }) });
  const uploadFile = useMutation({ mutationFn: (f: File) => api.upload(`/api/contacts/${contact.id}/files`, f), onSuccess: () => qc.invalidateQueries({ queryKey: ["contact-files", contact.id] }) });

  return (
    <Card className="min-h-0 overflow-auto p-5">
      {/* header + photo */}
      <div className="mb-5 flex items-center gap-4">
        <div className="relative">
          <Avatar contact={contact} size={64} />
          {canEdit && (
            <label className="absolute -bottom-1 -right-1 grid h-6 w-6 cursor-pointer place-items-center rounded-full border border-line bg-surface text-[11px] shadow-sm hover:border-accent" title="Rasm yuklash">
              📷<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadPhoto.mutate(e.target.files[0])} />
            </label>
          )}
        </div>
        <div>
          <div className="text-lg font-bold text-ink">{contact.full_name}</div>
          <div className="font-mono text-[11px] text-ink-3">Kontakt #{contact.id}{contact.company ? ` · ${contact.company}` : ""}</div>
        </div>
      </div>

      {/* personal data */}
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">Shaxsiy maʼlumotlar</div>
      <div className="mb-5 grid max-w-3xl gap-x-8 gap-y-1 md:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="flex items-baseline gap-3 text-[13px]">
            <span className="w-28 flex-none text-ink-3">{f.label}</span>
            <input type={f.type ?? "text"} defaultValue={(contact[f.key] as string) ?? ""} disabled={!canEdit}
              onBlur={(e) => e.target.value !== ((contact[f.key] as string) ?? "") && patch.mutate({ [f.key]: e.target.value || null })}
              className="flex-1 rounded-sm border border-transparent bg-transparent px-1.5 py-1 text-ink hover:border-line focus:border-accent focus:outline-none disabled:hover:border-transparent" />
          </div>
        ))}
      </div>
      <div className="mb-5 max-w-3xl">
        <div className="mb-1 text-[13px] text-ink-3">Izoh</div>
        <textarea defaultValue={contact.notes ?? ""} disabled={!canEdit} rows={2}
          onBlur={(e) => e.target.value !== (contact.notes ?? "") && patch.mutate({ notes: e.target.value || null })}
          className="w-full resize-none rounded-sm border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent" />
      </div>

      {/* files */}
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">Fayllar</span>
        {canEdit && (
          <label className="cursor-pointer font-mono text-[11px] text-accent hover:underline">＋ Fayl<input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile.mutate(e.target.files[0])} /></label>
        )}
      </div>
      {files?.length ? (
        <div className="mb-5 grid gap-1.5 md:grid-cols-2">
          {files.map((f) => (
            <a key={f.id} href={`/api/contacts/files/${f.id}/download`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-sm border border-line-2 bg-surface px-3 py-2 hover:border-accent">
              <span>📎</span><span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{f.filename}</span><span className="font-mono text-[10px] text-ink-3">{kb(f.size)}</span>
            </a>
          ))}
        </div>
      ) : <div className="mb-5 rounded-sm border border-dashed border-line-2 py-4 text-center font-mono text-[11px] text-ink-4">fayl yoʻq</div>}

      {/* linked leads */}
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">Bogʻliq leadlar</div>
      {!leads?.length ? (
        <div className="rounded-sm border border-dashed border-line-2 py-4 text-center font-mono text-[11px] text-ink-4">lead yoʻq</div>
      ) : (
        <div className="space-y-1.5">
          {leads.map((l) => (
            <div key={l.id} className="flex items-center gap-2 rounded-sm border border-line-2 bg-surface px-3 py-2 text-[13px]">
              <span className="flex-1 truncate font-semibold text-ink">{l.title}</span>
              <span className="font-mono tnum text-ink-2">{formatMoney(l.budget)}</span>
              <StatusPill tone={LEAD_TONE[l.status] ?? "muted"}>{l.status}</StatusPill>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
