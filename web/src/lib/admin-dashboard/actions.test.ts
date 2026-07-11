import { describe, expect, it, vi } from "vitest";

import {
  executeAdminAction,
  formatAdminActionFeedback,
  getAllowedNextOrderStatuses,
  parseAdminActionFormData,
} from "./actions";

const adminUserId = "8bcce9f3-2a1b-43c0-9e51-70667e017111";

describe("parseAdminActionFormData", () => {
  it("parses admin-created orders with normalized order items", () => {
    const formData = new FormData();
    formData.set("action", "create-order");
    formData.set("customerId", "b10bb955-d8b1-4a26-a6e2-928fd33949e1");
    formData.set("agentId", "  ");
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
        customer: {
          type: "existing",
          customerId: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
        },
        payload: {
          agent_id: null,
          source: "admin_manual",
          order_status: "processing",
          payment_status: "unpaid",
          submitted_by: adminUserId,
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
    formData.append("productId", "");
    formData.append("quantity", "");
    formData.append("addDetails", "");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["At least one order item is required."],
    });
  });

  it("parses admin-created orders with inline customer details when no existing customer is selected", () => {
    const formData = new FormData();
    formData.set("action", "create-order");
    formData.set("firstName", "  Luz  ");
    formData.set("lastName", "Dela Cruz");
    formData.set("phoneNumber", " 09171112222 ");
    formData.set("email", "luz@example.test");
    formData.set("address", "  Stall 8  ");
    formData.set("assignedAgentId", "64568f81-108b-42bd-b926-7e825dad67c6");
    formData.set("isReseller", "on");
    formData.append("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.append("quantity", "3");
    formData.append("addDetails", "");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "create-order",
        customer: {
          type: "new",
          payload: {
            first_name: "Luz",
            last_name: "Dela Cruz",
            phone_number: "09171112222",
            email: "luz@example.test",
            address: "Stall 8",
            assigned_agent_id: "64568f81-108b-42bd-b926-7e825dad67c6",
            created_by: adminUserId,
            is_reseller: true,
            updated_at: expect.any(String),
          },
        },
        payload: {
          agent_id: null,
          source: "admin_manual",
          order_status: "processing",
          payment_status: "unpaid",
          submitted_by: adminUserId,
          updated_at: expect.any(String),
        },
        items: [
          {
            product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
            partial_quantity: 3,
            final_quantity: 3,
            add_details: null,
          },
        ],
      },
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
    const imageFile = new File(["image-bytes"], "pork.png", {
      type: "image/png",
    });
    formData.set("action", "save-product");
    formData.set("name", "  Pork Belly  ");
    formData.set("category", "pork");
    formData.set("unitLabel", "kg");
    formData.set("defaultPrice", "250.50");
    formData.set("resellerPrice", "220");
    formData.set("stockStatus", "limited");
    formData.set("description", "  ");
    formData.set("imageFile", imageFile);
    formData.set("isActive", "on");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "save-product",
        payload: {
          category: "pork",
          default_price: 250.5,
          description: null,
          image_file: imageFile,
          is_active: true,
          name: "Pork Belly",
          reseller_price: 220,
          stock_status: "limited",
          unit_label: "kg",
        },
      },
    });
  });

  it("requires a product image when creating a product", () => {
    const formData = new FormData();
    formData.set("action", "save-product");
    formData.set("name", "Pork Belly");
    formData.set("category", "pork");
    formData.set("unitLabel", "kg");
    formData.set("defaultPrice", "250.50");
    formData.set("resellerPrice", "220");
    formData.set("stockStatus", "limited");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Product image is required."],
    });
  });

  it("rejects unsupported product unit labels", () => {
    const formData = new FormData();
    formData.set("action", "save-product");
    formData.set("name", "Pork Belly");
    formData.set("category", "pork");
    formData.set("unitLabel", "box");
    formData.set("defaultPrice", "250.50");
    formData.set("resellerPrice", "220");
    formData.set("stockStatus", "limited");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Unit label is not supported."],
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

  it("parses create-agent actions with normalized email and contact", () => {
    const formData = new FormData();
    formData.set("action", "create-agent");
    formData.set("email", "  Agent@Example.Test ");
    formData.set("contact", " 09171234567 ");
    formData.set("password", "password123");
    formData.set("displayName", "New Agent");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "create-agent",
        payload: {
          email: "agent@example.test",
          contact: "09171234567",
          password: "password123",
          display_name: "New Agent",
          status: "active",
        },
      },
    });
  });

  it("rejects create-agent actions without a contact number", () => {
    const formData = new FormData();
    formData.set("action", "create-agent");
    formData.set("email", "agent@example.test");
    formData.set("contact", "   ");
    formData.set("password", "password123");
    formData.set("displayName", "New Agent");

    expect(parseAdminActionFormData(formData, adminUserId).success).toBe(false);
  });

  it("rejects create-agent actions with non-numeric contact numbers", () => {
    const formData = new FormData();
    formData.set("action", "create-agent");
    formData.set("email", "agent@example.test");
    formData.set("contact", "0917-123-4567");
    formData.set("password", "password123");
    formData.set("displayName", "New Agent");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Contact number must be exactly 11 digits."],
    });
  });

  it("rejects create-agent actions when contact number is not 11 digits", () => {
    const formData = new FormData();
    formData.set("action", "create-agent");
    formData.set("email", "agent@example.test");
    formData.set("contact", "0917123456");
    formData.set("password", "password123");
    formData.set("displayName", "New Agent");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Contact number must be exactly 11 digits."],
    });
  });

  it("rejects create-agent actions with invalid email before other field errors", () => {
    const formData = new FormData();
    formData.set("action", "create-agent");
    formData.set("email", "not-an-email");
    formData.set("contact", "letters");
    formData.set("password", "short");
    formData.set("displayName", "");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Enter a valid email address."],
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
    formData.set("isPaid", "on");
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
          agent_commission_paid: true,
        },
      });
      expect(result.action.payload.agent_commission_set_at).toEqual(expect.any(String));
    }
  });

  it("clears commission audit fields when commission amount is zero", () => {
    const formData = new FormData();
    formData.set("action", "update-commission");
    formData.set("orderItemId", "45e73d23-f25f-4de7-ae3a-ebcf34e995f1");
    formData.set("amount", "0");
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
          agent_commission_paid: false,
        },
      },
    });
  });

  it("parses invoice saves without date or status fields", () => {
    const formData = new FormData();
    formData.set("action", "save-invoice");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "save-invoice",
        payload: {
          order_id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
          status: "issued",
          issued_at: expect.any(String),
          due_at: null,
          updated_at: expect.any(String),
        },
      },
    });
  });

  it("parses reseller application status updates", () => {
    const formData = new FormData();
    formData.set("action", "update-reseller-application");
    formData.set("applicationId", "45e73d23-f25f-4de7-ae3a-ebcf34e995f1");
    formData.set("applicationStatus", "contacted");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "update-reseller-application",
        applicationId: "45e73d23-f25f-4de7-ae3a-ebcf34e995f1",
        payload: {
          application_status: "contacted",
          admin_read_at: expect.any(String),
          admin_read_by: adminUserId,
          updated_at: expect.any(String),
        },
      },
    });
  });

  it("parses order read actions with safe admin return paths", () => {
    const formData = new FormData();
    formData.set("action", "mark-order-read");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("returnTo", "/admin/orders/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "mark-order-read",
        orderId: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
        returnTo: "/admin/orders/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      },
    });
  });

  it("rejects read-action return paths outside the admin dashboard", () => {
    const formData = new FormData();
    formData.set("action", "mark-order-read");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("returnTo", "https://example.test/admin/orders");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Return path is not supported."],
    });
  });

  it("rejects removed order adjustment saves", () => {
    const formData = new FormData();
    formData.set("action", "update-order-adjustments");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("agentId", "");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Unknown admin action."],
    });
  });

  it("rejects removed order update saves", () => {
    const formData = new FormData();
    formData.set("action", "add-order-update");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("updateType", "admin_note");
    formData.set("title", "Removed order update action");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Unknown admin action."],
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
      customer: {
        type: "existing",
        customerId: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
      },
      payload: {
        agent_id: null,
        source: "admin_manual",
        order_status: "processing",
        payment_status: "unpaid",
        submitted_by: adminUserId,
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
      order_status: "processing",
      payment_status: "unpaid",
      submitted_by: adminUserId,
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

  it("creates a new customer before creating an admin order even when the phone number already exists", async () => {
    const customerId = "b10bb955-d8b1-4a26-a6e2-928fd33949e1";
    const orderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const customerPayload = {
      first_name: "Luz",
      last_name: "Dela Cruz",
      phone_number: "09171112222",
      email: "luz@example.test",
      address: "Stall 8",
      assigned_agent_id: null,
      created_by: adminUserId,
      is_reseller: false,
      updated_at: "2026-07-01T00:00:00.000Z",
    };
    const phoneMaybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const phoneLookupEq = vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: phoneMaybeSingle })) }));
    const emailMaybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const emailLookupIlike = vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: emailMaybeSingle })) }));
    const customerSelect = vi.fn(() => ({
      eq: phoneLookupEq,
      ilike: emailLookupIlike,
    }));
    const customerInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: customerId }, error: null })),
      })),
    }));
    const orderInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: orderId }, error: null })),
      })),
    }));
    const itemInsert = vi.fn(() => Promise.resolve({ error: null }));
    const from = vi.fn((table: string) => {
      if (table === "customer") return { select: customerSelect, insert: customerInsert };
      if (table === "customer_order") return { insert: orderInsert };
      if (table === "customer_order_item") return { insert: itemInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    await executeAdminAction({ from } as never, {
      type: "create-order",
      customer: {
        type: "new",
        payload: customerPayload,
      },
      payload: {
        agent_id: null,
        source: "admin_manual",
        order_status: "processing",
        payment_status: "unpaid",
        submitted_by: adminUserId,
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

    expect(customerSelect).toHaveBeenCalledWith("id");
    expect(phoneLookupEq).toHaveBeenCalledWith("phone_number", "09171112222");
    expect(emailLookupIlike).toHaveBeenCalledWith("email", "luz@example.test");
    expect(customerInsert).toHaveBeenCalledWith(customerPayload);
    expect(orderInsert).toHaveBeenCalledWith(expect.objectContaining({
      customer_id: customerId,
    }));
  });

  it("rejects admin order creation when the new customer phone number already exists", async () => {
    const maybeSingle = vi.fn(() => Promise.resolve({
      data: { id: "existing-customer-id" },
      error: null,
    }));
    const customerLookupEq = vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle })) }));
    const customerSelect = vi.fn(() => ({ eq: customerLookupEq }));
    const customerInsert = vi.fn();
    const orderInsert = vi.fn();
    const from = vi.fn((table: string) => {
      if (table === "customer") return { select: customerSelect, insert: customerInsert };
      if (table === "customer_order") return { insert: orderInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(executeAdminAction({ from } as never, {
      type: "create-order",
      customer: {
        type: "new",
        payload: {
          first_name: "Luz",
          last_name: "Dela Cruz",
          phone_number: "09171112222",
          email: "luz@example.test",
          address: "Stall 8",
          assigned_agent_id: null,
          created_by: adminUserId,
          is_reseller: false,
          updated_at: "2026-07-01T00:00:00.000Z",
        },
      },
      payload: {
        agent_id: null,
        source: "admin_manual",
        order_status: "processing",
        payment_status: "unpaid",
        submitted_by: adminUserId,
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
    })).rejects.toThrow("Phone number already exists for another customer.");

    expect(customerSelect).toHaveBeenCalledWith("id");
    expect(customerLookupEq).toHaveBeenCalledWith("phone_number", "09171112222");
    expect(customerInsert).not.toHaveBeenCalled();
    expect(orderInsert).not.toHaveBeenCalled();
  });

  it("rejects admin order creation when the new customer email already exists", async () => {
    const phoneMaybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const phoneLookupEq = vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: phoneMaybeSingle })) }));
    const emailMaybeSingle = vi.fn(() => Promise.resolve({
      data: { id: "existing-customer-id" },
      error: null,
    }));
    const emailLookupIlike = vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: emailMaybeSingle })) }));
    const customerSelect = vi.fn(() => ({
      eq: phoneLookupEq,
      ilike: emailLookupIlike,
    }));
    const customerInsert = vi.fn();
    const orderInsert = vi.fn();
    const from = vi.fn((table: string) => {
      if (table === "customer") return { select: customerSelect, insert: customerInsert };
      if (table === "customer_order") return { insert: orderInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(executeAdminAction({ from } as never, {
      type: "create-order",
      customer: {
        type: "new",
        payload: {
          first_name: "Luz",
          last_name: "Dela Cruz",
          phone_number: "09171112222",
          email: "LUZ@example.test",
          address: "Stall 8",
          assigned_agent_id: null,
          created_by: adminUserId,
          is_reseller: false,
          updated_at: "2026-07-01T00:00:00.000Z",
        },
      },
      payload: {
        agent_id: null,
        source: "admin_manual",
        order_status: "processing",
        payment_status: "unpaid",
        submitted_by: adminUserId,
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
    })).rejects.toThrow("Email already exists for another customer.");

    expect(customerSelect).toHaveBeenCalledWith("id");
    expect(phoneLookupEq).toHaveBeenCalledWith("phone_number", "09171112222");
    expect(emailLookupIlike).toHaveBeenCalledWith("email", "luz@example.test");
    expect(customerInsert).not.toHaveBeenCalled();
    expect(orderInsert).not.toHaveBeenCalled();
  });

  it("creates a new customer before creating an admin order when no phone match exists", async () => {
    const customerId = "b10bb955-d8b1-4a26-a6e2-928fd33949e1";
    const orderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const customerPayload = {
      first_name: "Luz",
      last_name: "Dela Cruz",
      phone_number: "09171112222",
      email: "luz@example.test",
      address: "Stall 8",
      assigned_agent_id: null,
      created_by: adminUserId,
      is_reseller: false,
      updated_at: "2026-07-01T00:00:00.000Z",
    };
    const phoneMaybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const customerLookupEq = vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: phoneMaybeSingle })) }));
    const emailMaybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const customerLookupIlike = vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: emailMaybeSingle })) }));
    const customerSelect = vi.fn(() => ({
      eq: customerLookupEq,
      ilike: customerLookupIlike,
    }));
    const customerInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: customerId }, error: null })),
      })),
    }));
    const orderInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: orderId }, error: null })),
      })),
    }));
    const itemInsert = vi.fn(() => Promise.resolve({ error: null }));
    const from = vi.fn((table: string) => {
      if (table === "customer") return { select: customerSelect, insert: customerInsert };
      if (table === "customer_order") return { insert: orderInsert };
      if (table === "customer_order_item") return { insert: itemInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    await executeAdminAction({ from } as never, {
      type: "create-order",
      customer: {
        type: "new",
        payload: customerPayload,
      },
      payload: {
        agent_id: null,
        source: "admin_manual",
        order_status: "processing",
        payment_status: "unpaid",
        submitted_by: adminUserId,
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

    expect(customerSelect).toHaveBeenCalledWith("id");
    expect(customerLookupEq).toHaveBeenCalledWith("phone_number", "09171112222");
    expect(customerLookupIlike).toHaveBeenCalledWith("email", "luz@example.test");
    expect(customerInsert).toHaveBeenCalledWith(customerPayload);
    expect(orderInsert).toHaveBeenCalledWith(expect.objectContaining({
      customer_id: customerId,
    }));
  });

  it("blocks marking a commission as paid when no payment record exists", async () => {
    const customerOrderItemMaybeSingle = vi.fn(() => Promise.resolve({
      data: {
        id: "45e73d23-f25f-4de7-ae3a-ebcf34e995f1",
        order_id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
        final_quantity: 2,
        unit_price: 100,
        agent_commission_paid: false,
      },
      error: null,
    }));
    const customerOrderItemEq = vi.fn((field: string, value: string) => {
      if (field === "id" && value === "45e73d23-f25f-4de7-ae3a-ebcf34e995f1") {
        return { maybeSingle: customerOrderItemMaybeSingle };
      }

      if (field === "order_id" && value === "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb") {
        return Promise.resolve({
          data: [
            {
              id: "45e73d23-f25f-4de7-ae3a-ebcf34e995f1",
              final_quantity: 2,
              unit_price: 100,
              agent_commission_paid: false,
            },
          ],
          error: null,
        });
      }

      throw new Error(`Unexpected eq on customer_order_item: ${field}=${value}`);
    });
    const customerOrderItemSelect = vi.fn(() => ({ eq: customerOrderItemEq }));
    const customerOrderItemUpdate = vi.fn(() => ({ eq: vi.fn() }));
    const paymentEq = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const paymentSelect = vi.fn(() => ({ eq: paymentEq }));
    const from = vi.fn((table: string) => {
      if (table === "customer_order_item") {
        return { select: customerOrderItemSelect, update: customerOrderItemUpdate };
      }

      if (table === "payment") {
        return { select: paymentSelect };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await expect(executeAdminAction({ from } as never, {
      type: "update-commission",
      orderItemId: "45e73d23-f25f-4de7-ae3a-ebcf34e995f1",
      payload: {
        agent_commission_amount: 125.25,
        agent_commission_paid: true,
        agent_commission_set_by: adminUserId,
        agent_commission_set_at: "2026-07-11T00:00:00.000Z",
        agent_commission_notes: "Reviewed",
      },
    }, adminUserId)).rejects.toThrow("Record a payment before marking commission as paid.");

    expect(customerOrderItemUpdate).not.toHaveBeenCalled();
  });

  it("blocks marking a commission as paid when recorded payments do not cover the item total", async () => {
    const customerOrderItemMaybeSingle = vi.fn(() => Promise.resolve({
      data: {
        id: "item-2",
        order_id: "order-1",
        final_quantity: 3,
        unit_price: 100,
        agent_commission_paid: false,
      },
      error: null,
    }));
    const customerOrderItemEq = vi.fn((field: string, value: string) => {
      if (field === "id" && value === "item-2") {
        return { maybeSingle: customerOrderItemMaybeSingle };
      }

      if (field === "order_id" && value === "order-1") {
        return Promise.resolve({
          data: [
            { id: "item-1", final_quantity: 2, unit_price: 100, agent_commission_paid: true },
            { id: "item-2", final_quantity: 3, unit_price: 100, agent_commission_paid: false },
          ],
          error: null,
        });
      }

      throw new Error(`Unexpected eq on customer_order_item: ${field}=${value}`);
    });
    const customerOrderItemSelect = vi.fn(() => ({ eq: customerOrderItemEq }));
    const customerOrderItemUpdateEq = vi.fn(() => Promise.resolve({ error: null }));
    const customerOrderItemUpdate = vi.fn(() => ({ eq: customerOrderItemUpdateEq }));
    const paymentEq = vi.fn(() => Promise.resolve({
      data: [{ amount: 400 }],
      error: null,
    }));
    const paymentSelect = vi.fn(() => ({ eq: paymentEq }));
    const from = vi.fn((table: string) => {
      if (table === "customer_order_item") {
        return { select: customerOrderItemSelect, update: customerOrderItemUpdate };
      }

      if (table === "payment") {
        return { select: paymentSelect };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await expect(executeAdminAction({ from } as never, {
      type: "update-commission",
      orderItemId: "item-2",
      payload: {
        agent_commission_amount: 125.25,
        agent_commission_paid: true,
        agent_commission_set_by: adminUserId,
        agent_commission_set_at: "2026-07-11T00:00:00.000Z",
        agent_commission_notes: "Reviewed",
      },
    }, adminUserId)).rejects.toThrow(
      "This commission cannot be marked as paid because recorded payments do not cover the item total.",
    );

    expect(customerOrderItemUpdateEq).not.toHaveBeenCalled();
  });
});

describe("getAllowedNextOrderStatuses", () => {
  it("allows pending orders to move into processing or closed", () => {
    expect(getAllowedNextOrderStatuses("pending")).toEqual([
      "processing",
      "closed",
    ]);
  });

  it("allows closed unpaid orders to reopen into processing", () => {
    expect(getAllowedNextOrderStatuses("closed", "unpaid")).toEqual([
      "processing",
    ]);
    expect(getAllowedNextOrderStatuses("closed", "partial")).toEqual([
      "processing",
    ]);
    expect(getAllowedNextOrderStatuses("closed", "refunded")).toEqual([
      "processing",
    ]);
  });

  it("prevents paid closed orders from reopening", () => {
    expect(getAllowedNextOrderStatuses("closed", "paid")).toEqual([]);
  });
});

describe("formatAdminActionFeedback", () => {
  it("returns transient feedback with a clean reload URL", () => {
    const url = new URL(
      "https://jehmarp.example/admin/orders/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb?status=Order%20marked%20as%20read.&page=2#error-anchor",
    );

    expect(formatAdminActionFeedback(url)).toEqual({
      status: "Order marked as read.",
      error: undefined,
      cleanPath: "/admin/orders/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb?page=2#error-anchor",
    });
  });

  it("does not provide a clean URL when no feedback is present", () => {
    const url = new URL("https://jehmarp.example/admin/orders?page=2");

    expect(formatAdminActionFeedback(url)).toEqual({
      status: undefined,
      error: undefined,
      cleanPath: undefined,
    });
  });
});
