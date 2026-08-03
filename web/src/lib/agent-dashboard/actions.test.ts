import { describe, expect, it, vi } from "vitest";

import { combineDateAndTime } from "@/lib/datetime";

import {
  executeAgentAction,
  parseAgentActionFormData,
} from "./actions";

const agentUserId = "22222222-2222-2222-2222-222222222222";
const agentId = "64568f81-108b-42bd-b926-7e825dad67c6";

describe("parseAgentActionFormData", () => {
  it("parses a product-first agent order without customer details", () => {
    const formData = new FormData();
    formData.set("action", "create-agent-order");
    formData.set("orderSubmissionMode", "distribution");
    formData.set("releaseDate", "2026-07-21");
    formData.set("releaseTime", "14:30");
    formData.append("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.append("quantity", "2");
    formData.append("addDetails", "  Slice thin  ");
    formData.append("productId", "  ");
    formData.append("quantity", "  ");
    formData.append("addDetails", "  ");

    expect(parseAgentActionFormData(formData, agentUserId, agentId, new Set())).toEqual({
      success: true,
      action: {
        type: "create-agent-order",
        agentId,
        payload: {
          mode: "distribution",
          releaseDate: "2026-07-21",
          releaseTime: "14:30",
          items: [
            {
              productId: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
              quantity: 2,
              addDetails: "Slice thin",
            },
          ],
        },
      },
    });
  });

  it("ignores customer fields when parsing product-first agent orders", () => {
    const formData = new FormData();
    formData.set("action", "create-agent-order");
    formData.set("orderSubmissionMode", "distribution");
    formData.set("releaseDate", "2026-07-21");
    formData.set("releaseTime", "14:30");
    formData.set("customerId", "b10bb955-d8b1-4a26-a6e2-928fd33949e1");
    formData.set("firstName", "  Liza  ");
    formData.set("lastName", "Reyes");
    formData.set("phoneNumber", " 09171234567 ");
    formData.set("email", " ");
    formData.set("address", "  Stall 4  ");
    formData.append("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.append("quantity", "2");
    formData.append("addDetails", "");

    expect(parseAgentActionFormData(formData, agentUserId, agentId, new Set())).toEqual({
      success: true,
      action: {
        type: "create-agent-order",
        agentId,
        payload: {
          mode: "distribution",
          releaseDate: "2026-07-21",
          releaseTime: "14:30",
          items: [
            {
              productId: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
              quantity: 2,
              addDetails: null,
            },
          ],
        },
      },
    });
  });

  it("rejects agent orders without at least one item", () => {
    const formData = new FormData();
    formData.set("action", "create-agent-order");
    formData.set("orderSubmissionMode", "distribution");
    formData.set("releaseDate", "2026-07-21");
    formData.set("releaseTime", "14:30");
    formData.append("productId", "");
    formData.append("quantity", "");
    formData.append("addDetails", "");

    expect(parseAgentActionFormData(formData, agentUserId, agentId, new Set())).toEqual({
      success: false,
      errors: ["At least one order item is required."],
    });
  });

  it("parses an explicit personal agent order", () => {
    const formData = new FormData();
    formData.set("action", "create-agent-order");
    formData.set("orderSubmissionMode", "personal");
    formData.set("releaseDate", "2026-07-21");
    formData.set("releaseTime", "14:30");
    formData.append("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.append("quantity", "3");
    formData.append("addDetails", "For my household");

    expect(parseAgentActionFormData(formData, agentUserId, agentId, new Set())).toEqual({
      success: true,
      action: {
        type: "create-agent-order",
        agentId,
        payload: {
          mode: "personal",
          releaseDate: "2026-07-21",
          releaseTime: "14:30",
          items: [
            {
              productId: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
              quantity: 3,
              addDetails: "For my household",
            },
          ],
        },
      },
    });
  });

  it("rejects unsupported agent order submission modes", () => {
    const formData = new FormData();
    formData.set("action", "create-agent-order");
    formData.set("orderSubmissionMode", "customer-drop");
    formData.set("releaseDate", "2026-07-21");
    formData.set("releaseTime", "14:30");
    formData.append("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.append("quantity", "3");
    formData.append("addDetails", "");

    expect(parseAgentActionFormData(formData, agentUserId, agentId, new Set())).toEqual({
      success: false,
      errors: ["Order submission mode is not supported."],
    });
  });

  it("rejects invalid release dates", () => {
    const formData = new FormData();
    formData.set("action", "create-agent-order");
    formData.set("orderSubmissionMode", "distribution");
    formData.set("releaseDate", "07/21/2026");
    formData.set("releaseTime", "14:30");
    formData.append("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.append("quantity", "3");
    formData.append("addDetails", "");

    expect(parseAgentActionFormData(formData, agentUserId, agentId, new Set())).toEqual({
      success: false,
      errors: ["Date must use YYYY-MM-DD format."],
    });
  });

  it("rejects agent orders without a release time", () => {
    const formData = new FormData();
    formData.set("action", "create-agent-order");
    formData.set("orderSubmissionMode", "distribution");
    formData.set("releaseDate", "2026-07-21");
    formData.append("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.append("quantity", "3");
    formData.append("addDetails", "");

    expect(parseAgentActionFormData(formData, agentUserId, agentId, new Set())).toEqual({
      success: false,
      errors: ["Release time is required."],
    });
  });

  it("parses agent received payment records for customer orders", () => {
    const formData = new FormData();
    formData.set("action", "record-agent-payment");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("amount", "725.50");
    formData.set("paymentMethod", "Cash");
    formData.set("paymentTerms", "Gcash");
    formData.set("paymentDate", "2026-07-18");
    formData.set("referenceNumber", "  REF-725  ");
    formData.set("notes", "  Received by agent at pickup  ");

    expect(parseAgentActionFormData(formData, agentUserId, agentId, new Set())).toEqual({
      success: true,
      action: {
        type: "record-agent-payment",
        agentId,
        payload: {
          orderId: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
          amount: 725.5,
          paymentMethod: "Cash",
          paymentTerms: "Gcash",
          paymentDate: combineDateAndTime("2026-07-18"),
          referenceNumber: "REF-725",
          notes: "Received by agent at pickup",
        },
      },
    });
  });

  it("rejects agent received payment records without a positive amount", () => {
    const formData = new FormData();
    formData.set("action", "record-agent-payment");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("amount", "0");
    formData.set("paymentMethod", "Cash");
    formData.set("paymentTerms", "Cash on Delivery (COD)");
    formData.set("paymentDate", "2026-07-18");

    expect(parseAgentActionFormData(formData, agentUserId, agentId, new Set())).toEqual({
      success: false,
      errors: ["Amount must be greater than zero."],
    });
  });

  it("parses agent received payment distributions in selected order", () => {
    const formData = new FormData();
    formData.set("action", "record-agent-payment-distribution");
    formData.append("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.append("orderId", "0d805818-837b-42d9-996e-79a6a3559f9b");
    formData.append("orderId", "fb672730-f4f6-493d-94b9-6ce88312f379");
    formData.set("amount", "3500");
    formData.set("paymentMethod", "Cash");
    formData.set("paymentTerms", "Bank Transfer");
    formData.set("paymentDate", "2026-07-18");
    formData.set("referenceNumber", "  REMIT-001  ");
    formData.set("notes", "  Customer batch payment  ");

    expect(parseAgentActionFormData(formData, agentUserId, agentId, new Set())).toEqual({
      success: true,
      action: {
        type: "record-agent-payment-distribution",
        agentId,
        payload: {
          orderIds: [
            "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
            "0d805818-837b-42d9-996e-79a6a3559f9b",
            "fb672730-f4f6-493d-94b9-6ce88312f379",
          ],
          amount: 3500,
          paymentMethod: "Cash",
          paymentTerms: "Bank Transfer",
          paymentDate: combineDateAndTime("2026-07-18"),
          referenceNumber: "REMIT-001",
          notes: "Customer batch payment",
        },
      },
    });
  });

  it("rejects payment distributions without selected customer orders", () => {
    const formData = new FormData();
    formData.set("action", "record-agent-payment-distribution");
    formData.set("amount", "3500");
    formData.set("paymentMethod", "Cash");
    formData.set("paymentTerms", "Cash on Delivery (COD)");
    formData.set("paymentDate", "2026-07-18");

    expect(parseAgentActionFormData(formData, agentUserId, agentId, new Set())).toEqual({
      success: false,
      errors: ["At least one customer order is required."],
    });
  });

  it("parses attach-agent-order-customer actions for existing assigned customers", () => {
    const customerId = "b10bb955-d8b1-4a26-a6e2-928fd33949e1";
    const formData = new FormData();
    formData.set("action", "attach-agent-order-customer");
    formData.set("agentOrderId", "11111111-1111-4111-8111-111111111111");
    formData.set(
      "attachCustomerEntries",
      JSON.stringify([
        {
          customerId,
          items: [
            {
              productId: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
              quantity: 2,
              addDetails: "Packed separately",
            },
          ],
        },
      ]),
    );

    expect(parseAgentActionFormData(formData, agentUserId, agentId, new Set([customerId]))).toEqual({
      success: true,
      action: {
        type: "attach-agent-order-customer",
        agentOrderId: "11111111-1111-4111-8111-111111111111",
        entries: [
          {
            customer: {
              type: "existing",
              customerId,
            },
            items: [
              {
                productId: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
                quantity: 2,
                addDetails: "Packed separately",
              },
            ],
          },
        ],
        requireApproval: true,
      },
    });
  });

  it("parses attach-agent-order-customer actions for new customers", () => {
    const formData = new FormData();
    formData.set("action", "attach-agent-order-customer");
    formData.set("agentOrderId", "11111111-1111-4111-8111-111111111111");
    formData.set(
      "attachCustomerEntries",
      JSON.stringify([
        {
          customerId: null,
          firstName: "Ana",
          lastName: "Buyer",
          phoneNumber: "09171234567",
          email: "ana@example.test",
          address: "Market stall",
          items: [
            {
              productId: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
              quantity: 1.5,
              addDetails: null,
            },
          ],
        },
      ]),
    );

    expect(parseAgentActionFormData(formData, agentUserId, agentId, new Set())).toEqual({
      success: true,
      action: {
        type: "attach-agent-order-customer",
        agentOrderId: "11111111-1111-4111-8111-111111111111",
        entries: [
          {
            customer: {
              type: "new",
              payload: {
                firstName: "Ana",
                lastName: "Buyer",
                phoneNumber: "09171234567",
                email: "ana@example.test",
                address: "Market stall",
              },
            },
            items: [
              {
                productId: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
                quantity: 1.5,
                addDetails: null,
              },
            ],
          },
        ],
        requireApproval: true,
      },
    });
  });

  it("allows attach-agent-order-customer actions for unassigned existing customers", () => {
    const formData = new FormData();
    formData.set("action", "attach-agent-order-customer");
    formData.set("agentOrderId", "11111111-1111-4111-8111-111111111111");
    formData.set(
      "attachCustomerEntries",
      JSON.stringify([
        {
          customerId: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
          items: [
            {
              productId: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
              quantity: 2,
              addDetails: null,
            },
          ],
        },
      ]),
    );

    expect(parseAgentActionFormData(formData, agentUserId, agentId, new Set())).toEqual({
      success: true,
      action: {
        type: "attach-agent-order-customer",
        agentOrderId: "11111111-1111-4111-8111-111111111111",
        entries: [
          {
            customer: {
              type: "existing",
              customerId: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
            },
            items: [
              {
                productId: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
                quantity: 2,
                addDetails: null,
              },
            ],
          },
        ],
        requireApproval: true,
      },
    });
  });
});

describe("executeAgentAction", () => {
  it("attaches a customer order after verifying agent order status with explicit queries", async () => {
    const agentOrderMaybeSingle = vi.fn(() => Promise.resolve({
      data: {
        order_status: "pending_customers",
        release_date: "2026-07-22T00:30:00.000Z",
      },
      error: null,
    }));
    const agentOrderKindEq = vi.fn(() => ({ maybeSingle: agentOrderMaybeSingle }));
    const agentOrderEq = vi.fn(() => ({ eq: agentOrderKindEq }));
    const agentOrderSelect = vi.fn(() => ({ eq: agentOrderEq }));
    const customerOrderIs = vi.fn(() => Promise.resolve({
      data: [],
      error: null,
    }));
    const customerOrderEq = vi.fn(() => ({ is: customerOrderIs }));
    const customerOrderIn = vi.fn(() => ({ eq: customerOrderEq }));
    const customerOrderSelect = vi.fn(() => ({ in: customerOrderIn }));
    const rpc = vi.fn(() => Promise.resolve({
      data: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      error: null,
    }));
    let orderCall = 0;
    const from = vi.fn((table: string) => {
      if (table === "order") {
        orderCall += 1;
        return orderCall === 1
          ? { select: agentOrderSelect }
          : { select: customerOrderSelect };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    await executeAgentAction({ from, rpc } as never, {
      type: "attach-agent-order-customer",
      agentOrderId: "11111111-1111-4111-8111-111111111111",
      entries: [
        {
          customer: {
            type: "existing",
            customerId: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
          },
          items: [
            {
              productId: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
              quantity: 2,
              addDetails: null,
            },
          ],
        },
      ],
      requireApproval: true,
    });

    expect(agentOrderSelect).toHaveBeenCalledWith("order_status, release_date");
    expect(agentOrderEq).toHaveBeenCalledWith("id", "11111111-1111-4111-8111-111111111111");
    expect(agentOrderKindEq).toHaveBeenCalledWith("order_kind", "distribution");
    expect(customerOrderSelect).toHaveBeenCalledWith("payment_status");
    expect(customerOrderEq).toHaveBeenCalledWith("parent_order_id", "11111111-1111-4111-8111-111111111111");
    expect(rpc).toHaveBeenCalledWith("attach_customer_to_agent_order", {
      target_agent_order_id: "11111111-1111-4111-8111-111111111111",
      target_customer_id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
      item_payload: [
        {
          productId: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
          quantity: 2,
          addDetails: null,
        },
      ],
      customer_payload: {
        releaseDate: "2026-07-22",
        releaseTime: "08:30",
      },
      require_approval: true,
    });
  });

  it("submits product-first agent orders through the trusted RPC", async () => {
    const rpc = vi.fn(() => Promise.resolve({
      data: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      error: null,
    }));

    await executeAgentAction({ rpc } as never, {
      type: "create-agent-order",
      agentId,
      payload: {
        mode: "distribution",
        releaseDate: "2026-07-21",
        releaseTime: "14:30",
        items: [
          {
            productId: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
            quantity: 2,
            addDetails: null,
          },
        ],
      },
    });

    expect(rpc).toHaveBeenCalledWith("submit_agent_order", {
      target_customer_id: null,
      item_payload: [
        {
          productId: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
          quantity: 2,
          addDetails: null,
        },
      ],
      customer_payload: {
        releaseDate: "2026-07-21",
        releaseTime: "14:30",
      },
    });
  });

  it("submits explicit personal orders as customer orders through the trusted RPC", async () => {
    const rpc = vi.fn(() => Promise.resolve({
      data: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      error: null,
    }));

    await executeAgentAction({ rpc } as never, {
      type: "create-agent-order",
      agentId,
      payload: {
        mode: "personal",
        releaseDate: "2026-07-21",
        releaseTime: "14:30",
        items: [
          {
            productId: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
            quantity: 2,
            addDetails: null,
          },
        ],
      },
    });

    expect(rpc).toHaveBeenCalledWith("submit_agent_order", {
      target_customer_id: null,
      item_payload: [
        {
          productId: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
          quantity: 2,
          addDetails: null,
        },
      ],
      customer_payload: {
        orderFor: "personal",
        releaseDate: "2026-07-21",
        releaseTime: "14:30",
      },
    });
  });

  it("surfaces a safe error when the RPC rejects the order", async () => {
    const rpc = vi.fn(() => Promise.resolve({
      data: null,
      error: { message: "permission denied for table customer_order" },
    }));

    await expect(executeAgentAction({ rpc } as never, {
      type: "create-agent-order",
      agentId,
      payload: {
        mode: "distribution",
        releaseDate: "2026-07-21",
        releaseTime: "14:30",
        items: [
          {
            productId: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
            quantity: 2,
            addDetails: null,
          },
        ],
      },
    })).rejects.toThrow("Unable to submit agent order.");
  });

  it("records agent received payments through the pending-payment RPC", async () => {
    const rpc = vi.fn(() => Promise.resolve({
      data: "9ff2f3cf-14a3-4208-8e6b-886d4a6c8d74",
      error: null,
    }));

    await executeAgentAction({ rpc } as never, {
      type: "record-agent-payment",
      agentId,
      payload: {
        orderId: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
        amount: 725.5,
        paymentMethod: "Cash",
        paymentTerms: "Gcash",
        paymentDate: combineDateAndTime("2026-07-18"),
        referenceNumber: "REF-725",
        notes: "Received by agent at pickup",
      },
    });

    expect(rpc).toHaveBeenCalledWith("submit_agent_received_payment", {
      target_order_id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      payment_amount: 725.5,
      payment_method_value: "Cash",
      payment_terms_value: "Gcash",
      payment_date_value: combineDateAndTime("2026-07-18"),
      reference_number_value: "REF-725",
      notes_value: "Received by agent at pickup",
    });
  });

  it("surfaces a safe error when pending payment submission is rejected", async () => {
    const rpc = vi.fn(() => Promise.resolve({
      data: null,
      error: { message: "Payment amount exceeds the remaining order balance." },
    }));

    await expect(executeAgentAction({ rpc } as never, {
      type: "record-agent-payment",
      agentId,
      payload: {
        orderId: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
        amount: 725.5,
        paymentMethod: "Cash",
        paymentTerms: "Gcash",
        paymentDate: combineDateAndTime("2026-07-18"),
        referenceNumber: null,
        notes: null,
      },
    })).rejects.toThrow("Unable to record received payment.");
  });

  it("distributes agent received payments through the trusted RPC", async () => {
    const rpc = vi.fn(() => Promise.resolve({
      data: [
        "9ff2f3cf-14a3-4208-8e6b-886d4a6c8d74",
        "b8658ba4-aa0e-48ed-a62f-9eedb70ba894",
      ],
      error: null,
    }));

    await executeAgentAction({ rpc } as never, {
      type: "record-agent-payment-distribution",
      agentId,
      payload: {
        orderIds: [
          "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
          "0d805818-837b-42d9-996e-79a6a3559f9b",
        ],
        amount: 3500,
        paymentMethod: "Cash",
        paymentTerms: "Bank Transfer",
        paymentDate: combineDateAndTime("2026-07-18"),
        referenceNumber: "REMIT-001",
        notes: "Customer batch payment",
      },
    });

    expect(rpc).toHaveBeenCalledWith("submit_agent_received_payment_distribution", {
      target_order_ids: [
        "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
        "0d805818-837b-42d9-996e-79a6a3559f9b",
      ],
      payment_amount: 3500,
      payment_method_value: "Cash",
      payment_terms_value: "Bank Transfer",
      payment_date_value: combineDateAndTime("2026-07-18"),
      reference_number_value: "REMIT-001",
      notes_value: "Customer batch payment",
    });
  });

  it("surfaces a safe error when payment distribution is rejected", async () => {
    const rpc = vi.fn(() => Promise.resolve({
      data: null,
      error: { message: "Payment amount exceeds selected order balances." },
    }));

    await expect(executeAgentAction({ rpc } as never, {
      type: "record-agent-payment-distribution",
      agentId,
      payload: {
        orderIds: [
          "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
          "0d805818-837b-42d9-996e-79a6a3559f9b",
        ],
        amount: 3500,
        paymentMethod: "Cash",
        paymentTerms: "Cash on Delivery (COD)",
        paymentDate: combineDateAndTime("2026-07-18"),
        referenceNumber: null,
        notes: null,
      },
    })).rejects.toThrow("Unable to distribute received payment.");
  });
});
