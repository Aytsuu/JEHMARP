import { afterEach, describe, expect, it, vi } from "vitest";

import { deliverResellerPriceListEmailIfConfigured } from "./reseller-price-list-email";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("deliverResellerPriceListEmailIfConfigured", () => {
  const applicationId = "b10bb955-d8b1-4a26-a6e2-928fd33949e1";

  it("skips delivery when Resend is not configured in the web app", async () => {
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_key");

    const supabase = {
      from: vi.fn(),
    };

    await expect(
      deliverResellerPriceListEmailIfConfigured(applicationId, {
        supabase: supabase as never,
      }),
    ).resolves.toBe("skipped");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("sends the reseller price list and updates delivery status when configured", async () => {
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_key");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESELLER_PRICE_LIST_FROM", "JEHMARP <sales@example.com>");
    vi.stubEnv("RESELLER_ADMIN_EMAIL", "admin@example.com");

    const applicationSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve({
          data: {
            id: applicationId,
            name: "Market Owner",
            email: "owner@example.com",
            address: "123 Market Road",
            planned_transaction_type: "retail_resale",
            expected_quantity_per_week: "40 kg",
            contact_number: "09170000000",
            message: null,
          },
          error: null,
        })),
      })),
    }));
    const productSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({
            data: [
              {
                name: "Pork Belly",
                category: "pork",
                unit_label: "kg",
                default_price: 320,
                reseller_price: 295,
              },
            ],
            error: null,
          })),
        })),
      })),
    }));
    const updateEq = vi.fn(() => Promise.resolve({ error: null }));
    const update = vi.fn(() => ({ eq: updateEq }));

    const from = vi.fn((table: string) => {
      if (table === "reseller_application") {
        return {
          select: applicationSelect,
          update,
        };
      }

      if (table === "product") {
        return { select: productSelect };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const fetcher = vi.fn((url: string) => {
      if (url === "https://api.resend.com/emails") {
        return Promise.resolve(Response.json({ id: "email-id" }));
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    await expect(
      deliverResellerPriceListEmailIfConfigured(applicationId, {
        supabase: { from } as never,
        fetch: fetcher as typeof fetch,
      }),
    ).resolves.toBe("sent");

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(update).toHaveBeenCalledWith({
      email_delivery_status: "sent",
      price_list_sent_at: expect.any(String),
      email_error: null,
    });
    expect(updateEq).toHaveBeenCalledWith("id", applicationId);
  });
});
