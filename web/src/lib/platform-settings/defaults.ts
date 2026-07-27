import type {
  BusinessProfileSettings,
  DefaultsSettings,
  DocumentNumberingSettings,
  DocumentPaymentSettings,
  NotificationRoute,
  PlatformSettings,
} from "./types";
import { notificationEvents } from "./types";
import {
  DEFAULT_CONTACT_DETAILS_EMAIL,
  DEFAULT_CONTACT_DETAILS_PHONE,
} from "./contact-sync";

export const DEFAULT_BRAND_LINES = [
  "Meat and Poultry Products",
  "Brgy. Tolo-Tolo Consolacion, Cebu",
  "Cell #: 0917 777 0118 | 0932 215 9289",
] as const;

export const DEFAULT_CUSTOMER_CREDIT_LIMIT = 1000;

export const DEFAULT_BUSINESS_PROFILE: BusinessProfileSettings = {
  tradeName: DEFAULT_BRAND_LINES[0],
  legalName: "",
  address: DEFAULT_BRAND_LINES[1],
  phone: DEFAULT_CONTACT_DETAILS_PHONE,
  tin: "",
  logoPath: null,
  primaryEmail: DEFAULT_CONTACT_DETAILS_EMAIL,
  secondaryEmail: "",
};

export const DEFAULT_DOCUMENT_PAYMENT: DocumentPaymentSettings = {
  instructions: "",
  bankName: "",
  accountName: "",
  accountNumber: "",
  gcashNumber: "",
  mayaNumber: "",
};

export const DEFAULT_DEFAULTS: DefaultsSettings = {
  customerCreditLimit: DEFAULT_CUSTOMER_CREDIT_LIMIT,
};

export const DEFAULT_NOTIFICATION_ROUTES: NotificationRoute[] = notificationEvents.map((event) => ({
  event,
  primaryEmail: "",
  secondaryEmail: "",
}));

export const DEFAULT_DOCUMENT_NUMBERING: DocumentNumberingSettings = {
  invoicePrefix: "INV-",
  invoiceNext: 1,
  orderSlipPrefix: "OS-",
  orderSlipNext: 1,
};

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  businessProfile: { ...DEFAULT_BUSINESS_PROFILE },
  documentPayment: { ...DEFAULT_DOCUMENT_PAYMENT },
  defaults: { ...DEFAULT_DEFAULTS },
  notifications: {
    routes: DEFAULT_NOTIFICATION_ROUTES.map((route) => ({ ...route })),
  },
  documentNumbering: { ...DEFAULT_DOCUMENT_NUMBERING },
};
