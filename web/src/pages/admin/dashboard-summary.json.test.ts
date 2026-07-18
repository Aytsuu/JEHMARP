import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminRoute = vi.fn();
const loadAdminDashboardSummaryData = vi.fn();

vi.mock("@/lib/admin-dashboard/page", () => ({
  requireAdminRoute,
}));

vi.mock("@/lib/admin-dashboard/data", () => ({
  loadAdminDashboardSummaryData,
}));

describe("GET /admin/dashboard-summary.json", () => {
  beforeEach(() => {
    vi.resetModules();
    requireAdminRoute.mockReset();
    loadAdminDashboardSummaryData.mockReset();
  });

  it("returns JSON summary data for an authenticated admin", async () => {
    requireAdminRoute.mockResolvedValue({
      ready: true,
      userId: "admin-user-id",
    });
    loadAdminDashboardSummaryData.mockResolvedValue({
      orders: 12,
      inquiries: 4,
      customers: 7,
      products: 9,
      resellerApplications: 3,
    });

    const { GET } = await import("./dashboard-summary.json");
    const response = await GET({
      request: new Request("http://localhost/admin/dashboard-summary.json"),
      url: new URL("http://localhost/admin/dashboard-summary.json"),
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      orders: 12,
      inquiries: 4,
      customers: 7,
      products: 9,
      resellerApplications: 3,
    });
  });

  it("returns the guard response when the request is not allowed", async () => {
    const redirectResponse = new Response(null, {
      status: 302,
      headers: {
        Location: "/login",
      },
    });
    requireAdminRoute.mockResolvedValue({
      ready: false,
      response: redirectResponse,
    });

    const { GET } = await import("./dashboard-summary.json");
    const response = await GET({
      request: new Request("http://localhost/admin/dashboard-summary.json"),
      url: new URL("http://localhost/admin/dashboard-summary.json"),
    } as Parameters<typeof GET>[0]);

    expect(response).toBe(redirectResponse);
    expect(loadAdminDashboardSummaryData).not.toHaveBeenCalled();
  });
});
