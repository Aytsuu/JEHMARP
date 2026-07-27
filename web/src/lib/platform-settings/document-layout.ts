import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { DocumentLayoutOptions } from "@/lib/order-documents/layout";
import { loadPlatformSettings, type PlatformSettings } from "./index";

export function toDocumentLayoutOptions(settings: PlatformSettings): DocumentLayoutOptions {
  return {
    businessProfile: settings.businessProfile,
    documentPayment: settings.documentPayment,
  };
}

export async function loadDocumentLayoutOptions(
  supabase: ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient(),
): Promise<DocumentLayoutOptions> {
  return toDocumentLayoutOptions(await loadPlatformSettings(supabase));
}
