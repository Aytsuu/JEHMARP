import { consumeDashboardFragmentRefreshNeeded } from "./dashboard-fragment-cache";

const dashboardRecordPageSelector =
  "[data-dashboard-record-page], [data-order-detail-page], [data-admin-record-page], [data-agent-record-page]";

export function initDashboardRecordPageRefresh() {
  if (!document.querySelector(dashboardRecordPageSelector)) return;
  if (!consumeDashboardFragmentRefreshNeeded()) return;

  window.location.reload();
}

/** @deprecated Use initDashboardRecordPageRefresh */
export const initOrderDetailPageRefresh = initDashboardRecordPageRefresh;
