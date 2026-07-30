import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { InviteResult, Role, User, UserDetail } from "@/lib/types";
import { APPS, type AppName, type Level } from "@/lib/permissions";
import { PageTitle, Card, Spinner, EmptyState } from "@/components/ui/misc";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";

const APP_LABEL: Record<AppName, string> = {
  showroom: "Showroom", shaxmatka: "Shaxmatka", deals: "Bitimlar", crm: "CRM",
  clients: "Mijozlar", accounting: "Buxgalteriya", dashboard: "Dashboard", settings: "Sozlamalar",
};
const LEVELS: { key: Level; label: string; cls: string }[] = [
  { key: "none", label: "Yoʻq", cls: "bg-ink-4" },
  { key: "view", label: "Koʻrish", cls: "bg-info" },
  { key: "edit", label: "Tahrir", cls: "bg-warn" },
  { key: "manage", label: "Boshqarish", cls: "bg-ok" },
];
const STATUS_TONE: Record<string, "ok" | "warn" | "muted"> = { active: "ok", invited: "warn", disabled: "muted" };

function emptyAccess(): Record<string, string> { return Object.fromEntries(APPS.map((a) => [a, "none"])); }

export function UsersPage() {
  const { can } = useAuth();
  const canManage = can("settings", "manage");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: users, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => api.get<User[]>("/api/users") });
  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: () => api.get<Role[]>("/api/roles") });
  const roleName = (id: number | null) => roles?.find((r) => r.id === id)?.name ?? "—";

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageTitle title="Foydalanuvchilar" sub="Settings · Users & Roles" />
        {canManage && <Button size="sm" onClick={() => setInviteOpen(true)}>+ Foydalanuvchi qoʻshish</Button>}
      </div>

      {isLoading ? <Spinner /> : !users?.length ? <EmptyState>Foydalanuvchilar yoʻq.</EmptyState> : (
        <Card className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-surface-2 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
                <th className="px-4 py-2.5">Foydalanuvchi</th>
                <th className="px-4 py-2.5">Bazaviy rol</th>
                <th className="px-4 py-2.5">Holat</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="cursor-pointer border-t border-line-2 hover:bg-surface-2" onClick={() => canManage && setSelectedId(u.id)}>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-ink">{u.full_name}{u.is_superuser && <span className="ml-2 rounded-sm bg-accent-bg px-1.5 py-0.5 font-mono text-[9px] text-accent-ink">SUPER</span>}</div>
                    <div className="font-mono text-[11px] text-ink-3">{u.email}</div>
                  </td>
                  <td className="px-4 py-2.5"><span className="rounded-sm border border-line bg-surface-3 px-2 py-0.5 font-mono text-[11px] text-ink-2">{roleName(u.base_role_id)}</span></td>
                  <td className="px-4 py-2.5"><StatusPill tone={STATUS_TONE[u.status] ?? "muted"}>{u.status}</StatusPill></td>
                  <td className="px-4 py-2.5 text-right font-mono text-[11px] text-accent">{canManage ? "tahrirlash ›" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {inviteOpen && <InviteModal roles={roles ?? []} onClose={() => setInviteOpen(false)} />}
      {selectedId != null && <EditPanel userId={selectedId} roles={roles ?? []} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

/* --------------------------- access matrix --------------------------- */
function AccessMatrix({ access, onChange, disabled }: { access: Record<string, string>; onChange: (app: string, level: Level) => void; disabled?: boolean }) {
  return (
    <div className="space-y-1.5">
      {APPS.map((app) => (
        <div key={app} className="flex items-center gap-3">
          <span className="w-28 flex-none text-[12.5px] text-ink-2">{APP_LABEL[app]}</span>
          <div className="inline-flex flex-1 rounded-sm border border-line bg-surface-3 p-0.5">
            {LEVELS.map((lv) => {
              const active = (access[app] ?? "none") === lv.key;
              return (
                <button key={lv.key} disabled={disabled} onClick={() => onChange(app, lv.key)}
                  className={`flex-1 rounded-sm px-2 py-1 font-mono text-[10.5px] font-semibold ${active ? `${lv.cls} text-white` : "text-ink-3 hover:text-ink"}`}>
                  {lv.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------- invite modal --------------------------- */
function InviteModal({ roles, onClose }: { roles: Role[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ full_name: "", email: "", phone: "" });
  const [roleId, setRoleId] = useState<number | "">("");
  const [access, setAccess] = useState<Record<string, string>>(emptyAccess());
  const [result, setResult] = useState<InviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickRole = (id: number | "") => {
    setRoleId(id);
    const role = roles.find((r) => r.id === id);
    setAccess({ ...emptyAccess(), ...(role?.default_access ?? {}) });
  };

  const invite = useMutation({
    mutationFn: () => api.post<InviteResult>("/api/users", {
      full_name: form.full_name.trim(), email: form.email.trim(), phone: form.phone.trim() || null,
      base_role_id: roleId === "" ? null : roleId, access_overrides: access,
    }),
    onSuccess: (r) => { setResult(r); qc.invalidateQueries({ queryKey: ["users"] }); },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Xatolik"),
  });

  const inviteLink = result ? `${location.origin}/accept-invite?token=${result.invite_token}` : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-lg overflow-auto rounded-lg border border-line bg-surface p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <span className="text-base font-bold text-ink">Yangi foydalanuvchi</span>
          <button onClick={onClose} className="text-ink-3 hover:text-ink">✕</button>
        </div>

        {result ? (
          <div>
            <div className="mb-2 rounded-sm border border-ok-line bg-ok-bg px-3 py-2 text-[13px] text-ok">✓ {result.user.full_name} taklif qilindi</div>
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">Taklif havolasi</div>
            <div className="flex gap-2">
              <input readOnly value={inviteLink} className="flex-1 rounded-sm border border-line-strong bg-surface-2 px-2.5 py-1.5 font-mono text-[11px] text-ink-2" />
              <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(inviteLink)}>Nusxa</Button>
            </div>
            <p className="mt-2 text-[12px] text-ink-3">Havolani foydalanuvchiga yuboring — u parol oʻrnatib faollashadi.</p>
            <div className="mt-4 text-right"><Button size="sm" onClick={onClose}>Yopish</Button></div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <input className="rounded-sm border border-line-strong bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent" placeholder="F.I.Sh" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              <input className="rounded-sm border border-line-strong bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input className="rounded-sm border border-line-strong bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent" placeholder="Telefon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <select className="rounded-sm border border-line-strong bg-surface px-2 py-2 text-[13px] outline-none focus:border-accent" value={roleId} onChange={(e) => pickRole(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Bazaviy rol…</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="mt-4 mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">Har bir app uchun ruxsat</div>
            <AccessMatrix access={access} onChange={(a, l) => setAccess({ ...access, [a]: l })} />
            {error && <div className="mt-3 rounded-sm border border-crit-line bg-crit-bg px-3 py-2 text-[12.5px] text-crit">{error}</div>}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>Bekor</Button>
              <Button size="sm" onClick={() => { setError(null); invite.mutate(); }} disabled={!form.full_name.trim() || !form.email.trim() || invite.isPending}>Taklif qilish</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* --------------------------- edit panel --------------------------- */
function EditPanel({ userId, roles, onClose }: { userId: number; roles: Role[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: user, isLoading } = useQuery({ queryKey: ["user", userId], queryFn: () => api.get<UserDetail>(`/api/users/${userId}`) });
  const [roleId, setRoleId] = useState<number | "">("");
  const [access, setAccess] = useState<Record<string, string> | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["user", userId] }); qc.invalidateQueries({ queryKey: ["users"] }); };

  // Initialise local state once the user loads.
  const eff = access ?? user?.effective_access ?? emptyAccess();
  const curRole = roleId === "" ? (user?.base_role_id ?? "") : roleId;

  const save = useMutation({
    mutationFn: () => api.patch(`/api/users/${userId}`, { base_role_id: curRole === "" ? null : curRole, access_overrides: eff }),
    onSuccess: () => { refresh(); onClose(); },
  });
  const setStatus = useMutation({
    mutationFn: (action: "activate" | "deactivate") => api.post(`/api/users/${userId}/${action}`),
    onSuccess: refresh,
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-lg flex-col bg-surface shadow-lg" onClick={(e) => e.stopPropagation()}>
        {isLoading || !user ? <div className="p-6"><Spinner /></div> : (
          <>
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <div>
                <div className="text-base font-bold text-ink">{user.full_name}</div>
                <div className="font-mono text-[11px] text-ink-3">{user.email}</div>
              </div>
              <button onClick={onClose} className="text-ink-3 hover:text-ink">✕</button>
            </div>
            <div className="flex-1 overflow-auto p-5">
              <div className="mb-4 flex items-center gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">Holat</span>
                <StatusPill tone={STATUS_TONE[user.status] ?? "muted"}>{user.status}</StatusPill>
                {user.status !== "active" ? <Button size="sm" variant="secondary" onClick={() => setStatus.mutate("activate")}>Faollashtirish</Button>
                  : <Button size="sm" variant="ghost" onClick={() => setStatus.mutate("deactivate")}>Bloklash</Button>}
              </div>

              <div className="mb-4">
                <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">Bazaviy rol</div>
                <select className="w-full rounded-sm border border-line-strong bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
                  value={curRole} onChange={(e) => { const id = e.target.value ? Number(e.target.value) : ""; setRoleId(id); const role = roles.find((r) => r.id === id); setAccess({ ...emptyAccess(), ...(role?.default_access ?? {}) }); }}>
                  <option value="">— rol yoʻq —</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>

              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">Har bir app uchun ruxsat</div>
              <AccessMatrix access={eff} onChange={(a, l) => setAccess({ ...eff, [a]: l })} disabled={user.is_superuser} />
              {user.is_superuser && <p className="mt-2 text-[12px] text-ink-4">Superuser hamma narsaga kira oladi (oʻzgartirib boʻlmaydi).</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
              <Button variant="ghost" size="sm" onClick={onClose}>Bekor</Button>
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Saqlash</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
