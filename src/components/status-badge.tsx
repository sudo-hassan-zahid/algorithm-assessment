const labels: Record<string, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  AUTO_EXECUTED: "Auto-executed",
  ESCALATED: "Needs review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  FAILED: "Failed",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status status--${status.toLowerCase()}`}>
      {labels[status] ?? status}
    </span>
  );
}
