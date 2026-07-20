import { clearDashboardFragmentCaches } from "./dashboard-fragment-cache";
import { getOrderStatusBadgeLabel } from "@/lib/order-status-display";
import { resolveStatusBadgeVariant } from "@/lib/status-badge";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type OrderStatusAutoSaveOptions = {
  root?: ParentNode;
  fetcher?: Fetcher;
};

const initializedFlag = "orderStatusAutoSaveInitialized";
const savingFlag = "orderStatusSaving";
const statusBadgeVariantPattern = /^status-badge--/;

type AdminActionJsonResponse = {
  success: boolean;
  status?: string;
  error?: string;
};

function getFormAction(form: HTMLFormElement) {
  return form.action || form.closest<HTMLElement>("[data-order-status-panel]")?.dataset.saveUrl || "";
}

function getStatusSelect(form: HTMLFormElement) {
  return form.querySelector<HTMLSelectElement>('select[name="orderStatus"]');
}

function getStatusBadgeLabel(status: string) {
  return getOrderStatusBadgeLabel(status);
}

function normalizeActionPath(url: string) {
  if (!url) return "";

  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url;
  }
}

function findStatusPanel(form: HTMLFormElement, root: ParentNode) {
  const actionPath = normalizeActionPath(getFormAction(form));
  if (!actionPath) return null;

  const panelFromRoot = Array.from(
    root.querySelectorAll<HTMLElement>("[data-order-status-panel]"),
  ).find(
    (panel) => normalizeActionPath(panel.dataset.saveUrl ?? "") === actionPath,
  );

  return panelFromRoot ?? form.closest<HTMLElement>("[data-order-status-panel]");
}

function updateVisibleStatus(
  form: HTMLFormElement,
  root: ParentNode,
  status: string,
  label: string,
) {
  const panel = findStatusPanel(form, root);
  const trigger = panel?.querySelector<HTMLButtonElement>("[data-order-status-trigger]");
  const badge = trigger?.querySelector<HTMLElement>(".status-badge");
  if (!trigger || !badge) return;

  badge.textContent = label;
  badge.classList.forEach((className) => {
    if (statusBadgeVariantPattern.test(className)) {
      badge.classList.remove(className);
    }
  });
  badge.classList.add(`status-badge--${resolveStatusBadgeVariant("order", status)}`);
  trigger.setAttribute(
    "aria-label",
    `Order status: ${label}. Click to update.`,
  );
}

function updateStatusDependentControls(root: ParentNode, status: string) {
  const createInvoiceAction = root.querySelector<HTMLInputElement>(
    'input[name="action"][value="save-invoice"]',
  );
  const createInvoiceButton = createInvoiceAction
    ?.closest("form")
    ?.querySelector<HTMLButtonElement>('button[type="submit"]');

  if (createInvoiceButton) {
    createInvoiceButton.disabled = status !== "processing";
  }
}

export function initOrderStatusAutoSave({
  root = document,
  fetcher = fetch,
}: OrderStatusAutoSaveOptions = {}) {
  root.querySelectorAll<HTMLFormElement>("[data-order-status-form]").forEach((form) => {
    if (form.dataset[initializedFlag] === "true") return;

    const statusSelect = getStatusSelect(form);
    const saveUrl = getFormAction(form);
    if (!statusSelect || !saveUrl) return;

    form.dataset[initializedFlag] = "true";
    let lastSavedStatus = statusSelect.value;

    statusSelect.addEventListener("change", async () => {
      if (form.dataset[savingFlag] === "true" || statusSelect.value === lastSavedStatus) {
        return;
      }

      const nextStatus = statusSelect.value;
      const nextStatusLabel = getStatusBadgeLabel(nextStatus);
      const previousStatus = lastSavedStatus;
      const previousStatusLabel = getStatusBadgeLabel(previousStatus);
      const formData = new FormData(form);
      form.dataset[savingFlag] = "true";
      statusSelect.disabled = true;
      statusSelect.setAttribute("aria-busy", "true");
      clearDashboardFragmentCaches();
      updateVisibleStatus(form, root, nextStatus, nextStatusLabel);
      updateStatusDependentControls(root, nextStatus);

      try {
        const response = await fetcher(saveUrl, {
          method: "POST",
          body: formData,
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
          },
        });

        const result = await response.json() as AdminActionJsonResponse;

        if (!response.ok || !result.success) {
          throw new Error(result.error || `Order status update failed with ${response.status}.`);
        }

        lastSavedStatus = nextStatus;
      } catch {
        statusSelect.value = previousStatus;
        updateVisibleStatus(form, root, previousStatus, previousStatusLabel);
        updateStatusDependentControls(root, previousStatus);
      } finally {
        delete form.dataset[savingFlag];
        statusSelect.disabled = false;
        statusSelect.removeAttribute("aria-busy");
      }
    });
  });
}
