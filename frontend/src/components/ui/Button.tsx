import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-white border-accent-2 hover:bg-accent-2",
  secondary: "bg-surface text-ink border-line-strong hover:bg-surface-2",
  ghost: "bg-transparent text-ink-2 border-transparent hover:bg-surface-3 hover:text-ink",
  danger: "bg-crit text-white border-transparent hover:opacity-90",
};

const SIZES: Record<Size, string> = {
  md: "px-3.5 py-2 text-[13px]",
  sm: "px-2.5 py-1.5 text-xs",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = "primary", size = "md", className = "", ...rest }: Props) {
  return (
    <button
      className={`inline-flex items-center gap-2 rounded-sm border font-semibold leading-none
        transition-colors disabled:opacity-50 disabled:cursor-not-allowed
        ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    />
  );
}
