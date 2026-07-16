import type { APIContext } from "astro";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

import { parseContactNumber } from "@/lib/formatters";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PRODUCT_IMAGE_BUCKET, isManagedStoragePath } from "@/lib/supabase/storage";

import {
  defaultProductCategories,
  defaultProductUnitLabels,
  normalizeProductOptionValue,
  productOtherOptionValue,
} from "./product-options";

const uuidSchema = z.uuid();
const pageStatuses = ["draft", "published", "archived"] as const;
const productCategories = defaultProductCategories;
const productUnitLabels = defaultProductUnitLabels;
const productAmountTypes = ["value", "percentage"] as const;
const stockStatuses = ["in_stock", "limited", "out_of_stock"] as const;
const orderStatuses = ["pending", "processing", "closed"] as const;
const inquiryStatuses = ["new", "reviewing", "responded", "closed", "spam"] as const;
const resellerApplicationStatuses = ["submitted", "contacted", "closed"] as const;
const registrationLinkDurations = ["30m", "1h", "3h", "12h", "1d"] as const;
const paymentCustomerTypes = ["regular", "wholesale", "reseller"] as const;

export type PageStatus = (typeof pageStatuses)[number];
export type ProductCategory = string;
export type ProductUnitLabel = string;
export type ProductAmountType = (typeof productAmountTypes)[number];
export type StockStatus = (typeof stockStatuses)[number];
export type OrderStatus = (typeof orderStatuses)[number];
export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid";
export type InquiryStatus = (typeof inquiryStatuses)[number];
export type ResellerApplicationStatus = (typeof resellerApplicationStatuses)[number];
export type RegistrationLinkDuration = (typeof registrationLinkDurations)[number];
export type PaymentCustomerType = (typeof paymentCustomerTypes)[number];
type OrderPaymentStatus = "unpaid" | "partial" | "paid" | "refunded";

type AdminDashboardContext = Pick<APIContext, "cookies" | "request" | "redirect">;
type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;
type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;
type ProductImageFile = File & { size: number; type: string; name: string };
export type AdminActionFeedback = {
  status?: string;
  error?: string;
  cleanPath?: string;
};

const maxProductImageBytes = 2 * 1024 * 1024;

type CustomerFormPayload = {
  first_name: string;
  last_name: string;
  phone_number: string;
  email: string | null;
  address: string;
  assigned_agent_id: string | null;
  is_reseller: boolean;
  credit_limit: number;
  created_by?: string;
  updated_at: string;
};

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
        unit_label: ProductUnitLabel;
        default_price: number;
        reseller_price: number;
        reseller_deduction_type: ProductAmountType;
        reseller_deduction_value: number;
        agent_commission_type: ProductAmountType;
        agent_commission_value: number;
        stock_status: StockStatus;
        image_file: ProductImageFile | null;
        is_active: boolean;
        updated_at?: string;
      };
    }
  | {
      type: "save-customer";
      customerId?: string;
      payload: CustomerFormPayload;
    }
  | {
      type: "create-agent";
      payload: {
        employee_id: string | null;
        first_name: string;
        last_name: string;
        display_name: string;
        email: string | null;
        contact: string;
        password: string | null;
        status: "active" | "inactive" | "suspended";
      };
    }
  | {
      type: "promote-customer-to-agent";
      customerId: string;
    }
  | {
      type: "update-agent";
      agentId: string;
      payload: {
        employee_id: string | null;
        first_name: string;
        last_name: string;
        display_name: string;
        status: "active" | "inactive" | "suspended";
        updated_at: string;
      };
    }
  | {
      type: "create-order";
      customer:
        | {
            type: "existing";
            customerId: string;
          }
        | {
            type: "new";
            payload: CustomerFormPayload;
          };
      payload: {
        agent_id: string | null;
        source: "admin_manual";
        order_status: OrderStatus;
        payment_status: "unpaid";
        release_date?: string | null;
        submitted_by: string;
        updated_at: string;
      };
      items: {
        product_id: string;
        partial_quantity: number;
        final_quantity: number;
        add_details: string | null;
      }[];
      payment?: {
        amount: number;
        payment_method: string;
        payment_date: string;
        recorded_by: string;
        reference_number: string | null;
        notes: string | null;
      } | null;
    }
  | {
      type: "update-order-status";
      orderId: string;
      payload: {
        order_status: OrderStatus;
        admin_read_at: string;
        admin_read_by: string;
        updated_at: string;
      };
    }
  | {
      type: "update-order-notes";
      orderId: string;
      payload: {
        notes: string | null;
        updated_at: string;
      };
    }
  | {
      type: "mark-order-read";
      orderId: string;
      returnTo?: string;
    }
  | {
      type: "update-commission";
      orderItemId: string;
      payload: {
        agent_commission_amount: number;
        agent_commission_paid: boolean;
        agent_commission_set_by: string | null;
        agent_commission_set_at: string | null;
      };
    }
  | {
      type: "update-agent-order-commission";
      agentOrderItemId: string;
      payload: {
        agent_commission_amount: number;
        agent_commission_updated_by: string;
        agent_commission_updated_at: string;
      };
    }
  | {
      type: "record-payment";
      customerType: PaymentCustomerType;
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
        issued_at: string;
        due_at: string | null;
        updated_at: string;
      };
    }
  | {
      type: "update-inquiry";
      inquiryId: string;
      payload: {
        inquiry_status: InquiryStatus;
        internal_notes: string | null;
        admin_read_at: string;
        admin_read_by: string;
        updated_at: string;
      };
    }
  | {
      type: "mark-inquiry-read";
      inquiryId: string;
    }
  | {
      type: "update-reseller-application";
      applicationId: string;
      payload: {
        application_status: ResellerApplicationStatus;
        admin_read_at: string;
        admin_read_by: string;
        updated_at: string;
      };
    }
  | {
      type: "mark-reseller-application-read";
      applicationId: string;
    }
  | {
      type: "mark-admin-notification-read";
      notificationId: string;
    }
  | {
      type: "mark-all-admin-notifications-read";
    }
  | {
      type: "update-invoice-item-quantity";
      orderItemId: string;
      payload: {
        final_quantity: number;
      };
    }
  | {
      type: "apply-customer-payment";
      payload: {
        customer_id: string;
        amount: number;
        payment_method: string;
        payment_date: string;
        recorded_by: string;
        reference_number: string | null;
        notes: string | null;
      };
    }
  | {
      type: "create-customer-registration-link";
      payload: {
        agent_ids: string[];
        duration: RegistrationLinkDuration;
        base_url: string;
        created_by: string;
      };
    }
  | {
      type: "add-order-item";
      orderId: string;
      payload: {
        order_id: string;
        product_id: string;
        partial_quantity: number;
        final_quantity: number;
        add_details: string | null;
      };
    }
  | {
      type: "remove-order-item";
      orderItemId: string;
    }
  | {
      type: "update-order-item-quantity";
      orderItemId: string;
      payload: {
        partial_quantity: number;
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
  const wantsJsonResponse = acceptsJsonResponse(context.request);

  if (!parsed.success) {
    if (wantsJsonResponse) {
      return Response.json(
        {
          success: false,
          error: parsed.errors.join(" "),
        },
        { status: 400 },
      );
    }

    return context.redirect(`${returnPath}?error=${encodeURIComponent(parsed.errors.join(" "))}`, 303);
  }

  try {
    await executeAdminAction(createSupabaseServerClient(context), parsed.action, adminUserId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin action failed.";
    if (wantsJsonResponse) {
      return Response.json(
        {
          success: false,
          error: message,
        },
        { status: 500 },
      );
    }

    return context.redirect(`${returnPath}?error=${encodeURIComponent(message)}`, 303);
  }

  const redirectPath = getActionRedirectPath(parsed.action, returnPath);
  const message = getActionSuccessMessage(parsed.action);

  if (wantsJsonResponse) {
    return Response.json({
      success: true,
      status: message,
      redirectPath,
      action: parsed.action.type,
    });
  }

  return context.redirect(
    withActionFeedback(
      redirectPath,
      "status",
      message,
    ),
    303,
  );
}

export async function markUnreadAdminInquiriesRead(
  context: Pick<APIContext, "cookies" | "request">,
  adminUserId: string,
) {
  const { error } = await createSupabaseServerClient(context)
    .from("contact_inquiry")
    .update(adminReadPayload(adminUserId))
    .eq("inquiry_status", "new")
    .is("admin_read_at", null);

  if (error) {
    throw new Error("Unable to mark inquiries as read.");
  }
}

export async function markUnreadAdminOrdersRead(
  context: Pick<APIContext, "cookies" | "request">,
  adminUserId: string,
) {
  const supabase = createSupabaseServerClient(context);
  const payload = adminReadPayload(adminUserId);
  const results = await Promise.all([
    supabase
      .from("customer_order")
      .update(payload)
      .eq("order_status", "pending")
      .neq("source", "admin_manual")
      .is("admin_read_at", null),
    supabase
      .from("agent_order")
      .update(payload)
      .in("order_status", ["pending_customers", "pending_order"])
      .is("admin_read_at", null),
  ]);

  const failedResult = results.find((result) => result.error);

  if (failedResult?.error) {
    throw new Error("Unable to mark orders as read.");
  }
}

export async function markAdminOrderReadIfUnread(
  context: Pick<APIContext, "cookies" | "request">,
  orderId: string,
  adminUserId: string,
) {
  const { error } = await createSupabaseServerClient(context)
    .from("customer_order")
    .update(adminReadPayload(adminUserId))
    .eq("id", orderId)
    .eq("order_status", "pending")
    .neq("source", "admin_manual")
    .is("admin_read_at", null);

  if (error) {
    throw new Error("Unable to mark order as read.");
  }
}

const viewedResellerApplicationIdsSchema = z
  .array(uuidSchema)
  .min(1, "At least one application id is required.")
  .max(100, "Too many application ids were provided.");

export function parseViewedResellerApplicationIds(value: unknown): string[] {
  const result = viewedResellerApplicationIdsSchema.safeParse(value);

  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid application ids.");
  }

  return [...new Set(result.data)];
}

export async function markViewedResellerApplicationsRead(
  supabase: SupabaseServerClient,
  applicationIds: string[],
  adminUserId: string,
): Promise<{ markedCount: number }> {
  const uniqueIds = parseViewedResellerApplicationIds(applicationIds);

  if (uniqueIds.length === 0) {
    return { markedCount: 0 };
  }

  const { data, error } = await supabase
    .from("reseller_application")
    .update(adminReadPayload(adminUserId))
    .in("id", uniqueIds)
    .eq("application_status", "submitted")
    .is("admin_read_at", null)
    .select("id");

  if (error) {
    throw new Error("Unable to mark reseller applications as read.");
  }

  return { markedCount: data?.length ?? 0 };
}

export async function executeAdminAction(
  supabase: SupabaseServerClient,
  action: AdminAction,
  adminUserId = "00000000-0000-4000-8000-000000000000",
): Promise<void> {
  switch (action.type) {
    case "save-page-section":
      await executeTableUpdate(supabase, "page_section", action.sectionId, action.payload);
      return;
    case "save-product":
      await executeProductSave(action);
      return;
    case "save-customer":
      await executeCustomerSave(supabase, action);
      return;
    case "create-agent":
      await executeAgentCreate(action.payload);
      return;
    case "promote-customer-to-agent":
      await executeCustomerPromotionToAgent(action.customerId);
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
    case "update-order-notes":
      await executeTableUpdate(supabase, "customer_order", action.orderId, action.payload);
      return;
    case "mark-order-read":
      await markAdminRecordRead(supabase, "customer_order", action.orderId, adminReadPayload(adminUserId));
      return;
    case "update-commission":
      await assertOrderItemCommissionPayable(supabase, action.orderItemId, action.payload.agent_commission_paid);
      await executeTableUpdate(supabase, "customer_order_item", action.orderItemId, action.payload);
      return;
    case "update-agent-order-commission":
      await assertAgentOrderItemCommissionEditable(supabase, action.agentOrderItemId);
      await executeTableUpdate(supabase, "agent_order_item", action.agentOrderItemId, action.payload);
      return;
    case "update-invoice-item-quantity":
      await assertOrderItemInvoiceQuantityEditable(supabase, action.orderItemId);
      await executeTableUpdate(supabase, "customer_order_item", action.orderItemId, action.payload);
      return;
    case "add-order-item":
      await assertOrderProductsEditable(supabase, action.orderId);
      await executeTableInsert(supabase, "customer_order_item", action.payload);
      return;
    case "remove-order-item":
      await assertOrderProductsEditableByItemId(supabase, action.orderItemId, {
        requireMultipleItems: true,
      });
      await executeTableDelete(supabase, "customer_order_item", action.orderItemId);
      return;
    case "update-order-item-quantity":
      await assertOrderProductsEditableByItemId(supabase, action.orderItemId);
      await executeTableUpdate(supabase, "customer_order_item", action.orderItemId, action.payload);
      return;
    case "record-payment":
      await assertOrderHasSalesInvoice(supabase, action.payload.order_id);
      assertPaymentAmountWithinBalance(
        action.payload.amount,
        await applyPaymentCustomerTypePricing(supabase, action.payload.order_id, action.customerType),
      );
      await executeTableInsert(supabase, "payment", action.payload);
      await markAdminRecordRead(supabase, "customer_order", action.payload.order_id, adminReadPayload(action.payload.recorded_by));
      return;
    case "apply-customer-payment":
      await executeCustomerPaymentDistribution(action.payload);
      return;
    case "create-customer-registration-link":
      await executeCustomerRegistrationLinkCreate(action.payload);
      return;
    case "save-invoice":
      await assertOrderCanGenerateInvoice(supabase, action.payload.order_id);
      await executeTableUpsert(supabase, "invoice", action.invoiceId, action.payload);
      await markAdminRecordRead(supabase, "customer_order", action.payload.order_id, adminReadPayload(adminUserId));
      return;
    case "update-inquiry":
      await executeTableUpdate(supabase, "contact_inquiry", action.inquiryId, action.payload);
      return;
    case "mark-inquiry-read":
      await markAdminRecordRead(supabase, "contact_inquiry", action.inquiryId, adminReadPayload(adminUserId));
      return;
    case "update-reseller-application":
      await executeTableUpdate(supabase, "reseller_application", action.applicationId, action.payload);
      return;
    case "mark-reseller-application-read":
      await markAdminRecordRead(supabase, "reseller_application", action.applicationId, adminReadPayload(adminUserId));
      return;
    case "mark-admin-notification-read":
      await markAdminNotificationRead(supabase, action.notificationId, adminUserId);
      return;
    case "mark-all-admin-notifications-read":
      await markAllAdminNotificationsRead(supabase, adminUserId);
      return;
  }
}

export function getAllowedNextOrderStatuses(
  status: OrderStatus,
  paymentStatus?: OrderPaymentStatus,
): OrderStatus[] {
  switch (status) {
    case "pending":
      return ["processing", "closed"];
    case "processing":
      return ["closed"];
    case "closed":
      return paymentStatus && paymentStatus !== "paid" ? ["processing"] : [];
  }
}

export function formatAdminActionFeedback(url: URL): AdminActionFeedback {
  const status = normalizeQueryMessage(url.searchParams.get("status"));
  const error = normalizeQueryMessage(url.searchParams.get("error"));

  return {
    status,
    error,
    cleanPath: status || error ? getAdminActionFeedbackCleanPath(url) : undefined,
  };
}

export function getPageStatuses() {
  return [...pageStatuses];
}

export function getProductCategories() {
  return [...productCategories];
}

export function getProductUnitLabels() {
  return [...productUnitLabels];
}

export function getStockStatuses() {
  return [...stockStatuses];
}

export function getOrderStatuses() {
  return [...orderStatuses];
}

export function getInquiryStatuses() {
  return [...inquiryStatuses];
}

export function getResellerApplicationStatuses() {
  return [...resellerApplicationStatuses];
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
    case "save-product": {
      const productId = optionalUuid(formData, "productId");
      const defaultPrice = nonNegativeNumber(formData, "defaultPrice");
      const resellerDeductionType = enumValue(
        formData,
        "resellerDeductionType",
        productAmountTypes,
      );
      const resellerDeductionValue = productAmountValue(
        formData,
        "resellerDeductionValue",
        resellerDeductionType,
        "Reseller deduction",
      );
      const agentCommissionType = enumValue(
        formData,
        "agentCommissionType",
        productAmountTypes,
      );
      const agentCommissionValue = productAmountValue(
        formData,
        "agentCommissionValue",
        agentCommissionType,
        "Agent commission",
      );

      return success({
        type: "save-product",
        productId,
        payload: {
          name: requiredString(formData, "name"),
          category: productOptionValue(
            formData,
            "category",
            "categoryOther",
            "Category",
          ),
          description: optionalString(formData, "description"),
          unit_label: productOptionValue(
            formData,
            "unitLabel",
            "unitLabelOther",
            "Unit label",
          ),
          default_price: defaultPrice,
          reseller_price: calculateResellerPrice(
            defaultPrice,
            resellerDeductionType,
            resellerDeductionValue,
          ),
          reseller_deduction_type: resellerDeductionType,
          reseller_deduction_value: resellerDeductionValue,
          agent_commission_type: agentCommissionType,
          agent_commission_value: agentCommissionValue,
          stock_status: enumValue(formData, "stockStatus", stockStatuses),
          image_file: requiredProductImage(
            formData,
            "imageFile",
            {
              required: !optionalUuid(formData, "productId"),
            },
          ),
          is_active: formData.get("isActive") === "on",
        },
      });
    }
    case "save-customer": {
      const customerId = optionalUuid(formData, "customerId");
      return success({
        type: "save-customer",
        customerId,
        payload: parseCustomerFormPayload(formData, adminUserId, { isNew: !customerId }),
      });
    }
    case "create-agent":
      return success({
        type: "create-agent",
        payload: parseCreateAgentPayload(formData),
      });
    case "promote-customer-to-agent":
      return success({
        type: "promote-customer-to-agent",
        customerId: uuidSchema.parse(requiredString(formData, "customerId")),
      });
    case "update-agent":
      return success({
        type: "update-agent",
        agentId: uuidSchema.parse(requiredString(formData, "agentId")),
        payload: {
          ...parseAgentProfilePayload(formData),
          status: enumValue(formData, "status", ["active", "inactive", "suspended"] as const),
          updated_at: new Date().toISOString(),
        },
      });
    case "create-order": {
      const existingCustomerId = optionalUuid(formData, "customerId");

      return success({
        type: "create-order",
        customer: existingCustomerId
          ? {
              type: "existing",
              customerId: existingCustomerId,
            }
          : {
              type: "new",
              payload: parseCustomerFormPayload(formData, adminUserId, { isNew: true }),
            },
        payload: {
          agent_id: optionalUuid(formData, "agentId") ?? null,
          source: "admin_manual",
          order_status: "processing",
          payment_status: "unpaid",
          release_date: optionalDateString(formData, "releaseDate"),
          submitted_by: adminUserId,
          updated_at: new Date().toISOString(),
        },
        items: parseOrderItems(formData),
        payment: parseCreateOrderPaymentPayload(formData, adminUserId),
      });
    }
    case "update-order-status": {
      const nextStatus = enumValue(formData, "orderStatus", orderStatuses);
      return success({
        type: "update-order-status",
        orderId: uuidSchema.parse(requiredString(formData, "orderId")),
        payload: {
          order_status: nextStatus,
          ...adminReadPayload(adminUserId),
          updated_at: new Date().toISOString(),
        },
      });
    }
    case "update-order-notes":
      return success({
        type: "update-order-notes",
        orderId: uuidSchema.parse(requiredString(formData, "orderId")),
        payload: {
          notes: optionalString(formData, "notes"),
          updated_at: new Date().toISOString(),
        },
      });
    case "mark-order-read":
      return success({
        type: "mark-order-read",
        orderId: uuidSchema.parse(requiredString(formData, "orderId")),
        returnTo: optionalAdminReturnPath(formData, "returnTo"),
      });
    case "update-commission": {
      const amount = nonNegativeNumber(formData, "amount");
      const isPaid = formData.get("isPaid") === "on";
      return success({
        type: "update-commission",
        orderItemId: uuidSchema.parse(requiredString(formData, "orderItemId")),
        payload: amount <= 0
          ? {
              agent_commission_amount: 0,
              agent_commission_paid: false,
              agent_commission_set_by: null,
              agent_commission_set_at: null,
            }
          : {
              agent_commission_amount: amount,
              agent_commission_paid: isPaid,
              agent_commission_set_by: adminUserId,
              agent_commission_set_at: new Date().toISOString(),
            },
      });
    }
    case "update-agent-order-commission":
      return success({
        type: "update-agent-order-commission",
        agentOrderItemId: uuidSchema.parse(requiredString(formData, "agentOrderItemId")),
        payload: {
          agent_commission_amount: nonNegativeNumber(formData, "amount"),
          agent_commission_updated_by: adminUserId,
          agent_commission_updated_at: new Date().toISOString(),
        },
      });
    case "update-invoice-item-quantity":
      return success({
        type: "update-invoice-item-quantity",
        orderItemId: uuidSchema.parse(requiredString(formData, "orderItemId")),
        payload: {
          final_quantity: positiveNumber(formData, "quantity"),
        },
      });
    case "add-order-item": {
      const quantity = positiveNumber(formData, "quantity");
      const orderId = uuidSchema.parse(requiredString(formData, "orderId"));

      return success({
        type: "add-order-item",
        orderId,
        payload: {
          order_id: orderId,
          product_id: uuidSchema.parse(requiredString(formData, "productId")),
          partial_quantity: quantity,
          final_quantity: quantity,
          add_details: optionalString(formData, "addDetails"),
        },
      });
    }
    case "remove-order-item":
      return success({
        type: "remove-order-item",
        orderItemId: uuidSchema.parse(requiredString(formData, "orderItemId")),
      });
    case "update-order-item-quantity":
      return success({
        type: "update-order-item-quantity",
        orderItemId: uuidSchema.parse(requiredString(formData, "orderItemId")),
        payload: {
          partial_quantity: positiveNumber(formData, "quantity"),
        },
      });
    case "record-payment":
      return success({
        type: "record-payment",
        customerType: enumValue(formData, "customerType", paymentCustomerTypes),
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
    case "apply-customer-payment":
      return success({
        type: "apply-customer-payment",
        payload: {
          customer_id: uuidSchema.parse(requiredString(formData, "customerId")),
          amount: positiveNumber(formData, "amount"),
          payment_method: requiredString(formData, "paymentMethod"),
          payment_date: dateString(formData, "paymentDate"),
          recorded_by: adminUserId,
          reference_number: optionalString(formData, "referenceNumber"),
          notes: optionalString(formData, "notes"),
        },
      });
    case "create-customer-registration-link":
      return success({
        type: "create-customer-registration-link",
        payload: {
          agent_ids: requiredUuidList(formData, "agentId"),
          duration: enumValue(formData, "duration", registrationLinkDurations),
          base_url: requiredUrlOrigin(formData, "baseUrl"),
          created_by: adminUserId,
        },
      });
    case "save-invoice":
      return success({
        type: "save-invoice",
        invoiceId: optionalUuid(formData, "invoiceId"),
        payload: {
          order_id: uuidSchema.parse(requiredString(formData, "orderId")),
          status: "issued",
          issued_at: new Date().toISOString(),
          due_at: null,
          updated_at: new Date().toISOString(),
        },
      });
    case "update-inquiry":
      return success({
        type: "update-inquiry",
        inquiryId: uuidSchema.parse(requiredString(formData, "inquiryId")),
        payload: {
          inquiry_status: enumValue(formData, "inquiryStatus", inquiryStatuses),
          internal_notes: optionalString(formData, "internalNotes"),
          ...adminReadPayload(adminUserId),
          updated_at: new Date().toISOString(),
        },
      });
    case "mark-inquiry-read":
      return success({
        type: "mark-inquiry-read",
        inquiryId: uuidSchema.parse(requiredString(formData, "inquiryId")),
      });
    case "update-reseller-application":
      return success({
        type: "update-reseller-application",
        applicationId: uuidSchema.parse(requiredString(formData, "applicationId")),
        payload: {
          application_status: enumValue(formData, "applicationStatus", resellerApplicationStatuses),
          ...adminReadPayload(adminUserId),
          updated_at: new Date().toISOString(),
        },
      });
    case "mark-reseller-application-read":
      return success({
        type: "mark-reseller-application-read",
        applicationId: uuidSchema.parse(requiredString(formData, "applicationId")),
      });
    case "mark-admin-notification-read":
      return success({
        type: "mark-admin-notification-read",
        notificationId: requiredString(formData, "notificationId"),
      });
    case "mark-all-admin-notifications-read":
      return success({
        type: "mark-all-admin-notifications-read",
      });
    default:
      throw new Error("Unknown admin action.");
  }
}

async function executeAgentCreate(
  payload: Extract<AdminAction, { type: "create-agent" }>["payload"],
) {
  const adminClient = createSupabaseAdminClient();
  await assertAgentEmailIsAvailable(adminClient, payload.email);
  await assertAgentContactIsAvailable(adminClient, payload.contact);

  let userId: string | null = null;

  if (payload.email) {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: payload.email,
      password: payload.password ?? undefined,
      email_confirm: true,
    });

    if (error || !data.user) {
      if (error?.message?.toLowerCase().includes("already")) {
        throw new Error("Email already exists for another account.");
      }

      throw new Error("Unable to create agent auth account.");
    }

    userId = data.user.id;
  }

  const { error: profileError } = await adminClient.from("agent_profile").insert({
    user_id: userId,
    employee_id: payload.employee_id,
    first_name: payload.first_name,
    last_name: payload.last_name,
    display_name: payload.display_name,
    contact: payload.contact,
    status: payload.status,
  });

  if (profileError) {
    if (userId) {
      await adminClient.auth.admin.deleteUser(userId);
    }

    if (profileError.code === "23505") {
      throw new Error("Contact number or employee ID already exists for another agent.");
    }

    throw new Error("Unable to create agent profile.");
  }
}

async function assertAgentEmailIsAvailable(
  adminClient: SupabaseAdminClient,
  email: string | null,
) {
  if (!email) return;

  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (error) {
    throw new Error("Unable to validate existing agent email.");
  }

  const hasExistingEmail = (data?.users ?? []).some(
    (user) => (user.email ?? "").trim().toLowerCase() === normalizedEmail,
  );

  if (hasExistingEmail) {
    throw new Error("Email already exists for another account.");
  }
}

async function assertAgentContactIsAvailable(
  adminClient: SupabaseAdminClient,
  contact: string,
) {
  const normalizedContact = contact.trim();
  const { data, error } = await adminClient
    .from("agent_profile")
    .select("id")
    .eq("contact", normalizedContact)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to validate existing agent contact number.");
  }

  if (data?.id) {
    throw new Error("Contact number already exists for another agent.");
  }
}

async function executeProductSave(action: Extract<AdminAction, { type: "save-product" }>) {
  const adminClient = createSupabaseAdminClient();
  const existingProduct = action.productId
    ? await loadExistingProduct(adminClient, action.productId)
    : null;
  const existingImagePath = existingProduct?.image_path ?? null;
  let uploadedImagePath: string | null = null;

  try {
    if (action.payload.image_file) {
      uploadedImagePath = await uploadProductImage(
        adminClient,
        action.payload.image_file,
        action.payload.name,
      );
    }

    const payload = {
      name: action.payload.name,
      category: action.payload.category,
      description: action.payload.description,
      unit_label: action.payload.unit_label,
      default_price: action.payload.default_price,
      reseller_price: action.payload.reseller_price,
      reseller_deduction_type: action.payload.reseller_deduction_type,
      reseller_deduction_value: action.payload.reseller_deduction_value,
      agent_commission_type: action.payload.agent_commission_type,
      agent_commission_value: action.payload.agent_commission_value,
      stock_status: action.payload.stock_status,
      image_path: uploadedImagePath ?? existingImagePath,
      is_active: action.payload.is_active,
      updated_at: new Date().toISOString(),
    };

    if (!payload.image_path) {
      throw new Error("Product image is required.");
    }

    await executeTableUpsert(adminClient, "product", action.productId, payload);

    if (uploadedImagePath && existingImagePath && existingImagePath !== uploadedImagePath) {
      await removeProductImage(adminClient, existingImagePath);
    }
  } catch (error) {
    if (uploadedImagePath) {
      await removeProductImage(adminClient, uploadedImagePath);
    }

    throw error;
  }
}

async function executeOrderCreate(
  supabase: SupabaseServerClient,
  action: Extract<AdminAction, { type: "create-order" }>,
) {
  const customer = await resolveOrderCustomer(supabase, action.customer);
  const { data, error } = await supabase
    .from("customer_order")
    .insert({
      customer_id: customer.customerId,
      ...action.payload,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    await cleanupCreatedOrderCustomer(supabase, customer.createdCustomerId);
    throw new Error("Unable to create order.");
  }

  const orderId = String(data.id);
  const { error: itemError } = await supabase
    .from("customer_order_item")
    .insert(action.items.map((item) => ({ ...item, order_id: orderId })));

  if (itemError) {
    await cleanupCreatedOrder(supabase, orderId, customer.createdCustomerId, "Unable to create order items");
    throw new Error("Unable to create order items.");
  }

  if (!action.payment) return;

  const { error: paymentError } = await supabase
    .from("payment")
    .insert({
      ...action.payment,
      order_id: orderId,
    });

  if (!paymentError) return;

  await cleanupCreatedOrder(supabase, orderId, customer.createdCustomerId, "Unable to create payment record");
  throw new Error("Unable to create payment record.");
}

async function executeCustomerSave(
  supabase: SupabaseServerClient,
  action: Extract<AdminAction, { type: "save-customer" }>,
) {
  if (!action.customerId) {
    await assertCustomerContactIsAvailable(supabase, action.payload);
  }

  await executeTableUpsert(supabase, "customer", action.customerId, action.payload);
}

async function resolveOrderCustomer(
  supabase: SupabaseServerClient,
  customer: Extract<AdminAction, { type: "create-order" }>["customer"],
) {
  if (customer.type === "existing") {
    return {
      customerId: customer.customerId,
      createdCustomerId: null,
    };
  }

  await assertCustomerContactIsAvailable(supabase, customer.payload);

  const { data, error } = await supabase
    .from("customer")
    .insert(customer.payload)
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error("Unable to create customer.");
  }

  const customerId = String(data.id);
  return {
    customerId,
    createdCustomerId: customerId,
  };
}

async function assertCustomerContactIsAvailable(
  supabase: SupabaseServerClient,
  payload: CustomerFormPayload,
) {
  const existingPhoneCustomerId = await findExistingCustomerIdByPhone(supabase, payload.phone_number);

  if (existingPhoneCustomerId) {
    throw new Error("Phone number already exists for another customer.");
  }

  if (!payload.email) {
    return;
  }

  const existingEmailCustomerId = await findExistingCustomerIdByEmail(supabase, payload.email);

  if (existingEmailCustomerId) {
    throw new Error("Email already exists for another customer.");
  }
}

async function loadExistingProduct(
  supabase: SupabaseAdminClient,
  productId: string,
) {
  const { data, error } = await supabase
    .from("product")
    .select("id, image_path")
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to load existing product.");
  }

  if (!data) {
    throw new Error("Product was not found.");
  }

  return {
    id: String(data.id),
    image_path: typeof data.image_path === "string" ? data.image_path : null,
  };
}

async function findExistingCustomerIdByPhone(
  supabase: SupabaseServerClient,
  phoneNumber: string,
) {
  const { data, error } = await supabase
    .from("customer")
    .select("id")
    .eq("phone_number", phoneNumber)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to validate existing customer phone number.");
  }

  return data?.id ? String(data.id) : null;
}

async function findExistingCustomerIdByEmail(
  supabase: SupabaseServerClient,
  email: string,
) {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await supabase
    .from("customer")
    .select("id")
    .ilike("email", normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to validate existing customer email.");
  }

  return data?.id ? String(data.id) : null;
}

async function assertOrderCanGenerateInvoice(
  supabase: SupabaseServerClient,
  orderId: string,
) {
  const { data, error } = await supabase
    .from("customer_order")
    .select("order_status")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to verify order status for invoice generation.");
  }

  if (!data || data.order_status !== "processing") {
    throw new Error("Only processing orders can generate a sales invoice.");
  }
}

async function assertOrderHasSalesInvoice(
  supabase: SupabaseServerClient,
  orderId: string,
) {
  const { data, error } = await supabase
    .from("invoice")
    .select("id")
    .eq("order_id", orderId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to verify sales invoice before recording payment.");
  }

  if (!data?.id) {
    throw new Error("Create a sales invoice before recording a payment.");
  }
}

async function applyPaymentCustomerTypePricing(
  supabase: SupabaseServerClient,
  orderId: string,
  customerType: PaymentCustomerType,
) {
  const targetPriceType = customerType === "reseller" ? "reseller" : "retail";
  const { data: payments, error: paymentError } = await supabase
    .from("payment")
    .select("id, amount")
    .eq("order_id", orderId);

  if (paymentError) {
    throw new Error("Unable to verify existing payments before updating customer type pricing.");
  }

  const { data: items, error: itemError } = await supabase
    .from("customer_order_item")
    .select(`
      id,
      final_quantity,
      price_type,
      unit_price,
      product:product_id (
        default_price,
        reseller_price
      )
    `)
    .eq("order_id", orderId);

  if (itemError) {
    throw new Error("Unable to load order item prices.");
  }

  type PaymentPricingItemRow = {
    id?: unknown;
    final_quantity?: unknown;
    price_type?: unknown;
    product?: { default_price?: unknown; reseller_price?: unknown } | Array<{ default_price?: unknown; reseller_price?: unknown }> | null;
  };

  const normalizedItems = ((items ?? []) as PaymentPricingItemRow[]).map((item) => {
    const product = Array.isArray(item.product)
      ? item.product[0] as { default_price?: unknown; reseller_price?: unknown } | undefined
      : item.product;
    const defaultPrice = Number(product?.default_price);
    const resellerPrice = Number(product?.reseller_price);
    const finalQuantity = Number(item.final_quantity);
    const unitPrice = targetPriceType === "reseller" ? resellerPrice : defaultPrice;

    if (
      typeof item.id !== "string" ||
      !Number.isFinite(finalQuantity) ||
      !Number.isFinite(defaultPrice) ||
      !Number.isFinite(resellerPrice)
    ) {
      throw new Error("Order item product pricing is incomplete.");
    }

    return {
      id: item.id,
      finalQuantity,
      priceType: typeof item.price_type === "string" ? item.price_type : "",
      unitPrice,
    };
  });

  if ((payments ?? []).length > 0) {
    const hasPricingChange = normalizedItems.some((item) => item.priceType !== targetPriceType);

    if (hasPricingChange) {
      throw new Error("Customer type pricing can only be changed before a payment record exists.");
    }

    return calculatePaymentBalance(normalizedItems, payments ?? []);
  }

  await Promise.all(normalizedItems.map(async (item) => {
    const { error } = await supabase
      .from("customer_order_item")
      .update({
        price_type: targetPriceType,
        unit_price: item.unitPrice,
      })
      .eq("id", item.id);

    if (error) {
      throw new Error("Unable to update order item pricing.");
    }
  }));

  return calculatePaymentBalance(normalizedItems, payments ?? []);
}

function assertPaymentAmountWithinBalance(amount: number, balance: number) {
  if (!Number.isFinite(balance) || amount > balance + 0.005) {
    throw new Error("Payment amount cannot exceed the remaining balance.");
  }
}

function calculatePaymentBalance(
  items: Array<{ finalQuantity: number; unitPrice: number }>,
  payments: Array<{ amount?: unknown }>,
) {
  const orderTotal = items.reduce((total, item) => total + item.finalQuantity * item.unitPrice, 0);
  const paidTotal = payments.reduce((total, payment) => {
    const amount = Number(payment.amount ?? 0);
    return total + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  return Math.max(roundCurrency(orderTotal - paidTotal), 0);
}

async function assertOrderItemInvoiceQuantityEditable(
  supabase: SupabaseServerClient,
  orderItemId: string,
) {
  const { data: orderItem, error: orderItemError } = await supabase
    .from("customer_order_item")
    .select("order_id")
    .eq("id", orderItemId)
    .maybeSingle();

  if (orderItemError) {
    throw new Error("Unable to verify invoice quantity update.");
  }

  const orderId = typeof orderItem?.order_id === "string" ? orderItem.order_id : null;

  if (!orderId) {
    throw new Error("Order item was not found.");
  }

  const { data: payment, error: paymentError } = await supabase
    .from("payment")
    .select("id")
    .eq("order_id", orderId)
    .limit(1)
    .maybeSingle();

  if (paymentError) {
    throw new Error("Unable to verify existing payments before updating invoice quantity.");
  }

  if (payment?.id) {
    throw new Error("Invoice quantities cannot be edited after a payment record has been created.");
  }
}

async function executeCustomerPromotionToAgent(customerId: string) {
  const adminClient = createSupabaseAdminClient();
  const { data: customer, error: customerError } = await adminClient
    .from("customer")
    .select("id, first_name, last_name, phone_number, email")
    .eq("id", customerId)
    .maybeSingle();

  if (customerError) {
    throw new Error("Unable to load customer for promotion.");
  }

  if (!customer) {
    throw new Error("Customer was not found.");
  }

  const { data: existingAgent, error: existingAgentError } = await adminClient
    .from("agent_profile")
    .select("id")
    .eq("customer_id", customerId)
    .limit(1)
    .maybeSingle();

  if (existingAgentError) {
    throw new Error("Unable to verify existing customer agent profile.");
  }

  if (existingAgent?.id) {
    throw new Error("This customer is already linked to an agent profile.");
  }

  await assertAgentContactIsAvailable(adminClient, String(customer.phone_number));

  const firstName = String(customer.first_name ?? "").trim();
  const lastName = String(customer.last_name ?? "").trim();
  const { error: profileError } = await adminClient.from("agent_profile").insert({
    user_id: null,
    customer_id: customerId,
    employee_id: null,
    first_name: firstName,
    last_name: lastName,
    display_name: `${firstName} ${lastName}`.trim(),
    contact: String(customer.phone_number),
    status: "active",
  });

  if (profileError) {
    if (profileError.code === "23505") {
      throw new Error("This customer is already linked to an agent or uses contact details owned by another agent.");
    }

    throw new Error("Unable to promote customer to agent.");
  }
}

async function executeCustomerPaymentDistribution(
  payload: Extract<AdminAction, { type: "apply-customer-payment" }>["payload"],
) {
  const adminClient = createSupabaseAdminClient();
  const { error } = await adminClient.rpc("apply_customer_payment_distribution", {
    target_customer_id: payload.customer_id,
    payment_amount: payload.amount,
    payment_method_value: payload.payment_method,
    payment_date_value: payload.payment_date,
    recorded_by_value: payload.recorded_by,
    reference_number_value: payload.reference_number,
    notes_value: payload.notes,
  });

  if (error) {
    throw new Error(error.message || "Unable to distribute customer payment.");
  }
}

async function executeCustomerRegistrationLinkCreate(
  payload: Extract<AdminAction, { type: "create-customer-registration-link" }>["payload"],
) {
  const adminClient = createSupabaseAdminClient();
  const { data: agents, error: agentError } = await adminClient
    .from("agent_profile")
    .select("id")
    .in("id", payload.agent_ids)
    .eq("status", "active");

  if (agentError) {
    throw new Error("Unable to validate registration link agents.");
  }

  const activeAgentIds = new Set((agents ?? []).map((agent) => String(agent.id)));

  if (activeAgentIds.size !== payload.agent_ids.length) {
    throw new Error("Registration links can only be sent to active agents.");
  }

  const token = createRegistrationToken();
  const { data: link, error: linkError } = await adminClient
    .from("customer_registration_link")
    .insert({
      token,
      token_hash: hashRegistrationToken(token),
      expires_at: new Date(Date.now() + registrationDurationSeconds(payload.duration) * 1000).toISOString(),
      created_by: payload.created_by,
    })
    .select("id")
    .single();

  if (linkError || !link?.id) {
    throw new Error("Unable to create customer registration link.");
  }

  const { error: linkAgentError } = await adminClient
    .from("customer_registration_link_agent")
    .insert(payload.agent_ids.map((agentId) => ({
      link_id: String(link.id),
      agent_id: agentId,
    })));

  if (linkAgentError) {
    await adminClient.from("customer_registration_link").delete().eq("id", String(link.id));
    throw new Error("Unable to notify selected agents about the registration link.");
  }
}

async function assertOrderProductsEditableByItemId(
  supabase: SupabaseServerClient,
  orderItemId: string,
  options: { requireMultipleItems?: boolean } = {},
) {
  const { data: orderItem, error: orderItemError } = await supabase
    .from("customer_order_item")
    .select("order_id")
    .eq("id", orderItemId)
    .maybeSingle();

  if (orderItemError) {
    throw new Error("Unable to verify order products before updating them.");
  }

  const orderId = typeof orderItem?.order_id === "string" ? orderItem.order_id : null;

  if (!orderId) {
    throw new Error("Order item was not found.");
  }

  await assertOrderProductsEditable(supabase, orderId, options);
}

async function assertOrderProductsEditable(
  supabase: SupabaseServerClient,
  orderId: string,
  options: { requireMultipleItems?: boolean } = {},
) {
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoice")
    .select("id")
    .eq("order_id", orderId)
    .limit(1)
    .maybeSingle();

  if (invoiceError) {
    throw new Error("Unable to verify invoices before updating order products.");
  }

  if (invoice?.id) {
    throw new Error("Order products cannot be edited after a sales invoice has been created.");
  }

  const { data: payment, error: paymentError } = await supabase
    .from("payment")
    .select("id")
    .eq("order_id", orderId)
    .limit(1)
    .maybeSingle();

  if (paymentError) {
    throw new Error("Unable to verify payments before updating order products.");
  }

  if (payment?.id) {
    throw new Error("Order products cannot be edited after a payment record has been created.");
  }

  if (options.requireMultipleItems) {
    const { data: orderItems, error: orderItemsError } = await supabase
      .from("customer_order_item")
      .select("id")
      .eq("order_id", orderId);

    if (orderItemsError) {
      throw new Error("Unable to verify order item count before removing a product.");
    }

    if ((orderItems ?? []).length <= 1) {
      throw new Error("Order must keep at least one product.");
    }
  }
}

async function assertOrderItemCommissionPayable(
  supabase: SupabaseServerClient,
  orderItemId: string,
  isPaid: boolean,
) {
  if (!isPaid) {
    return;
  }

  const { data: orderItem, error: orderItemError } = await supabase
    .from("customer_order_item")
    .select("id, order_id, final_quantity, unit_price, agent_commission_paid")
    .eq("id", orderItemId)
    .maybeSingle();

  if (orderItemError) {
    throw new Error("Unable to verify commission payment status.");
  }

  if (!orderItem || typeof orderItem.order_id !== "string") {
    throw new Error("Order item was not found.");
  }

  const orderId = orderItem.order_id;

  const { data: payments, error: paymentError } = await supabase
    .from("payment")
    .select("amount")
    .eq("order_id", orderId);

  if (paymentError) {
    throw new Error("Unable to verify payment records before updating commission.");
  }

  const paymentTotal = (payments ?? []).reduce((total, payment) => {
    const amount = Number((payment as { amount?: unknown }).amount);
    return total + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  if (paymentTotal <= 0) {
    throw new Error("Record a payment before marking commission as paid.");
  }

  const { data: orderItems, error: orderItemsError } = await supabase
    .from("customer_order_item")
    .select("id, final_quantity, unit_price, agent_commission_paid")
    .eq("order_id", orderId);

  if (orderItemsError) {
    throw new Error("Unable to verify commission payment coverage.");
  }

  const currentItemTotal = roundCurrency(
    Number(orderItem.final_quantity ?? 0) * Number(orderItem.unit_price ?? 0),
  );
  const paidCommissionCoverage = (orderItems ?? []).reduce((total, item) => {
    const normalizedItem = item as {
      id?: unknown;
      final_quantity?: unknown;
      unit_price?: unknown;
      agent_commission_paid?: unknown;
    };

    if (typeof normalizedItem.id !== "string" || normalizedItem.id === orderItemId) {
      return total;
    }

    if (normalizedItem.agent_commission_paid !== true) {
      return total;
    }

    const quantity = Number(normalizedItem.final_quantity);
    const unitPrice = Number(normalizedItem.unit_price);

    if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
      return total;
    }

    return total + roundCurrency(quantity * unitPrice);
  }, 0);

  const availableCoverage = roundCurrency(paymentTotal - paidCommissionCoverage);

  if (currentItemTotal > availableCoverage) {
    throw new Error("This commission cannot be marked as paid because recorded payments do not cover the item total.");
  }
}

async function assertAgentOrderItemCommissionEditable(
  supabase: SupabaseServerClient,
  agentOrderItemId: string,
) {
  const { data: agentOrderItem, error: agentOrderItemError } = await supabase
    .from("agent_order_item")
    .select("id, agent_order_id")
    .eq("id", agentOrderItemId)
    .maybeSingle();

  if (agentOrderItemError) {
    throw new Error("Unable to verify agent order commission status.");
  }

  if (!agentOrderItem || typeof agentOrderItem.agent_order_id !== "string") {
    throw new Error("Agent order item was not found.");
  }

  const { data: customerOrders, error: customerOrdersError } = await supabase
    .from("customer_order")
    .select("id, payment_status")
    .eq("agent_order_id", agentOrderItem.agent_order_id);

  if (customerOrdersError) {
    throw new Error("Unable to verify agent order payments before updating commission.");
  }

  const linkedCustomerOrders = customerOrders ?? [];
  const isFullyPaid = linkedCustomerOrders.length > 0 &&
    linkedCustomerOrders.every((order) => order.payment_status === "paid");

  if (isFullyPaid) {
    throw new Error("Agent order commission cannot be edited after all customer orders are fully paid.");
  }
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function cleanupCreatedOrderCustomer(
  supabase: SupabaseServerClient,
  customerId: string | null,
) {
  if (!customerId) return;

  await supabase.from("customer").delete().eq("id", customerId);
}

async function cleanupCreatedOrder(
  supabase: SupabaseServerClient,
  orderId: string,
  createdCustomerId: string | null,
  failureLabel: string,
) {
  const { error: cleanupError } = await supabase.from("customer_order").delete().eq("id", orderId);

  if (cleanupError) {
    throw new Error(`${failureLabel}. The order was created but cleanup failed.`);
  }

  await cleanupCreatedOrderCustomer(supabase, createdCustomerId);
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

async function executeTableDelete(
  supabase: SupabaseServerClient,
  table: string,
  id: string,
) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw new Error(`Unable to delete ${table.replaceAll("_", " ")}.`);
}

type AdminReadableTable =
  | "customer_order"
  | "contact_inquiry"
  | "reseller_application";

function adminReadPayload(adminUserId: string) {
  return {
    admin_read_at: new Date().toISOString(),
    admin_read_by: adminUserId,
  };
}

async function markAdminRecordRead(
  supabase: SupabaseServerClient,
  table: AdminReadableTable,
  id: string,
  payload: ReturnType<typeof adminReadPayload>,
) {
  await executeTableUpdate(supabase, table, id, payload);
}

async function markAdminNotificationRead(
  supabase: SupabaseServerClient,
  notificationId: string,
  adminUserId: string,
) {
  const target = adminNotificationTarget(notificationId);

  await markAdminRecordRead(
    supabase,
    target.table,
    target.id,
    adminReadPayload(adminUserId),
  );
}

async function markAllAdminNotificationsRead(
  supabase: SupabaseServerClient,
  adminUserId: string,
) {
  const payload = adminReadPayload(adminUserId);
  const results = await Promise.all([
    supabase
      .from("customer_order")
      .update(payload)
      .eq("order_status", "pending")
      .neq("source", "admin_manual")
      .is("admin_read_at", null),
    supabase
      .from("contact_inquiry")
      .update(payload)
      .eq("inquiry_status", "new")
      .is("admin_read_at", null),
    supabase
      .from("reseller_application")
      .update(payload)
      .eq("application_status", "submitted")
      .is("admin_read_at", null),
  ]);

  const failedResult = results.find((result) => result.error);

  if (failedResult?.error) {
    throw new Error("Unable to mark admin notifications as read.");
  }
}

function adminNotificationTarget(notificationId: string): {
  table: AdminReadableTable;
  id: string;
} {
  if (notificationId.startsWith("reseller-app-")) {
    return {
      table: "reseller_application",
      id: uuidSchema.parse(notificationId.slice("reseller-app-".length)),
    };
  }

  if (notificationId.startsWith("order-pending-")) {
    return {
      table: "customer_order",
      id: uuidSchema.parse(notificationId.slice("order-pending-".length)),
    };
  }

  if (notificationId.startsWith("inquiry-new-")) {
    return {
      table: "contact_inquiry",
      id: uuidSchema.parse(notificationId.slice("inquiry-new-".length)),
    };
  }

  throw new Error("Notification cannot be marked as read.");
}

async function uploadProductImage(
  supabase: SupabaseAdminClient,
  file: ProductImageFile,
  productName: string,
) {
  const extension = inferFileExtension(file);
  const fileNameBase = slugifyFileSegment(productName) || "product";
  const objectPath = `products/${fileNameBase}-${crypto.randomUUID()}.${extension}`;
  const { data, error } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(objectPath, file, {
      cacheControl: "31536000",
      contentType: file.type || undefined,
      upsert: false,
    });

  if (error || !data?.path) {
    throw new Error("Unable to upload product image.");
  }

  return data.path;
}

async function removeProductImage(
  supabase: SupabaseAdminClient,
  imagePath: string,
) {
  if (!isManagedStoragePath(imagePath, PRODUCT_IMAGE_BUCKET)) {
    return;
  }

  await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([imagePath]);
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

  return value ? z.email("Enter a valid email address.").parse(value.toLowerCase()) : null;
}

function optionalUuid(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  return value ? uuidSchema.parse(value) : undefined;
}

function requiredUuidList(formData: FormData, key: string) {
  const values = formData
    .getAll(key)
    .map((value) => normalizeFormDataEntry(value))
    .filter((value) => value.length > 0);

  if (values.length === 0) {
    throw new Error(`${toSentenceLabel(key)} is required.`);
  }

  return [...new Set(values.map((value) => uuidSchema.parse(value)))];
}

function requiredUrlOrigin(formData: FormData, key: string) {
  const value = requiredString(formData, key);
  const url = new URL(value);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${toSentenceLabel(key)} must be a valid website URL.`);
  }

  return url.origin;
}

function optionalAdminReturnPath(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) return undefined;

  if (!value.startsWith("/admin") || value.startsWith("//")) {
    throw new Error("Return path is not supported.");
  }

  return value;
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

function productOptionValue(
  formData: FormData,
  key: string,
  otherKey: string,
  label: string,
) {
  const selectedValue = requiredString(formData, key);
  const rawValue = selectedValue === productOtherOptionValue
    ? requiredString(formData, otherKey)
    : selectedValue;
  const normalizedValue = normalizeProductOptionValue(rawValue);

  if (!normalizedValue) {
    throw new Error(`${label} is required.`);
  }

  if (normalizedValue.length > 60) {
    throw new Error(`${label} must be 60 characters or fewer.`);
  }

  return normalizedValue;
}

function productAmountValue(
  formData: FormData,
  key: string,
  type: ProductAmountType,
  label: string,
) {
  const value = nonNegativeNumber(formData, key);

  if (type === "percentage" && value > 100) {
    throw new Error(`${label} percentage cannot exceed 100.`);
  }

  return value;
}

function calculateResellerPrice(
  defaultPrice: number,
  deductionType: ProductAmountType,
  deductionValue: number,
) {
  const resellerPrice = deductionType === "percentage"
    ? defaultPrice * (1 - deductionValue / 100)
    : defaultPrice - deductionValue;

  if (resellerPrice < 0) {
    throw new Error("Reseller deduction cannot exceed the default price.");
  }

  return roundCurrency(resellerPrice);
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

function optionalNonNegativeNumber(formData: FormData, key: string, fallback: number) {
  const rawValue = optionalString(formData, key);

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);

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

function optionalDateString(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${toSentenceLabel(key)} must be a date.`);
  }

  return value;
}

function parseCreateOrderPaymentPayload(
  formData: FormData,
  adminUserId: string,
): Extract<AdminAction, { type: "create-order" }>["payment"] {
  const amountText = optionalString(formData, "downpaymentAmount");

  if (!amountText) {
    return null;
  }

  const amount = Number(amountText);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Downpayment amount must be greater than zero.");
  }

  return {
    amount,
    payment_method: requiredString(formData, "downpaymentMethod"),
    payment_date: dateString(formData, "downpaymentDate"),
    recorded_by: adminUserId,
    reference_number: optionalString(formData, "downpaymentReferenceNumber"),
    notes: optionalString(formData, "downpaymentNotes"),
  };
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

function parseCreateAgentPayload(
  formData: FormData,
): Extract<AdminAction, { type: "create-agent" }>["payload"] {
  const email = optionalEmail(formData, "email");
  const contact = parseContactNumber(requiredString(formData, "contact"));
  const password = email
    ? z.string().min(8, "Password must be at least 8 characters.").parse(
        requiredString(formData, "password"),
      )
    : optionalString(formData, "password");

  return {
    ...parseAgentProfilePayload(formData),
    email,
    contact,
    password,
    status: "active",
  };
}

function parseAgentProfilePayload(formData: FormData) {
  const firstName = requiredString(formData, "firstName");
  const lastName = requiredString(formData, "lastName");

  return {
    employee_id: optionalString(formData, "employeeId"),
    first_name: firstName,
    last_name: lastName,
    display_name: `${firstName} ${lastName}`.trim(),
  };
}

function parseCustomerFormPayload(
  formData: FormData,
  adminUserId: string,
  options: { isNew: boolean },
): CustomerFormPayload {
  return {
    first_name: requiredString(formData, "firstName"),
    last_name: requiredString(formData, "lastName"),
    phone_number: requiredString(formData, "phoneNumber"),
    email: optionalEmail(formData, "email"),
    address: requiredString(formData, "address"),
    assigned_agent_id: optionalUuid(formData, "assignedAgentId") ?? null,
    is_reseller: formData.get("isReseller") === "on",
    credit_limit: optionalNonNegativeNumber(formData, "creditLimit", 1000),
    created_by: options.isNew ? adminUserId : undefined,
    updated_at: new Date().toISOString(),
  };
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

function requiredProductImage(
  formData: FormData,
  key: string,
  options: { required: boolean },
) {
  const value = formData.get(key);

  if (!(value instanceof File) || value.size === 0) {
    if (options.required) {
      throw new Error("Product image is required.");
    }

    return null;
  }

  if (!value.type.startsWith("image/")) {
    throw new Error("Product image must be a supported image file.");
  }

  if (value.size > maxProductImageBytes) {
    throw new Error("Product image must be 2 MB or smaller.");
  }

  return value as ProductImageFile;
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
    case "save-customer":
      return "Customer saved.";
    case "create-agent":
      return "Agent account created.";
    case "promote-customer-to-agent":
      return "Customer promoted to agent.";
    case "update-agent":
      return "Agent updated.";
    case "create-order":
      return "Order created.";
    case "update-order-status":
      return "Order status updated.";
    case "update-order-notes":
      return "Order notes saved.";
    case "mark-order-read":
      return "Order marked as read.";
    case "update-commission":
      return "Commission updated.";
    case "update-agent-order-commission":
      return "Commission updated.";
    case "update-invoice-item-quantity":
      return "Quantity updated.";
    case "add-order-item":
      return "Order product added.";
    case "remove-order-item":
      return "Order product removed.";
    case "update-order-item-quantity":
      return "Quantity updated.";
    case "record-payment":
      return "Payment recorded.";
    case "apply-customer-payment":
      return "Customer payment distributed.";
    case "create-customer-registration-link":
      return "Registration link created and sent to selected agents.";
    case "save-invoice":
      return "Invoice saved.";
    case "update-inquiry":
      return "Inquiry updated.";
    case "mark-inquiry-read":
      return "Inquiry marked as read.";
    case "update-reseller-application":
      return "Reseller application updated.";
    case "mark-reseller-application-read":
      return "Reseller application marked as read.";
    case "mark-admin-notification-read":
      return "Notification marked as read.";
    case "mark-all-admin-notifications-read":
      return "Notifications marked as read.";
  }
}

function getActionRedirectPath(action: AdminAction, fallbackPath: string) {
  if (action.type === "mark-order-read" && action.returnTo) {
    return action.returnTo;
  }

  return fallbackPath;
}

function withActionFeedback(path: string, key: "status" | "error", message: string) {
  const separator = path.includes("?") ? "&" : "?";

  return `${path}${separator}${key}=${encodeURIComponent(message)}`;
}

function getAdminActionFeedbackCleanPath(url: URL) {
  const cleanUrl = new URL(url.href);

  cleanUrl.searchParams.delete("status");
  cleanUrl.searchParams.delete("error");

  return `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`;
}

function normalizeQueryMessage(value: string | null) {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function acceptsJsonResponse(request: Request) {
  return request.headers.get("Accept")?.includes("application/json") ?? false;
}

function toSentenceLabel(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function slugifyFileSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function inferFileExtension(file: ProductImageFile) {
  const nameExtension = file.name.split(".").pop()?.toLowerCase();

  if (nameExtension && /^[a-z0-9]+$/.test(nameExtension)) {
    return nameExtension;
  }

  switch (file.type) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    default:
      return "bin";
  }
}

function createRegistrationToken() {
  return randomBytes(32).toString("base64url");
}

function hashRegistrationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function registrationDurationSeconds(duration: RegistrationLinkDuration) {
  switch (duration) {
    case "30m":
      return 30 * 60;
    case "1h":
      return 60 * 60;
    case "3h":
      return 3 * 60 * 60;
    case "12h":
      return 12 * 60 * 60;
    case "1d":
      return 24 * 60 * 60;
  }
}
