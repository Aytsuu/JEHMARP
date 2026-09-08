export type PrivacyCollectionPurpose =
  | "guest-order"
  | "contact-inquiry"
  | "reseller-application"
  | "login"
  | "registration";

const PURPOSE_TEXT: Record<PrivacyCollectionPurpose, string> = {
  "guest-order":
    "We collect your contact and order details to process your request, coordinate fulfilment, and send order-related updates.",
  "contact-inquiry":
    "We collect your inquiry details so we can review your message and respond to you.",
  "reseller-application":
    "We collect your application details to assess your reseller request and contact you about the outcome.",
  login:
    "We collect your account credentials and related security data to authenticate authorized access and protect the platform.",
  registration:
    "We collect the registration details you provide so we can create and administer your customer account.",
};

import { isPrivacyNoticePublishable, resolvePrivacyNoticeHref } from "@/lib/platform-settings/privacy-notice";
import { loadPlatformSettings } from "@/lib/platform-settings";
import type { PlatformSettings } from "@/lib/platform-settings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export function getPrivacyCollectionPurposeText(purpose: PrivacyCollectionPurpose) {
  return PURPOSE_TEXT[purpose];
}

export type PrivacyCollectionContext = {
  privacyHref: string | null;
  requireAcknowledgement: boolean;
};

export function getPrivacyCollectionContext(settings: PlatformSettings): PrivacyCollectionContext {
  const publishable = isPrivacyNoticePublishable(settings);
  return {
    privacyHref: resolvePrivacyNoticeHref(settings),
    requireAcknowledgement: publishable,
  };
}

export async function loadPrivacyAcknowledgementRequirement() {
  const settings = await loadPlatformSettings(createSupabaseAdminClient());
  return isPrivacyNoticePublishable(settings);
}
