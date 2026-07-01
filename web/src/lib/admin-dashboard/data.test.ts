import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupabaseAdminClient = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient,
}));

const emptyResponse = {
  data: [],
  error: null,
};

function createQueryBuilder() {
  const builder = {
    select: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve(emptyResponse)),
    then: (resolve: (value: typeof emptyResponse) => unknown) => resolve(emptyResponse),
  };

  return builder;
}

describe("loadAdminDashboardData", () => {
  beforeEach(() => {
    vi.resetModules();
    createSupabaseAdminClient.mockReset();
  });

  it("uses the server-only admin client so protected admin columns can be read without broadening public grants", async () => {
    const from = vi.fn(() => createQueryBuilder());
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminDashboardData } = await import("./data");

    const result = await loadAdminDashboardData();

    expect(createSupabaseAdminClient).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("product");
    expect(result.products).toEqual([]);
  });
});
