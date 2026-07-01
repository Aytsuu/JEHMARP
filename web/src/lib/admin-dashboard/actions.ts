import type { APIContext } from "astro";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidSchema = z.uuid();
const pageStatuses = ["draft", "published", "archived"] as const;
const productCategories = ["pork", "chicken", "egg"] as const;
const stockStatuses = ["in_stock", "limited", "out_of_stock"] as const;
const orderStatuses = [
  "draft",
  "submitted",
  "approved",
  "processing",
  "fulfilled",
  "rejected",
  "cancelled",
  "closed",
] as const;
const commissionStatuses = ["unset", "set", "cancelled", "paid"] as const;
const invoiceStatuses = ["draft", "issued", "partially_paid", "paid", "void", "overdue"] as const;
const inquiryStatuses = ["new", "reviewing", "responded", "closed", "spam"] as const;

export type PageStatus = (typeof pageStatuses)[number];
export type ProductCategory = (typeof productCategories)[number];
export type StockStatus = (typeof stockStatuses)[number];
export type OrderStatus = (typeof orderStatuses)[number];
export type CommissionStatus = (typeof commissionStatuses)[number];
export type InvoiceStatus = (typeof invoiceStatuses)[number];
export type InquiryStatus = (typeof inquiryStatuses)[number];

type AdminDashboardContext = Pick<APIContext, "cookies" | "request" | "redirect">;
type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

type ParseSuccess = {
  success: true;
  action: AdminAction;
};

type ParseFailure = {
  success: false;
  errors: string[];
};

export type AdminActionParseResult = ParseSuccess | ParseFailure;

export type AdminAction =
  | {
      type: "save-page-section";
      sectionId: string;
      payload: {
        page_id: string;
        type: string;
        sort_order: number;
        content: Record<string, unknown>;
        status: PageStatus;
        updated_at: string;
      };
    }
  | {
      type: "save-product";
      productId?: string;
      payload: {
        name: string;
        category: ProductCategory;
        description: string | null;
        unit_label: string;
        default_price: number;
        reseller_price: number;
        stock_status: StockStatus;
        image_path: string | null;
        is_active: boolean;
        updated_at?: string;
      };
    }
  | {
      type: "deactivate-product";
      productId: string;
    }
  | {
      type: "save-customer";
      customerId?: string;
      payload: {
        first_name: string;
        last_name: string;
        phone_number: string;
        email: string | null;
        address: string;
        assigned_agent_id: string | null;
        is_reseller: boolean;
        created_by?: string;
        updated_at: string;
      };
    }
  | {
      type: "create-agent";
      payload: {
        email: string;
        password: string;
        display_name: string;
        status: "active" | "inactive" | "suspended";
      };
    }
  | {
      type: "update-agent";
      agentId: string;
      payload: {
        display_name: string;
        status: "active" | "inactive" | "suspended";
        updated_at: string;
      };
    }
  | {
      type: "create-order";
      payload: {
        customer_id: string;
        agent_id: string | null;
        source: "admin_manual";
        order_status: OrderStatus;
        payment_status: "unpaid";
        discount_amount: number;
        delivery_fee: number;
        submitted_by: string;
        approved_by?: string | null;
        approved_at?: string | null;
        updated_at: string;
      };
      items: {
        product_id: string;
        partial_quantity: number;
        final_quantity: number;
        add_details: string | null;
      }[];
    }
  | {
      type: "update-order-status";
      orderId: string;
      payload: {
        order_status: OrderStatus;
        approved_by?: string | null;
        approved_at?: string | null;
        updated_at: string;
      };
    }
  | {
      type: "update-order-adjustments";
      orderId: string;
      payload: {
        discount_amount: number;
        delivery_fee: number;
        agent_id: string | null;
        updated_at: string;
      };
    }
  | {
      type: "update-commission";
      orderItemId: string;
      payload: {
        agent_commission_amount: number;
        agent_commission_status: CommissionStatus;
        agent_commission_set_by: string | null;
        agent_commission_set_at: string | null;
        agent_commission_notes: string | null;
      };
    }
  | {
      type: "record-payment";
      payload: {
        order_id: string;
        amount: number;
        payment_method: string;
        payment_date: string;
        recorded_by: string;
        reference_number: string | null;
        notes: string | null;
      };
    }
  | {
      type: "save-invoice";
      invoiceId?: string;
      payload: {
        order_id: string;
        status: InvoiceStatus;
        issued_at: string | null;
        due_at: string | null;
        updated_at: string;
      };
    }
  | {
      type: "add-order-update";
      payload: {
        order_id: string;
        update_type: string;
        title: string;
        details: string | null;
        created_by: string;
      };
    }
  | {
      type: "update-inquiry";
      inquiryId: string;
      payload: {
        inquiry_status: InquiryStatus;
        internal_notes: string | null;
        updated_at: string;
      };
    };

export function parseAdminActionFormData(
  formData: FormData,
  adminUserId: string,
): AdminActionParseResult {
  try {
    return parseAdminActionFormDataOrThrow(formData, adminUserId);
  } catch (error) {
    return {
      success: false,
      errors: error instanceof z.ZodError
        ? flattenZodErrors(error)
        : [error instanceof Error ? error.message : "Unable to parse admin action."],
    };
  }
}

export async function handleAdminDashboardAction(
  context: AdminDashboardContext,
  adminUserId: string,
  returnPath = "/admin",
) {
  const formData = await context.request.formData();
  const parsed = parseAdminActionFormData(formData, adminUserId);

  if (!parsed.success) {
    return context.redirect(`${returnPath}?error=${encodeURIComponent(parsed.errors.join(" "))}`, 303);
  }

  try {
    await executeAdminAction(createSupabaseServerClient(context), parsed.action);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin action failed.";
    return context.redirect(`${returnPath}?error=${encodeURIComponent(message)}`, 303);
  }

  return context.redirect(`${returnPath}?status=${encodeURIComponent(getActionSuccessMessage(parsed.action))}`, 303);
}

export async function executeAdminAction(
  supabase: SupabaseServerClient,
  action: AdminAction,
): Promise<void> {
  switch (action.type) {
    case "save-page-section":
      await executeTableUpdate(supabase, "page_section", action.sectionId, action.payload);
      return;
    case "save-product":
      await executeTableUpsert(supabase, "product", action.productId, {
        ...action.payload,
        updated_at: new Date().toISOString(),
      });
      return;
    case "deactivate-product": {
      const { error } = await supabase.rpc("deactivate_product", {
        target_product_id: action.productId,
      });
      if (error) throw new Error("Unable to deactivate product.");
      return;
    }
    case "save-customer":
      await executeTableUpsert(supabase, "customer", action.customerId, action.payload);
      return;
    case "create-agent":
      await executeAgentCreate(action.payload);
      return;
    case "update-agent":
      await executeTableUpdate(supabase, "agent_profile", action.agentId, action.payload);
      return;
    case "create-order":
      await executeOrderCreate(supabase, action);
      return;
    case "update-order-status":
      await executeTableUpdate(supabase, "customer_order", action.orderId, action.payload);
      return;
    case "update-order-adjustments":
      await executeTableUpdate(supabase, "customer_order", action.orderId, action.payload);
      return;
    case "update-commission":
      await executeTableUpdate(supabase, "customer_order_item", action.orderItemId, action.payload);
      return;
    case "record-payment":
      await executeTableInsert(supabase, "payment", action.payload);
      return;
    case "save-invoice":
      await executeTableUpsert(supabase, "invoice", action.invoiceId, action.payload);
      return;
    case "add-order-update":
      await executeTableInsert(supabase, "customer_order_update", action.payload);
      return;
    case "update-inquiry":
      await executeTableUpdate(supabase, "contact_inquiry", action.inquiryId, action.payload);
      return;
  }
}

export function getAllowedNextOrderStatuses(status: OrderStatus): OrderStatus[] {
  switch (status) {
    case "draft":
      return ["submitted", "cancelled"];
    case "submitted":
      return ["approved", "rejected", "cancelled"];
    case "approved":
      return ["processing", "fulfilled", "cancelled", "closed"];
    case "processing":
      return ["fulfilled", "cancelled", "closed"];
    case "fulfilled":
      return ["closed"];
    case "rejected":
    case "cancelled":
    case "closed":
      return [];
  }
}

export function formatAdminActionFeedback(url: URL) {
  return {
    status: normalizeQueryMessage(url.searchParams.get("status")),
    error: normalizeQueryMessage(url.searchParams.get("error")),
  };
}

export function getPageStatuses() {
  return [...pageStatuses];
}

export function getProductCategories() {
  return [...productCategories];
}

export function getStockStatuses() {
  return [...stockStatuses];
}

export function getOrderStatuses() {
  return [...orderStatuses];
}

export function getCommissionStatuses() {
  return [...commissionStatuses];
}

export function getInvoiceStatuses() {
  return [...invoiceStatuses];
}

export function getInquiryStatuses() {
  return [...inquiryStatuses];
}

function parseAdminActionFormDataOrThrow(
  formData: FormData,
  adminUserId: string,
): ParseSuccess {
  const action = requiredString(formData, "action");

  switch (action) {
    case "save-page-section": {
      const content = parseSectionContent(requiredString(formData, "content"));
      return success({
        type: "save-page-section",
        sectionId: requiredUuid(formData, "sectionId"),
        payload: {
          page_id: uuidSchema.parse(requiredString(formData, "pageId")),
          type: requiredString(formData, "type"),
          sort_order: nonNegativeInteger(formData, "sortOrder"),
          content,
          status: enumValue(formData, "status", pageStatuses),
          updated_at: new Date().toISOString(),
        },
      });
    }
    case "save-product":
      return success({
        type: "save-product",
        productId: optionalUuid(formData, "productId"),
        payload: {
          name: requiredString(formData, "name"),
          category: enumValue(formData, "category", productCategories),
          description: optionalString(formData, "description"),
          unit_label: requiredString(formData, "unitLabel"),
          default_price: nonNegativeNumber(formData, "defaultPrice"),
          reseller_price: nonNegativeNumber(formData, "resellerPrice"),
          stock_status: enumValue(formData, "stockStatus", stockStatuses),
          image_path: optionalString(formData, "imagePath"),
          is_active: formData.get("isActive") === "on",
        },
      });
    case "deactivate-product":
      return success({
        type: "deactivate-product",
        productId: uuidSchema.parse(requiredString(formData, "productId")),
      });
    case "save-customer":
      return success({
        type: "save-customer",
        customerId: optionalUuid(formData, "customerId"),
        payload: {
          first_name: requiredString(formData, "firstName"),
          last_name: requiredString(formData, "lastName"),
          phone_number: requiredString(formData, "phoneNumber"),
          email: optionalEmail(formData, "email"),
          address: requiredString(formData, "address"),
          assigned_agent_id: optionalUuid(formData, "assignedAgentId") ?? null,
          is_reseller: formData.get("isReseller") === "on",
          created_by: optionalUuid(formData, "customerId") ? undefined : adminUserId,
          updated_at: new Date().toISOString(),
        },
      });
    case "create-agent":
      return success({
        type: "create-agent",
        payload: {
          email: z.email().parse(requiredString(formData, "email")),
          password: z.string().min(8, "Password must be at least 8 characters.").parse(
            requiredString(formData, "password"),
          ),
          display_name: requiredString(formData, "displayName"),
          status: enumValue(formData, "status", ["active", "inactive", "suspended"] as const),
        },
      });
    case "update-agent":
      return success({
        type: "update-agent",
        agentId: uuidSchema.parse(requiredString(formData, "agentId")),
        payload: {
          display_name: requiredString(formData, "displayName"),
          status: enumValue(formData, "status", ["active", "inactive", "suspended"] as const),
          updated_at: new Date().toISOString(),
        },
      });
    case "create-order": {
      const approvedAt = new Date().toISOString();

      return success({
        type: "create-order",
        payload: {
          customer_id: uuidSchema.parse(requiredString(formData, "customerId")),
          agent_id: optionalUuid(formData, "agentId") ?? null,
          source: "admin_manual",
          order_status: "approved",
          payment_status: "unpaid",
          discount_amount: nonNegativeNumber(formData, "discountAmount"),
          delivery_fee: nonNegativeNumber(formData, "deliveryFee"),
          submitted_by: adminUserId,
          approved_by: adminUserId,
          approved_at: approvedAt,
          updated_at: new Date().toISOString(),
        },
        items: parseOrderItems(formData),
      });
    }
    case "update-order-status": {
      const nextStatus = enumValue(formData, "orderStatus", orderStatuses);
      return success({
        type: "update-order-status",
        orderId: uuidSchema.parse(requiredString(formData, "orderId")),
        payload: {
          order_status: nextStatus,
          approved_by: nextStatus === "approved" ? adminUserId : undefined,
          approved_at: nextStatus === "approved" ? new Date().toISOString() : undefined,
          updated_at: new Date().toISOString(),
        },
      });
    }
    case "update-order-adjustments":
      return success({
        type: "update-order-adjustments",
        orderId: uuidSchema.parse(requiredString(formData, "orderId")),
        payload: {
          discount_amount: nonNegativeNumber(formData, "discountAmount"),
          delivery_fee: nonNegativeNumber(formData, "deliveryFee"),
          agent_id: optionalUuid(formData, "agentId") ?? null,
          updated_at: new Date().toISOString(),
        },
      });
    case "update-commission": {
      const status = enumValue(formData, "status", commissionStatuses);
      return success({
        type: "update-commission",
        orderItemId: uuidSchema.parse(requiredString(formData, "orderItemId")),
        payload: status === "unset"
          ? {
              agent_commission_amount: 0,
              agent_commission_status: status,
              agent_commission_set_by: null,
              agent_commission_set_at: null,
              agent_commission_notes: null,
            }
          : {
              agent_commission_amount: nonNegativeNumber(formData, "amount"),
              agent_commission_status: status,
              agent_commission_set_by: adminUserId,
              agent_commission_set_at: new Date().toISOString(),
              agent_commission_notes: optionalString(formData, "notes"),
            },
      });
    }
    case "record-payment":
      return success({
        type: "record-payment",
        payload: {
          order_id: uuidSchema.parse(requiredString(formData, "orderId")),
          amount: positiveNumber(formData, "amount"),
          payment_method: requiredString(formData, "paymentMethod"),
          payment_date: dateString(formData, "paymentDate"),
          recorded_by: adminUserId,
          reference_number: optionalString(formData, "referenceNumber"),
          notes: optionalString(formData, "notes"),
        },
      });
    case "save-invoice":
      return success({
        type: "save-invoice",
        invoiceId: optionalUuid(formData, "invoiceId"),
        payload: {
          order_id: uuidSchema.parse(requiredString(formData, "orderId")),
          status: enumValue(formData, "status", invoiceStatuses),
          issued_at: optionalDateTime(formData, "issuedAt"),
          due_at: optionalDateTime(formData, "dueAt"),
          updated_at: new Date().toISOString(),
        },
      });
    case "add-order-update":
      return success({
        type: "add-order-update",
        payload: {
          order_id: uuidSchema.parse(requiredString(formData, "orderId")),
          update_type: requiredString(formData, "updateType"),
          title: requiredString(formData, "title"),
          details: optionalString(formData, "details"),
          created_by: adminUserId,
        },
      });
    case "update-inquiry":
      return success({
        type: "update-inquiry",
        inquiryId: uuidSchema.parse(requiredString(formData, "inquiryId")),
        payload: {
          inquiry_status: enumValue(formData, "inquiryStatus", inquiryStatuses),
          internal_notes: optionalString(formData, "internalNotes"),
          updated_at: new Date().toISOString(),
        },
      });
    default:
      throw new Error("Unknown admin action.");
  }
}

async function executeAgentCreate(
  payload: Extract<AdminAction, { type: "create-agent" }>["payload"],
) {
  const adminClient = createSupabaseAdminClient();
  const { data, error } = await adminClient.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
    user_metadata: {
      display_name: payload.display_name,
    },
  });

  if (error || !data.user) {
    throw new Error("Unable to create agent auth account.");
  }

  const { error: profileError } = await adminClient.from("agent_profile").insert({
    user_id: data.user.id,
    display_name: payload.display_name,
    status: payload.status,
  });

  if (profileError) {
    await adminClient.auth.admin.deleteUser(data.user.id);
    throw new Error("Unable to create agent profile.");
  }
}

async function executeOrderCreate(
  supabase: SupabaseServerClient,
  action: Extract<AdminAction, { type: "create-order" }>,
) {
  const { data, error } = await supabase
    .from("customer_order")
    .insert(action.payload)
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error("Unable to create order.");
  }

  const orderId = String(data.id);
  const { error: itemError } = await supabase
    .from("customer_order_item")
    .insert(action.items.map((item) => ({ ...item, order_id: orderId })));

  if (!itemError) return;

  const { error: cleanupError } = await supabase.from("customer_order").delete().eq("id", orderId);

  if (cleanupError) {
    throw new Error("Unable to create order items. The order was created but cleanup failed.");
  }

  throw new Error("Unable to create order items.");
}

async function executeTableUpsert(
  supabase: SupabaseServerClient,
  table: string,
  id: string | undefined,
  payload: Record<string, unknown>,
) {
  if (id) {
    await executeTableUpdate(supabase, table, id, payload);
    return;
  }

  await executeTableInsert(supabase, table, payload);
}

async function executeTableInsert(
  supabase: SupabaseServerClient,
  table: string,
  payload: Record<string, unknown>,
) {
  const { error } = await supabase.from(table).insert(payload);
  if (error) throw new Error(`Unable to insert ${table.replaceAll("_", " ")}.`);
}

async function executeTableUpdate(
  supabase: SupabaseServerClient,
  table: string,
  id: string,
  payload: Record<string, unknown>,
) {
  const { error } = await supabase.from(table).update(payload).eq("id", id);
  if (error) throw new Error(`Unable to update ${table.replaceAll("_", " ")}.`);
}

function success(action: AdminAction): ParseSuccess {
  return {
    success: true,
    action,
  };
}

function requiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  if (!value) {
    throw new Error(`${toSentenceLabel(key)} is required.`);
  }

  return value;
}

function optionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  return value.length > 0 ? value : null;
}

function optionalEmail(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  return value ? z.email().parse(value) : null;
}

function optionalUuid(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  return value ? uuidSchema.parse(value) : undefined;
}

function requiredUuid(formData: FormData, key: string) {
  return uuidSchema.parse(requiredString(formData, key));
}

function enumValue<T extends string>(
  formData: FormData,
  key: string,
  values: readonly T[],
): T {
  const value = requiredString(formData, key);
  const found = values.find((item) => item === value);

  if (!found) {
    throw new Error(`${toSentenceLabel(key)} is not supported.`);
  }

  return found;
}

function nonNegativeInteger(formData: FormData, key: string) {
  const value = Number(requiredString(formData, key));

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${toSentenceLabel(key)} must be a non-negative integer.`);
  }

  return value;
}

function nonNegativeNumber(formData: FormData, key: string) {
  const value = Number(requiredString(formData, key));

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${toSentenceLabel(key)} must be a non-negative number.`);
  }

  return value;
}

function positiveNumber(formData: FormData, key: string) {
  const value = Number(requiredString(formData, key));

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${toSentenceLabel(key)} must be greater than zero.`);
  }

  return value;
}

function dateString(formData: FormData, key: string) {
  const value = requiredString(formData, key);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${toSentenceLabel(key)} must be a date.`);
  }

  return value;
}

function optionalDateTime(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) return null;

  return new Date(value).toISOString();
}

function parseOrderItems(formData: FormData) {
  const productIds = formData.getAll("productId");
  const quantities = formData.getAll("quantity");
  const details = formData.getAll("addDetails");
  const itemCount = Math.max(productIds.length, quantities.length, details.length);
  const parsedItems = Array.from({ length: itemCount })
    .map((_, index) => parseOrderItem(productIds[index], quantities[index], details[index]))
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (parsedItems.length === 0) {
    throw new Error("At least one order item is required.");
  }

  return parsedItems;
}

function parseOrderItem(
  productIdValue: FormDataEntryValue | undefined,
  quantityValue: FormDataEntryValue | undefined,
  detailsValue: FormDataEntryValue | undefined,
) {
  const productId = normalizeFormDataEntry(productIdValue);
  const quantityText = normalizeFormDataEntry(quantityValue);
  const addDetails = normalizeFormDataEntry(detailsValue);

  if (!productId && !quantityText && !addDetails) return null;

  if (!productId) {
    throw new Error("Product id is required for every order item.");
  }

  if (!quantityText) {
    throw new Error("Order item quantity is required.");
  }

  const quantity = Number(quantityText);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Order item quantity must be greater than zero.");
  }

  return {
    product_id: uuidSchema.parse(productId),
    partial_quantity: quantity,
    final_quantity: quantity,
    add_details: addDetails || null,
  };
}

function normalizeFormDataEntry(value: FormDataEntryValue | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function parseSectionContent(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);

    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("Section content must be a JSON object.");
    }

    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Section content must be valid JSON.", { cause: error });
    }

    throw error;
  }
}

function flattenZodErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => issue.message);
}

function getActionSuccessMessage(action: AdminAction) {
  switch (action.type) {
    case "save-page-section":
      return "Page section saved.";
    case "save-product":
      return "Product saved.";
    case "deactivate-product":
      return "Product deactivated.";
    case "save-customer":
      return "Customer saved.";
    case "create-agent":
      return "Agent account created.";
    case "update-agent":
      return "Agent updated.";
    case "create-order":
      return "Order created.";
    case "update-order-status":
      return "Order status updated.";
    case "update-order-adjustments":
      return "Order details updated.";
    case "update-commission":
      return "Commission updated.";
    case "record-payment":
      return "Payment recorded.";
    case "save-invoice":
      return "Invoice saved.";
    case "add-order-update":
      return "Order timeline update added.";
    case "update-inquiry":
      return "Inquiry updated.";
  }
}

function normalizeQueryMessage(value: string | null) {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function toSentenceLabel(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}
