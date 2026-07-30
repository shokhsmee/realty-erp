/** Multi-currency context.
 *
 * All prices are STORED in the base currency (see backend). This provider loads
 * the currency table (with each currency's latest daily rate) and exposes the
 * one "selected" display currency plus conversion helpers so every page can show
 * and accept prices in whichever currency the user picked.
 *
 *   rate(cur) = base-currency units per 1 unit of `cur`   (base = 1)
 *   fromBase(x) = x / rate(selected)   — base amount → selected currency
 *   toBase(x)   = x * rate(selected)   — entered amount → base for storage
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Currency } from "@/lib/types";
import { formatMoney } from "@/components/ui/Money";

const STORE_KEY = "realty.currency";

interface CurrencyCtx {
  currencies: Currency[];
  base: Currency | null;
  selected: Currency | null;
  setSelected: (id: number) => void;
  /** base-currency units per 1 unit of `cur` (defaults to selected). */
  rate: (cur?: Currency | null) => number;
  /** base amount → selected currency. */
  fromBase: (baseAmount: number | string) => number;
  /** amount typed in the selected currency → base for storage. */
  toBase: (amount: number | string) => number;
  /** Format a base amount in the selected currency, with its code. */
  fmt: (baseAmount: number | string) => string;
  ready: boolean;
}

const Ctx = createContext<CurrencyCtx | null>(null);

const num = (v: number | string | null | undefined) =>
  v == null ? 0 : typeof v === "string" ? Number(v) : v;

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { data } = useQuery({
    queryKey: ["currencies"],
    queryFn: () => api.get<Currency[]>("/api/settings/currencies"),
  });
  const currencies = useMemo(() => data ?? [], [data]);
  const active = useMemo(() => currencies.filter((c) => c.is_active), [currencies]);

  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? Number(raw) : null;
  });

  // Once currencies load, settle on a valid selection: stored → default
  // (last-added) → base → first.
  useEffect(() => {
    if (!active.length) return;
    const valid = selectedId != null && active.some((c) => c.id === selectedId);
    if (valid) return;
    const fallback =
      active.find((c) => c.is_default) ?? active.find((c) => c.is_base) ?? active[0];
    setSelectedId(fallback.id);
  }, [active, selectedId]);

  const base = useMemo(() => currencies.find((c) => c.is_base) ?? null, [currencies]);
  const selected = useMemo(
    () => active.find((c) => c.id === selectedId) ?? base,
    [active, selectedId, base],
  );

  const setSelected = (id: number) => {
    setSelectedId(id);
    localStorage.setItem(STORE_KEY, String(id));
  };

  const rate = (cur?: Currency | null) => {
    const c = cur ?? selected;
    if (!c) return 1;
    if (c.is_base) return 1;
    const r = num(c.latest_rate);
    return r > 0 ? r : 1;
  };

  const fromBase = (baseAmount: number | string) => num(baseAmount) / rate();
  const toBase = (amount: number | string) => num(amount) * rate();

  const fmt = (baseAmount: number | string) => {
    const code = selected?.code ?? base?.code ?? "";
    return `${formatMoney(fromBase(baseAmount))} ${code}`.trim();
  };

  const value: CurrencyCtx = {
    currencies,
    base,
    selected,
    setSelected,
    rate,
    fromBase,
    toBase,
    fmt,
    ready: currencies.length > 0,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrency(): CurrencyCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
