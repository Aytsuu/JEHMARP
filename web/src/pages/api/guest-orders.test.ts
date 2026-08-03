import type { APIRoute } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";

const parseGuestOrderFormData = vi.fn();
const submitGuestOrder = vi.fn();

vi.mock("@/lib/public-website/guest-orders", () => ({
  parseGuestOrderFormData,
  submitGuestOrder,
}));

describe("POST /api/guest-orders", () => {
  beforeEach(() => {
    parseGuestOrderFormData.mockReset();
    submitGuestOrder.mockReset();
  });

  it("rejects form submissions from untrusted origins before parsing or submitting the order", async () => {
    const { POST } = await import("./guest-orders");
    const response = await POST({
      request: new Request("https://shop.example.test/api/guest-orders", {
        method: "POST",
        headers: {
          origin: "https://attacker.example.test",
        },
        body: validFormData(),
      }),
      url: new URL("https://shop.example.test/api/guest-orders"),
      redirect: redirectResponse,
    } as Parameters<APIRoute>[0]);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/shop?order=error&message=Invalid+form+submission.",
    );
    expect(parseGuestOrderFormData).not.toHaveBeenCalled();
    expect(submitGuestOrder).not.toHaveBeenCalled();
  });

  it("rejects form submissions without origin or referer metadata", async () => {
    const { POST } = await import("./guest-orders");
    const response = await POST({
      request: new Request("https://shop.example.test/api/guest-orders", {
        method: "POST",
        body: validFormData(),
      }),
      url: new URL("https://shop.example.test/api/guest-orders"),
      redirect: redirectResponse,
    } as Parameters<APIRoute>[0]);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/shop?order=error&message=Invalid+form+submission.",
    );
    expect(parseGuestOrderFormData).not.toHaveBeenCalled();
    expect(submitGuestOrder).not.toHaveBeenCalled();
  });

  it("accepts same-origin form submissions and forwards the parsed payload", async () => {
    const payload = {
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
        },
      ],
      turnstileToken: "turnstile-token",
    };

    parseGuestOrderFormData.mockReturnValue({
      success: true,
      data: payload,
    });
    submitGuestOrder.mockResolvedValue({
      orderId: "order-id",
      trackingNumber: "JHM-ABCD2345",
      trackingEmailStatus: "sent",
    });

    const { POST } = await import("./guest-orders");
    const response = await POST({
      request: new Request("https://shop.example.test/api/guest-orders", {
        method: "POST",
        headers: {
          origin: "https://shop.example.test",
          "cf-connecting-ip": "203.0.113.10",
        },
        body: validFormData(),
      }),
      url: new URL("https://shop.example.test/api/guest-orders"),
      redirect: redirectResponse,
    } as Parameters<APIRoute>[0]);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/shop?order=submitted&email=1");
    expect(submitGuestOrder).toHaveBeenCalledWith(payload, {
      clientIp: "203.0.113.10",
      siteOrigin: "https://shop.example.test",
    });
  });

  it("accepts referer-only same-origin form submissions", async () => {
    const payload = {
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
        },
      ],
      turnstileToken: "turnstile-token",
    };

    parseGuestOrderFormData.mockReturnValue({
      success: true,
      data: payload,
    });
    submitGuestOrder.mockResolvedValue({
      orderId: "order-id",
      trackingNumber: "JHM-ABCD2345",
      trackingEmailStatus: "sent",
    });

    const { POST } = await import("./guest-orders");
    const response = await POST({
      request: new Request("https://shop.example.test/api/guest-orders", {
        method: "POST",
        headers: {
          referer: "https://shop.example.test/shop",
        },
        body: validFormData(),
      }),
      url: new URL("https://shop.example.test/api/guest-orders"),
      redirect: redirectResponse,
    } as Parameters<APIRoute>[0]);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/shop?order=submitted&email=1");
    expect(submitGuestOrder).toHaveBeenCalledWith(payload, {
      clientIp: null,
      siteOrigin: "https://shop.example.test",
    });
  });

  it("does not claim the tracking email was sent when delivery was skipped", async () => {
    const payload = {
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
        },
      ],
      turnstileToken: "turnstile-token",
    };

    parseGuestOrderFormData.mockReturnValue({
      success: true,
      data: payload,
    });
    submitGuestOrder.mockResolvedValue({
      orderId: "order-id",
      trackingNumber: "JHM-ABCD2345",
      trackingEmailStatus: "skipped",
    });

    const { POST } = await import("./guest-orders");
    const response = await POST({
      request: new Request("https://shop.example.test/api/guest-orders", {
        method: "POST",
        headers: {
          origin: "https://shop.example.test",
        },
        body: validFormData(),
      }),
      url: new URL("https://shop.example.test/api/guest-orders"),
      redirect: redirectResponse,
    } as Parameters<APIRoute>[0]);

    expect(response.headers.get("location")).toBe("/shop?order=submitted&email=unavailable");
  });
});

function redirectResponse(path: string, status?: number): Response {
  return new Response(null, {
    status: status ?? 302,
    headers: {
      location: path,
    },
  });
}

function validFormData(): FormData {
  const formData = new FormData();

  formData.set("firstName", "Maria");
  formData.set("lastName", "Santos");
  formData.set("phoneNumber", "09170000000");
  formData.set("email", "maria@example.com");
  formData.set("address", "San Pedro");
  formData.set("quantity:product-1", "2");
  formData.set("cf-turnstile-response", "turnstile-token");

  return formData;
}
