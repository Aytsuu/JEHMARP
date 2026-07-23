import { z } from "zod";

import { releaseSchedulePartsFromIso } from "@/lib/datetime";
import { canAttachCustomerToAgentOrder } from "@/lib/agent-order-distribution";
import type { SupabaseClient } from "@supabase/supabase-js";

const uuidSchema = z.uuid();

export type AgentOrderAttachItemPayload = {
  productId: string;
  quantity: number;
  addDetails: string | null;
};

export type AgentOrderAttachCustomerPayload =
  | {
      type: "existing";
      customerId: string;
    }
  | {
      type: "new";
      payload: {
        firstName: string;
        lastName: string;
        phoneNumber: string;
        email: string | null;
        address: string;
      };
    };

export type AgentOrderAttachEntry = {
  customer: AgentOrderAttachCustomerPayload;
  items: AgentOrderAttachItemPayload[];
};

const attachCustomerItemSchema = z.object({
  productId: uuidSchema,
  quantity: z.number().positive("Order item quantity must be greater than zero."),
  addDetails: z.string().nullable(),
});

const attachCustomerEntryInputSchema = z.object({
  customerId: uuidSchema.nullable(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phoneNumber: z.string().optional(),
  email: z.string().email().nullable().optional(),
  address: z.string().optional(),
  items: z.array(attachCustomerItemSchema).min(1, "At least one order item is required."),
});

const attachCustomerEntriesSchema = z
  .array(attachCustomerEntryInputSchema)
  .min(1, "At least one customer order is required.");

export function parseAttachCustomerEntriesJson(
  raw: string,
  options?: {
    assignedCustomerIds?: ReadonlySet<string>;
  },
): AgentOrderAttachEntry[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Customer order payload is invalid.");
  }

  const entries = attachCustomerEntriesSchema.parse(parsed);

  return entries.map((entry) => {
    if (entry.customerId) {
      if (
        options?.assignedCustomerIds &&
        !options.assignedCustomerIds.has(entry.customerId)
      ) {
        throw new Error("Selected customer is not assigned to this agent.");
      }

      return {
        customer: {
          type: "existing" as const,
          customerId: entry.customerId,
        },
        items: entry.items,
      };
    }

    const firstName = requiredEntryField(entry.firstName, "First name is required.");
    const lastName = requiredEntryField(entry.lastName, "Last name is required.");
    const phoneNumber = requiredEntryField(entry.phoneNumber, "Phone number is required.");
    const address = requiredEntryField(entry.address, "Address is required.");

    return {
      customer: {
        type: "new" as const,
        payload: {
          firstName,
          lastName,
          phoneNumber,
          email: entry.email ?? null,
          address,
        },
      },
      items: entry.items,
    };
  });
}

function requiredEntryField(value: string | undefined, message: string) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}

type SupabaseServerClient = Pick<SupabaseClient, "from">;

export async function assertAgentOrderAllowsCustomerAttach(
  supabase: SupabaseServerClient,
  agentOrderId: string,
) {
  const { data: agentOrder, error: agentOrderError } = await supabase
    .from("order")
    .select("order_status, release_date")
    .eq("id", agentOrderId)
    .eq("order_kind", "distribution")
    .maybeSingle();

  if (agentOrderError) {
    throw new Error("Unable to verify agent order status before attaching a customer.", {
      cause: agentOrderError,
    });
  }

  if (!agentOrder) {
    throw new Error("Agent order was not found.");
  }

  const { data: customerOrders, error: customerOrdersError } = await supabase
    .from("order")
    .select("payment_status")
    .in("order_kind", ["customer", "personal"])
    .eq("parent_order_id", agentOrderId)
    .is("converted_at", null);

  if (customerOrdersError) {
    throw new Error("Unable to verify linked customer order payment statuses before attaching a customer.", {
      cause: customerOrdersError,
    });
  }

  if (!canAttachCustomerToAgentOrder({
    order_status: String(agentOrder.order_status),
    customer_order: (customerOrders ?? []).map((order) => ({
      payment_status: String((order as { payment_status?: unknown }).payment_status ?? "unpaid"),
    })),
  })) {
    throw new Error("Completed and paid agent orders cannot accept new customers.");
  }

  if (!agentOrder.release_date) {
    throw new Error("Agent order release schedule is required before attaching customer orders.");
  }

  return releaseSchedulePartsFromIso(String(agentOrder.release_date));
}
