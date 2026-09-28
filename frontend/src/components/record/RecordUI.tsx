/** Shared "record form" design system — the Odoo-style building blocks used by
 * every detail/form view (deals, leads, contacts, units…): a status ribbon,
 * a flat smart-button strip, and underline two-column field groups.
 *
 * Extracted so all record forms share one consistent, polished look.
 */
import { StatusPill } from "@/components/ui/StatusPill";

/* ------------------------------ status ribbon ------------------------------ */
export interface RibbonStep {
  value: string;
  label: string;
}
/** Odoo-style statusbar: ordered stages with the current one filled, past ones
 * accented, upcoming muted. When `current` isn't among the steps (e.g. a
 * cancelled/lost record), a single critical pill is shown instead. */
export function StatusRibbon({ steps, current, terminalLabel }: {
  steps: RibbonStep[];
  current: string;
  terminalLabel?: string;
}) {
  const ci = steps.findIndex((s) => s.value === current);
  if (ci < 0 && terminalLabel) return <StatusPill tone="crit">{terminalLabel}</StatusPill>;
  return (
    <div className="flex flex-wrap items-center gap-0.5 text-[11px] font-semibold">
      {steps.map((s, i) => (
        <span key={s.value} className="flex items-center gap-0.5">
          {i > 0 && <span className="text-ink-4">›</span>}
          <span className={`rounded px-2.5 py-1 ${i === ci ? "bg-accent text-white" : i < ci ? "text-accent-ink" : "text-ink-4"}`}>
            {s.label}
          </span>
        </span>
      ))}
    </div>
  );
}

/* ------------------------------ smart buttons ------------------------------ */
/** Container for a connected strip of SmartBtns. */
export function SmartBtnStrip({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`flex flex-wrap items-stretch border-b border-line px-3 py-2 ${className}`}>{children}</div>;
}

/** A single Odoo statbutton: icon + big value + accent label + tiny sub, joined
 * to its neighbours by a left divider. */
export function SmartBtn({ active, onClick, icon, big, label, sub }: {
  active?: boolean; onClick: () => void; icon: string; big: string; label: string; sub?: string;
}) {
  return (
    <button onClick={onClick}
      className={`group flex items-center gap-2.5 border-l border-line px-3.5 py-1 text-left transition first:border-l-0 hover:bg-surface-2 ${active ? "bg-accent-bg" : ""}`}>
      <span className={`text-[18px] leading-none ${active ? "" : "opacity-80"}`}>{icon}</span>
      <span className="min-w-0 leading-tight">
        <span className="block font-mono tnum text-[14px] font-bold text-ink">{big}</span>
        <span className="block text-[11px] font-semibold text-accent-ink">{label}</span>
        {sub != null && <span className="block truncate font-mono text-[9.5px] text-ink-4">{sub}</span>}
      </span>
    </button>
  );
}

/* ------------------------------ field groups ------------------------------ */
/** A titled group of label→value rows (2-col grids stack these). */
export function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 border-b border-line pb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-accent-ink">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

/** One label-left / value-right row with an underline; `link` renders the value
 * as an accent (relational-field) value. */
export function Field({ l, v, tone, link }: { l: string; v: React.ReactNode; tone?: "ok" | "warn"; link?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line-2 pb-1 text-[13px]">
      <span className="shrink-0 text-ink-3">{l}</span>
      <span className={`text-right ${link ? "font-semibold text-accent-ink" : "font-mono"} ${tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : link ? "" : "text-ink"}`}>{v}</span>
    </div>
  );
}
