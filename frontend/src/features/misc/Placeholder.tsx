import { PageTitle, EmptyState } from "@/components/ui/misc";

export function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <PageTitle title={title} />
      <EmptyState>Bu boʻlim keyingi bosqichda quriladi.</EmptyState>
    </div>
  );
}
