type DashboardTableEmptyStateContentProps = {
  message: string;
};

export default function DashboardTableEmptyStateContent({
  message,
}: DashboardTableEmptyStateContentProps) {
  return (
    <div className="dashboard-table-empty-state dashboard-table-empty-state--compact">
      <svg
        className="dashboard-table-empty-state__illustration"
        viewBox="0 0 128 128"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M24 46 64 24l40 22-40 22L24 46Z"
          fill="#fff"
          stroke="#62355C"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        <path
          d="M24 46v44l40 22V68L24 46Z"
          fill="#D6AB7F"
          stroke="#62355C"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        <path
          d="M104 46v44l-40 22V68l40-22Z"
          fill="#C89562"
          stroke="#62355C"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        <path
          d="M24 46 7 57l40 22 17-11-40-22Z"
          fill="#fff"
          stroke="#62355C"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        <path
          d="M104 46 121 57 81 79 64 68l40-22Z"
          fill="#fff"
          stroke="#62355C"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        <path
          d="M64 68v44"
          fill="none"
          stroke="#62355C"
          strokeLinecap="round"
          strokeWidth="3"
        />
      </svg>
      <p className="dashboard-table-empty-state__message">{message}</p>
    </div>
  );
}
