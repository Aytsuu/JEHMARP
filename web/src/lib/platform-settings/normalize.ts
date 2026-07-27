import {
  DEFAULT_BUSINESS_PROFILE,
  DEFAULT_DEFAULTS,
  DEFAULT_DOCUMENT_NUMBERING,
  DEFAULT_DOCUMENT_PAYMENT,
  DEFAULT_NOTIFICATION_ROUTES,
} from "./defaults";
import type {
  BusinessProfileSettings,
  DefaultsSettings,
  DocumentNumberingSettings,
  DocumentPaymentSettings,
  NotificationEvent,
  NotificationRoute,
  NotificationsSettings,
  PlatformSettings,
  PlatformSettingsPatch,
} from "./types";
import { notificationEvents } from "./types";

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeNullableString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeNonNegativeNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Math.floor(normalizeNonNegativeNumber(value, fallback));
  return parsed < 1 ? fallback : parsed;
}

function normalizeNotificationRoute(value: unknown, fallbackEvent: NotificationEvent): NotificationRoute {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { event: fallbackEvent, primaryEmail: "", secondaryEmail: "" };
  }
  const record = value as Record<string, unknown>;
  const event = typeof record.event === "string" && (notificationEvents as readonly string[]).includes(record.event)
    ? record.event as NotificationEvent
    : fallbackEvent;
  return {
    event,
    primaryEmail: normalizeString(record.primaryEmail),
    secondaryEmail: normalizeString(record.secondaryEmail),
  };
}

export function normalizeBusinessProfile(value: unknown): BusinessProfileSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_BUSINESS_PROFILE };
  }
  const record = value as Record<string, unknown>;
  return {
    tradeName: normalizeString(record.tradeName, DEFAULT_BUSINESS_PROFILE.tradeName),
    legalName: normalizeString(record.legalName),
    address: normalizeString(record.address, DEFAULT_BUSINESS_PROFILE.address),
    phone: normalizeString(record.phone, DEFAULT_BUSINESS_PROFILE.phone),
    tin: normalizeString(record.tin),
    logoPath: normalizeNullableString(record.logoPath),
  };
}

export function normalizeDocumentPayment(value: unknown): DocumentPaymentSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_DOCUMENT_PAYMENT };
  }
  const record = value as Record<string, unknown>;
  return {
    instructions: normalizeString(record.instructions).slice(0, 2000),
    bankName: normalizeString(record.bankName).slice(0, 120),
    accountName: normalizeString(record.accountName).slice(0, 120),
    accountNumber: normalizeString(record.accountNumber).slice(0, 80),
    gcashNumber: normalizeString(record.gcashNumber).slice(0, 40),
    mayaNumber: normalizeString(record.mayaNumber).slice(0, 40),
  };
}

export function normalizeDefaults(value: unknown): DefaultsSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_DEFAULTS };
  }
  const record = value as Record<string, unknown>;
  return {
    customerCreditLimit: normalizeNonNegativeNumber(record.customerCreditLimit, DEFAULT_DEFAULTS.customerCreditLimit),
  };
}

export function normalizeNotifications(value: unknown): NotificationsSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { routes: DEFAULT_NOTIFICATION_ROUTES.map((route) => ({ ...route })) };
  }
  const record = value as Record<string, unknown>;
  const incomingRoutes = Array.isArray(record.routes) ? record.routes : [];
  const routesByEvent = new Map<NotificationEvent, NotificationRoute>();
  for (const [index, event] of notificationEvents.entries()) {
    routesByEvent.set(event, normalizeNotificationRoute(incomingRoutes[index], event));
  }
  for (const routeValue of incomingRoutes) {
    const normalized = normalizeNotificationRoute(routeValue, "new_order");
    routesByEvent.set(normalized.event, normalized);
  }
  return {
    routes: notificationEvents.map((event) => routesByEvent.get(event) ?? {
      event, primaryEmail: "", secondaryEmail: "",
    }),
  };
}

export function normalizeDocumentNumbering(value: unknown): DocumentNumberingSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_DOCUMENT_NUMBERING };
  }
  const record = value as Record<string, unknown>;
  return {
    invoicePrefix: normalizeString(record.invoicePrefix, DEFAULT_DOCUMENT_NUMBERING.invoicePrefix).slice(0, 20),
    invoiceNext: normalizePositiveInteger(record.invoiceNext, DEFAULT_DOCUMENT_NUMBERING.invoiceNext),
    orderSlipPrefix: normalizeString(record.orderSlipPrefix, DEFAULT_DOCUMENT_NUMBERING.orderSlipPrefix).slice(0, 20),
    orderSlipNext: normalizePositiveInteger(record.orderSlipNext, DEFAULT_DOCUMENT_NUMBERING.orderSlipNext),
  };
}

export function normalizePlatformSettings(value: unknown): PlatformSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      businessProfile: { ...DEFAULT_BUSINESS_PROFILE },
      documentPayment: { ...DEFAULT_DOCUMENT_PAYMENT },
      defaults: { ...DEFAULT_DEFAULTS },
      notifications: normalizeNotifications(null),
      documentNumbering: { ...DEFAULT_DOCUMENT_NUMBERING },
    };
  }
  const record = value as Record<string, unknown>;
  return {
    businessProfile: normalizeBusinessProfile(record.businessProfile),
    documentPayment: normalizeDocumentPayment(record.documentPayment),
    defaults: normalizeDefaults(record.defaults),
    notifications: normalizeNotifications(record.notifications),
    documentNumbering: normalizeDocumentNumbering(record.documentNumbering),
  };
}

export function mergePlatformSettings(current: PlatformSettings, patch: PlatformSettingsPatch): PlatformSettings {
  return {
    businessProfile: patch.businessProfile
      ? normalizeBusinessProfile({ ...current.businessProfile, ...patch.businessProfile })
      : current.businessProfile,
    documentPayment: patch.documentPayment
      ? normalizeDocumentPayment({ ...current.documentPayment, ...patch.documentPayment })
      : current.documentPayment,
    defaults: patch.defaults
      ? normalizeDefaults({ ...current.defaults, ...patch.defaults })
      : current.defaults,
    notifications: patch.notifications
      ? normalizeNotifications({ ...current.notifications, ...patch.notifications, routes: patch.notifications.routes ?? current.notifications.routes })
      : current.notifications,
    documentNumbering: patch.documentNumbering
      ? normalizeDocumentNumbering({ ...current.documentNumbering, ...patch.documentNumbering })
      : current.documentNumbering,
  };
}
