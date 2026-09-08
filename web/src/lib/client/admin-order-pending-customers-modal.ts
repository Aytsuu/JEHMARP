import { formatOrderCode } from "@/lib/order-detail-nav";
import { bindDashboardModal, openDashboardModal } from "@/lib/client/dashboard-modal";

type PendingCustomerOrder = {
  id: string;
  customer_label: string;
  created_at: string;
  total_amount: number;
  href: string;
};

export const PENDING_CUSTOMER_ORDERS_MODAL_ID = "pending-customer-orders-modal";

let pendingCustomerOrdersModalInitialized = false;

function formatCurrencyForClient(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number.isFinite(value) ? value : 0);
}

function formatDateTimeForClient(value: string) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function renderPendingCustomerOrders(orders: PendingCustomerOrder[]) {
  if (orders.length === 0) {
    return '<p class="dashboard-modal__empty">No pending customer orders.</p>';
  }

  return `
    <div class="pending-payments-list">
      ${orders.map((order) => `
        <article class="pending-payments-customer">
          <header class="pending-payments-customer__header">
            <div class="pending-payments-customer__identity">
              <p class="pending-payments-customer__name">${escapeHtml(order.customer_label)}</p>
              <p class="pending-payments-customer__meta">
                ${escapeHtml(formatOrderCode(order.id))} · ${escapeHtml(formatDateTimeForClient(order.created_at))}
              </p>
            </div>
            <strong class="pending-payments-order__balance">
              ${escapeHtml(formatCurrencyForClient(order.total_amount))}
            </strong>
          </header>
          <div class="pending-payments-order__actions">
            <a class="pending-payments-order__view-link" href="${escapeHtml(order.href)}">
              View order details
            </a>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setModalCopy(
  modal: HTMLElement,
  distributionLabel: string,
  pendingCount: number,
) {
  const title = modal.querySelector<HTMLElement>(`#${PENDING_CUSTOMER_ORDERS_MODAL_ID}-title`);
  const description = modal.querySelector<HTMLElement>(".dashboard-modal__header-copy p");
  const orderLabel = pendingCount === 1 ? "order" : "orders";

  if (title) {
    title.textContent = "Pending customer orders";
  }

  if (description) {
    description.textContent = `${pendingCount} customer ${orderLabel} awaiting acceptance for ${distributionLabel}`;
    description.hidden = false;
  }
}

async function loadPendingCustomerOrders(orderId: string) {
  const response = await fetch(
    `/admin/distribution-pending-customers.json?orderId=${encodeURIComponent(orderId)}`,
    {
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Pending customer orders failed with ${response.status}.`);
  }

  const body = await response.json() as { orders?: PendingCustomerOrder[] };
  return Array.isArray(body.orders) ? body.orders : [];
}

function getPendingCustomerOrdersModal() {
  const modal = document.getElementById(PENDING_CUSTOMER_ORDERS_MODAL_ID);
  return modal instanceof HTMLElement ? modal : null;
}

export function initAdminOrderPendingCustomersModal() {
  document.querySelectorAll<HTMLElement>(`[data-dashboard-modal="${PENDING_CUSTOMER_ORDERS_MODAL_ID}"]`)
    .forEach(bindDashboardModal);

  if (pendingCustomerOrdersModalInitialized) return;
  pendingCustomerOrdersModalInitialized = true;

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const trigger = target.closest<HTMLElement>("[data-open-pending-customer-orders-modal]");
    if (!trigger) return;

    event.preventDefault();

    const modal = getPendingCustomerOrdersModal();
    if (!modal) return;

    const orderId = trigger.dataset.distributionOrderId?.trim() ?? "";
    const distributionLabel = trigger.dataset.distributionLabel?.trim() || "this distribution order";
    const pendingCount = Number(trigger.dataset.pendingCustomerOrderCount ?? 0);
    const body = modal.querySelector<HTMLElement>("[data-pending-customer-orders-modal-body]");
    if (!orderId || !body) return;

    bindDashboardModal(modal);
    setModalCopy(modal, distributionLabel, Number.isFinite(pendingCount) ? pendingCount : 0);
    body.innerHTML = '<p class="dashboard-modal__empty">Loading pending customer orders...</p>';
    openDashboardModal(modal);

    void loadPendingCustomerOrders(orderId)
      .then((orders) => {
        body.innerHTML = renderPendingCustomerOrders(orders);
      })
      .catch(() => {
        body.innerHTML = '<p class="dashboard-modal__empty">Unable to load pending customer orders.</p>';
      });
  });
}
