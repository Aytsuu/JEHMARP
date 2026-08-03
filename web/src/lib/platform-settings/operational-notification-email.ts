import { getServerEnv } from "@/lib/env";
import { resolveTransactionalEmailFrom } from "@/lib/public-website/transactional-email";
import type { NotificationEvent } from "./types";
import { resolveNotificationEmails } from "./notifications";

export async function sendOperationalNotificationEmail(input: {
  event: NotificationEvent;
  subject: string;
  html: string;
  text: string;
  recipients: string[];
  fetch?: typeof fetch;
}): Promise<"sent" | "failed" | "skipped"> {
  const env = getServerEnv();
  const recipients = [...new Set(input.recipients.map((email) => email.trim()).filter(Boolean))];
  if (!env.resendApiKey || recipients.length === 0) return "skipped";

  const fetcher = input.fetch ?? fetch;
  const from = resolveTransactionalEmailFrom({
    resellerPriceListFrom: env.resellerPriceListFrom,
  }) ?? "notifications@jehmarp.local";
  const response = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: recipients, subject: input.subject, html: input.html, text: input.text }),
  });
  return response.ok ? "sent" : "failed";
}

export function resolveOperationalNotificationRecipients(
  event: NotificationEvent,
  settings: Parameters<typeof resolveNotificationEmails>[1],
  fallbacks: Parameters<typeof resolveNotificationEmails>[2] = {},
) {
  return resolveNotificationEmails(event, settings, fallbacks);
}
