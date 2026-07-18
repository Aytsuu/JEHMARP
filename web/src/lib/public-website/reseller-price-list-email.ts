import {
  type ResellerProduct,
  type StoredResellerApplication,
  sendResellerPriceList,
} from "../../../../supabase/functions/reseller-application/workflow";
import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ResellerApplicationRow = {
  id: string;
  name: string;
  email: string;
  address: string;
  planned_transaction_type: StoredResellerApplication["plannedTransactionType"];
  expected_quantity_per_week: string;
  contact_number: string;
  message: string | null;
};

type ResellerPriceListEmailOptions = {
  fetch?: typeof fetch;
  supabase?: ReturnType<typeof createSupabaseAdminClient>;
};

export async function deliverResellerPriceListEmailIfConfigured(
  applicationId: string,
  options: ResellerPriceListEmailOptions = {},
): Promise<"sent" | "failed" | "skipped"> {
  const env = getServerEnv();

  if (!env.resendApiKey || !env.resellerPriceListFrom) {
    return "skipped";
  }

  const supabase = options.supabase ?? createSupabaseAdminClient();
  const fetcher = options.fetch ?? fetch;
  const application = await loadResellerApplication(supabase, applicationId);

  if (!application) {
    throw new Error("Reseller application was not found.");
  }

  const products = await loadActiveResellerProducts(supabase);
  const emailResult = await sendResellerPriceList(
    fetcher,
    {
      apiKey: env.resendApiKey,
      from: env.resellerPriceListFrom,
      adminEmail: env.resellerAdminEmail,
    },
    application,
    products,
  );

  await updateResellerApplicationEmailStatus(supabase, applicationId, emailResult);

  return emailResult.status === "sent" ? "sent" : "failed";
}

async function loadResellerApplication(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  applicationId: string,
): Promise<StoredResellerApplication | null> {
  const { data, error } = await supabase
    .from("reseller_application")
    .select(
      "id, name, email, address, planned_transaction_type, expected_quantity_per_week, contact_number, message",
    )
    .eq("id", applicationId)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to load reseller application.");
  }

  if (!data) {
    return null;
  }

  const row = data as ResellerApplicationRow;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    address: row.address,
    plannedTransactionType: row.planned_transaction_type,
    expectedQuantityPerWeek: row.expected_quantity_per_week,
    contactNumber: row.contact_number,
    message: row.message ?? undefined,
  };
}

async function loadActiveResellerProducts(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
): Promise<ResellerProduct[]> {
  const { data, error } = await supabase
    .from("product")
    .select("name, category, unit_label, default_price, reseller_price")
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error("Unable to load reseller products.");
  }

  return (data ?? []) as ResellerProduct[];
}

async function updateResellerApplicationEmailStatus(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  applicationId: string,
  result: { status: "sent" } | { status: "failed"; error: string },
): Promise<void> {
  const payload = result.status === "sent"
    ? {
        email_delivery_status: "sent",
        price_list_sent_at: new Date().toISOString(),
        email_error: null,
      }
    : {
        email_delivery_status: "failed",
        email_error: result.error,
      };

  const { error } = await supabase
    .from("reseller_application")
    .update(payload)
    .eq("id", applicationId);

  if (error) {
    throw new Error("Unable to update reseller application email status.");
  }
}
