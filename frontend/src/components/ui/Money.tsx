/** Money display: grouped thousands (space separator, UZ style), monospace. */

export function formatMoney(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function Money({
  value,
  currency = "UZS",
  className = "",
}: {
  value: number | string;
  currency?: string;
  className?: string;
}) {
  return (
    <span className={`font-mono tnum font-semibold ${className}`}>
      {formatMoney(value)}
      <span className="ml-1 text-[0.8em] font-medium text-ink-3">{currency}</span>
    </span>
  );
}
