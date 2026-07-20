import TableEmptyIllustration from "@/components/dashboard/TableEmptyIllustration";

type DashboardTableEmptyStateContentProps = {
  message: string;
};

export default function DashboardTableEmptyStateContent({
  message,
}: DashboardTableEmptyStateContentProps) {
  return (
    <div className="dashboard-table-empty-state dashboard-table-empty-state--compact">
      <TableEmptyIllustration />
      <p className="dashboard-table-empty-state__message">{message}</p>
    </div>
  );
}
