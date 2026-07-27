import type { NotificationEvent, PlatformSettings } from "./types";

export type NotificationEmailFallbacks = Partial<Record<NotificationEvent, string | undefined>>;

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEvent, string> = {
  new_order: "New / pending orders",
  reseller_application: "Reseller applications",
  contact_inquiry: "Contact inquiries",
  credit_alert: "Unpaid / credit alerts",
};

export function resolveNotificationEmails(
  event: NotificationEvent,
  settings: PlatformSettings,
  fallbacks: NotificationEmailFallbacks = {},
): string[] {
  const profileEmails = [
    settings.businessProfile.primaryEmail.trim(),
    settings.businessProfile.secondaryEmail.trim(),
  ].filter(Boolean);

  if (profileEmails.length > 0) {
    return [...new Set(profileEmails)];
  }

  const route = settings.notifications.routes.find((entry) => entry.event === event);
  const routeEmails = [
    route?.primaryEmail?.trim(),
    route?.secondaryEmail?.trim(),
  ].filter((value): value is string => Boolean(value));

  if (routeEmails.length > 0) {
    return [...new Set(routeEmails)];
  }

  const fallback = fallbacks[event]?.trim();
  return fallback ? [fallback] : [];
}

export function resolvePrimaryNotificationEmail(
  event: NotificationEvent,
  settings: PlatformSettings,
  fallback?: string,
): string | undefined {
  return resolveNotificationEmails(event, settings, { [event]: fallback })[0];
}
