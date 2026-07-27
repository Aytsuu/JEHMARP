export const PLATFORM_SETTINGS_SINGLETON_ID = "default";

export const notificationEvents = [
  "new_order",
  "reseller_application",
  "contact_inquiry",
  "credit_alert",
] as const;

export type NotificationEvent = (typeof notificationEvents)[number];

export type NotificationRoute = {
  event: NotificationEvent;
  primaryEmail: string;
  secondaryEmail: string;
};

export type BusinessProfileSettings = {
  tradeName: string;
  legalName: string;
  address: string;
  phone: string;
  tin: string;
  logoPath: string | null;
  primaryEmail: string;
  secondaryEmail: string;
};

export type DocumentPaymentSettings = {
  instructions: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  gcashNumber: string;
  mayaNumber: string;
};

export type DefaultsSettings = {
  customerCreditLimit: number;
};

export type DocumentNumberingSettings = {
  invoicePrefix: string;
  invoiceNext: number;
  orderSlipPrefix: string;
  orderSlipNext: number;
};

export type NotificationsSettings = {
  routes: NotificationRoute[];
};

export type PlatformSettings = {
  businessProfile: BusinessProfileSettings;
  documentPayment: DocumentPaymentSettings;
  defaults: DefaultsSettings;
  notifications: NotificationsSettings;
  documentNumbering: DocumentNumberingSettings;
};

export type PlatformSettingsPatch = {
  businessProfile?: Partial<BusinessProfileSettings>;
  documentPayment?: Partial<DocumentPaymentSettings>;
  defaults?: Partial<DefaultsSettings>;
  notifications?: Partial<NotificationsSettings>;
  documentNumbering?: Partial<DocumentNumberingSettings>;
};

export type DocumentLayoutOptions = {
  businessProfile?: BusinessProfileSettings;
  documentPayment?: DocumentPaymentSettings;
};
