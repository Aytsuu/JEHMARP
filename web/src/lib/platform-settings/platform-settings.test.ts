import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PLATFORM_SETTINGS } from "./defaults";
import { mergePlatformSettings, normalizePlatformSettings } from "./normalize";
import { resolveNotificationEmails } from "./notifications";
import { loadPlatformSettings, savePlatformSettings } from "./storage";
import { formatOrderSlipPaymentLines } from "./document-payment";

describe("normalizePlatformSettings", () => {
  it("returns defaults for invalid payloads", () => {
    expect(normalizePlatformSettings(null)).toEqual(DEFAULT_PLATFORM_SETTINGS);
  });
});

describe("mergePlatformSettings", () => {
  it("merges nested business profile fields", () => {
    const current = normalizePlatformSettings({});
    const next = mergePlatformSettings(current, { businessProfile: { phone: "0999" } });
    expect(next.businessProfile.phone).toBe("0999");
  });
});

describe("resolveNotificationEmails", () => {
  it("prefers business profile emails over route and fallback values", () => {
    const settings = mergePlatformSettings(normalizePlatformSettings({}), {
      businessProfile: { primaryEmail: "ops@example.com", secondaryEmail: "backup@example.com" },
      notifications: {
        routes: [
          { event: "new_order", primaryEmail: "legacy@example.com", secondaryEmail: "" },
          ...DEFAULT_PLATFORM_SETTINGS.notifications.routes.slice(1),
        ],
      },
    });

    expect(resolveNotificationEmails("new_order", settings, { new_order: "fallback@example.com" }))
      .toEqual(["ops@example.com", "backup@example.com"]);
  });

  it("prefers configured route emails over fallbacks when profile emails are empty", () => {
    const settings = mergePlatformSettings(normalizePlatformSettings({}), {
      businessProfile: { primaryEmail: "", secondaryEmail: "" },
      notifications: {
        routes: [
          { event: "new_order", primaryEmail: "ops@example.com", secondaryEmail: "" },
          ...DEFAULT_PLATFORM_SETTINGS.notifications.routes.slice(1),
        ],
      },
    });
    expect(resolveNotificationEmails("new_order", settings, { new_order: "legacy@example.com" }))
      .toEqual(["ops@example.com"]);
  });
});

describe("platform settings storage", () => {
  it("loads defaults when the row is missing", async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    };
    await expect(loadPlatformSettings(client)).resolves.toEqual(DEFAULT_PLATFORM_SETTINGS);
  });

  it("loads defaults when the settings table has not been migrated yet", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: null,
              error: { code: "PGRST205", message: "Could not find the table 'public.platform_settings' in the schema cache" },
            }),
          }),
        }),
      }),
    };
    await expect(loadPlatformSettings(client)).resolves.toEqual(DEFAULT_PLATFORM_SETTINGS);
  });

  it("syncs invoice sequence when saving numbering", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { settings: DEFAULT_PLATFORM_SETTINGS }, error: null }),
          }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
      rpc,
    };
    await savePlatformSettings(client, { documentNumbering: { invoiceNext: 42 } }, "admin-id");
    expect(rpc).toHaveBeenCalledWith("sync_invoice_sequence_from_settings", { target_next: 42 });
  });
});

describe("formatOrderSlipPaymentLines", () => {
  it("returns template lines when payment settings are empty", () => {
    expect(formatOrderSlipPaymentLines(undefined)[0]).toContain("Cash on Delivery");
  });
});
