import { describe, expect, it, vi } from "vitest";

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
    formData.append("productId", "");
    formData.append("quantity", "");
    formData.append("addDetails", "");

    expect(parseAgentActionFormData(formData, agentUserId, agentId, new Set())).toEqual({
      success: false,
      errors: ["At least one order item is required."],
    });
  });
});

describe("executeAgentAction", () => {
  it("submits product-first agent orders through the trusted RPC", async () => {
    const rpc = vi.fn(() => Promise.resolve({
      data: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      error: null,
    }));

    await executeAgentAction({ rpc } as never, {
      type: "create-agent-order",
      agentId,
      payload: {
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
      customer_payload: null,
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
