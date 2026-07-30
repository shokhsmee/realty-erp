/** Status pill — color reserved for state, always with a label. */

type Tone = "ok" | "warn" | "info" | "crit" | "muted";

const TONES: Record<Tone, string> = {
  ok: "bg-ok-bg border-ok-line text-ok",
  warn: "bg-warn-bg border-warn-line text-warn",
  info: "bg-accent-bg border-accent text-accent-ink",
  crit: "bg-crit-bg border-crit-line text-crit",
  muted: "bg-surface-3 border-line text-ink-3",
};

const DOTS: Record<Tone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  info: "bg-accent",
  crit: "bg-crit",
  muted: "bg-ink-4",
};

export function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono
        text-[11px] font-semibold ${TONES[tone]}`}
    >
      <i className={`h-[7px] w-[7px] rounded-sm ${DOTS[tone]}`} />
      {children}
    </span>
  );
}

/** Map a unit/payment status string to a pill tone. */
export const UNIT_TONE: Record<string, Tone> = {
  free: "ok",
  hold: "warn",
  reserved: "info",
  sold: "crit",
};
