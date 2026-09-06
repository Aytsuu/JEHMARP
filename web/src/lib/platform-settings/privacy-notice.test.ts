import { describe, expect, it } from "vitest";

import { DEFAULT_PLATFORM_SETTINGS, DEFAULT_PRIVACY_NOTICE } from "./defaults";
import { mergePlatformSettings, normalizePlatformSettings } from "./normalize";
import {
  formatPrivacyNoticeEffectiveDate,
  getPrivacyNoticePublicationIssues,
  isPrivacyNoticePublishable,
  normalizePrivacyNotice,
  PRIVACY_NOTICE_ACK_FIELD,
  PRIVACY_NOTICE_PATH,
  resolvePrivacyNoticeHref,
  validatePrivacyNoticeAcknowledgement,
} from "./privacy-notice";
import type { PrivacyNoticeSettings } from "./types";

function completePrivacyNotice(
  overrides: Partial<PrivacyNoticeSettings> = {},
): PrivacyNoticeSettings {
  return {
    controllerLegalName: "JEHMARP Meatshop",
    philippineBusinessAddress: "Brgy. Tolo-Tolo, Consolacion, Cebu, Philippines",
    privacyContactEmail: "privacy@jehmarp.ph",
    noticeVersion: "1.0",
    effectiveDate: "2026-09-06",
    retentionInquiries: "24 months after inquiry closure",
    retentionResellerApplications: "36 months after decision",
    retentionOrders: "7 years from order completion",
    retentionAccounts: "While active plus 24 months after closure",
    retentionSecurityLogs: "12 months",
    retentionBackups: "30 days rolling",
    ...overrides,
  };
}

function settingsWithPrivacyNotice(overrides: Partial<PrivacyNoticeSettings> = {}) {
  return mergePlatformSettings(normalizePlatformSettings({}), {
    privacyNotice: completePrivacyNotice(overrides),
  });
}

describe("normalizePrivacyNotice", () => {
  it("returns default notice content for invalid payloads", () => {
    expect(normalizePrivacyNotice(null)).toEqual(DEFAULT_PRIVACY_NOTICE);
  });

  it("backfills missing fields from defaults after normalization", () => {
    expect(
      normalizePrivacyNotice({
        controllerLegalName: "Custom Controller",
        privacyContactEmail: "invalid-email",
        effectiveDate: "2026-02-30",
      }),
    ).toEqual({
      ...DEFAULT_PRIVACY_NOTICE,
      controllerLegalName: "Custom Controller",
    });
  });

  it("trims strings, normalizes email, and rejects invalid effective dates", () => {
    expect(
      normalizePrivacyNotice({
        controllerLegalName: "  JEHMARP  ",
        philippineBusinessAddress: " Cebu ",
        privacyContactEmail: " PRIVACY@JEHMARP.PH ",
        noticeVersion: " 1.0 ",
        effectiveDate: "2026-02-30",
        retentionInquiries: " 24 months ",
        retentionResellerApplications: " 36 months ",
        retentionOrders: " 7 years ",
        retentionAccounts: " active + 24 months ",
        retentionSecurityLogs: " 12 months ",
        retentionBackups: " 30 days ",
      }),
    ).toEqual({
      controllerLegalName: "JEHMARP",
      philippineBusinessAddress: "Cebu",
      privacyContactEmail: "privacy@jehmarp.ph",
      noticeVersion: "1.0",
      effectiveDate: DEFAULT_PRIVACY_NOTICE.effectiveDate,
      retentionInquiries: "24 months",
      retentionResellerApplications: "36 months",
      retentionOrders: "7 years",
      retentionAccounts: "active + 24 months",
      retentionSecurityLogs: "12 months",
      retentionBackups: "30 days",
    });
  });
});

describe("privacy notice publication readiness", () => {
  it("publishes the default platform settings notice", () => {
    expect(getPrivacyNoticePublicationIssues(DEFAULT_PLATFORM_SETTINGS)).toEqual([]);
    expect(isPrivacyNoticePublishable(DEFAULT_PLATFORM_SETTINGS)).toBe(true);
    expect(resolvePrivacyNoticeHref(DEFAULT_PLATFORM_SETTINGS)).toBe(PRIVACY_NOTICE_PATH);
  });

  it("loads publishable defaults when stored settings omit privacyNotice", () => {
    const settings = normalizePlatformSettings({
      businessProfile: DEFAULT_PLATFORM_SETTINGS.businessProfile,
    });

    expect(isPrivacyNoticePublishable(settings)).toBe(true);
    expect(settings.privacyNotice.controllerLegalName).toBe(DEFAULT_PRIVACY_NOTICE.controllerLegalName);
  });

  it("exposes /privacy when every required field is valid", () => {
    const settings = settingsWithPrivacyNotice();

    expect(getPrivacyNoticePublicationIssues(settings)).toEqual([]);
    expect(isPrivacyNoticePublishable(settings)).toBe(true);
    expect(resolvePrivacyNoticeHref(settings)).toBe(PRIVACY_NOTICE_PATH);
  });

  it("merges privacy notice fields through platform settings normalization", () => {
    const settings = mergePlatformSettings(DEFAULT_PLATFORM_SETTINGS, {
      privacyNotice: { controllerLegalName: "JEHMARP Meatshop" },
    });

    expect(settings.privacyNotice.controllerLegalName).toBe("JEHMARP Meatshop");
    expect(isPrivacyNoticePublishable(settings)).toBe(true);
  });
});

describe("validatePrivacyNoticeAcknowledgement", () => {
  it("requires acknowledgement only when publication is enabled", () => {
    const formData = new FormData();

    expect(validatePrivacyNoticeAcknowledgement(formData, false)).toBeNull();

    expect(validatePrivacyNoticeAcknowledgement(formData, true)).toBe(
      "Please confirm that you have read the Privacy & Data Privacy Notice.",
    );

    formData.set(PRIVACY_NOTICE_ACK_FIELD, "true");
    expect(validatePrivacyNoticeAcknowledgement(formData, true)).toBeNull();
  });
});

describe("formatPrivacyNoticeEffectiveDate", () => {
  it("formats ISO dates for Philippine readers", () => {
    expect(formatPrivacyNoticeEffectiveDate("2026-09-06")).toContain("2026");
  });
});
