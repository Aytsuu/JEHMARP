import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

import {
  executeAdminAction,
  formatAdminActionFeedback,
  getAllowedNextOrderStatuses,
  handleAdminDashboardAction,
  markViewedResellerApplicationsRead,
  parseAdminActionFormData,
  parseViewedResellerApplicationIds,
} from "./actions";

const adminUserId = "8bcce9f3-2a1b-43c0-9e51-70667e017111";

function createActionContext(formData: FormData, headers?: HeadersInit) {
  const request = {
    headers: new Headers(headers),
    formData: vi.fn(async () => formData),
  } as unknown as Request;

  return {
    request,
    cookies: {},
    redirect: vi.fn((url: string, status: number) => new Response(null, {
      status,
      headers: {
        Location: url,
      },
    })),
  };
}

function createUpdateClient(error: unknown = null) {
  const eq = vi.fn(async () => ({ error }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));

  return {
    client: { from },
    from,
    update,
    eq,
  };
}

function asAdminDashboardContext(context: ReturnType<typeof createActionContext>) {
  return context as unknown as Parameters<typeof handleAdminDashboardAction>[0];
}

describe("handleAdminDashboardAction", () => {
  it("returns JSON for fetch-based admin actions that accept JSON", async () => {
    const formData = new FormData();
    formData.set("action", "update-order-status");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("orderStatus", "processing");
    const db = createUpdateClient();
    mocks.createSupabaseServerClient.mockReturnValue(db.client);
    const context = createActionContext(formData, {
      Accept: "application/json",
    });

    const response = await handleAdminDashboardAction(
      asAdminDashboardContext(context),
      adminUserId,
      "/admin/orders/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      status: "Order status updated.",
      redirectPath: "/admin/orders/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      action: "update-order-status",
    });
    expect(context.redirect).not.toHaveBeenCalled();
    expect(db.from).toHaveBeenCalledWith("customer_order");
  });

  it("returns JSON validation errors for fetch-based admin actions", async () => {
    const formData = new FormData();
    formData.set("action", "update-order-status");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("orderStatus", "draft");
    const context = createActionContext(formData, {
      Accept: "application/json",
    });

    const response = await handleAdminDashboardAction(
      asAdminDashboardContext(context),
      adminUserId,
      "/admin/orders/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: "Order status is not supported.",
    });
    expect(context.redirect).not.toHaveBeenCalled();
  });

  it("keeps redirect responses for regular admin form posts", async () => {
    const formData = new FormData();
    formData.set("action", "update-order-status");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("orderStatus", "processing");
    const db = createUpdateClient();
    mocks.createSupabaseServerClient.mockReturnValue(db.client);
    const context = createActionContext(formData, {
      Accept: "text/html",
    });

    const response = await handleAdminDashboardAction(
      asAdminDashboardContext(context),
      adminUserId,
      "/admin/orders/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      "/admin/orders/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb?status=Order%20status%20updated.",
    );
    expect(context.redirect).toHaveBeenCalledTimes(1);
  });
});

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
          release_date: null,
          submitted_by: adminUserId,
          updated_at: expect.any(String),
        },
        payment: null,
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

  it("parses admin-created order release date and downpayment fields", () => {
    const formData = new FormData();
    formData.set("action", "create-order");
    formData.set("customerId", "b10bb955-d8b1-4a26-a6e2-928fd33949e1");
    formData.set("releaseDate", "2026-07-18");
    formData.set("downpaymentAmount", "700");
    formData.set("downpaymentMethod", "GCash");
    formData.set("downpaymentDate", "2026-07-16");
    formData.set("downpaymentReferenceNumber", "REF-700");
    formData.set("downpaymentNotes", "  Downpayment before release  ");
    formData.append("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.append("quantity", "2");
    formData.append("addDetails", "");

    expect(parseAdminActionFormData(formData, adminUserId)).toMatchObject({
      success: true,
      action: {
        type: "create-order",
        payload: {
          release_date: "2026-07-18",
        },
        payment: {
          amount: 700,
          payment_method: "GCash",
          payment_date: "2026-07-16",
          recorded_by: adminUserId,
          reference_number: "REF-700",
          notes: "Downpayment before release",
        },
      },
    });
  });

  it("parses order product additions for existing orders", () => {
    const formData = new FormData();
    formData.set("action", "add-order-item");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.set("quantity", "2.5");
    formData.set("addDetails", "  Whole pieces  ");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "add-order-item",
        orderId: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
        payload: {
          order_id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
          product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
          partial_quantity: 2.5,
          final_quantity: 2.5,
          add_details: "Whole pieces",
        },
      },
    });
  });

  it("parses order product removal requests", () => {
    const formData = new FormData();
    formData.set("action", "remove-order-item");
    formData.set("orderItemId", "45e73d23-f25f-4de7-ae3a-ebcf34e995f1");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "remove-order-item",
        orderItemId: "45e73d23-f25f-4de7-ae3a-ebcf34e995f1",
      },
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
            credit_limit: 1000,
            is_reseller: true,
            updated_at: expect.any(String),
          },
        },
        payload: {
          agent_id: null,
          source: "admin_manual",
          order_status: "processing",
          payment_status: "unpaid",
          release_date: null,
          submitted_by: adminUserId,
          updated_at: expect.any(String),
        },
        payment: null,
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
    formData.set("resellerDeductionType", "value");
    formData.set("resellerDeductionValue", "30.50");
    formData.set("agentCommissionType", "percentage");
    formData.set("agentCommissionValue", "5");
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
          agent_commission_type: "percentage",
          agent_commission_value: 5,
          image_file: imageFile,
          is_active: true,
          name: "Pork Belly",
          reseller_price: 220,
          reseller_deduction_type: "value",
          reseller_deduction_value: 30.5,
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
    formData.set("resellerDeductionType", "value");
    formData.set("resellerDeductionValue", "30.50");
    formData.set("agentCommissionType", "value");
    formData.set("agentCommissionValue", "0");
    formData.set("stockStatus", "limited");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Product image is required."],
    });
  });

  it("parses custom product unit labels from the other option", () => {
    const formData = new FormData();
    const imageFile = new File(["image-bytes"], "pork.png", {
      type: "image/png",
    });
    formData.set("action", "save-product");
    formData.set("name", "Pork Belly");
    formData.set("category", "__other");
    formData.set("categoryOther", "Frozen Foods");
    formData.set("unitLabel", "__other");
    formData.set("unitLabelOther", "Box");
    formData.set("defaultPrice", "250.50");
    formData.set("resellerDeductionType", "percentage");
    formData.set("resellerDeductionValue", "10");
    formData.set("agentCommissionType", "value");
    formData.set("agentCommissionValue", "15");
    formData.set("stockStatus", "limited");
    formData.set("imageFile", imageFile);

    const result = parseAdminActionFormData(formData, adminUserId);

    expect(result.success).toBe(true);
    expect(result.success ? result.action : null).toMatchObject({
      type: "save-product",
      payload: {
        category: "frozen foods",
        unit_label: "box",
        reseller_price: 225.45,
        agent_commission_type: "value",
        agent_commission_value: 15,
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
    formData.set("creditLimit", "1500");

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
          credit_limit: 1500,
          is_reseller: true,
          updated_at: expect.any(String),
        },
      },
    });
  });

  it("defaults new customer credit limit to 1000 when saving customers", () => {
    const formData = new FormData();
    formData.set("action", "save-customer");
    formData.set("firstName", "Ana");
    formData.set("lastName", "Buyer");
    formData.set("phoneNumber", "09170000000");
    formData.set("address", "Market stall 12");

    expect(parseAdminActionFormData(formData, adminUserId)).toMatchObject({
      success: true,
      action: {
        type: "save-customer",
        payload: {
          credit_limit: 1000,
        },
      },
    });
  });

  it("parses create-agent actions with profile names, optional employee ID, normalized email, and contact", () => {
    const formData = new FormData();
    formData.set("action", "create-agent");
    formData.set("employeeId", " EMP-001 ");
    formData.set("firstName", " New ");
    formData.set("lastName", " Agent ");
    formData.set("email", "  Agent@Example.Test ");
    formData.set("contact", " 09171234567 ");
    formData.set("password", "password123");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "create-agent",
        payload: {
          employee_id: "EMP-001",
          first_name: "New",
          last_name: "Agent",
          display_name: "New Agent",
          email: "agent@example.test",
          contact: "09171234567",
          password: "password123",
          status: "active",
        },
      },
    });
  });

  it("parses create-agent actions without email or auth password", () => {
    const formData = new FormData();
    formData.set("action", "create-agent");
    formData.set("firstName", "New");
    formData.set("lastName", "Agent");
    formData.set("email", " ");
    formData.set("contact", "09171234567");
    formData.set("password", " ");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "create-agent",
        payload: {
          employee_id: null,
          first_name: "New",
          last_name: "Agent",
          display_name: "New Agent",
          email: null,
          contact: "09171234567",
          password: null,
          status: "active",
        },
      },
    });
  });

  it("rejects create-agent actions without a contact number", () => {
    const formData = new FormData();
    formData.set("action", "create-agent");
    formData.set("firstName", "New");
    formData.set("lastName", "Agent");
    formData.set("email", "agent@example.test");
    formData.set("contact", "   ");
    formData.set("password", "password123");

    expect(parseAdminActionFormData(formData, adminUserId).success).toBe(false);
  });

  it("rejects create-agent actions with non-numeric contact numbers", () => {
    const formData = new FormData();
    formData.set("action", "create-agent");
    formData.set("firstName", "New");
    formData.set("lastName", "Agent");
    formData.set("email", "agent@example.test");
    formData.set("contact", "0917-123-4567");
    formData.set("password", "password123");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Contact number must be exactly 11 digits."],
    });
  });

  it("rejects create-agent actions when contact number is not 11 digits", () => {
    const formData = new FormData();
    formData.set("action", "create-agent");
    formData.set("firstName", "New");
    formData.set("lastName", "Agent");
    formData.set("email", "agent@example.test");
    formData.set("contact", "0917123456");
    formData.set("password", "password123");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Contact number must be exactly 11 digits."],
    });
  });

  it("rejects create-agent actions with invalid email before other field errors", () => {
    const formData = new FormData();
    formData.set("action", "create-agent");
    formData.set("firstName", "New");
    formData.set("lastName", "Agent");
    formData.set("email", "not-an-email");
    formData.set("contact", "letters");
    formData.set("password", "short");

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

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "update-commission",
        orderItemId: "45e73d23-f25f-4de7-ae3a-ebcf34e995f1",
        payload: {
          agent_commission_amount: 0,
          agent_commission_set_at: null,
          agent_commission_set_by: null,
          agent_commission_paid: false,
        },
      },
    });
  });

  it("parses agent order commission updates as a single amount", () => {
    const formData = new FormData();
    formData.set("action", "update-agent-order-commission");
    formData.set("agentOrderItemId", "45e73d23-f25f-4de7-ae3a-ebcf34e995f1");
    formData.set("amount", "95.75");

    const result = parseAdminActionFormData(formData, adminUserId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.action).toEqual({
        type: "update-agent-order-commission",
        agentOrderItemId: "45e73d23-f25f-4de7-ae3a-ebcf34e995f1",
        payload: {
          agent_commission_amount: 95.75,
          agent_commission_updated_by: adminUserId,
          agent_commission_updated_at: expect.any(String),
        },
      });
    }
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

  it("parses payment records with a selected customer type", () => {
    const formData = new FormData();
    formData.set("action", "record-payment");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("amount", "230");
    formData.set("paymentMethod", "Cash");
    formData.set("paymentDate", "2026-07-16");
    formData.set("customerType", "reseller");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "record-payment",
        customerType: "reseller",
        payload: {
          order_id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
          amount: 230,
          payment_method: "Cash",
          payment_date: "2026-07-16",
          recorded_by: adminUserId,
          reference_number: null,
          notes: null,
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

describe("markViewedResellerApplicationsRead", () => {
  const applicationId = "b10bb955-d8b1-4a26-a6e2-928fd33949e1";

  it("deduplicates and validates application ids", () => {
    expect(
      parseViewedResellerApplicationIds([
        applicationId,
        applicationId,
      ]),
    ).toEqual([applicationId]);
  });

  it("marks only submitted unread reseller applications", async () => {
    const select = vi.fn(() => Promise.resolve({
      data: [{ id: applicationId }],
      error: null,
    }));
    const eq = vi.fn(() => ({ is: vi.fn(() => ({ select })) }));
    const inFilter = vi.fn(() => ({ eq }));
    const update = vi.fn(() => ({ in: inFilter }));
    const from = vi.fn(() => ({ update }));

    const result = await markViewedResellerApplicationsRead(
      { from } as never,
      [applicationId],
      adminUserId,
    );

    expect(result).toEqual({ markedCount: 1 });
    expect(from).toHaveBeenCalledWith("reseller_application");
    expect(update).toHaveBeenCalledWith({
      admin_read_at: expect.any(String),
      admin_read_by: adminUserId,
    });
    expect(inFilter).toHaveBeenCalledWith("id", [applicationId]);
    expect(eq).toHaveBeenCalledWith("application_status", "submitted");
  });
});

describe("executeAdminAction", () => {
  it("validates and creates a direct customer record", async () => {
    const payload = {
      first_name: "Ana",
      last_name: "Buyer",
      phone_number: "09170000000",
      email: "ana@example.test",
      address: "Market stall 12",
      assigned_agent_id: null,
      created_by: adminUserId,
      credit_limit: 1000,
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
    const customerInsert = vi.fn(() => Promise.resolve({ error: null }));
    const from = vi.fn((table: string) => {
      if (table === "customer") return { select: customerSelect, insert: customerInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    await executeAdminAction({ from } as never, {
      type: "save-customer",
      payload,
    }, adminUserId);

    expect(customerSelect).toHaveBeenCalledWith("id");
    expect(phoneLookupEq).toHaveBeenCalledWith("phone_number", "09170000000");
    expect(emailLookupIlike).toHaveBeenCalledWith("email", "ana@example.test");
    expect(customerInsert).toHaveBeenCalledWith(payload);
  });

  it("rejects direct customer creation when the phone number already exists", async () => {
    const maybeSingle = vi.fn(() => Promise.resolve({
      data: { id: "existing-customer-id" },
      error: null,
    }));
    const customerLookupEq = vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle })) }));
    const customerSelect = vi.fn(() => ({ eq: customerLookupEq }));
    const customerInsert = vi.fn();
    const from = vi.fn((table: string) => {
      if (table === "customer") return { select: customerSelect, insert: customerInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(executeAdminAction({ from } as never, {
      type: "save-customer",
      payload: {
        first_name: "Ana",
        last_name: "Buyer",
        phone_number: "09170000000",
        email: null,
        address: "Market stall 12",
        assigned_agent_id: null,
        created_by: adminUserId,
        credit_limit: 1000,
        is_reseller: false,
        updated_at: "2026-07-01T00:00:00.000Z",
      },
    }, adminUserId)).rejects.toThrow("Phone number already exists for another customer.");

    expect(customerSelect).toHaveBeenCalledWith("id");
    expect(customerLookupEq).toHaveBeenCalledWith("phone_number", "09170000000");
    expect(customerInsert).not.toHaveBeenCalled();
  });

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
      credit_limit: 1000,
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
          credit_limit: 1000,
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
          credit_limit: 1000,
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
      credit_limit: 1000,
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
      },
    }, adminUserId)).rejects.toThrow(
      "This commission cannot be marked as paid because recorded payments do not cover the item total.",
    );

    expect(customerOrderItemUpdateEq).not.toHaveBeenCalled();
  });

  it("updates an agent order item commission amount while customer orders are not fully paid", async () => {
    const agentOrderItemId = "45e73d23-f25f-4de7-ae3a-ebcf34e995f1";
    const agentOrderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const agentOrderItemMaybeSingle = vi.fn(() => Promise.resolve({
      data: { id: agentOrderItemId, agent_order_id: agentOrderId },
      error: null,
    }));
    const agentOrderItemSelectEq = vi.fn(() => ({ maybeSingle: agentOrderItemMaybeSingle }));
    const agentOrderItemSelect = vi.fn(() => ({ eq: agentOrderItemSelectEq }));
    const agentOrderItemUpdateEq = vi.fn(() => Promise.resolve({ error: null }));
    const agentOrderItemUpdate = vi.fn(() => ({ eq: agentOrderItemUpdateEq }));
    const customerOrderEq = vi.fn(() => Promise.resolve({
      data: [
        { id: "customer-order-1", payment_status: "paid" },
        { id: "customer-order-2", payment_status: "partial" },
      ],
      error: null,
    }));
    const customerOrderSelect = vi.fn(() => ({ eq: customerOrderEq }));
    const payload = {
      agent_commission_amount: 95.75,
      agent_commission_updated_by: adminUserId,
      agent_commission_updated_at: "2026-07-14T10:00:00.000Z",
    };
    const from = vi.fn((table: string) => {
      if (table === "agent_order_item") {
        return {
          select: agentOrderItemSelect,
          update: agentOrderItemUpdate,
        };
      }

      if (table === "customer_order") {
        return { select: customerOrderSelect };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await executeAdminAction({ from } as never, {
      type: "update-agent-order-commission",
      agentOrderItemId,
      payload,
    }, adminUserId);

    expect(agentOrderItemSelect).toHaveBeenCalledWith("id, agent_order_id");
    expect(customerOrderSelect).toHaveBeenCalledWith("id, payment_status");
    expect(customerOrderEq).toHaveBeenCalledWith("agent_order_id", agentOrderId);
    expect(agentOrderItemUpdate).toHaveBeenCalledWith(payload);
    expect(agentOrderItemUpdateEq).toHaveBeenCalledWith("id", agentOrderItemId);
  });

  it("blocks agent order item commission changes after all linked customer orders are paid", async () => {
    const agentOrderItemId = "45e73d23-f25f-4de7-ae3a-ebcf34e995f1";
    const agentOrderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const agentOrderItemMaybeSingle = vi.fn(() => Promise.resolve({
      data: { id: agentOrderItemId, agent_order_id: agentOrderId },
      error: null,
    }));
    const agentOrderItemSelectEq = vi.fn(() => ({ maybeSingle: agentOrderItemMaybeSingle }));
    const agentOrderItemSelect = vi.fn(() => ({ eq: agentOrderItemSelectEq }));
    const agentOrderItemUpdate = vi.fn();
    const customerOrderEq = vi.fn(() => Promise.resolve({
      data: [
        { id: "customer-order-1", payment_status: "paid" },
        { id: "customer-order-2", payment_status: "paid" },
      ],
      error: null,
    }));
    const customerOrderSelect = vi.fn(() => ({ eq: customerOrderEq }));
    const from = vi.fn((table: string) => {
      if (table === "agent_order_item") {
        return {
          select: agentOrderItemSelect,
          update: agentOrderItemUpdate,
        };
      }

      if (table === "customer_order") {
        return { select: customerOrderSelect };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await expect(executeAdminAction({ from } as never, {
      type: "update-agent-order-commission",
      agentOrderItemId,
      payload: {
        agent_commission_amount: 95.75,
        agent_commission_updated_by: adminUserId,
        agent_commission_updated_at: "2026-07-14T10:00:00.000Z",
      },
    }, adminUserId)).rejects.toThrow(
      "Agent order commission cannot be edited after all customer orders are fully paid.",
    );

    expect(agentOrderItemUpdate).not.toHaveBeenCalled();
  });

  it("blocks order product additions after a sales invoice exists", async () => {
    const invoiceMaybeSingle = vi.fn(() => Promise.resolve({
      data: { id: "invoice-1" },
      error: null,
    }));
    const invoiceLimit = vi.fn(() => ({ maybeSingle: invoiceMaybeSingle }));
    const invoiceEq = vi.fn(() => ({ limit: invoiceLimit }));
    const invoiceSelect = vi.fn(() => ({ eq: invoiceEq }));
    const itemInsert = vi.fn();
    const from = vi.fn((table: string) => {
      if (table === "invoice") return { select: invoiceSelect };
      if (table === "customer_order_item") return { insert: itemInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(executeAdminAction({ from } as never, {
      type: "add-order-item",
      orderId: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      payload: {
        order_id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
        product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
        partial_quantity: 2,
        final_quantity: 2,
        add_details: null,
      },
    }, adminUserId)).rejects.toThrow(
      "Order products cannot be edited after a sales invoice has been created.",
    );

    expect(itemInsert).not.toHaveBeenCalled();
  });

  it("removes order products only after edit checks pass", async () => {
    const orderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const orderItemMaybeSingle = vi.fn(() => Promise.resolve({
      data: { order_id: orderId },
      error: null,
    }));
    const orderItemsEq = vi.fn((field: string, value: string) => {
      if (field === "id" && value === "45e73d23-f25f-4de7-ae3a-ebcf34e995f1") {
        return { maybeSingle: orderItemMaybeSingle };
      }

      if (field === "order_id" && value === orderId) {
        return Promise.resolve({
          data: [{ id: "item-1" }, { id: "item-2" }],
          error: null,
        });
      }

      throw new Error(`Unexpected eq on customer_order_item: ${field}=${value}`);
    });
    const orderItemsSelect = vi.fn(() => ({ eq: orderItemsEq }));
    const orderItemsDeleteEq = vi.fn(() => Promise.resolve({ error: null }));
    const orderItemsDelete = vi.fn(() => ({ eq: orderItemsDeleteEq }));
    const emptyMaybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const limit = vi.fn(() => ({ maybeSingle: emptyMaybeSingle }));
    const eq = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn((table: string) => {
      if (table === "customer_order_item") {
        return { select: orderItemsSelect, delete: orderItemsDelete };
      }

      if (table === "invoice" || table === "payment") {
        return { select };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await executeAdminAction({ from } as never, {
      type: "remove-order-item",
      orderItemId: "45e73d23-f25f-4de7-ae3a-ebcf34e995f1",
    }, adminUserId);

    expect(orderItemsDeleteEq).toHaveBeenCalledWith("id", "45e73d23-f25f-4de7-ae3a-ebcf34e995f1");
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
