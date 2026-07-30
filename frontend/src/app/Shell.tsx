import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { useRealtimeSync } from "@/lib/realtime";
import { NAV } from "@/app/nav";
import { Button } from "@/components/ui/Button";

export function Shell() {
  const { me, logout, can } = useAuth();
  const { currencies, selected, setSelected } = useCurrency();
  useRealtimeSync(); // live grid updates while the app is open

  // Only show nav entries the user can view; keep group order stable.
  const visible = NAV.filter((n) => can(n.app, "view"));
  const groups = [...new Set(visible.map((n) => n.group))];

  return (
    <div className="grid h-full grid-cols-[210px_1fr]">
      {/* Sidebar */}
      <aside className="flex flex-col border-r border-line bg-surface-2 p-2.5">
        <div className="flex items-center gap-2 px-1.5 pb-3 pt-1 text-[13px] font-extrabold">
          <span className="h-[22px] w-[22px] flex-none rounded-sm border-[1.5px] border-accent" />
          Blueprint OS
        </div>
        <nav className="flex flex-col gap-0.5">
          {groups.map((g) => (
            <div key={g}>
              <div className="px-2 pb-1 pt-3 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-4">
                {g}
              </div>
              {visible
                .filter((n) => n.group === g)
                .map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[12.5px] ${
                        isActive
                          ? "bg-accent-bg font-semibold text-accent-ink"
                          : "text-ink-2 hover:bg-surface-3"
                      }`
                    }
                  >
                    <span className="w-4 flex-none text-center opacity-70">{n.glyph}</span>
                    {n.label}
                  </NavLink>
                ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-col">
        <header className="flex h-12 items-center gap-3 border-b border-line bg-surface px-4">
          <span className="rounded-sm border border-line bg-surface-3 px-2.5 py-1 font-mono text-[11px] text-ink-2">
            ЖК Bunyodkor ▾
          </span>
          <div className="ml-auto flex items-center gap-3">
            {currencies.filter((c) => c.is_active).length > 1 && (
              <label className="flex items-center gap-1.5" title="Ko‘rsatish valyutasi">
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-4">
                  Valyuta
                </span>
                <select
                  value={selected?.id ?? ""}
                  onChange={(e) => setSelected(Number(e.target.value))}
                  className="rounded-sm border border-line-strong bg-surface px-2 py-1 font-mono text-[11px] font-semibold outline-none focus:border-accent"
                >
                  {currencies
                    .filter((c) => c.is_active)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <span className="font-mono text-[11px] text-ink-3">{me?.user.full_name}</span>
            <Button variant="ghost" size="sm" onClick={logout}>
              Chiqish
            </Button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto bg-bg p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
