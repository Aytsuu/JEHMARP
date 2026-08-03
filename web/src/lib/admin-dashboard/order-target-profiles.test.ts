import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient,
}));

import {
  buildOrderTargetPickerSummary,
  loadAttachOrderTargetProfiles,
  loadOrderTargetProfiles,
  parseOrderTargetProfileQuery,
} from "./order-target-profiles";

describe("parseOrderTargetProfileQuery", () => {
  it("defaults to page 1 and customer-agent scope", () => {
    expect(parseOrderTargetProfileQuery(new URL("https://example.test/admin/order-target-profiles.json")))
      .toEqual({
        page: 1,
        scope: "customer-agent",
        search: "",
        agentOrderId: "",
      });
  });

  it("parses search, page, and customer-only scope", () => {
    expect(parseOrderTargetProfileQuery(new URL(
      "https://example.test/admin/order-target-profiles.json?q=maria&page=2&scope=customer",
    ))).toEqual({
      page: 2,
      scope: "customer",
      search: "maria",
      agentOrderId: "",
    });
  });

  it("parses attach-order filters", () => {
    expect(parseOrderTargetProfileQuery(new URL(
      "https://example.test/admin/order-target-profiles.json?scope=customer&agentOrderId=order-1",
    ))).toEqual({
      page: 1,
      scope: "customer",
      search: "",
      agentOrderId: "order-1",
    });
  });
});

describe("buildOrderTargetPickerSummary", () => {
  it("returns the search hint when not filtering", () => {
    expect(buildOrderTargetPickerSummary({
      items: [],
      totalProfiles: 128,
      customerTotal: 100,
      agentTotal: 28,
      page: 1,
      pageSize: 10,
      segmentPageSize: 10,
      totalPages: 13,
      hasPagination: true,
      suggestedCount: 10,
      search: "",
      scope: "customer-agent",
    })).toBe("Try entering a customer or agent name.");
  });

  it("returns an empty summary while searching", () => {
    expect(buildOrderTargetPickerSummary({
      items: [],
      totalProfiles: 4,
      customerTotal: 4,
      agentTotal: 0,
      page: 1,
      pageSize: 10,
      segmentPageSize: 10,
      totalPages: 1,
      hasPagination: false,
      suggestedCount: 4,
      search: "maria",
      scope: "customer",
    })).toBe("");
  });
});

function buildCustomerRow(id: string, firstName: string, lastName: string) {
  return {
    id,
    first_name: firstName,
    last_name: lastName,
    phone_number: "09170000000",
    email: `${firstName.toLowerCase()}@example.test`,
    address: "Market",
    assigned_agent_id: null,
    is_reseller: false,
    outstanding_credit_balance: 0,
    credit_limit: 1000,
    credit_limit_exceeded: false,
  };
}

function buildAgentListRow(id: string, displayName: string) {
  return {
    id,
    display_name: displayName,
    contact: "09171112222",
    email: `${displayName.toLowerCase().replace(/\s+/g, ".")}@example.test`,
    status: "active",
  };
}

function buildAgentAttachRecord(id: string, displayName: string, customerId: string) {
  return {
    id,
    user_id: null,
    customer_id: customerId,
    promoted_from_customer_id: null,
    promoted_from_customer_at: null,
    employee_id: null,
    status: "active",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    profile: {
      id: `${id}-profile`,
      first_name: displayName.split(" ")[0] ?? displayName,
      last_name: displayName.split(" ").slice(1).join(" ") || "Agent",
      display_name: displayName,
      phone_number: "09171112222",
      email: `${displayName.toLowerCase().replace(/\s+/g, ".")}@example.test`,
      address: "Agent address",
    },
  };
}

describe("loadOrderTargetProfiles", () => {
  beforeEach(() => {
    createSupabaseAdminClient.mockReset();
  });

  it("loads the first ten profiles across customers and agents", async () => {
    const customers = Array.from({ length: 12 }, (_, index) =>
      buildCustomerRow(`customer-${index + 1}`, `Customer${index + 1}`, "Buyer"));
    const agents = Array.from({ length: 4 }, (_, index) =>
      buildAgentListRow(`agent-${index + 1}`, `Agent ${index + 1}`));
    const orderBuilder = {
      select: vi.fn(() => orderBuilder),
      in: vi.fn(() => orderBuilder),
      neq: vi.fn(() => orderBuilder),
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => resolve({
        data: [],
        error: null,
      }),
    };
    const rpc = vi.fn((name: string, params: { page_number: number; page_size: number }) => {
      if (name === "list_admin_customer_rows") {
        const start = (params.page_number - 1) * params.page_size;
        const records = customers.slice(start, start + params.page_size);

        return Promise.resolve({
          data: [{ records, total_rows: String(customers.length) }],
          error: null,
        });
      }

      if (name === "list_admin_agent_rows") {
        const start = (params.page_number - 1) * params.page_size;
        const records = agents.slice(start, start + params.page_size);

        return Promise.resolve({
          data: [{ records, total_rows: String(agents.length) }],
          error: null,
        });
      }

      return Promise.resolve({ data: null, error: null });
    });

    createSupabaseAdminClient.mockReturnValue({
      rpc,
      from: vi.fn(() => orderBuilder),
    });

    const result = await loadOrderTargetProfiles({
      page: 1,
      scope: "customer-agent",
      search: "",
    });

    expect(result.items).toHaveLength(10);
    expect(result.items.every((item) => item.type === "customer")).toBe(true);
    expect(result.totalProfiles).toBe(16);
    expect(result.totalPages).toBe(2);
    expect(result.hasPagination).toBe(true);
    expect(result.page).toBe(1);
  });

  it("loads the next page with remaining customers followed by agents", async () => {
    const customers = Array.from({ length: 12 }, (_, index) =>
      buildCustomerRow(`customer-${index + 1}`, `Customer${index + 1}`, "Buyer"));
    const agents = Array.from({ length: 4 }, (_, index) =>
      buildAgentListRow(`agent-${index + 1}`, `Agent ${index + 1}`));
    const orderBuilder = {
      select: vi.fn(() => orderBuilder),
      in: vi.fn(() => orderBuilder),
      neq: vi.fn(() => orderBuilder),
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => resolve({
        data: [],
        error: null,
      }),
    };
    const rpc = vi.fn((name: string, params: { page_number: number; page_size: number }) => {
      if (name === "list_admin_customer_rows") {
        const start = (params.page_number - 1) * params.page_size;
        const records = customers.slice(start, start + params.page_size);

        return Promise.resolve({
          data: [{ records, total_rows: String(customers.length) }],
          error: null,
        });
      }

      if (name === "list_admin_agent_rows") {
        const start = (params.page_number - 1) * params.page_size;
        const records = agents.slice(start, start + params.page_size);

        return Promise.resolve({
          data: [{ records, total_rows: String(agents.length) }],
          error: null,
        });
      }

      return Promise.resolve({ data: null, error: null });
    });

    createSupabaseAdminClient.mockReturnValue({
      rpc,
      from: vi.fn(() => orderBuilder),
    });

    const result = await loadOrderTargetProfiles({
      page: 2,
      scope: "customer-agent",
      search: "",
    });

    expect(result.items).toHaveLength(6);
    expect(result.items.slice(0, 2).every((item) => item.type === "customer")).toBe(true);
    expect(result.items.slice(2).every((item) => item.type === "agent")).toBe(true);
    expect(result.page).toBe(2);
    expect(result.hasPagination).toBe(true);
  });

  it("paginates when more than ten combined profiles exist", async () => {
    const orderBuilder = {
      select: vi.fn(() => orderBuilder),
      in: vi.fn(() => orderBuilder),
      neq: vi.fn(() => orderBuilder),
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => resolve({
        data: [],
        error: null,
      }),
    };
    const rpc = vi.fn((name: string) => {
      if (name === "list_admin_customer_rows") {
        return Promise.resolve({
          data: [{ records: [], total_rows: "6" }],
          error: null,
        });
      }

      if (name === "list_admin_agent_rows") {
        return Promise.resolve({
          data: [{ records: [], total_rows: "3" }],
          error: null,
        });
      }

      return Promise.resolve({ data: null, error: null });
    });

    createSupabaseAdminClient.mockReturnValue({
      rpc,
      from: vi.fn(() => orderBuilder),
    });

    const result = await loadOrderTargetProfiles({
      page: 1,
      scope: "customer-agent",
      search: "",
    });

    expect(result.totalProfiles).toBe(9);
    expect(result.hasPagination).toBe(false);
    expect(result.totalPages).toBe(1);
  });
});

describe("loadAttachOrderTargetProfiles", () => {
  beforeEach(() => {
    createSupabaseAdminClient.mockReset();
  });

  it("scopes customers to the distribution agent and includes unassigned customers", async () => {
    const orderBuilder = {
      select: vi.fn(() => orderBuilder),
      eq: vi.fn(() => orderBuilder),
      not: vi.fn(() => orderBuilder),
      in: vi.fn(() => orderBuilder),
      neq: vi.fn(() => orderBuilder),
      then: (resolve: (value: { data: { customer_id: string }[]; error: null }) => unknown) => resolve({
        data: [{ customer_id: "attached-customer" }],
        error: null,
      }),
    };
    const agentBuilder = {
      select: vi.fn(() => agentBuilder),
      eq: vi.fn(() => agentBuilder),
      maybeSingle: vi.fn(() => Promise.resolve({
        data: buildAgentAttachRecord("agent-1", "Carlos Agent", "agent-customer-1"),
        error: null,
      })),
    };
    const rpc = vi.fn(() => Promise.resolve({
      data: [{
        records: [buildCustomerRow("customer-1", "Maria", "Buyer")],
        total_rows: "1",
      }],
      error: null,
    }));

    createSupabaseAdminClient.mockReturnValue({
      rpc,
      from: vi.fn((table: string) => (table === "agent" ? agentBuilder : orderBuilder)),
    });

    const result = await loadAttachOrderTargetProfiles({
      agentOrderId: "distribution-order-1",
      assignedAgentId: "agent-1",
      page: 1,
      search: "",
    });

    expect(rpc).toHaveBeenCalledWith("list_admin_customer_rows", expect.objectContaining({
      assigned_agent_id_filter: "agent-1",
      include_unassigned_customers: true,
      exclude_customer_ids: ["attached-customer", "agent-customer-1"],
    }));
    expect(result.items[0]).toMatchObject({
      type: "agent",
      id: "agent-1",
      label: "Carlos Agent",
      attachCustomerId: "agent-customer-1",
    });
    expect(result.items[1]).toMatchObject({
      type: "customer",
      id: "customer-1",
    });
    expect(result.agentTotal).toBe(1);
  });
});
