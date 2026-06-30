import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const customerSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(100),
  lastName: z.string().trim().min(1, "Last name is required.").max(100),
  phoneNumber: z.string().trim().min(1, "Phone number is required.").max(50),
  email: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === "" ? undefined : value))
    .pipe(z.email("Email must be valid when provided.").optional()),
  address: z.string().trim().min(1, "Delivery address is required.").max(500),
});

const orderItemSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: z.number().positive("Product quantity must be greater than zero."),
  addDetails: z.string().trim().max(500).optional(),
});

export type GuestOrderPayload = {
  customer: z.infer<typeof customerSchema>;
  items: z.infer<typeof orderItemSchema>[];
};

export type GuestOrderParseResult =
  | {
      success: true;
      data: GuestOrderPayload;
    }
  | {
      success: false;
      errors: string[];
    };

export function parseGuestOrderFormData(formData: FormData): GuestOrderParseResult {
  const customerResult = customerSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phoneNumber: formData.get("phoneNumber"),
    email: formData.get("email"),
    address: formData.get("address"),
  });
  const itemResult = parseOrderItems(formData);
  const errors = [
    ...(customerResult.success ? [] : flattenZodErrors(customerResult.error)),
    ...itemResult.errors,
  ];

  if (!customerResult.success || itemResult.items.length === 0 || errors.length > 0) {
    return {
      success: false,
      errors: itemResult.items.length === 0
        ? [...errors, "Select at least one product quantity."]
        : errors,
    };
  }

  return {
    success: true,
    data: {
      customer: customerResult.data,
      items: itemResult.items,
    },
  };
}

export async function submitGuestOrder(payload: GuestOrderPayload): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("submit_guest_order", {
    customer_payload: payload.customer,
    item_payload: payload.items,
  });

  if (error || typeof data !== "string") {
    throw new Error("Unable to submit guest order");
  }

  return data;
}

function parseOrderItems(formData: FormData) {
  const errors: string[] = [];
  const items = Array.from(formData.entries()).flatMap(([key, rawValue]) => {
    if (!key.startsWith("quantity:")) {
      return [];
    }

    const productId = key.replace("quantity:", "").trim();
    const rawQuantity = String(rawValue ?? "").trim();

    if (rawQuantity === "") {
      return [];
    }

    const quantity = Number(rawQuantity);

    if (!Number.isFinite(quantity)) {
      errors.push("Product quantity must be a number.");
      return [];
    }

    if (quantity < 0) {
      errors.push("Product quantity cannot be negative.");
      return [];
    }

    if (quantity === 0) {
      return [];
    }

    const itemResult = orderItemSchema.safeParse({
      productId,
      quantity,
      addDetails: formData.get(`details:${productId}`) ?? undefined,
    });

    if (!itemResult.success) {
      errors.push(...flattenZodErrors(itemResult.error));
      return [];
    }

    return [itemResult.data];
  });

  return {
    items,
    errors,
  };
}

function flattenZodErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => issue.message);
}
