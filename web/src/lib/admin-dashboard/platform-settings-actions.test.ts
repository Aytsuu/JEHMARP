import { describe, expect, it, vi } from "vitest";

import {
  executePlatformSettingsAdminAction,
  isPlatformSettingsAdminAction,
  parsePlatformSettingsAdminAction,
} from "@/lib/admin-dashboard/platform-settings-actions";
import { DEFAULT_PLATFORM_SETTINGS } from "@/lib/platform-settings";

const createSupabaseAdminClient = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => createSupabaseAdminClient(),
}));

vi.mock("@/lib/platform-settings/contact-sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platform-settings/contact-sync")>();
  return {
    ...actual,
    syncContactDetailsFromBusinessProfile: vi.fn(async () => undefined),
  };
});

vi.mock("@/lib/supabase/storage", () => ({
  PRODUCT_IMAGE_BUCKET: "product-images",
  isManagedStoragePath: (path: string) => path.startsWith("platform/"),
  resolvePublicStorageUrl: (path: string | null) => (path ? `https://cdn.test/${path}` : null),
}));

describe("platform settings admin actions", () => {
  it("detects platform settings action names", () => {
    expect(isPlatformSettingsAdminAction("save-platform-settings-general")).toBe(true);
    expect(isPlatformSettingsAdminAction("save-customer")).toBe(false);
  });

  it("parses general settings form data", () => {
    const formData = new FormData();
    formData.set("tradeName", "JEHMARP");
    formData.set("phone", "09171234567");
    formData.set("customerCreditLimit", "2500");
    formData.set("primaryEmail", "ops@example.com");
    formData.set("secondaryEmail", "alerts@example.com");

    const action = parsePlatformSettingsAdminAction("save-platform-settings-general", formData);
    expect(action.type).toBe("save-platform-settings-general");

    if (action.type === "save-platform-settings-general") {
      expect(action.businessProfile.tradeName).toBe("JEHMARP");
      expect(action.businessProfile.primaryEmail).toBe("ops@example.com");
      expect(action.businessProfile.secondaryEmail).toBe("alerts@example.com");
      expect(action.defaults.customerCreditLimit).toBe(2500);
    }
  });

  it("uploads logos with the admin storage client", async () => {
    const upload = vi.fn(async () => ({ data: { path: "platform/logo-test.png" }, error: null }));
    const remove = vi.fn(async () => ({ data: [], error: null }));
    const update = vi.fn(() => ({ eq: async () => ({ error: null }) }));
    const select = vi.fn(() => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { settings: DEFAULT_PLATFORM_SETTINGS }, error: null }),
      }),
    }));

    createSupabaseAdminClient.mockReturnValue({
      from: () => ({ select, update }),
      storage: {
        from: () => ({ upload, remove }),
      },
    });

    const logoFile = new File([new Uint8Array([1, 2, 3])], "brand.png", { type: "image/png" });
    const result = await executePlatformSettingsAdminAction(
      {} as never,
      {
        type: "save-platform-settings-general",
        businessProfile: {
          tradeName: "JEHMARP",
          legalName: "",
          address: "Cebu",
          phone: "0917",
          tin: "",
          logoPath: null,
          primaryEmail: "",
          secondaryEmail: "",
        },
        defaults: { customerCreditLimit: 1000 },
        logoFile: logoFile as File & { name: string },
        removeLogo: false,
      },
      "admin-user-id",
    );

    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^platform\/logo-/),
      expect.any(File),
      expect.objectContaining({ contentType: "image/png" }),
    );
    expect(update).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        logoPath: "platform/logo-test.png",
        customerCreditLimit: 1000,
      }),
    );
  });
});
