import { describe, expect, it, vi } from "vitest";

import {
  readDashboardFragmentCache,
  writeDashboardFragmentCache,
} from "./dashboard-fragment-cache";
import { initOrderStatusAutoSave } from "./order-status-auto-save";

function createTestDocument(html: string) {
  const testDocument = document.implementation.createHTMLDocument("test");
  testDocument.body.innerHTML = html;

  return testDocument;
}

function createOrderStatusDocument() {
  return createTestDocument(`
    <div data-order-status-panel data-save-url="https://jehmarp.example/admin/orders/order-1">
      <button
        type="button"
        data-order-status-trigger
        aria-label="Order status: Pending. Click to update."
      >
        <span class="status-badge status-badge--warning">Pending</span>
      </button>
      <form
        method="post"
        action="https://jehmarp.example/admin/orders/order-1"
        data-order-status-form
      >
        <input type="hidden" name="action" value="update-order-status" />
        <input type="hidden" name="orderId" value="00000000-0000-4000-8000-000000000001" />
        <select name="orderStatus" required>
          <option value="pending" selected>Pending</option>
          <option value="processing">Processing</option>
          <option value="closed">Closed</option>
        </select>
      </form>
      <form method="post">
        <input type="hidden" name="action" value="save-invoice" />
        <button type="submit" disabled>Create Sales Invoice</button>
      </form>
    </div>
  `);
}

function changeSelect(select: HTMLSelectElement, value: string) {
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function flushPromises() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function createResponse(_url: string, init?: ResponseInit) {
  return new Response(
    JSON.stringify({
      success: init?.status ? init.status >= 200 && init.status < 300 : true,
      status: "Order status updated.",
    }),
    {
      status: init?.status ?? 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

describe("initOrderStatusAutoSave", () => {
  it("posts the order status form as JSON and updates the visible badge", async () => {
    const testDocument = createOrderStatusDocument();
    const form = testDocument.querySelector("form")!;
    const select = testDocument.querySelector("select")!;
    const trigger = testDocument.querySelector("[data-order-status-trigger]")!;
    const badge = testDocument.querySelector(".status-badge")!;
    const createInvoiceButton = Array.from(
      testDocument.querySelectorAll<HTMLButtonElement>('button[type="submit"]'),
    ).find((button) => button.textContent === "Create Sales Invoice")!;
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body as FormData;

      expect(body.get("action")).toBe("update-order-status");
      expect(body.get("orderStatus")).toBe("processing");
      expect(badge.textContent).toBe("Processing");

      return createResponse(
        "https://jehmarp.example/admin/orders/order-1?status=Order%20status%20updated.",
      );
    });

    initOrderStatusAutoSave({ root: testDocument, fetcher });
    changeSelect(select, "processing");
    await flushPromises();

    expect(fetcher).toHaveBeenCalledWith(
      "https://jehmarp.example/admin/orders/order-1",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
        },
      }),
    );
    expect(form.dataset.orderStatusSaving).toBeUndefined();
    expect(select.disabled).toBe(false);
    expect(select.getAttribute("aria-busy")).toBeNull();
    expect(badge.textContent).toBe("Processing");
    expect(badge.classList.contains("status-badge--info")).toBe(true);
    expect(trigger.getAttribute("aria-label")).toBe(
      "Order status: Processing. Click to update.",
    );
    expect(createInvoiceButton.disabled).toBe(false);
  });

  it("updates the badge when the status form is detached from the panel", async () => {
    const testDocument = createOrderStatusDocument();
    const panel = testDocument.querySelector("[data-order-status-panel]")!;
    const form = testDocument.querySelector("form")!;
    const select = testDocument.querySelector("select")!;
    const badge = testDocument.querySelector(".status-badge")!;
    const fetcher = vi.fn(async () =>
      createResponse("https://jehmarp.example/admin/orders/order-1"),
  );

    testDocument.body.appendChild(form);

    initOrderStatusAutoSave({ root: testDocument, fetcher });
    changeSelect(select, "closed");
    await flushPromises();

    expect(panel.contains(form)).toBe(false);
    expect(badge.textContent).toBe("Closed");
    expect(badge.classList.contains("status-badge--success")).toBe(true);
  });

  it("clears dashboard fragment caches before saving status", async () => {
    const testDocument = createOrderStatusDocument();
    const select = testDocument.querySelector("select")!;
    const fetcher = vi.fn(async () =>
      createResponse("https://jehmarp.example/admin/orders/order-1"),
    );

    writeDashboardFragmentCache("orders", "page=1", "<table>cached</table>");

    initOrderStatusAutoSave({ root: testDocument, fetcher });
    changeSelect(select, "processing");
    await flushPromises();

    expect(readDashboardFragmentCache("orders", "page=1")).toBeUndefined();
  });

  it("prevents repeated status saves while a request is in flight", async () => {
    const testDocument = createOrderStatusDocument();
    const form = testDocument.querySelector("form")!;
    const select = testDocument.querySelector("select")!;
    let resolveFetch: (response: Response) => void = () => {};
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    initOrderStatusAutoSave({ root: testDocument, fetcher });
    changeSelect(select, "processing");

    expect(form.dataset.orderStatusSaving).toBe("true");
    expect(select.disabled).toBe(true);

    changeSelect(select, "closed");
    expect(fetcher).toHaveBeenCalledTimes(1);

    resolveFetch(createResponse("https://jehmarp.example/admin/orders/order-1"));
    await flushPromises();
  });

  it("installs one listener when initialized more than once", async () => {
    const testDocument = createOrderStatusDocument();
    const select = testDocument.querySelector("select")!;
    const fetcher = vi.fn(async () =>
      createResponse("https://jehmarp.example/admin/orders/order-1"),
    );

    initOrderStatusAutoSave({ root: testDocument, fetcher });
    initOrderStatusAutoSave({ root: testDocument, fetcher });
    changeSelect(select, "processing");
    await flushPromises();

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("shows Processing on the badge when reopening a closed order via Open", async () => {
    const testDocument = createTestDocument(`
      <div data-order-status-panel data-save-url="https://jehmarp.example/admin/orders/order-1">
        <button type="button" data-order-status-trigger aria-label="Order status: Closed. Click to update.">
          <span class="status-badge status-badge--success">Closed</span>
        </button>
        <form
          method="post"
          action="https://jehmarp.example/admin/orders/order-1"
          data-order-status-form
        >
          <input type="hidden" name="action" value="update-order-status" />
          <input type="hidden" name="orderId" value="00000000-0000-4000-8000-000000000001" />
          <select name="orderStatus" required>
            <option value="closed" selected>Closed</option>
            <option value="processing">Open</option>
          </select>
        </form>
      </div>
    `);
    const select = testDocument.querySelector("select")!;
    const badge = testDocument.querySelector(".status-badge")!;
    const fetcher = vi.fn(async () =>
      createResponse("https://jehmarp.example/admin/orders/order-1"),
    );

    initOrderStatusAutoSave({ root: testDocument, fetcher });
    changeSelect(select, "processing");
    await flushPromises();

    expect(badge.textContent).toBe("Processing");
    expect(badge.classList.contains("status-badge--info")).toBe(true);
  });

  it("reverts the dropdown when saving fails", async () => {
    const testDocument = createOrderStatusDocument();
    const select = testDocument.querySelector("select")!;
    const badge = testDocument.querySelector(".status-badge")!;
    const fetcher = vi.fn(async () => {
      throw new Error("Network failure");
    });

    initOrderStatusAutoSave({ root: testDocument, fetcher });
    changeSelect(select, "processing");
    await flushPromises();

    expect(select.value).toBe("pending");
    expect(select.disabled).toBe(false);
    expect(badge.textContent).toBe("Pending");
    expect(badge.classList.contains("status-badge--warning")).toBe(true);
  });
});
