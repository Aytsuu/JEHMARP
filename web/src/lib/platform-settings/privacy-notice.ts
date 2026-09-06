import { DEFAULT_PRIVACY_NOTICE } from "./defaults";
import type { PlatformSettings, PrivacyNoticeSettings } from "./types";

export const PRIVACY_NOTICE_ACK_FIELD = "privacyNoticeAcknowledged";
export const PRIVACY_NOTICE_PATH = "/privacy";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeEmail(value: unknown) {
  const trimmed = normalizeString(value).toLowerCase();
  if (!trimmed) {
    return "";
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : "";
}

function normalizeRetentionText(value: unknown) {
  return normalizeString(value).slice(0, 500);
}

function normalizeEffectiveDate(value: unknown) {
  const normalized = normalizeString(value);
  if (!ISO_DATE_PATTERN.test(normalized)) {
    return "";
  }

  const [year, month, day] = normalized.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return "";
  }

  return normalized;
}

export function normalizePrivacyNotice(value: unknown): PrivacyNoticeSettings {
  const parsed = (() => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {
        controllerLegalName: "",
        philippineBusinessAddress: "",
        privacyContactEmail: "",
        noticeVersion: "",
        effectiveDate: "",
        retentionInquiries: "",
        retentionResellerApplications: "",
        retentionOrders: "",
        retentionAccounts: "",
        retentionSecurityLogs: "",
        retentionBackups: "",
      };
    }

    const record = value as Record<string, unknown>;
    return {
      controllerLegalName: normalizeString(record.controllerLegalName).slice(0, 200),
      philippineBusinessAddress: normalizeString(record.philippineBusinessAddress).slice(0, 500),
      privacyContactEmail: normalizeEmail(record.privacyContactEmail),
      noticeVersion: normalizeString(record.noticeVersion).slice(0, 40),
      effectiveDate: normalizeEffectiveDate(record.effectiveDate),
      retentionInquiries: normalizeRetentionText(record.retentionInquiries),
      retentionResellerApplications: normalizeRetentionText(record.retentionResellerApplications),
      retentionOrders: normalizeRetentionText(record.retentionOrders),
      retentionAccounts: normalizeRetentionText(record.retentionAccounts),
      retentionSecurityLogs: normalizeRetentionText(record.retentionSecurityLogs),
      retentionBackups: normalizeRetentionText(record.retentionBackups),
    };
  })();

  return {
    controllerLegalName: parsed.controllerLegalName || DEFAULT_PRIVACY_NOTICE.controllerLegalName,
    philippineBusinessAddress:
      parsed.philippineBusinessAddress || DEFAULT_PRIVACY_NOTICE.philippineBusinessAddress,
    privacyContactEmail: parsed.privacyContactEmail || DEFAULT_PRIVACY_NOTICE.privacyContactEmail,
    noticeVersion: parsed.noticeVersion || DEFAULT_PRIVACY_NOTICE.noticeVersion,
    effectiveDate: parsed.effectiveDate || DEFAULT_PRIVACY_NOTICE.effectiveDate,
    retentionInquiries: parsed.retentionInquiries || DEFAULT_PRIVACY_NOTICE.retentionInquiries,
    retentionResellerApplications:
      parsed.retentionResellerApplications || DEFAULT_PRIVACY_NOTICE.retentionResellerApplications,
    retentionOrders: parsed.retentionOrders || DEFAULT_PRIVACY_NOTICE.retentionOrders,
    retentionAccounts: parsed.retentionAccounts || DEFAULT_PRIVACY_NOTICE.retentionAccounts,
    retentionSecurityLogs:
      parsed.retentionSecurityLogs || DEFAULT_PRIVACY_NOTICE.retentionSecurityLogs,
    retentionBackups: parsed.retentionBackups || DEFAULT_PRIVACY_NOTICE.retentionBackups,
  };
}

export function getPrivacyNoticePublicationIssues(settings: PlatformSettings): string[] {
  const notice = settings.privacyNotice;
  const issues: string[] = [];

  if (!notice.controllerLegalName) issues.push("Controller legal name is required.");
  if (!notice.philippineBusinessAddress) issues.push("Philippine business address is required.");
  if (!notice.privacyContactEmail) issues.push("Privacy/DPO contact email is required.");
  if (!notice.noticeVersion) issues.push("Notice version is required.");
  if (!notice.effectiveDate) issues.push("Effective date must use YYYY-MM-DD format.");
  if (!notice.retentionInquiries) issues.push("Inquiry retention period is required.");
  if (!notice.retentionResellerApplications) issues.push("Reseller application retention period is required.");
  if (!notice.retentionOrders) issues.push("Order retention period is required.");
  if (!notice.retentionAccounts) issues.push("Account retention period is required.");
  if (!notice.retentionSecurityLogs) issues.push("Security log retention period is required.");
  if (!notice.retentionBackups) issues.push("Backup retention period is required.");

  return issues;
}

export function isPrivacyNoticePublishable(settings: PlatformSettings): boolean {
  return getPrivacyNoticePublicationIssues(settings).length === 0;
}

export function resolvePrivacyNoticeHref(settings: PlatformSettings): string | null {
  return isPrivacyNoticePublishable(settings) ? PRIVACY_NOTICE_PATH : null;
}

export function validatePrivacyNoticeAcknowledgement(
  formData: FormData,
  requireAcknowledgement: boolean,
): string | null {
  if (!requireAcknowledgement) {
    return null;
  }

  const value = formData.get(PRIVACY_NOTICE_ACK_FIELD);
  if (value === "on" || value === "true") {
    return null;
  }

  return "Please confirm that you have read the Privacy & Data Privacy Notice.";
}

export function formatPrivacyNoticeEffectiveDate(effectiveDate: string) {
  const [year, month, day] = effectiveDate.split("-").map((part) => Number(part));
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "long",
    timeZone: "Asia/Manila",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
