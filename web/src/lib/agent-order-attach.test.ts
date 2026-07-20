import { describe, expect, it } from "vitest";

import { parseAttachCustomerEntriesJson } from "@/lib/agent-order-attach";

const customerId = "b10bb955-d8b1-4a26-a6e2-928fd33949e1";
const productId = "4f65578f-3f1f-4216-9fc2-013ef06661d1";

describe("parseAttachCustomerEntriesJson", () => {
  it("parses existing and new customer entries", () => {
    const payload = JSON.stringify([
      {
        customerId,
        items: [
          {
            productId,
            quantity: 2,
            addDetails: "Packed separately",
          },
        ],
      },
      {
        customerId: null,
        firstName: "Ana",
        lastName: "Buyer",
        phoneNumber: "09171234567",
        email: "ana@example.test",
        address: "Market stall",
        items: [
          {
            productId,
            quantity: 1.5,
            addDetails: null,
          },
        ],
      },
    ]);

    expect(parseAttachCustomerEntriesJson(payload, { assignedCustomerIds: new Set([customerId]) })).toEqual([
      {
        customer: {
          type: "existing",
          customerId,
        },
        items: [
          {
            productId,
            quantity: 2,
            addDetails: "Packed separately",
          },
        ],
      },
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
            productId,
            quantity: 1.5,
            addDetails: null,
          },
        ],
      },
    ]);
  });

  it("rejects unassigned existing customers for agents", () => {
    const payload = JSON.stringify([
      {
        customerId,
        items: [
          {
            productId,
            quantity: 1,
            addDetails: null,
          },
        ],
      },
    ]);

    expect(() => parseAttachCustomerEntriesJson(payload, { assignedCustomerIds: new Set() })).toThrow(
      "Selected customer is not assigned to this agent.",
    );
  });
});
