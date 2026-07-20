import { z } from "zod";

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
