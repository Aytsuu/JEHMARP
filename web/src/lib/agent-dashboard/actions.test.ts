import { describe, expect, it, vi } from "vitest";

import {
  executeAgentAction,
  parseAgentActionFormData,
} from "./actions";

const agentUserId = "22222222-2222-2222-2222-222222222222";
const agentId = "64568f81-108b-42bd-b926-7e825dad67c6";
const customerId = "b10bb955-d8b1-4a26-a6e2-928fd33949e1";

describe("parseAgentActionFormData", () => {
  it("parses an agent-submitted order for a selected customer", () => {
    const formData = new FormData();
    formData.set("action", "create-agent-order");
    formData.set("customerId", customerId);
    formData.append("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.append("quantity", "2");
    formData.append("addDetails", "  Slice thin  ");
    formData.append("productId", "  ");
    formData.append("quantity", "  ");
    formData.append("addDetails", "  ");

    expect(parseAgentActionFormData(formData, agentUserId, agentId, new Set([customerId]))).toEqual({
      success: true,
      action: {
        type: "create-agent-order",
        agentId,
        payload: {
          customer: {
            type: "existing",
            customerId,
          },
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

  it("parses an agent-submitted order for a new customer", () => {
    const formData = new FormData();
    formData.set("action", "create-agent-order");
    formData.set("customerId", "");
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
          customer: {
            type: "new",
            payload: {
              firstName: "Liza",
              lastName: "Reyes",
              phoneNumber: "09171234567",
              email: null,
              address: "Stall 4",
            },
          },
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

  it("rejects agent order creation for unassigned customers", () => {
    const formData = new FormData();
    formData.set("action", "create-agent-order");
    formData.set("customerId", customerId);
    formData.append("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.append("quantity", "2");
    formData.append("addDetails", "");

    expect(parseAgentActionFormData(formData, agentUserId, agentId, new Set())).toEqual({
      success: false,
      errors: ["Selected customer is not assigned to this agent."],
    });
  });

  it("rejects agent orders without at least one item", () => {
    const formData = new FormData();
    formData.set("action", "create-agent-order");
    formData.set("customerId", customerId);
    formData.append("productId", "");
    formData.append("quantity", "");
    formData.append("addDetails", "");

    expect(parseAgentActionFormData(formData, agentUserId, agentId, new Set([customerId]))).toEqual({
      success: false,
      errors: ["At least one order item is required."],
    });
  });
});

describe("executeAgentAction", () => {
  it("submits agent orders through the trusted RPC instead of direct table inserts", async () => {
    const rpc = vi.fn(() => Promise.resolve({
      data: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      error: null,
    }));

    await executeAgentAction({ rpc } as never, {
      type: "create-agent-order",
      agentId,
      payload: {
        customer: {
          type: "existing",
          customerId,
        },
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
      target_customer_id: customerId,
      item_payload: [
        {
          productId: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
          quantity: 2,
          addDetails: null,
        },
      ],
      customer_payload: null,
    });
  });

  it("submits new customer orders through the trusted RPC with customer details", async () => {
    const rpc = vi.fn(() => Promise.resolve({
      data: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      error: null,
    }));

    await executeAgentAction({ rpc } as never, {
      type: "create-agent-order",
      agentId,
      payload: {
        customer: {
          type: "new",
          payload: {
            firstName: "Liza",
            lastName: "Reyes",
            phoneNumber: "09171234567",
            email: null,
            address: "Stall 4",
          },
        },
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
        firstName: "Liza",
        lastName: "Reyes",
        phoneNumber: "09171234567",
        email: null,
        address: "Stall 4",
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
        customer: {
          type: "existing",
          customerId,
        },
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
});
