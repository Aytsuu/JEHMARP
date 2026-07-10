import type { APIContext } from "astro";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadAgentDashboardData } from "./data";

const uuidSchema = z.uuid();

type AgentDashboardContext = Pick<APIContext, "cookies" | "request" | "redirect">;
type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

type AgentOrderItemPayload = {
  productId: string;
  quantity: number;
  addDetails: string | null;
};

type NewAgentCustomerPayload = {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string | null;
  address: string;
};

export type AgentAction =
  | {
      type: "create-agent-order";
      agentId: string;
      payload: {
        customer:
          | {
              type: "existing";
              customerId: string;
            }
          | {
              type: "new";
              payload: NewAgentCustomerPayload;
            };
        items: AgentOrderItemPayload[];
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
  assignedCustomerIds: ReadonlySet<string>,
): AgentActionParseResult {
  try {
    const action = requiredString(formData, "action");

    if (action !== "create-agent-order") {
      throw new Error("Unknown agent action.");
    }

    const customer = parseOrderCustomer(formData, assignedCustomerIds);

    return {
      success: true,
      action: {
        type: "create-agent-order",
        agentId,
        payload: {
          customer,
          items: parseOrderItems(formData),
        },
      },
    };
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
      const customer = action.payload.customer;
      const { data, error } = await supabase.rpc("submit_agent_order", {
        target_customer_id: customer.type === "existing" ? customer.customerId : null,
        item_payload: action.payload.items,
        customer_payload: customer.type === "new" ? customer.payload : null,
      });

      if (error || typeof data !== "string") {
        throw new Error("Unable to submit agent order.");
      }

      return;
    }
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

function parseOrderCustomer(
  formData: FormData,
  assignedCustomerIds: ReadonlySet<string>,
): AgentAction["payload"]["customer"] {
  const selectedCustomerId = optionalString(formData, "customerId");

  if (selectedCustomerId) {
    const customerId = uuidSchema.parse(selectedCustomerId);

    if (!assignedCustomerIds.has(customerId)) {
      throw new Error("Selected customer is not assigned to this agent.");
    }

    return {
      type: "existing",
      customerId,
    };
  }

  return {
    type: "new",
    payload: {
      firstName: requiredString(formData, "firstName"),
      lastName: requiredString(formData, "lastName"),
      phoneNumber: requiredString(formData, "phoneNumber"),
      email: optionalEmail(formData, "email"),
      address: requiredString(formData, "address"),
    },
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

function optionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  return value.length > 0 ? value : null;
}

function optionalEmail(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  return value ? z.email().parse(value) : null;
}

function normalizeFormDataEntry(value: FormDataEntryValue | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function getActionSuccessMessage(action: AgentAction) {
  switch (action.type) {
    case "create-agent-order":
      return "Order submitted.";
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
