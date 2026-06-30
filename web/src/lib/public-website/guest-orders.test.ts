import { describe, expect, it } from "vitest";

import { parseGuestOrderFormData } from "./guest-orders";

describe("parseGuestOrderFormData", () => {
  it("returns a trusted workflow payload from valid guest order form data", () => {
    const formData = new FormData();
    formData.set("firstName", "Maria");
    formData.set("lastName", "Santos");
    formData.set("phoneNumber", "09170000000");
    formData.set("email", "maria@example.com");
    formData.set("address", "San Pedro");
    formData.set("quantity:product-1", "2");
    formData.set("details:product-1", "Cut small");
    formData.set("quantity:product-2", "0");

    expect(parseGuestOrderFormData(formData)).toEqual({
      success: true,
      data: {
        customer: {
          firstName: "Maria",
          lastName: "Santos",
          phoneNumber: "09170000000",
          email: "maria@example.com",
          address: "San Pedro",
        },
        items: [
          {
            productId: "product-1",
            quantity: 2,
            addDetails: "Cut small",
          },
        ],
      },
    });
  });

  it("rejects missing customer fields and empty item selections", () => {
    const formData = new FormData();
    formData.set("firstName", "");
    formData.set("lastName", "Santos");
    formData.set("phoneNumber", "");
    formData.set("address", "");

    const result = parseGuestOrderFormData(formData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          "First name is required.",
          "Phone number is required.",
          "Delivery address is required.",
          "Select at least one product quantity.",
        ]),
      );
    }
  });

  it("rejects invalid email and negative quantities", () => {
    const formData = new FormData();
    formData.set("firstName", "Maria");
    formData.set("lastName", "Santos");
    formData.set("phoneNumber", "09170000000");
    formData.set("email", "not-an-email");
    formData.set("address", "San Pedro");
    formData.set("quantity:product-1", "-2");

    const result = parseGuestOrderFormData(formData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          "Email must be valid when provided.",
          "Product quantity cannot be negative.",
        ]),
      );
    }
  });
});
