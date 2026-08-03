import type {
  OrderTargetProfile,
  OrderTargetProfileCustomer,
  OrderTargetProfilesResult,
} from "@/lib/admin-dashboard/order-target-profiles";
import { formatRecordCount } from "@/lib/admin-dashboard/pagination";
import {
  readDashboardFragmentCache,
  writeDashboardFragmentCache,
} from "@/lib/client/dashboard-fragment-cache";

export type OrderCustomerPickerFieldMap = {
  firstName?: HTMLInputElement | null;
  lastName?: HTMLInputElement | null;
  phoneNumber?: HTMLInputElement | null;
  email?: HTMLInputElement | null;
  address?: HTMLTextAreaElement | null;
  assignedAgentId?: HTMLSelectElement | null;
  isReseller?: HTMLInputElement | null;
};

export type OrderCustomerPickerSelection = {
  profile: OrderTargetProfile | null;
  customerId: string;
  agentId: string;
};

export type InitOrderCustomerPickerOptions = {
  scope: HTMLElement;
  customerOptionTemplate?: HTMLTemplateElement | null;
  apiEndpoint?: string;
  profileScope?: "customer-agent" | "customer";
  cacheKey?: string;
  newCustomerFields?: HTMLElement | null;
  fieldMap?: OrderCustomerPickerFieldMap;
  showPaymentNotice?: boolean;
  agentIdInput?: HTMLInputElement | null;
  onChange?: (selection: OrderCustomerPickerSelection) => void;
};

type OrderTargetProfilesResponse = OrderTargetProfilesResult & {
  summary: string;
};

function buildProfileCacheQuery(
  page: number,
  search: string,
  scope: "customer-agent" | "customer",
) {
  const params = new URLSearchParams();

  if (page > 1) {
    params.set("page", String(page));
  }

  if (scope !== "customer-agent") {
    params.set("scope", scope);
  }

  const normalizedSearch = search.trim();
  if (normalizedSearch.length > 0) {
    params.set("q", normalizedSearch);
  }

  return params.toString();
}

function readCachedProfiles(
  cacheKey: string,
  cacheQuery: string,
): OrderTargetProfilesResponse | null {
  const cachedValue = readDashboardFragmentCache(cacheKey, cacheQuery);
  if (!cachedValue) return null;

  try {
    return JSON.parse(cachedValue) as OrderTargetProfilesResponse;
  } catch {
    return null;
  }
}

function writeCachedProfiles(
  cacheKey: string,
  cacheQuery: string,
  result: OrderTargetProfilesResponse,
) {
  writeDashboardFragmentCache(cacheKey, cacheQuery, JSON.stringify(result));
}

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
    customerOptionTemplate = null,
    apiEndpoint,
    profileScope = "customer-agent",
    cacheKey = `order-target-profiles-${profileScope}-v1`,
    newCustomerFields = null,
    fieldMap = {},
    showPaymentNotice = false,
    agentIdInput = null,
    onChange,
  } = options;

  const customerSearch = scope.querySelector<HTMLInputElement>("[data-customer-search]");
  const customerIdInput = scope.querySelector<HTMLInputElement>("input[data-customer-id]");
  const customerPicker = scope.querySelector<HTMLElement>("[data-customer-picker]");
  const customerPickerToggle = scope.querySelector<HTMLButtonElement>("[data-customer-picker-toggle]");
  const customerPickerMenu = scope.querySelector<HTMLElement>("[data-customer-picker-menu]");
  const customerOptionsContainer = scope.querySelector<HTMLElement>("[data-customer-options]");
  const customerOptionsEmpty = scope.querySelector<HTMLElement>("[data-customer-options-empty]");
  const customerPickerSummary = scope.querySelector<HTMLElement>("[data-customer-picker-summary]");
  const customerPickerFooter = scope.querySelector<HTMLElement>("[data-customer-picker-footer]");
  const customerPickerTotalRecords = scope.querySelector<HTMLElement>("[data-customer-picker-total-records]");
  const customerPickerPaginationControls = scope.querySelector<HTMLElement>("[data-customer-picker-pagination-controls]");
  const customerPickerPageInput = scope.querySelector<HTMLInputElement>("[data-customer-picker-page]");
  const customerPickerPageTotal = scope.querySelector<HTMLElement>("[data-customer-picker-total]");
  const customerPickerPrev = customerPickerFooter?.querySelector<HTMLButtonElement>("[data-customer-picker-prev]") ?? null;
  const customerPickerNext = customerPickerFooter?.querySelector<HTMLButtonElement>("[data-customer-picker-next]") ?? null;
  const customerOrderNotice = showPaymentNotice
    ? scope.querySelector<HTMLElement>("[data-customer-order-notice]")
    : null;

  const firstNameInput = fieldMap.firstName
    ?? scope.querySelector<HTMLInputElement>("input[data-customer-first-name]");
  const lastNameInput = fieldMap.lastName
    ?? scope.querySelector<HTMLInputElement>("input[data-customer-last-name]");
  const isResellerCheckbox = fieldMap.isReseller
    ?? scope.querySelector<HTMLInputElement>("[data-customer-is-reseller]");

  const useApi = Boolean(apiEndpoint);
  const legacyCustomerOptionNodes = !useApi
    ? Array.from(
        customerOptionTemplate?.content.querySelectorAll<HTMLButtonElement>("[data-order-target-option], [data-customer-id]") ?? [],
      )
    : [];
  const legacyCustomerSearchCache = new Map<string, HTMLButtonElement[]>();

  let customerSearchTimer: number | undefined;
  let fetchGeneration = 0;
  let pendingPage: number | null = null;
  let displayedPage = 1;
  let totalPages = 1;
  let currentSearch = customerSearch?.value.trim() ?? "";
  let latestResult: OrderTargetProfilesResponse | null = null;
  let selectedProfile: OrderTargetProfile | null = null;

  const existingController = customerPicker
    ? (customerPicker as HTMLElement & {
        __orderCustomerPickerController?: { destroy: () => void };
      }).__orderCustomerPickerController
    : undefined;

  existingController?.destroy();

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
    customerPickerSummary?.setAttribute("hidden", "");
  }

  function showCustomerPickerSkeleton() {
    if (!customerOptionsContainer || !customerOptionsEmpty) return;

    customerOptionsEmpty.hidden = true;
    customerPickerSummary?.setAttribute("hidden", "");
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

  function updatePaginationControls(page: number, pages: number, hasPagination: boolean) {
    if (!customerPickerFooter || !customerPickerTotalRecords) return;

    customerPickerFooter.hidden = false;

    if (customerPickerPaginationControls && customerPickerPageInput && customerPickerPageTotal && customerPickerPrev && customerPickerNext) {
      customerPickerPaginationControls.hidden = !hasPagination;
      customerPickerPageInput.value = String(page);
      customerPickerPageTotal.textContent = String(pages);
      customerPickerPrev.disabled = page <= 1;
      customerPickerNext.disabled = page >= pages;
    }
  }

  function buildProfileOptionButton(profile: OrderTargetProfile) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "order-customer-picker__option";
    button.dataset.orderTargetOption = "";
    button.dataset.orderTargetType = profile.type;
    button.dataset.customerLabel = profile.label;

    const name = document.createElement("span");
    name.className = "order-customer-picker__option-name";
    name.textContent = profile.label;

    const type = document.createElement("span");
    type.className = "order-customer-picker__option-type";
    type.textContent = profile.type === "customer" ? "Customer" : "Agent";
    button.replaceChildren(name, type);

    if (profile.type === "customer") {
      button.dataset.customerId = profile.id;
      button.dataset.customerFirstName = profile.firstName;
      button.dataset.customerLastName = profile.lastName;
      button.dataset.customerPhoneNumber = profile.phoneNumber;
      button.dataset.customerEmail = profile.email;
      button.dataset.customerAddress = profile.address;
      button.dataset.customerAssignedAgentId = profile.assignedAgentId;
      button.dataset.customerIsReseller = String(profile.isReseller);
      button.dataset.customerPaymentNotice = profile.paymentNotice;
      button.dataset.customerBalance = String(profile.balance);
      button.dataset.customerCreditLimit = String(profile.creditLimit);
      button.dataset.customerCreditExceeded = String(profile.creditExceeded);
      return button;
    }

    button.dataset.agentId = profile.id;
    button.dataset.customerId = "";
    button.dataset.customerPhoneNumber = profile.phoneNumber;
    button.dataset.customerEmail = profile.email;
    button.dataset.customerFirstName = "";
    button.dataset.customerLastName = "";
    button.dataset.customerAddress = "";
    button.dataset.customerAssignedAgentId = "";
    button.dataset.customerIsReseller = "false";
    button.dataset.customerPaymentNotice = "";
    button.dataset.customerBalance = "0";
    button.dataset.customerCreditLimit = "0";
    button.dataset.customerCreditExceeded = "false";
    return button;
  }

  function renderApiResult(result: OrderTargetProfilesResponse) {
    if (!customerOptionsContainer || !customerOptionsEmpty) return;

    latestResult = result;
    displayedPage = result.page;
    totalPages = result.totalPages;
    pendingPage = null;
    currentSearch = result.search;

    if (result.items.length === 0) {
      if (customerPickerFooter && customerPickerTotalRecords) {
        customerPickerFooter.hidden = false;
        customerPickerTotalRecords.textContent = formatRecordCount(result.totalProfiles);
      }
      updatePaginationControls(result.page, result.totalPages, result.hasPagination);
      showCustomerPickerMessage(result.search.length > 0 ? "No match found" : "No customers or agents found.");
      return;
    }

    customerOptionsEmpty.hidden = true;
    customerOptionsContainer.replaceChildren(
      ...result.items.map((profile) => buildProfileOptionButton(profile)),
    );

    if (customerPickerSummary) {
      if (result.search.length === 0 && result.summary.length > 0) {
        customerPickerSummary.textContent = result.summary;
        customerPickerSummary.hidden = false;
      } else {
        customerPickerSummary.hidden = true;
      }
    }

    if (customerPickerFooter && customerPickerTotalRecords) {
      customerPickerFooter.hidden = false;
      customerPickerTotalRecords.textContent = formatRecordCount(result.totalProfiles);
    }

    updatePaginationControls(result.page, result.totalPages, result.hasPagination);
  }

  async function loadProfiles(page: number, search = currentSearch) {
    if (!apiEndpoint) return;

    const generation = ++fetchGeneration;
    const requestedPage = Math.min(Math.max(Math.trunc(page), 1), Math.max(totalPages, 1));
    const requestedSearch = search.trim();
    const cacheQuery = buildProfileCacheQuery(requestedPage, requestedSearch, profileScope);
    const cachedResult = readCachedProfiles(cacheKey, cacheQuery);

    pendingPage = requestedPage;
    currentSearch = requestedSearch;

    if (cachedResult) {
      if (generation !== fetchGeneration) {
        return;
      }

      renderApiResult(cachedResult);
      return;
    }

    showCustomerPickerSkeleton();
    updatePaginationControls(requestedPage, totalPages, totalPages > 1);

    const params = new URLSearchParams();
    params.set("page", String(requestedPage));
    params.set("scope", profileScope);
    if (requestedSearch.length > 0) {
      params.set("q", requestedSearch);
    }

    try {
      const response = await fetch(`${apiEndpoint}?${params.toString()}`, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Unable to load profiles.");
      }

      const result = await response.json() as OrderTargetProfilesResponse;

      if (generation !== fetchGeneration) {
        return;
      }

      writeCachedProfiles(cacheKey, cacheQuery, result);
      renderApiResult(result);
    } catch {
      if (generation !== fetchGeneration) {
        return;
      }

      pendingPage = null;
      updatePaginationControls(displayedPage, totalPages, totalPages > 1);
      showCustomerPickerMessage("Unable to load profiles. Try again.");
    }
  }

  function requestPage(page: number, search = currentSearch) {
    const nextPage = Math.min(Math.max(Math.trunc(page), 1), Math.max(totalPages, 1));

    if (pendingPage === nextPage && currentSearch === search.trim()) {
      return;
    }

    void loadProfiles(nextPage, search);
  }

  function renderLegacyCustomerOptions(searchTerm: string) {
    if (!customerOptionsContainer || !customerOptionsEmpty) return;

    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (normalizedSearch.length === 0) {
      showCustomerPickerMessage("Try entering customer name");
      return;
    }

    const matchingCustomers = legacyCustomerSearchCache.get(normalizedSearch)
      ?? legacyCustomerOptionNodes
          .filter((customer) =>
            (customer.dataset.customerLabel ?? "").toLowerCase().includes(normalizedSearch) ||
            (customer.dataset.customerEmail ?? "").toLowerCase().includes(normalizedSearch) ||
            (customer.dataset.customerPhoneNumber ?? "").toLowerCase().includes(normalizedSearch)
          )
          .slice(0, 25);

    if (!legacyCustomerSearchCache.has(normalizedSearch)) {
      legacyCustomerSearchCache.set(normalizedSearch, matchingCustomers);
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

  function renderCustomerOptions(searchTerm: string, page = displayedPage) {
    const normalizedSearch = searchTerm.trim();

    if (useApi) {
      requestPage(page, normalizedSearch);
      return;
    }

    renderLegacyCustomerOptions(searchTerm);
  }

  function getRenderedCustomerOptions() {
    return Array.from(
      customerOptionsContainer?.querySelectorAll<HTMLButtonElement>("[data-order-target-option], [data-customer-id]") ?? [],
    );
  }

  function getSelectedOptionElement() {
    return getRenderedCustomerOptions().find(
      (option) => option.dataset.customerLabel === customerSearch?.value,
    );
  }

  function profileFromOption(option: HTMLElement | undefined): OrderTargetProfile | null {
    if (!option) return null;

    if (option.dataset.orderTargetType === "agent") {
      const agentId = option.dataset.agentId ?? "";
      if (!agentId) return null;

      return {
        type: "agent",
        id: agentId,
        label: option.dataset.customerLabel ?? "",
        phoneNumber: option.dataset.customerPhoneNumber ?? "",
        email: option.dataset.customerEmail ?? "",
      };
    }

    const customerId = option.dataset.customerId ?? "";
    if (!customerId) return null;

    return {
      type: "customer",
      id: customerId,
      label: option.dataset.customerLabel ?? "",
      firstName: option.dataset.customerFirstName ?? "",
      lastName: option.dataset.customerLastName ?? "",
      phoneNumber: option.dataset.customerPhoneNumber ?? "",
      email: option.dataset.customerEmail ?? "",
      address: option.dataset.customerAddress ?? "",
      assignedAgentId: option.dataset.customerAssignedAgentId ?? "",
      isReseller: option.dataset.customerIsReseller === "true",
      paymentNotice: (option.dataset.customerPaymentNotice ?? "") as "" | "unpaid" | "partial",
      balance: Number(option.dataset.customerBalance ?? 0),
      creditLimit: Number(option.dataset.customerCreditLimit ?? 1000),
      creditExceeded: option.dataset.customerCreditExceeded === "true",
    };
  }

  function getCustomerFieldRoot() {
    return newCustomerFields ?? scope;
  }

  function fillCustomerFields(profile: OrderTargetProfileCustomer | null) {
    const root = getCustomerFieldRoot();
    const firstName = fieldMap.firstName
      ?? root.querySelector<HTMLInputElement>("input[data-customer-first-name]");
    const lastName = fieldMap.lastName
      ?? root.querySelector<HTMLInputElement>("input[data-customer-last-name]");
    const phoneNumber = fieldMap.phoneNumber
      ?? root.querySelector<HTMLInputElement>("input[data-customer-phone-number]");
    const email = fieldMap.email
      ?? root.querySelector<HTMLInputElement>("input[data-customer-email]");
    const address = fieldMap.address
      ?? root.querySelector<HTMLTextAreaElement>("textarea[data-customer-address]");
    const assignedAgent = fieldMap.assignedAgentId
      ?? root.querySelector<HTMLSelectElement>("[data-customer-assigned-agent-id]");
    const isReseller = fieldMap.isReseller
      ?? root.querySelector<HTMLInputElement>("[data-customer-is-reseller]");

    if (firstName) {
      firstName.value = profile?.firstName ?? "";
    }
    if (lastName) lastName.value = profile?.lastName ?? "";
    if (phoneNumber) phoneNumber.value = profile?.phoneNumber ?? "";
    if (email) email.value = profile?.email ?? "";
    if (address) address.value = profile?.address ?? "";
    if (assignedAgent) {
      assignedAgent.value = profile?.assignedAgentId ?? "";
    }
    if (isReseller) {
      isReseller.checked = profile?.isReseller ?? false;
    }
  }

  function updateCustomerOrderNotice(profile: OrderTargetProfileCustomer | null) {
    if (!customerOrderNotice) return;

    const paymentNotice = profile?.paymentNotice ?? "";
    const customerBalance = Number(profile?.balance ?? 0);
    const creditLimit = Number(profile?.creditLimit ?? 1000);
    const creditLimitExceeded = profile?.creditExceeded ?? false;
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

  function getSelection(): OrderCustomerPickerSelection {
    const customerProfile = selectedProfile?.type === "customer" ? selectedProfile : null;
    const agentProfile = selectedProfile?.type === "agent" ? selectedProfile : null;

    return {
      profile: selectedProfile,
      customerId: customerProfile?.id ?? "",
      agentId: agentProfile?.id ?? "",
    };
  }

  function refreshCustomerMode() {
    const selectedOption = getSelectedOptionElement();
    const matchedProfile = profileFromOption(selectedOption);

    if (matchedProfile) {
      selectedProfile = matchedProfile;
    } else if (customerSearch?.value.trim() !== selectedProfile?.label) {
      selectedProfile = null;
    }

    const selection = getSelection();
    const hasAgentTarget = selection.agentId.length > 0;
    const selectedCustomerId = hasAgentTarget ? "" : selection.customerId;

    if (customerIdInput) {
      customerIdInput.value = selectedCustomerId;
    }
    if (agentIdInput) {
      agentIdInput.value = selection.agentId;
    }

    if (hasAgentTarget) {
      fillCustomerFields(null);
      updateCustomerOrderNotice(null);
    } else if (selectedProfile?.type === "customer") {
      fillCustomerFields(selectedProfile);
      updateCustomerOrderNotice(selectedProfile);
    } else {
      updateCustomerOrderNotice(null);
    }

    const fields = newCustomerFields?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input, select, textarea",
    );
    const hasExistingCustomer = selectedCustomerId.length > 0;
    fields?.forEach((field) => {
      if (field === customerIdInput) return;
      field.disabled = hasAgentTarget || hasExistingCustomer;
      field.required = !hasAgentTarget && !hasExistingCustomer;
    });
    newCustomerFields?.toggleAttribute("hidden", hasAgentTarget);
    newCustomerFields?.toggleAttribute("data-disabled", hasAgentTarget || hasExistingCustomer);
    onChange?.(selection);
  }

  function isPickerInteractionTarget(target: EventTarget | null) {
    if (!(target instanceof Node)) return false;
    if (customerPicker?.contains(target)) return true;
    return customerPickerMenu?.contains(target) ?? false;
  }

  function handleDocumentPointerDown(event: PointerEvent) {
    if (isPickerInteractionTarget(event.target)) return;
    setCustomerPickerOpen(false);
  }

  function handleCustomerSearchInput() {
    window.clearTimeout(customerSearchTimer);
    setCustomerPickerOpen(true);

    const searchValue = customerSearch?.value ?? "";
    const normalizedSearch = searchValue.trim();

    if (normalizedSearch.length === 0) {
      if (currentSearch.length > 0) {
        requestPage(1, "");
      }
      refreshCustomerMode();
      return;
    }

    if (useApi) {
      showCustomerPickerSkeleton();
    }

    customerSearchTimer = window.setTimeout(() => {
      requestPage(1, normalizedSearch);
      refreshCustomerMode();
    }, useApi ? 300 : 450);
  }

  function handleCustomerSearchFocus() {
    const isOpen = customerPickerToggle?.getAttribute("aria-expanded") === "true";
    setCustomerPickerOpen(true);

    if (!isOpen && latestResult === null) {
      requestPage(displayedPage);
    }
  }

  function handleCustomerPickerToggle() {
    const willOpen = customerPickerToggle?.getAttribute("aria-expanded") !== "true";
    setCustomerPickerOpen(willOpen);

    if (willOpen && latestResult === null) {
      requestPage(displayedPage);
    }
  }

  function handleCustomerOptionClick(event: Event) {
    const target = event.target;
    const option = target instanceof HTMLElement
      ? target.closest<HTMLButtonElement>("[data-order-target-option], [data-customer-id]")
      : null;

    if (!option || !customerSearch) return;

    selectedProfile = profileFromOption(option);
    customerSearch.value = option.dataset.customerLabel ?? "";
    refreshCustomerMode();
    setCustomerPickerOpen(false);
  }

  function stopPickerControlEvent(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function handlePrevPageClick(event: Event) {
    stopPickerControlEvent(event);
    if (customerPickerPrev?.disabled) return;
    window.clearTimeout(customerSearchTimer);
    requestPage(displayedPage - 1);
  }

  function handleNextPageClick(event: Event) {
    stopPickerControlEvent(event);
    if (customerPickerNext?.disabled) return;
    window.clearTimeout(customerSearchTimer);
    requestPage(displayedPage + 1);
  }

  function handlePageInputCommit(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches("[data-customer-picker-page]")) {
      return;
    }

    stopPickerControlEvent(event);
    window.clearTimeout(customerSearchTimer);

    const page = Number(target.value);
    requestPage(Number.isInteger(page) && page > 0 ? page : 1);
  }

  function handlePageInputKeydown(event: KeyboardEvent) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches("[data-customer-picker-page]")) {
      return;
    }

    if (event.key !== "Enter") return;

    stopPickerControlEvent(event);
    window.clearTimeout(customerSearchTimer);

    const page = Number(target.value);
    requestPage(Number.isInteger(page) && page > 0 ? page : 1);
  }

  const pickerEventOptions = { capture: true } as const;

  customerSearch?.addEventListener("input", handleCustomerSearchInput);
  customerSearch?.addEventListener("focus", handleCustomerSearchFocus);
  customerPickerToggle?.addEventListener("click", handleCustomerPickerToggle);
  customerOptionsContainer?.addEventListener("click", handleCustomerOptionClick);
  customerPickerPrev?.addEventListener("click", handlePrevPageClick, pickerEventOptions);
  customerPickerNext?.addEventListener("click", handleNextPageClick, pickerEventOptions);
  customerPickerPageInput?.addEventListener("change", handlePageInputCommit, pickerEventOptions);
  customerPickerPageInput?.addEventListener("keydown", handlePageInputKeydown, pickerEventOptions);
  document.addEventListener("pointerdown", handleDocumentPointerDown, pickerEventOptions);

  renderCustomerOptions(customerSearch?.value ?? "", 1);
  setCustomerPickerOpen(false);
  refreshCustomerMode();

  const controller = {
    refresh: refreshCustomerMode,
    getSelection,
    getSelectedCustomerLabel() {
      const selection = getSelection();
      if (selection.profile) {
        return selection.profile.label;
      }

      const firstName = firstNameInput?.value.trim() ?? "";
      const lastName = lastNameInput?.value.trim() ?? "";
      const fullName = `${firstName} ${lastName}`.trim();
      return fullName || "New customer";
    },
    isSelectedCustomerReseller() {
      if (getSelection().agentId) {
        return false;
      }

      if (selectedProfile?.type === "customer") {
        return selectedProfile.isReseller;
      }

      return isResellerCheckbox?.checked ?? false;
    },
    getSelectedCustomerProfile() {
      return selectedProfile?.type === "customer" ? selectedProfile : null;
    },
    destroy() {
      window.clearTimeout(customerSearchTimer);
      fetchGeneration += 1;
      customerSearch?.removeEventListener("input", handleCustomerSearchInput);
      customerSearch?.removeEventListener("focus", handleCustomerSearchFocus);
      customerPickerToggle?.removeEventListener("click", handleCustomerPickerToggle);
      customerOptionsContainer?.removeEventListener("click", handleCustomerOptionClick);
      customerPickerPrev?.removeEventListener("click", handlePrevPageClick, pickerEventOptions);
      customerPickerNext?.removeEventListener("click", handleNextPageClick, pickerEventOptions);
      customerPickerPageInput?.removeEventListener("change", handlePageInputCommit, pickerEventOptions);
      customerPickerPageInput?.removeEventListener("keydown", handlePageInputKeydown, pickerEventOptions);
      document.removeEventListener("pointerdown", handleDocumentPointerDown, pickerEventOptions);

      if (customerPicker) {
        delete (customerPicker as HTMLElement & {
          __orderCustomerPickerController?: { destroy: () => void };
        }).__orderCustomerPickerController;
      }
    },
  };

  if (customerPicker) {
    (customerPicker as HTMLElement & {
      __orderCustomerPickerController?: typeof controller;
    }).__orderCustomerPickerController = controller;
  }

  return controller;
}
