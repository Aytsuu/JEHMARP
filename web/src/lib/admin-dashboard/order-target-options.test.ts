import { describe, expect, it } from "vitest";

import type { AdminAgent, AdminCustomer } from "./data";
import { buildAdminOrderTargetOptions } from "./order-target-options";

describe("buildAdminOrderTargetOptions", () => {
  it("returns searchable order targets for customers and active agents", () => {
    const customer = customerRow({
      id: "customer-id",
      first_name: "Ana",
      last_name: "Buyer",
      phone_number: "09170000000",
    });
    const activeAgent = agentRow({
      id: "agent-id",
      display_name: "Maria Agent",
      contact: "09171112222",
      status: "active",
    });
    const inactiveAgent = agentRow({
      id: "inactive-agent-id",
      display_name: "Inactive Agent",
      status: "inactive",
    });

    const options = buildAdminOrderTargetOptions({
      customers: [customer],
      agents: [inactiveAgent, activeAgent],
      customerPaymentNoticeById: new Map([["customer-id", "partial"]]),
      customerBalances: { "customer-id": 250 },
    });

    expect(options).toHaveLength(2);
    expect(options).toEqual([
      expect.objectContaining({
        type: "customer",
        label: "Ana Buyer",
        paymentNotice: "partial",
        balance: 250,
      }),
      expect.objectContaining({
        type: "agent",
        label: "Maria Agent",
        agent: expect.objectContaining({
          id: "agent-id",
          contact: "09171112222",
        }),
      }),
    ]);
  });
});

function customerRow(overrides: Partial<AdminCustomer>): AdminCustomer {
  return {
    id: "customer-id",
    first_name: "Customer",
    last_name: "Name",
    phone_number: "09170000000",
    email: null,
    address: "Market",
    assigned_agent_id: null,
    is_reseller: false,
    credit_limit: 1000,
    credit_limit_exceeded: false,
    created_at: "2026-07-22T00:00:00.000Z",
    updated_at: "2026-07-22T00:00:00.000Z",
    ...overrides,
  };
}

function agentRow(overrides: Partial<AdminAgent>): AdminAgent {
  return {
    id: "agent-id",
    user_id: null,
    customer_id: "agent-customer-id",
    employee_id: null,
    first_name: "Agent",
    last_name: "Name",
    display_name: "Agent Name",
    status: "active",
    email: null,
    contact: null,
    created_at: "2026-07-22T00:00:00.000Z",
    updated_at: "2026-07-22T00:00:00.000Z",
    ...overrides,
  };
}
