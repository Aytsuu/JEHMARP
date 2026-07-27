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

describe("platform settings admin actions", () => {
  it("detects platform settings action names", () => {
    expect(isPlatformSettingsAdminAction("save-platform-settings-defaults")).toBe(true);
    expect(isPlatformSettingsAdminAction("save-customer")).toBe(false);
  });

  it("parses defaults form data", () => {
    const formData = new FormData();
    formData.set("customerCreditLimit", "2500");
    const action = parsePlatformSettingsAdminAction("save-platform-settings-defaults", formData);
    expect(action.type).toBe("save-platform-settings-defaults");
    if (action.type === "save-platform-settings-defaults") {
      expect(action.payload.customerCreditLimit).toBe(2500);
    }
  });

  it("parses document numbering form data", () => {
    const formData = new FormData();
    formData.set("invoicePrefix", "INV-");
    formData.set("invoiceNext", "42");
    formData.set("orderSlipPrefix", "OS-");
    formData.set("orderSlipNext", "7");
    const action = parsePlatformSettingsAdminAction("save-platform-settings-document-numbering", formData);
    expect(action.type).toBe("save-platform-settings-document-numbering");
    if (action.type === "save-platform-settings-document-numbering") {
      expect(action.payload.invoiceNext).toBe(42);
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
    await executePlatformSettingsAdminAction(
      {} as never,
      {
        type: "save-platform-settings-business-profile",
        payload: {
          tradeName: "JEHMARP",
          legalName: "",
          address: "Cebu",
          phone: "0917",
          tin: "",
          logoPath: null,
        },
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
  });
});
