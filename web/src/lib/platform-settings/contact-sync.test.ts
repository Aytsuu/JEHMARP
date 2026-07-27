import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_CONTACT_DETAILS_EMAIL,
  DEFAULT_CONTACT_DETAILS_PHONE,
  isLockedContactDetailsField,
  syncContactDetailsFromBusinessProfile,
} from "./contact-sync";

const { invalidatePublicPageContentCacheForPage } = vi.hoisted(() => ({
  invalidatePublicPageContentCacheForPage: vi.fn(
    async (pageId: string): Promise<void> => {
      void pageId;
    },
  ),
}));

vi.mock("@/lib/public-website/content", () => ({
  invalidatePublicPageContentCacheForPage,
}));

describe("contact sync", () => {
  it("identifies locked contact detail fields", () => {
    expect(isLockedContactDetailsField("email")).toBe(true);
    expect(isLockedContactDetailsField("phone")).toBe(true);
    expect(isLockedContactDetailsField("location")).toBe(false);
  });

  it("updates the contact page contact_details section", async () => {
    invalidatePublicPageContentCacheForPage.mockClear();
    const update = vi.fn(() => ({ eq: async () => ({ error: null }) }));

    const adminClient = {
      from: (table: string) => {
        if (table === "page") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "contact-page-id" },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "page_section") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "contact-section-id",
                      content: {
                        heading: "Contact details",
                        email: "old@example.com",
                        phone: "old-phone",
                        location: "Compostela Public Market",
                      },
                    },
                    error: null,
                  }),
                }),
              }),
            }),
            update,
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    };

    await syncContactDetailsFromBusinessProfile(adminClient as never, {
      phone: DEFAULT_CONTACT_DETAILS_PHONE,
      primaryEmail: DEFAULT_CONTACT_DETAILS_EMAIL,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          email: DEFAULT_CONTACT_DETAILS_EMAIL,
          phone: DEFAULT_CONTACT_DETAILS_PHONE,
          location: "Compostela Public Market",
        }),
      }),
    );
    expect(invalidatePublicPageContentCacheForPage).toHaveBeenCalledWith("contact-page-id");
  });
});
