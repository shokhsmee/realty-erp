/** Swatch color picker — pick an actual color, not a token name. */

export const STAGE_COLORS = ["info", "accent", "warn", "ok", "crit", "muted"];
export const TAG_COLORS = ["accent", "info", "ok", "warn", "crit"];

function cssVar(token: string): string {
  return token === "muted" ? "var(--line-strong)" : `var(--${token})`;
}

export function ColorPicker({
  value,
  onChange,
  colors = STAGE_COLORS,
  size = 16,
}: {
  value: string;
  onChange: (c: string) => void;
  colors?: string[];
  size?: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {colors.map((c) => {
        const active = value === c;
        return (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => onChange(c)}
            className={`rounded-full transition ${active ? "ring-2 ring-ink ring-offset-1" : "hover:scale-110"}`}
            style={{ width: size, height: size, background: cssVar(c) }}
          />
        );
      })}
    </div>
  );
}
