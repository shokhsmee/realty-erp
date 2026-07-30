/** Small shared UI atoms. */

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-3">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
      {label ?? "Yuklanmoqda…"}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded border border-line bg-surface shadow-sm ${className}`}>{children}</div>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4 border-b border-line pb-3">
      <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
      {sub && <p className="mt-0.5 text-sm text-ink-3">{sub}</p>}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-dashed border-line bg-surface-2 p-8 text-center text-sm text-ink-3">
      {children}
    </div>
  );
}
