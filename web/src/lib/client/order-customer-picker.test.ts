import { beforeEach, describe, expect, it, vi } from "vitest";

import { initOrderCustomerPicker } from "./order-customer-picker";

function renderPicker() {
  document.body.innerHTML = `
    <form id="create-order-form">
      <div data-customer-picker>
        <input data-customer-search />
        <button type="button" data-customer-picker-toggle aria-expanded="false">Toggle</button>
        <div hidden data-customer-picker-menu>
          <p hidden data-customer-picker-summary></p>
          <div data-customer-options></div>
          <p hidden data-customer-options-empty></p>
          <div hidden data-customer-picker-footer>
            <span data-customer-picker-total-records></span>
            <div hidden data-customer-picker-pagination-controls>
              <button type="button" data-customer-picker-prev>Previous</button>
              <input type="text" data-customer-picker-page value="1" />
              <span>of <span data-customer-picker-total>1</span></span>
              <button type="button" data-customer-picker-next>Next</button>
            </div>
          </div>
        </div>
      </div>
      <input type="hidden" data-customer-id />
      <input type="hidden" data-agent-order-agent-id />
      <p hidden data-customer-order-notice></p>
      <section data-new-customer-fields>
        <input data-customer-first-name required />
        <input data-customer-last-name required />
        <input data-customer-phone-number required />
        <input data-customer-email />
        <select data-customer-assigned-agent-id>
          <option value="">None</option>
          <option value="agent-1">Agent One</option>
        </select>
        <input type="checkbox" data-customer-is-reseller />
        <textarea data-customer-address required></textarea>
      </section>
    </form>
  `;

  return document.querySelector<HTMLFormElement>("#create-order-form")!;
}

function mockProfilesResponse(overrides: Record<string, unknown> = {}) {
  return {
    items: [
      {
        type: "customer",
        id: "customer-1",
        label: "Ana Buyer",
        firstName: "Ana",
        lastName: "Buyer",
        phoneNumber: "09170000000",
        email: "ana@example.test",
        address: "Market",
        assignedAgentId: "",
        isReseller: false,
        paymentNotice: "",
        balance: 0,
        creditLimit: 1000,
        creditExceeded: false,
      },
      {
        type: "agent",
        id: "agent-1",
        label: "Maria Agent",
        phoneNumber: "09171112222",
        email: "maria@example.test",
      },
    ],
    totalProfiles: 128,
    customerTotal: 100,
    agentTotal: 28,
    page: 1,
    pageSize: 10,
    segmentPageSize: 10,
    totalPages: 13,
    hasPagination: true,
    suggestedCount: 10,
    search: "",
    scope: "customer-agent",
    summary: "Try entering a customer or agent name.",
    ...overrides,
  };
}

describe("initOrderCustomerPicker", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("loads paginated suggestions from the API on init", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockProfilesResponse(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const form = renderPicker();
    initOrderCustomerPicker({
      scope: form,
      apiEndpoint: "/admin/order-target-profiles.json",
      profileScope: "customer-agent",
      newCustomerFields: form.querySelector("[data-new-customer-fields]"),
      showPaymentNotice: true,
      agentIdInput: form.querySelector("[data-agent-order-agent-id]"),
    });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/admin/order-target-profiles.json?page=1&scope=customer-agent",
        expect.objectContaining({ headers: { Accept: "application/json" } }),
      );
    });

    const summary = form.querySelector<HTMLElement>("[data-customer-picker-summary]");
    await vi.waitFor(() => {
      expect(summary?.textContent).toBe("Try entering a customer or agent name.");
    });

    const options = form.querySelectorAll<HTMLButtonElement>(".order-customer-picker__option");

    expect(summary?.hidden).toBe(false);
    expect(form.querySelector<HTMLElement>("[data-customer-picker-footer]")?.hidden).toBe(false);
    expect(options).toHaveLength(2);
    expect(options[0]?.querySelector(".order-customer-picker__option-name")?.textContent).toBe("Ana Buyer");
    expect(options[0]?.querySelector(".order-customer-picker__option-type")?.textContent).toBe("Customer");
    expect(options[1]?.querySelector(".order-customer-picker__option-name")?.textContent).toBe("Maria Agent");
    expect(options[1]?.querySelector(".order-customer-picker__option-type")?.textContent).toBe("Agent");
  });

  it("requests the next page when pagination is used", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockProfilesResponse(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockProfilesResponse({
          page: 2,
          items: [
            {
              type: "customer",
              id: "customer-2",
              label: "Ben Buyer",
              firstName: "Ben",
              lastName: "Buyer",
              phoneNumber: "09170000001",
              email: "",
              address: "City",
              assignedAgentId: "",
              isReseller: false,
              paymentNotice: "",
              balance: 0,
              creditLimit: 1000,
              creditExceeded: false,
            },
          ],
          suggestedCount: 1,
          summary: "Try entering a customer or agent name.",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const form = renderPicker();
    initOrderCustomerPicker({
      scope: form,
      apiEndpoint: "/admin/order-target-profiles.json",
      profileScope: "customer-agent",
    });

    await vi.waitFor(() => {
      expect(form.querySelectorAll(".order-customer-picker__option")).toHaveLength(2);
    });

    form.querySelector<HTMLButtonElement>("[data-customer-picker-next]")?.click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/admin/order-target-profiles.json?page=2&scope=customer-agent",
        expect.any(Object),
      );
      expect(form.querySelector<HTMLInputElement>("[data-customer-picker-page]")?.value)
        .toBe("2");
      expect(form.querySelector<HTMLElement>("[data-customer-picker-total]")?.textContent)
        .toBe("13");
    });
  });

  it("serves cached pages without refetching when revisiting pagination", async () => {
    const pageTwoResponse = mockProfilesResponse({
      page: 2,
      items: [
        {
          type: "customer",
          id: "customer-2",
          label: "Ben Buyer",
          firstName: "Ben",
          lastName: "Buyer",
          phoneNumber: "09170000001",
          email: "",
          address: "City",
          assignedAgentId: "",
          isReseller: false,
          paymentNotice: "",
          balance: 0,
          creditLimit: 1000,
          creditExceeded: false,
        },
      ],
      suggestedCount: 1,
      summary: "Try entering a customer or agent name.",
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockProfilesResponse(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => pageTwoResponse,
      });
    vi.stubGlobal("fetch", fetchMock);

    const form = renderPicker();
    initOrderCustomerPicker({
      scope: form,
      apiEndpoint: "/admin/order-target-profiles.json",
      profileScope: "customer-agent",
      cacheKey: "admin-order-target-profiles-v1",
    });

    await vi.waitFor(() => {
      expect(form.querySelectorAll(".order-customer-picker__option")).toHaveLength(2);
    });

    form.querySelector<HTMLButtonElement>("[data-customer-picker-next]")?.click();

    await vi.waitFor(() => {
      expect(form.querySelector<HTMLInputElement>("[data-customer-picker-page]")?.value).toBe("2");
      expect(form.querySelector(".order-customer-picker__option-name")?.textContent).toBe("Ben Buyer");
    });

    form.querySelector<HTMLButtonElement>("[data-customer-picker-prev]")?.click();

    await vi.waitFor(() => {
      expect(form.querySelector<HTMLInputElement>("[data-customer-picker-page]")?.value).toBe("1");
      expect(form.querySelector(".order-customer-picker__option-name")?.textContent).toBe("Ana Buyer");
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(form.querySelectorAll(".order-customer-picker__skeleton")).toHaveLength(0);
  });

  it("requests the next page when pagination is used inside a label wrapper", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockProfilesResponse(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockProfilesResponse({
          page: 2,
          items: [
            {
              type: "customer",
              id: "customer-2",
              label: "Ben Buyer",
              firstName: "Ben",
              lastName: "Buyer",
              phoneNumber: "09170000001",
              email: "",
              address: "City",
              assignedAgentId: "",
              isReseller: false,
              paymentNotice: "",
              balance: 0,
              creditLimit: 1000,
              creditExceeded: false,
            },
          ],
          suggestedCount: 1,
          summary: "Try entering a customer or agent name.",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const form = renderPicker();
    const label = document.createElement("label");
    label.className = "field-row";
    const picker = form.querySelector("[data-customer-picker]")!;
    label.append(picker);
    form.prepend(label);

    initOrderCustomerPicker({
      scope: form,
      apiEndpoint: "/admin/order-target-profiles.json",
      profileScope: "customer-agent",
    });

    await vi.waitFor(() => {
      expect(form.querySelectorAll(".order-customer-picker__option")).toHaveLength(2);
    });

    const menu = form.querySelector<HTMLElement>("[data-customer-picker-menu]")!;
    const toggle = form.querySelector<HTMLButtonElement>("[data-customer-picker-toggle]")!;
    menu.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    form.querySelector<HTMLElement>("[data-customer-picker]")!.dataset.open = "true";

    form.querySelector<HTMLButtonElement>("[data-customer-picker-next]")?.click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/admin/order-target-profiles.json?page=2&scope=customer-agent",
        expect.any(Object),
      );
      expect(form.querySelector<HTMLInputElement>("[data-customer-picker-page]")?.value)
        .toBe("2");
    });
  });

  it("keeps pagination responsive during overlapping fetches", async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    const firstResponse = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstResponse)
      .mockResolvedValue({
        ok: true,
        json: async () => mockProfilesResponse({
          page: 2,
          items: [
            {
              type: "customer",
              id: "customer-2",
              label: "Ben Buyer",
              firstName: "Ben",
              lastName: "Buyer",
              phoneNumber: "09170000001",
              email: "",
              address: "City",
              assignedAgentId: "",
              isReseller: false,
              paymentNotice: "",
              balance: 0,
              creditLimit: 1000,
              creditExceeded: false,
            },
          ],
          suggestedCount: 1,
          summary: "Try entering a customer or agent name.",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const form = renderPicker();
    initOrderCustomerPicker({
      scope: form,
      apiEndpoint: "/admin/order-target-profiles.json",
      profileScope: "customer-agent",
    });

    resolveFirst?.({
      ok: true,
      json: async () => mockProfilesResponse(),
    });

    await vi.waitFor(() => {
      expect(form.querySelectorAll(".order-customer-picker__option")).toHaveLength(2);
    });

    const footer = form.querySelector<HTMLElement>("[data-customer-picker-footer]")!;
    const nextButton = form.querySelector<HTMLButtonElement>("[data-customer-picker-next]")!;

    nextButton.click();
    expect(footer.hidden).toBe(false);
    expect(form.querySelector<HTMLInputElement>("[data-customer-picker-page]")?.value).toBe("2");

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/admin/order-target-profiles.json?page=2&scope=customer-agent",
        expect.objectContaining({ headers: { Accept: "application/json" } }),
      );
      expect(form.querySelector<HTMLInputElement>("[data-customer-picker-page]")?.value).toBe("2");
    });
  });

  it("does not reset browse pagination when the empty search input fires again", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockProfilesResponse(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockProfilesResponse({
          page: 2,
          items: [
            {
              type: "customer",
              id: "customer-2",
              label: "Ben Buyer",
              firstName: "Ben",
              lastName: "Buyer",
              phoneNumber: "09170000001",
              email: "",
              address: "City",
              assignedAgentId: "",
              isReseller: false,
              paymentNotice: "",
              balance: 0,
              creditLimit: 1000,
              creditExceeded: false,
            },
          ],
          suggestedCount: 1,
          summary: "Try entering a customer or agent name.",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const form = renderPicker();
    initOrderCustomerPicker({
      scope: form,
      apiEndpoint: "/admin/order-target-profiles.json",
      profileScope: "customer-agent",
    });

    await vi.waitFor(() => {
      expect(form.querySelectorAll(".order-customer-picker__option")).toHaveLength(2);
    });

    form.querySelector<HTMLButtonElement>("[data-customer-picker-next]")?.click();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/admin/order-target-profiles.json?page=2&scope=customer-agent",
        expect.any(Object),
      );
    });

    const searchInput = form.querySelector<HTMLInputElement>("[data-customer-search]")!;
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it("loads a page from the editable page input", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockProfilesResponse(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockProfilesResponse({
          page: 3,
          suggestedCount: 2,
          summary: "Try entering a customer or agent name.",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const form = renderPicker();
    initOrderCustomerPicker({
      scope: form,
      apiEndpoint: "/admin/order-target-profiles.json",
      profileScope: "customer-agent",
    });

    await vi.waitFor(() => {
      expect(form.querySelectorAll(".order-customer-picker__option")).toHaveLength(2);
    });

    const pageInput = form.querySelector<HTMLInputElement>("[data-customer-picker-page]")!;
    pageInput.value = "3";
    pageInput.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/admin/order-target-profiles.json?page=3&scope=customer-agent",
        expect.any(Object),
      );
    });
  });

  it("hides pagination controls when only one page exists", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockProfilesResponse({
        totalProfiles: 8,
        customerTotal: 5,
        agentTotal: 3,
        totalPages: 1,
        hasPagination: false,
        suggestedCount: 2,
        summary: "Try entering a customer or agent name.",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const form = renderPicker();
    initOrderCustomerPicker({
      scope: form,
      apiEndpoint: "/admin/order-target-profiles.json",
      profileScope: "customer-agent",
    });

    await vi.waitFor(() => {
      expect(form.querySelector<HTMLElement>("[data-customer-picker-pagination-controls]")?.hidden).toBe(true);
      expect(form.querySelector<HTMLElement>("[data-customer-picker-footer]")?.hidden).toBe(false);
      expect(form.querySelector<HTMLElement>("[data-customer-picker-total-records]")?.textContent).toBe("8 records");
    });
  });

  it("filters legacy template options when searching without an API endpoint", async () => {
    vi.useFakeTimers();

    const form = renderPicker();
    const optionTemplate = document.createElement("template");
    optionTemplate.setAttribute("data-customer-option-template", "");
    optionTemplate.innerHTML = `
      <button
        type="button"
        data-customer-id="customer-legacy-1"
        data-customer-label="Jane Customer"
        data-customer-first-name="Jane"
        data-customer-last-name="Customer"
        data-customer-phone-number="09171234567"
        data-customer-email="jane@example.test"
        data-customer-address="Quezon City"
      >
        Jane Customer
      </button>
      <button
        type="button"
        data-customer-id="customer-legacy-2"
        data-customer-label="John Smith"
        data-customer-first-name="John"
        data-customer-last-name="Smith"
        data-customer-phone-number="09179876543"
        data-customer-email="john@example.test"
        data-customer-address="Manila"
      >
        John Smith
      </button>
    `;
    form.append(optionTemplate);

    initOrderCustomerPicker({
      scope: form,
      customerOptionTemplate: optionTemplate,
      newCustomerFields: form.querySelector("[data-new-customer-fields]"),
    });

    const searchInput = form.querySelector<HTMLInputElement>("[data-customer-search]")!;
    searchInput.value = "jane";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));

    await vi.advanceTimersByTimeAsync(450);

    const options = form.querySelectorAll<HTMLButtonElement>("[data-customer-options] [data-customer-id]");

    expect(options).toHaveLength(1);
    expect(options[0]?.dataset.customerLabel).toBe("Jane Customer");

    vi.useRealTimers();
  });

  it("selects a customer and populates the customer details section", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockProfilesResponse(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const form = renderPicker();
    const picker = initOrderCustomerPicker({
      scope: form,
      apiEndpoint: "/admin/order-target-profiles.json",
      profileScope: "customer-agent",
      newCustomerFields: form.querySelector("[data-new-customer-fields]"),
    });

    await vi.waitFor(() => {
      expect(form.querySelectorAll(".order-customer-picker__option")).toHaveLength(2);
    });

    const customerOption = form.querySelector<HTMLButtonElement>('[data-customer-id="customer-1"]');
    expect(customerOption?.dataset.customerFirstName).toBe("Ana");
    customerOption?.click();

    await vi.waitFor(() => {
      expect(picker.getSelection().customerId).toBe("customer-1");
    });

    expect(picker.getSelectedCustomerProfile()).toEqual(expect.objectContaining({
      firstName: "Ana",
      lastName: "Buyer",
    }));

    const customerDetails = form.querySelector<HTMLElement>("[data-new-customer-fields]");

    expect(form.querySelector<HTMLInputElement>("[data-customer-search]")?.value).toBe("Ana Buyer");
    expect(form.querySelector<HTMLInputElement>("input[data-customer-id]")?.value).toBe("customer-1");
    expect(customerDetails?.hasAttribute("hidden")).toBe(false);
    expect(form.querySelector<HTMLInputElement>("input[data-customer-first-name]")?.value).toBe("Ana");
    expect(form.querySelector<HTMLInputElement>("input[data-customer-last-name]")?.value).toBe("Buyer");
    expect(form.querySelector<HTMLInputElement>("input[data-customer-phone-number]")?.value).toBe("09170000000");
    expect(form.querySelector<HTMLInputElement>("input[data-customer-first-name]")?.disabled).toBe(true);
  });

  it("keeps optional new-customer fields optional when entering a new customer", () => {
    const form = renderPicker();
    initOrderCustomerPicker({
      scope: form,
      newCustomerFields: form.querySelector("[data-new-customer-fields]"),
    });

    const assignedAgentSelect = form.querySelector<HTMLSelectElement>("[data-customer-assigned-agent-id]");
    const emailInput = form.querySelector<HTMLInputElement>("[data-customer-email]");
    const isResellerCheckbox = form.querySelector<HTMLInputElement>("[data-customer-is-reseller]");

    expect(assignedAgentSelect?.required).toBe(false);
    expect(emailInput?.required).toBe(false);
    expect(isResellerCheckbox?.required).toBe(false);

    assignedAgentSelect!.value = "";
    expect(assignedAgentSelect!.checkValidity()).toBe(true);
  });

  it("omits profile type labels when showProfileType is false", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockProfilesResponse({
        items: [
          {
            type: "customer",
            id: "customer-1",
            label: "Ana Buyer",
            firstName: "Ana",
            lastName: "Buyer",
            phoneNumber: "09170000000",
            email: "ana@example.test",
            address: "Market",
            assignedAgentId: "",
            isReseller: false,
            paymentNotice: "",
            balance: 0,
            creditLimit: 1000,
            creditExceeded: false,
          },
        ],
        customerTotal: 1,
        agentTotal: 0,
        totalProfiles: 1,
        totalPages: 1,
        hasPagination: false,
        suggestedCount: 1,
        scope: "customer",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const form = renderPicker();
    initOrderCustomerPicker({
      scope: form,
      apiEndpoint: "/agent/order-target-profiles.json",
      profileScope: "customer",
      showProfileType: false,
    });

    await vi.waitFor(() => {
      expect(form.querySelectorAll(".order-customer-picker__option")).toHaveLength(1);
    });

    const option = form.querySelector(".order-customer-picker__option");
    expect(option?.querySelector(".order-customer-picker__option-type")).toBeNull();
    expect(option?.querySelector(".order-customer-picker__option-name")?.textContent).toBe("Ana Buyer");
  });

  it("uses attachCustomerId when selecting a distribution agent row", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockProfilesResponse({
        items: [
          {
            type: "agent",
            id: "agent-1",
            label: "Carlos Agent",
            phoneNumber: "09171112222",
            email: "carlos@example.test",
            attachCustomerId: "agent-customer-1",
          },
        ],
        customerTotal: 0,
        agentTotal: 1,
        totalProfiles: 1,
        totalPages: 1,
        hasPagination: false,
        suggestedCount: 1,
        scope: "customer",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const form = renderPicker();
    const picker = initOrderCustomerPicker({
      scope: form,
      apiEndpoint: "/admin/order-target-profiles.json",
      profileScope: "customer",
      showProfileType: true,
    });

    await vi.waitFor(() => {
      expect(form.querySelectorAll(".order-customer-picker__option")).toHaveLength(1);
    });

    const option = form.querySelector<HTMLButtonElement>('[data-agent-id="agent-1"]');
    option?.click();

    await vi.waitFor(() => {
      expect(picker.getSelection().customerId).toBe("agent-customer-1");
    });

    expect(form.querySelector<HTMLInputElement>("input[data-customer-id]")?.value).toBe("agent-customer-1");
    expect(option?.querySelector(".order-customer-picker__option-type")?.textContent).toBe("Agent");
  });
});
