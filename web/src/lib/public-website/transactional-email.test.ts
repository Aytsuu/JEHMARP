import { describe, expect, it } from "vitest";

import { resolveTransactionalEmailFrom } from "./transactional-email";

describe("resolveTransactionalEmailFrom", () => {
  it("prefers the configured Resend from address", () => {
    expect(resolveTransactionalEmailFrom({
      resellerPriceListFrom: "JEHMARP <orders@example.com>",
      tradeName: "Shop Name",
      primaryEmail: "shop@example.com",
    })).toBe("JEHMARP <orders@example.com>");
  });

  it("falls back to business profile identity when Resend from is unset", () => {
    expect(resolveTransactionalEmailFrom({
      tradeName: "Meat and Poultry Products",
      primaryEmail: "orders@example.com",
    })).toBe("Meat and Poultry Products <orders@example.com>");
  });

  it("returns null when no sender can be resolved", () => {
    expect(resolveTransactionalEmailFrom({})).toBeNull();
  });
});
