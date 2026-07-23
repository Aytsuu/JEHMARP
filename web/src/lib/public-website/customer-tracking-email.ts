import { getServerEnv } from "@/lib/env";

export type CustomerTrackingEmailContext = {
  recipientName: string;
  trackingNumber: string;
  trackPageUrl: string;
  includeOrderSubmittedNote?: boolean;
};

export type CustomerTrackingEmailResult =
  | { status: "sent" }
  | { status: "failed"; error: string }
  | { status: "skipped" };

export async function sendCustomerTrackingNumberEmail(
  to: string,
  context: CustomerTrackingEmailContext,
  options: { fetch?: typeof fetch } = {},
): Promise<CustomerTrackingEmailResult> {
  const env = getServerEnv();
  const from = env.resellerPriceListFrom;

  if (!env.resendApiKey || !from) {
    return { status: "skipped" };
  }

  const fetcher = options.fetch ?? fetch;
  const response = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Your JEHMARP customer tracking number",
      html: buildTrackingEmailHtml(context),
      text: buildTrackingEmailText(context),
    }),
  });

  if (!response.ok) {
    const providerError = await response.text().catch(() => "");

    return {
      status: "failed",
      error: providerError.trim() || "Email delivery failed.",
    };
  }

  return { status: "sent" };
}

function buildTrackingEmailHtml(context: CustomerTrackingEmailContext): string {
  const intro = context.includeOrderSubmittedNote
    ? "<p>Thank you for your order. Use the tracking number below to check your order status without creating an account.</p>"
    : "<p>Your JEHMARP customer registration is complete. Use the tracking number below to check your orders without creating an account.</p>";

  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <p>Hello ${escapeHtml(context.recipientName)},</p>
      ${intro}
      <p style="font-size: 1.25rem; font-weight: 700; letter-spacing: 0.08em;">${escapeHtml(context.trackingNumber)}</p>
      <p>Track your orders here: <a href="${escapeHtml(context.trackPageUrl)}">${escapeHtml(context.trackPageUrl)}</a></p>
      <p>Please save this tracking number now. You will need it to view your order status.</p>
    </div>
  `.trim();
}

function buildTrackingEmailText(context: CustomerTrackingEmailContext): string {
  const intro = context.includeOrderSubmittedNote
    ? "Thank you for your order. Use the tracking number below to check your order status without creating an account."
    : "Your JEHMARP customer registration is complete. Use the tracking number below to check your orders without creating an account.";

  return [
    `Hello ${context.recipientName},`,
    "",
    intro,
    "",
    context.trackingNumber,
    "",
    `Track your orders here: ${context.trackPageUrl}`,
    "",
    "Please save this tracking number now. You will need it to view your order status.",
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
