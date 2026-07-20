export type OrderCustomerPickerFieldMap = {
  firstName?: HTMLInputElement | null;
  lastName?: HTMLInputElement | null;
  phoneNumber?: HTMLInputElement | null;
  email?: HTMLInputElement | null;
  address?: HTMLTextAreaElement | null;
  assignedAgentId?: HTMLSelectElement | null;
  isReseller?: HTMLInputElement | null;
};

export type InitOrderCustomerPickerOptions = {
  scope: HTMLElement;
  customerOptionTemplate: HTMLTemplateElement;
  newCustomerFields?: HTMLElement | null;
  fieldMap?: OrderCustomerPickerFieldMap;
  showPaymentNotice?: boolean;
  onChange?: () => void;
};

function formatCompactCurrencyForClient(value: number) {
  const normalizedValue = Number.isFinite(value) ? value : 0;
  const absoluteValue = Math.abs(normalizedValue);
  const sign = normalizedValue < 0 ? "-" : "";
  const currencySymbol = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).formatToParts(0).find((part) => part.type === "currency")?.value ?? "PHP";

  if (absoluteValue >= 1000) {
    const compactValue = new Intl.NumberFormat("en-PH", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
    }).format(absoluteValue / 1000);

    return `${sign}${currencySymbol}${compactValue}k`;
  }

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(normalizedValue);
}

export function initOrderCustomerPicker(options: InitOrderCustomerPickerOptions) {
  const {
    scope,
    customerOptionTemplate,
    newCustomerFields = null,
    fieldMap = {},
    showPaymentNotice = false,
    onChange,
  } = options;

  const customerSearch = scope.querySelector<HTMLInputElement>("[data-customer-search]");
  const customerIdInput = scope.querySelector<HTMLInputElement>("[data-customer-id]");
  const customerPicker = scope.querySelector<HTMLElement>("[data-customer-picker]");
  const customerPickerToggle = scope.querySelector<HTMLButtonElement>("[data-customer-picker-toggle]");
  const customerPickerMenu = scope.querySelector<HTMLElement>("[data-customer-picker-menu]");
  const customerOptionsContainer = scope.querySelector<HTMLElement>("[data-customer-options]");
  const customerOptionsEmpty = scope.querySelector<HTMLElement>("[data-customer-options-empty]");
  const customerOrderNotice = showPaymentNotice
    ? scope.querySelector<HTMLElement>("[data-customer-order-notice]")
    : null;

  const firstNameInput = fieldMap.firstName
    ?? scope.querySelector<HTMLInputElement>("[data-customer-first-name]");
  const lastNameInput = fieldMap.lastName
    ?? scope.querySelector<HTMLInputElement>("[data-customer-last-name]");
  const phoneNumberInput = fieldMap.phoneNumber
    ?? scope.querySelector<HTMLInputElement>("[data-customer-phone-number]");
  const emailInput = fieldMap.email
    ?? scope.querySelector<HTMLInputElement>("[data-customer-email]");
  const addressTextarea = fieldMap.address
    ?? scope.querySelector<HTMLTextAreaElement>("[data-customer-address]");
  const assignedAgentSelect = fieldMap.assignedAgentId
    ?? scope.querySelector<HTMLSelectElement>("[data-customer-assigned-agent-id]");
  const isResellerCheckbox = fieldMap.isReseller
    ?? scope.querySelector<HTMLInputElement>("[data-customer-is-reseller]");

  const customerOptionNodes = Array.from(
    customerOptionTemplate.content.querySelectorAll<HTMLButtonElement>("[data-customer-id]"),
  );
  const customerSearchCache = new Map<string, HTMLButtonElement[]>();
  let customerSearchTimer: number | undefined;

  function setCustomerPickerOpen(isOpen: boolean) {
    if (!customerPicker || !customerPickerMenu || !customerPickerToggle) return;
    customerPickerMenu.hidden = !isOpen;
    customerPickerToggle.setAttribute("aria-expanded", String(isOpen));
    customerPicker.dataset.open = String(isOpen);
  }

  function showCustomerPickerMessage(message: string) {
    if (!customerOptionsContainer || !customerOptionsEmpty) return;
    customerOptionsContainer.replaceChildren();
    customerOptionsEmpty.textContent = message;
    customerOptionsEmpty.hidden = false;
  }

  function showCustomerPickerSkeleton() {
    if (!customerOptionsContainer || !customerOptionsEmpty) return;

    customerOptionsEmpty.hidden = true;
    customerOptionsContainer.replaceChildren(
      ...Array.from({ length: 3 }, () => {
        const skeleton = document.createElement("div");
        skeleton.className = "order-customer-picker__skeleton";
        skeleton.innerHTML = `
            <span class="table-skeleton-block table-skeleton-block--wide"></span>
          `;
        return skeleton;
      }),
    );
  }

  function renderCustomerOptions(searchTerm: string) {
    if (!customerOptionsContainer || !customerOptionsEmpty) return;

    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (normalizedSearch.length === 0) {
      showCustomerPickerMessage("Try entering customer name");
      return;
    }

    const matchingCustomers = customerSearchCache.get(normalizedSearch)
      ?? customerOptionNodes
          .filter((customer) =>
            (customer.dataset.customerLabel ?? "").toLowerCase().includes(normalizedSearch) ||
            (customer.dataset.customerEmail ?? "").toLowerCase().includes(normalizedSearch) ||
            (customer.dataset.customerPhoneNumber ?? "").toLowerCase().includes(normalizedSearch)
          )
          .slice(0, 25);

    if (!customerSearchCache.has(normalizedSearch)) {
      customerSearchCache.set(normalizedSearch, matchingCustomers);
    }

    customerOptionsContainer.replaceChildren(
      ...matchingCustomers.map((customer) => customer.cloneNode(true)),
    );

    if (matchingCustomers.length === 0) {
      showCustomerPickerMessage("No match found");
      return;
    }

    customerOptionsEmpty.hidden = true;
  }

  function getRenderedCustomerOptions() {
    return Array.from(
      customerOptionsContainer?.querySelectorAll<HTMLButtonElement>("[data-customer-id]") ?? [],
    );
  }

  function getSelectedCustomer() {
    return getRenderedCustomerOptions().find(
      (option) => option.dataset.customerLabel === customerSearch?.value,
    );
  }

  function fillCustomerFields(customer: HTMLElement | undefined) {
    if (firstNameInput) firstNameInput.value = customer?.dataset.customerFirstName ?? "";
    if (lastNameInput) lastNameInput.value = customer?.dataset.customerLastName ?? "";
    if (phoneNumberInput) phoneNumberInput.value = customer?.dataset.customerPhoneNumber ?? "";
    if (emailInput) emailInput.value = customer?.dataset.customerEmail ?? "";
    if (addressTextarea) addressTextarea.value = customer?.dataset.customerAddress ?? "";
    if (assignedAgentSelect) {
      assignedAgentSelect.value = customer?.dataset.customerAssignedAgentId ?? "";
    }
    if (isResellerCheckbox) {
      isResellerCheckbox.checked = customer?.dataset.customerIsReseller === "true";
    }
  }

  function updateCustomerOrderNotice(customer: HTMLElement | undefined) {
    if (!customerOrderNotice) return;

    const paymentNotice = customer?.dataset.customerPaymentNotice;
    const customerBalance = Number(customer?.dataset.customerBalance ?? 0);
    const creditLimit = Number(customer?.dataset.customerCreditLimit ?? 1000);
    const creditLimitExceeded = customer?.dataset.customerCreditExceeded === "true";
    const balanceLabel = Number.isFinite(customerBalance) && customerBalance > 0
      ? ` Overall balance: ${formatCompactCurrencyForClient(customerBalance)}.`
      : "";
    const creditLabel = Number.isFinite(creditLimit)
      ? ` Credit limit: ${formatCompactCurrencyForClient(creditLimit)}.`
      : "";

    if (creditLimitExceeded) {
      customerOrderNotice.textContent = `This customer has exceeded their credit limit.${balanceLabel}${creditLabel}`;
      customerOrderNotice.dataset.noticeKind = "unpaid";
      customerOrderNotice.hidden = false;
      return;
    }

    if (paymentNotice === "unpaid") {
      customerOrderNotice.textContent = `This customer currently has an unpaid order.${balanceLabel}${creditLabel}`;
      customerOrderNotice.dataset.noticeKind = "unpaid";
      customerOrderNotice.hidden = false;
      return;
    }

    if (paymentNotice === "partial") {
      customerOrderNotice.textContent = `This customer currently has a partially paid order.${balanceLabel}${creditLabel}`;
      customerOrderNotice.dataset.noticeKind = "partial";
      customerOrderNotice.hidden = false;
      return;
    }

    if (customerBalance > 0) {
      customerOrderNotice.textContent = `Overall balance: ${formatCompactCurrencyForClient(customerBalance)}.${creditLabel}`;
      customerOrderNotice.dataset.noticeKind = "partial";
      customerOrderNotice.hidden = false;
      return;
    }

    customerOrderNotice.textContent = "";
    customerOrderNotice.hidden = true;
    delete customerOrderNotice.dataset.noticeKind;
  }

  function refreshCustomerMode() {
    const selectedCustomer = getSelectedCustomer();
    const selectedCustomerId = selectedCustomer?.dataset.customerId ?? "";

    if (customerIdInput) {
      customerIdInput.value = selectedCustomerId;
    }

    fillCustomerFields(selectedCustomer);
    updateCustomerOrderNotice(selectedCustomer);

    const fields = newCustomerFields?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input, select, textarea",
    );
    fields?.forEach((field) => {
      field.disabled = selectedCustomerId.length > 0;
      field.required = selectedCustomerId.length === 0;
    });
    newCustomerFields?.toggleAttribute("hidden", selectedCustomerId.length > 0);
    newCustomerFields?.toggleAttribute("data-disabled", selectedCustomerId.length > 0);
    onChange?.();
  }

  function handleDocumentClick(event: MouseEvent) {
    if (!customerPicker) return;
    const target = event.target;
    if (target instanceof Node && customerPicker.contains(target)) return;
    setCustomerPickerOpen(false);
  }

  function handleCustomerSearchInput() {
    window.clearTimeout(customerSearchTimer);
    setCustomerPickerOpen(true);

    const searchValue = customerSearch?.value ?? "";
    if (searchValue.trim().length === 0) {
      renderCustomerOptions("");
      refreshCustomerMode();
      return;
    }

    showCustomerPickerSkeleton();
    customerSearchTimer = window.setTimeout(() => {
      renderCustomerOptions(searchValue);
      refreshCustomerMode();
    }, 450);
  }

  function handleCustomerSearchFocus() {
    renderCustomerOptions(customerSearch?.value ?? "");
    setCustomerPickerOpen(true);
  }

  function handleCustomerPickerToggle() {
    renderCustomerOptions(customerSearch?.value ?? "");
    const isOpen = customerPickerToggle?.getAttribute("aria-expanded") === "true";
    setCustomerPickerOpen(!isOpen);
  }

  function handleCustomerOptionClick(event: Event) {
    const target = event.target;
    const option = target instanceof HTMLElement
      ? target.closest<HTMLButtonElement>("[data-customer-id]")
      : null;

    if (!option || !customerSearch) return;

    customerSearch.value = option.dataset.customerLabel ?? "";
    refreshCustomerMode();
    setCustomerPickerOpen(false);
  }

  customerSearch?.addEventListener("input", handleCustomerSearchInput);
  customerSearch?.addEventListener("focus", handleCustomerSearchFocus);
  customerPickerToggle?.addEventListener("click", handleCustomerPickerToggle);
  customerOptionsContainer?.addEventListener("click", handleCustomerOptionClick);
  document.addEventListener("click", handleDocumentClick);

  renderCustomerOptions(customerSearch?.value ?? "");
  setCustomerPickerOpen(false);
  refreshCustomerMode();

  return {
    refresh: refreshCustomerMode,
    getSelectedCustomerLabel() {
      const selectedCustomerId = customerIdInput?.value.trim() ?? "";
      if (selectedCustomerId.length > 0) {
        return customerSearch?.value.trim() || "Existing customer";
      }

      const firstName = firstNameInput?.value.trim() ?? "";
      const lastName = lastNameInput?.value.trim() ?? "";
      const fullName = `${firstName} ${lastName}`.trim();
      return fullName || "New customer";
    },
    destroy() {
      window.clearTimeout(customerSearchTimer);
      customerSearch?.removeEventListener("input", handleCustomerSearchInput);
      customerSearch?.removeEventListener("focus", handleCustomerSearchFocus);
      customerPickerToggle?.removeEventListener("click", handleCustomerPickerToggle);
      customerOptionsContainer?.removeEventListener("click", handleCustomerOptionClick);
      document.removeEventListener("click", handleDocumentClick);
    },
  };
}
