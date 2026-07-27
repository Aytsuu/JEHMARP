import { invalidatePublicPageContentCacheForPage } from "@/lib/public-website/content";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const DEFAULT_CONTACT_DETAILS_EMAIL = "jehmarp2020@gmail.com";
export const DEFAULT_CONTACT_DETAILS_PHONE = "09322159289 | 09177770118";

export const CONTACT_DETAILS_LOCKED_FIELDS = ["email", "phone"] as const;

const CONTACT_PAGE_SLUG = "contact";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export function isLockedContactDetailsField(fieldKey: string) {
  return (CONTACT_DETAILS_LOCKED_FIELDS as readonly string[]).includes(fieldKey);
}

export async function syncContactDetailsFromBusinessProfile(
  adminClient: SupabaseAdminClient,
  input: { phone: string; primaryEmail: string },
) {
  const { data: page, error: pageError } = await adminClient
    .from("page")
    .select("id")
    .eq("slug", CONTACT_PAGE_SLUG)
    .maybeSingle();

  if (pageError || !page?.id) {
    return;
  }

  const { data: section, error: sectionError } = await adminClient
    .from("page_section")
    .select("id, content")
    .eq("page_id", page.id)
    .eq("type", "contact_details")
    .maybeSingle();

  if (sectionError || !section?.id) {
    return;
  }

  const existingContent =
    section.content && typeof section.content === "object" && !Array.isArray(section.content)
      ? (section.content as Record<string, unknown>)
      : {};

  const content = {
    ...existingContent,
    email: input.primaryEmail,
    phone: input.phone,
  };

  const { error: updateError } = await adminClient
    .from("page_section")
    .update({
      content,
      updated_at: new Date().toISOString(),
    })
    .eq("id", section.id);

  if (updateError) {
    throw new Error("Unable to sync contact page details from platform settings.");
  }

  await invalidatePublicPageContentCacheForPage(page.id);
}
