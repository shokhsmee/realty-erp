import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Client } from "@/lib/types";
import { PageTitle, Card, Spinner, EmptyState } from "@/components/ui/misc";

export function ClientsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: () => api.get<Client[]>("/api/clients"),
  });

  return (
    <div>
      <PageTitle title="Mijozlar" sub="Clients" />
      {isLoading ? (
        <Spinner />
      ) : !data?.length ? (
        <EmptyState>Hozircha mijoz yoʻq.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-surface-2 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
                <th className="px-4 py-2.5">Ism</th>
                <th className="px-4 py-2.5">Telefon</th>
                <th className="px-4 py-2.5">Passport</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="border-t border-line-2">
                  <td className="px-4 py-2.5 font-semibold text-ink">{c.full_name}</td>
                  <td className="px-4 py-2.5 font-mono text-ink-2">{c.phone ?? "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-ink-3">{c.passport ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
