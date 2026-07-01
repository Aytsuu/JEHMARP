import { describe, expect, it, vi } from "vitest";

import {
  executeAdminAction,
  getAllowedNextOrderStatuses,
  parseAdminActionFormData,
} from "./actions";

const adminUserId = "8bcce9f3-2a1b-43c0-9e51-70667e017111";

describe("parseAdminActionFormData", () => {
  it("parses admin-created orders with normalized adjustments and order items", () => {
    const formData = new FormData();
    formData.set("action", "create-order");
    formData.set("customerId", "b10bb955-d8b1-4a26-a6e2-928fd33949e1");
    formData.set("agentId", "  ");
    formData.set("discountAmount", "15.50");
    formData.set("deliveryFee", "80");
    formData.append("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.append("quantity", "2");
    formData.append("addDetails", "  Slice thin  ");
    formData.append("productId", "  ");
    formData.append("quantity", "  ");
    formData.append("addDetails", "  ");
    formData.append("productId", "9ad456ad-1d2e-41b2-b297-8ddf6304ece0");
    formData.append("quantity", "1.5");
    formData.append("addDetails", "  ");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "create-order",
        payload: {
          customer_id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
          agent_id: null,
          source: "admin_manual",
          order_status: "approved",
          payment_status: "unpaid",
          discount_amount: 15.5,
          delivery_fee: 80,
          submitted_by: adminUserId,
          approved_by: adminUserId,
          approved_at: expect.any(String),
          updated_at: expect.any(String),
        },
        items: [
          {
            product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
            partial_quantity: 2,
            final_quantity: 2,
            add_details: "Slice thin",
          },
          {
            product_id: "9ad456ad-1d2e-41b2-b297-8ddf6304ece0",
            partial_quantity: 1.5,
            final_quantity: 1.5,
            add_details: null,
          },
        ],
      },
    });
  });

  it("rejects admin-created orders without at least one order item", () => {
    const formData = new FormData();
    formData.set("action", "create-order");
    formData.set("customerId", "b10bb955-d8b1-4a26-a6e2-928fd33949e1");
    formData.set("discountAmount", "0");
    formData.set("deliveryFee", "0");
    formData.append("productId", "");
    formData.append("quantity", "");
    formData.append("addDetails", "");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["At least one order item is required."],
    });
  });

  it("rejects page saves because admin content only updates existing predefined pages", () => {
    const formData = new FormData();
    formData.set("action", "save-page");
    formData.set("slug", "new-page");
    formData.set("title", "New Page");
    formData.set("status", "draft");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Unknown admin action."],
    });
  });

  it("parses product saves with normalized numeric and optional fields", () => {
    const formData = new FormData();
    formData.set("action", "save-product");
    formData.set("name", "  Pork Belly  ");
    formData.set("category", "pork");
    formData.set("unitLabel", "kg");
    formData.set("defaultPrice", "250.50");
    formData.set("resellerPrice", "220");
    formData.set("stockStatus", "limited");
    formData.set("description", "  ");
    formData.set("imagePath", "/images/pork.png");
    formData.set("isActive", "on");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "save-product",
        payload: {
          category: "pork",
          default_price: 250.5,
          description: null,
          image_path: "/images/pork.png",
          is_active: true,
          name: "Pork Belly",
          reseller_price: 220,
          stock_status: "limited",
          unit_label: "kg",
        },
      },
    });
  });

  it("parses customer reseller classification when saving customers", () => {
    const formData = new FormData();
    formData.set("action", "save-customer");
    formData.set("firstName", "  Ana  ");
    formData.set("lastName", "Buyer");
    formData.set("phoneNumber", "09170000000");
    formData.set("email", "ana@example.test");
    formData.set("address", "Market stall 12");
    formData.set("assignedAgentId", "");
    formData.set("isReseller", "on");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "save-customer",
        payload: {
          first_name: "Ana",
          last_name: "Buyer",
          phone_number: "09170000000",
          email: "ana@example.test",
          address: "Market stall 12",
          assigned_agent_id: null,
          created_by: adminUserId,
          is_reseller: true,
          updated_at: expect.any(String),
        },
      },
    });
  });

  it("rejects malformed page section JSON before writing", () => {
    const formData = new FormData();
    formData.set("action", "save-page-section");
    formData.set("sectionId", "45e73d23-f25f-4de7-ae3a-ebcf34e995f1");
    formData.set("pageId", "9db3dfbf-4271-456f-a7dd-6897ad099515");
    formData.set("type", "hero");
    formData.set("sortOrder", "0");
    formData.set("status", "published");
    formData.set("content", "{\"heading\":");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Section content must be valid JSON."],
    });
  });

  it("requires page section id so content updates cannot create new sections", () => {
    const formData = new FormData();
    formData.set("action", "save-page-section");
    formData.set("pageId", "9db3dfbf-4271-456f-a7dd-6897ad099515");
    formData.set("type", "hero");
    formData.set("sortOrder", "0");
    formData.set("status", "published");
    formData.set("content", "{}");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Section id is required."],
    });
  });

  it("sets commission audit fields when a commission is managed", () => {
    const formData = new FormData();
    formData.set("action", "update-commission");
    formData.set("orderItemId", "45e73d23-f25f-4de7-ae3a-ebcf34e995f1");
    formData.set("amount", "125.25");
    formData.set("status", "set");
    formData.set("notes", "Reviewed");

    const result = parseAdminActionFormData(formData, adminUserId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.action.type).toBe("update-commission");
    }
    if (result.success && result.action.type === "update-commission") {
      expect(result.action).toMatchObject({
        type: "update-commission",
        payload: {
          agent_commission_amount: 125.25,
          agent_commission_notes: "Reviewed",
          agent_commission_set_by: adminUserId,
          agent_commission_status: "set",
        },
      });
      expect(result.action.payload.agent_commission_set_at).toEqual(expect.any(String));
    }
  });

  it("clears commission audit fields when commission status is unset", () => {
    const formData = new FormData();
    formData.set("action", "update-commission");
    formData.set("orderItemId", "45e73d23-f25f-4de7-ae3a-ebcf34e995f1");
    formData.set("amount", "125.25");
    formData.set("status", "unset");
    formData.set("notes", "Remove commission");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "update-commission",
        orderItemId: "45e73d23-f25f-4de7-ae3a-ebcf34e995f1",
        payload: {
          agent_commission_amount: 0,
          agent_commission_notes: null,
          agent_commission_set_at: null,
          agent_commission_set_by: null,
          agent_commission_status: "unset",
        },
      },
    });
  });

});

describe("executeAdminAction", () => {
  it("creates an admin order and inserts each order item with the returned order id", async () => {
    const orderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const orderInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: orderId }, error: null })),
      })),
    }));
    const itemInsert = vi.fn(() => Promise.resolve({ error: null }));
    const from = vi.fn((table: string) => {
      if (table === "customer_order") return { insert: orderInsert };
      if (table === "customer_order_item") return { insert: itemInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    await executeAdminAction({ from } as never, {
      type: "create-order",
      payload: {
        customer_id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
        agent_id: null,
        source: "admin_manual",
        order_status: "approved",
        payment_status: "unpaid",
        discount_amount: 0,
        delivery_fee: 50,
        submitted_by: adminUserId,
        approved_by: adminUserId,
        approved_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-01T00:00:00.000Z",
      },
      items: [
        {
          product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
          partial_quantity: 2,
          final_quantity: 2,
          add_details: null,
        },
      ],
    });

    expect(from).toHaveBeenCalledWith("customer_order");
    expect(from).toHaveBeenCalledWith("customer_order_item");
    expect(orderInsert).toHaveBeenCalledWith({
      customer_id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
      agent_id: null,
      source: "admin_manual",
      order_status: "approved",
      payment_status: "unpaid",
      discount_amount: 0,
      delivery_fee: 50,
      submitted_by: adminUserId,
      approved_by: adminUserId,
      approved_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
    });
    expect(itemInsert).toHaveBeenCalledWith([
      {
        order_id: orderId,
        product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
        partial_quantity: 2,
        final_quantity: 2,
        add_details: null,
      },
    ]);
  });
});

describe("getAllowedNextOrderStatuses", () => {
  it("allows submitted orders to be approved, rejected, or cancelled", () => {
    expect(getAllowedNextOrderStatuses("submitted")).toEqual([
      "approved",
      "rejected",
      "cancelled",
    ]);
  });

  it("prevents terminal statuses from moving forward", () => {
    expect(getAllowedNextOrderStatuses("closed")).toEqual([]);
    expect(getAllowedNextOrderStatuses("cancelled")).toEqual([]);
    expect(getAllowedNextOrderStatuses("rejected")).toEqual([]);
  });
});
