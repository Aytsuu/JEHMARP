import type { APIContext } from "astro";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadAgentDashboardData } from "./data";

const uuidSchema = z.uuid();
const agentOrderSubmissionModes = ["distribution", "personal"] as const;
const paymentMethods = ["Cash", "Check"] as const;
const paymentTermsOptions = ["Cash on Delivery (COD)", "Bank Transfer", "Gcash"] as const;

type AgentDashboardContext = Pick<APIContext, "cookies" | "request" | "redirect">;
type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;
type AgentOrderSubmissionMode = (typeof agentOrderSubmissionModes)[number];

type AgentOrderItemPayload = {
  productId: string;
  quantity: number;
  addDetails: string | null;
};

export type AgentAction =
  | {
      type: "create-agent-order";
      agentId: string;
      payload: {
        mode: AgentOrderSubmissionMode;
        releaseDate: string | null;
        items: AgentOrderItemPayload[];
      };
    }
  | {
      type: "record-agent-payment";
      agentId: string;
      payload: {
        orderId: string;
        amount: number;
        paymentMethod: string;
        paymentTerms: string;
        paymentDate: string;
        referenceNumber: string | null;
        notes: string | null;
      };
    }
  | {
      type: "record-agent-payment-distribution";
      agentId: string;
      payload: {
        orderIds: string[];
        amount: number;
        paymentMethod: string;
        paymentTerms: string;
        paymentDate: string;
        referenceNumber: string | null;
        notes: string | null;
      };
    };

type ParseSuccess = {
  success: true;
  action: AgentAction;
};

type ParseFailure = {
  success: false;
  errors: string[];
};

export type AgentActionParseResult = ParseSuccess | ParseFailure;

export function parseAgentActionFormData(
  formData: FormData,
  _agentUserId: string,
  agentId: string,
  _assignedCustomerIds: ReadonlySet<string>,
): AgentActionParseResult {
  void _assignedCustomerIds;

  try {
    const action = requiredString(formData, "action");

    if (action === "create-agent-order") {
      return {
        success: true,
        action: {
          type: "create-agent-order",
          agentId,
          payload: {
            mode: enumValue(formData, "orderSubmissionMode", agentOrderSubmissionModes),
            releaseDate: optionalDateString(formData, "releaseDate"),
            items: parseOrderItems(formData),
          },
        },
      };
    }

    if (action === "record-agent-payment") {
      return {
        success: true,
        action: {
          type: "record-agent-payment",
          agentId,
          payload: {
            orderId: uuidSchema.parse(requiredString(formData, "orderId")),
            amount: positiveNumber(formData, "amount"),
            paymentMethod: enumValue(formData, "paymentMethod", paymentMethods),
            paymentTerms: enumValue(formData, "paymentTerms", paymentTermsOptions),
            paymentDate: dateString(formData, "paymentDate"),
            referenceNumber: optionalString(formData, "referenceNumber"),
            notes: optionalString(formData, "notes"),
          },
        },
      };
    }

    if (action === "record-agent-payment-distribution") {
      return {
        success: true,
        action: {
          type: "record-agent-payment-distribution",
          agentId,
          payload: {
            orderIds: requiredUuidList(formData, "orderId", "At least one customer order is required."),
            amount: positiveNumber(formData, "amount"),
            paymentMethod: enumValue(formData, "paymentMethod", paymentMethods),
            paymentTerms: enumValue(formData, "paymentTerms", paymentTermsOptions),
            paymentDate: dateString(formData, "paymentDate"),
            referenceNumber: optionalString(formData, "referenceNumber"),
            notes: optionalString(formData, "notes"),
          },
        },
      };
    }

    throw new Error("Unknown agent action.");
  } catch (error) {
    return {
      success: false,
      errors: error instanceof z.ZodError
        ? error.issues.map((issue) => issue.message)
        : [error instanceof Error ? error.message : "Unable to parse agent action."],
    };
  }
}

export async function handleAgentDashboardAction(
  context: AgentDashboardContext,
  agentUserId: string,
  returnPath = "/agent",
) {
  const [formData, dashboardData] = await Promise.all([
    context.request.formData(),
    loadAgentDashboardData(context, agentUserId),
  ]);
  const assignedCustomerIds = new Set(dashboardData.customers.map((customer) => customer.id));
  const parsed = parseAgentActionFormData(
    formData,
    agentUserId,
    dashboardData.agent.id,
    assignedCustomerIds,
  );

  if (!parsed.success) {
    return context.redirect(`${returnPath}?error=${encodeURIComponent(parsed.errors.join(" "))}`, 303);
  }

  try {
    await executeAgentAction(createSupabaseServerClient(context), parsed.action);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent action failed.";
    return context.redirect(`${returnPath}?error=${encodeURIComponent(message)}`, 303);
  }

  return context.redirect(`${returnPath}?status=${encodeURIComponent(getActionSuccessMessage(parsed.action))}`, 303);
}

export async function executeAgentAction(
  supabase: SupabaseServerClient,
  action: AgentAction,
): Promise<void> {
  switch (action.type) {
    case "create-agent-order": {
      const { data, error } = await supabase.rpc("submit_agent_order", {
        target_customer_id: null,
        item_payload: action.payload.items,
        customer_payload: getAgentOrderCustomerPayload(
          action.payload.mode,
          action.payload.releaseDate,
        ),
      });

      if (error || typeof data !== "string") {
        throw new Error("Unable to submit agent order.");
      }

      return;
    }
    case "record-agent-payment": {
      const { data, error } = await supabase.rpc("submit_agent_received_payment", {
        target_order_id: action.payload.orderId,
        payment_amount: action.payload.amount,
        payment_method_value: action.payload.paymentMethod,
        payment_terms_value: action.payload.paymentTerms,
        payment_date_value: action.payload.paymentDate,
        reference_number_value: action.payload.referenceNumber,
        notes_value: action.payload.notes,
      });

      if (error || typeof data !== "string") {
        throw new Error("Unable to record received payment.");
      }

      return;
    }
    case "record-agent-payment-distribution": {
      const { data, error } = await supabase.rpc("submit_agent_received_payment_distribution", {
        target_order_ids: action.payload.orderIds,
        payment_amount: action.payload.amount,
        payment_method_value: action.payload.paymentMethod,
        payment_terms_value: action.payload.paymentTerms,
        payment_date_value: action.payload.paymentDate,
        reference_number_value: action.payload.referenceNumber,
        notes_value: action.payload.notes,
      });

      if (error || !Array.isArray(data)) {
        throw new Error("Unable to distribute received payment.");
      }

      return;
    }
  }
}

function getAgentOrderCustomerPayload(
  mode: AgentOrderSubmissionMode,
  releaseDate: string | null,
) {
  switch (mode) {
    case "distribution":
      return releaseDate
        ? {
            releaseDate,
          }
        : null;
    case "personal":
      return {
        orderFor: "personal",
        releaseDate,
      };
  }
}

export function formatAgentActionFeedback(url: URL) {
  return {
    status: normalizeQueryMessage(url.searchParams.get("status")),
    error: normalizeQueryMessage(url.searchParams.get("error")),
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
    productId: uuidSchema.parse(productId),
    quantity,
    addDetails: addDetails || null,
  };
}

function requiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  if (!value) {
    throw new Error(`${toSentenceLabel(key)} is required.`);
  }

  return value;
}

function requiredUuidList(formData: FormData, key: string, emptyMessage: string) {
  const values = formData
    .getAll(key)
    .map((value) => normalizeFormDataEntry(value))
    .filter((value) => value.length > 0);

  if (values.length === 0) {
    throw new Error(emptyMessage);
  }

  return [...new Set(values.map((value) => uuidSchema.parse(value)))];
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

function optionalDateString(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${toSentenceLabel(key)} must be a date.`);
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

function positiveNumber(formData: FormData, key: string) {
  const value = Number(requiredString(formData, key));

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${toSentenceLabel(key)} must be greater than zero.`);
  }

  return value;
}

function optionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  return value.length > 0 ? value : null;
}

function normalizeFormDataEntry(value: FormDataEntryValue | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function getActionSuccessMessage(action: AgentAction) {
  switch (action.type) {
    case "create-agent-order":
      return "Order submitted.";
    case "record-agent-payment":
      return "Payment recorded for admin confirmation.";
    case "record-agent-payment-distribution":
      return "Payments recorded for admin confirmation.";
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
