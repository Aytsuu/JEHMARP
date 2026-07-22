import { beforeEach, describe, expect, it, vi } from "vitest";

import { markDashboardFragmentRefreshNeeded } from "./dashboard-fragment-cache";
import {
  initDashboardRecordPageRefresh,
  initOrderDetailPageRefresh,
} from "./order-detail-page";

describe("initOrderDetailPageRefresh", () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = "";
    vi.stubGlobal("location", {
      ...window.location,
      reload: vi.fn(),
    });
  });

  it("reloads order detail pages after a dashboard mutation", () => {
    document.body.innerHTML = '<div data-order-detail-page data-dashboard-record-page></div>';
    markDashboardFragmentRefreshNeeded();

    initDashboardRecordPageRefresh();

    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it("reloads other admin record pages after a dashboard mutation", () => {
    document.body.innerHTML = '<div data-dashboard-record-page></div>';
    markDashboardFragmentRefreshNeeded();

    initDashboardRecordPageRefresh();

    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it("keeps the legacy order detail initializer alias", () => {
    document.body.innerHTML = '<div data-order-detail-page></div>';
    markDashboardFragmentRefreshNeeded();

    initOrderDetailPageRefresh();

    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload when no mutation refresh is pending", () => {
    document.body.innerHTML = '<div data-dashboard-record-page></div>';

    initDashboardRecordPageRefresh();

    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it("does not reload on non-order-detail pages", () => {
    markDashboardFragmentRefreshNeeded();

    initDashboardRecordPageRefresh();

    expect(window.location.reload).not.toHaveBeenCalled();
  });
});
