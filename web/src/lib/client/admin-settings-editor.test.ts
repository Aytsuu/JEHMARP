import { beforeEach, describe, expect, it, vi } from "vitest";

import { initAdminSettingsGeneral } from "./admin-settings-editor";

function renderGeneralSettingsForm() {
  document.body.innerHTML = `
    <section data-admin-settings-general>
      <header>
        <button
          type="submit"
          data-settings-save-button
          form="admin-settings-general-form"
          disabled
        >
          Save changes
        </button>
        <p data-settings-save-status hidden></p>
      </header>
      <form id="admin-settings-general-form" data-settings-general-form>
        <input type="hidden" name="logoPath" value="" />
        <input type="file" name="logoFile" hidden />
        <input name="tradeName" value="JEHMARP" />
        <input name="phone" value="09322159289 | 09177770118" />
        <input name="primaryEmail" value="jehmarp2020@gmail.com" />
        <input name="secondaryEmail" value="" />
        <input name="customerCreditLimit" value="1000" />
      </form>
    </section>
  `;
}

function getSaveButton() {
  return document.querySelector<HTMLButtonElement>("[data-settings-save-button]")!;
}

function getForm() {
  return document.querySelector<HTMLFormElement>("[data-settings-general-form]")!;
}

describe("initAdminSettingsGeneral", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("keeps save disabled when there are no changes", () => {
    renderGeneralSettingsForm();

    initAdminSettingsGeneral();

    expect(getSaveButton().disabled).toBe(true);
  });

  it("enables save when a field changes", () => {
    renderGeneralSettingsForm();

    initAdminSettingsGeneral();
    getForm().querySelector<HTMLInputElement>('input[name="tradeName"]')!.value = "Updated name";
    getForm().querySelector<HTMLInputElement>('input[name="tradeName"]')!.dispatchEvent(new Event("input", { bubbles: true }));

    expect(getSaveButton().disabled).toBe(false);
  });

  it("disables save again after reverting a change", () => {
    renderGeneralSettingsForm();

    initAdminSettingsGeneral();
    const tradeName = getForm().querySelector<HTMLInputElement>('input[name="tradeName"]')!;
    tradeName.value = "Updated name";
    tradeName.dispatchEvent(new Event("input", { bubbles: true }));
    tradeName.value = "JEHMARP";
    tradeName.dispatchEvent(new Event("input", { bubbles: true }));

    expect(getSaveButton().disabled).toBe(true);
  });

  it("submits changes when save is clicked", async () => {
    renderGeneralSettingsForm();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        sectionContent: {
          logoPath: null,
          logoUrl: null,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    initAdminSettingsGeneral();
    const tradeName = getForm().querySelector<HTMLInputElement>('input[name="tradeName"]')!;
    tradeName.value = "Updated name";
    tradeName.dispatchEvent(new Event("input", { bubbles: true }));

    getForm().requestSubmit();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.method).toBe("POST");
    expect(request.body).toBeInstanceOf(FormData);
    expect((request.body as FormData).get("tradeName")).toBe("Updated name");
    expect(getSaveButton().disabled).toBe(true);
  });
});
