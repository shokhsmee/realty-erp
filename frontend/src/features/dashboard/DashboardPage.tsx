import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Complex, ComplexTree } from "@/lib/types";
import { PageTitle, Card, Spinner, EmptyState } from "@/components/ui/misc";
import { formatMoney } from "@/components/ui/Money";

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">{label}</div>
      <div className={`mt-1 font-mono tnum text-2xl font-bold ${tone ?? "text-ink"}`}>{value}</div>
    </Card>
  );
}

export function DashboardPage() {
  const { data: complexes, isLoading } = useQuery({
    queryKey: ["complexes"],
    queryFn: () => api.get<Complex[]>("/api/structure/complexes"),
  });
  const complexId = complexes?.[0]?.id;

  const { data: tree } = useQuery({
    queryKey: ["tree", complexId],
    queryFn: () => api.get<ComplexTree>(`/api/structure/complexes/${complexId}/tree`),
    enabled: complexId != null,
  });

  if (isLoading)
    return (
      <div className="flex justify-center pt-10">
        <Spinner />
      </div>
    );

  const units = tree?.blocks.flatMap((b) => b.floors.flatMap((f) => f.units)) ?? [];
  const by = (s: string) => units.filter((u) => u.status === s);
  const soldValue = by("sold").reduce((sum, u) => sum + Number(u.price), 0);

  return (
    <div>
      <PageTitle title="Dashboard" sub={tree?.name} />
      {units.length === 0 ? (
        <EmptyState>Maʼlumot yoʻq — demo seed ishga tushiring.</EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Jami xonadon" value={String(units.length)} />
          <Tile label="Boʻsh" value={String(by("free").length)} tone="text-ok" />
          <Tile label="Bron" value={String(by("reserved").length)} tone="text-accent" />
          <Tile label="Sotilgan" value={String(by("sold").length)} tone="text-crit" />
          <Tile label="Sotuv summasi" value={formatMoney(soldValue)} />
        </div>
      )}
    </div>
  );
}
