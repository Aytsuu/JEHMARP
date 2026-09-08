import { beforeEach, describe, expect, it, vi } from "vitest";

import { initAdminOrderPendingCustomersModal, PENDING_CUSTOMER_ORDERS_MODAL_ID } from "./admin-order-pending-customers-modal";

describe("initAdminOrderPendingCustomersModal", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("opens the pending customer orders modal when the action button is clicked", async () => {
    document.body.innerHTML = `
      <div
        id="${PENDING_CUSTOMER_ORDERS_MODAL_ID}"
        class="dashboard-modal"
        data-dashboard-modal="${PENDING_CUSTOMER_ORDERS_MODAL_ID}"
        aria-hidden="true"
      >
        <div class="dashboard-modal__backdrop" data-dashboard-modal-close></div>
        <section class="dashboard-modal__panel" tabindex="-1" data-dashboard-modal-panel>
          <header class="dashboard-modal__header">
            <div class="dashboard-modal__header-copy">
              <h2 id="${PENDING_CUSTOMER_ORDERS_MODAL_ID}-title">Pending customer orders</h2>
              <p>Review customer orders awaiting acceptance.</p>
            </div>
          </header>
          <div class="dashboard-modal__body">
            <div data-pending-customer-orders-modal-body></div>
          </div>
        </section>
      </div>
      <button
        type="button"
        data-open-pending-customer-orders-modal
        data-distribution-order-id="distribution-1"
        data-distribution-label="Carlos Agent"
        data-pending-customer-order-count="2"
      >
        2
      </button>
    `;

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        orders: [
          {
            id: "child-order-1",
            customer_label: "Maria Santos",
            created_at: "2026-08-04T01:15:00.000Z",
            total_amount: 900,
            href: "/admin/orders/customer/child-order-1",
          },
        ],
      }),
    } as Response);

    initAdminOrderPendingCustomersModal();
    document.querySelector<HTMLButtonElement>("[data-open-pending-customer-orders-modal]")!.click();

    const modal = document.getElementById(PENDING_CUSTOMER_ORDERS_MODAL_ID)!;
    expect(modal.classList.contains("dashboard-modal--open")).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/admin/distribution-pending-customers.json?orderId=distribution-1",
      expect.objectContaining({
        headers: {
          Accept: "application/json",
        },
      }),
    );

    await vi.waitFor(() => {
      expect(document.querySelector("[data-pending-customer-orders-modal-body]")?.textContent)
        .toContain("Maria Santos");
    });
  });
});
