import { describe, expect, it, vi } from "vitest";

import { bindPopoverFormSaveState } from "./dashboard-cell-popover-form-state";
import { initFaqEditors } from "./faq-editor";

describe("faq-editor", () => {
  it("adds and removes FAQ items before save", () => {
    document.body.innerHTML = `
      <div data-faq-preview-root="faq-section">
        <h2 class="faq-section__title">FAQ</h2>
        <p class="faq-section__desc">Description</p>
        <div data-faq-accordion></div>
      </div>
      <form data-faq-form>
        <input type="hidden" name="sectionId" value="faq-section" />
        <input type="hidden" name="currentContent" value='{"description":"Description"}' />
        <input type="hidden" name="content" data-faq-json value="" />
        <input type="hidden" data-faq-heading value="FAQ" />
        <ul data-faq-list>
          <li data-faq-item>
            <input data-faq-question value="One?" />
            <textarea data-faq-answer>First.</textarea>
          </li>
        </ul>
        <button type="button" data-faq-add>Add</button>
        <button type="submit">Save</button>
      </form>
    `;

    initFaqEditors();
    const form = document.querySelector<HTMLFormElement>("[data-faq-form]")!;
    const list = form.querySelector<HTMLUListElement>("[data-faq-list]")!;

    form.querySelector<HTMLButtonElement>("[data-faq-add]")?.click();
    expect(list.querySelectorAll("[data-faq-item]")).toHaveLength(2);

    list.querySelector<HTMLButtonElement>("[data-faq-remove]")?.click();
    expect(list.querySelectorAll("[data-faq-item]")).toHaveLength(1);
  });

  it("adds only one item after popover rebind", () => {
    document.body.innerHTML = `
      <div data-faq-preview-root="faq-section">
        <h2 class="faq-section__title">FAQ</h2>
        <p class="faq-section__desc">Description</p>
        <div data-faq-accordion></div>
      </div>
      <form data-faq-form>
        <input type="hidden" name="sectionId" value="faq-section" />
        <input type="hidden" name="currentContent" value='{"description":"Description"}' />
        <input type="hidden" name="content" data-faq-json value="" />
        <input type="hidden" data-faq-heading value="FAQ" />
        <ul data-faq-list>
          <li data-faq-item>
            <input data-faq-question value="One?" />
            <textarea data-faq-answer>First.</textarea>
          </li>
        </ul>
        <button type="button" data-faq-add>Add</button>
        <button type="submit">Save</button>
      </form>
    `;

    initFaqEditors();
    initFaqEditors({ rebind: true });

    const form = document.querySelector<HTMLFormElement>("[data-faq-form]")!;
    const list = form.querySelector<HTMLUListElement>("[data-faq-list]")!;

    form.querySelector<HTMLButtonElement>("[data-faq-add]")?.click();
    expect(list.querySelectorAll("[data-faq-item]")).toHaveLength(2);
  });

  it("keeps save disabled after adding and removing an empty question", () => {
    const initialContent = JSON.stringify(
      {
        heading: "FAQ",
        description: "Description",
        items: [{ question: "One?", answer: "First." }],
      },
      null,
      2,
    );

    document.body.innerHTML = `
      <div data-faq-preview-root="faq-section">
        <h2 class="faq-section__title">FAQ</h2>
        <p class="faq-section__desc">Description</p>
        <div data-faq-accordion></div>
      </div>
      <form data-faq-form>
        <input type="hidden" name="sectionId" value="faq-section" />
        <input type="hidden" name="currentContent" value='${initialContent.replaceAll("'", "&#39;")}' />
        <input type="hidden" name="content" data-faq-json value="${initialContent.replaceAll('"', "&quot;")}" />
        <input type="hidden" data-faq-heading value="FAQ" />
        <ul data-faq-list>
          <li data-faq-item>
            <input data-faq-question value="One?" />
            <textarea data-faq-answer>First.</textarea>
          </li>
        </ul>
        <button type="button" data-faq-add>Add</button>
        <button type="submit">Save</button>
      </form>
    `;

    const form = document.querySelector<HTMLFormElement>("[data-faq-form]")!;
    const saveButton = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const cleanup = bindPopoverFormSaveState(form);

    initFaqEditors();

    expect(saveButton.disabled).toBe(true);

    form.querySelector<HTMLButtonElement>("[data-faq-add]")?.click();
    expect(saveButton.disabled).toBe(true);

    form.querySelector<HTMLButtonElement>("[data-faq-remove]")?.click();
    expect(saveButton.disabled).toBe(true);

    cleanup();
  });

  it("does not submit when a FAQ row has empty fields", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    document.body.innerHTML = `
      <div data-faq-preview-root="faq-section">
        <h2 class="faq-section__title">FAQ</h2>
        <p class="faq-section__desc">Description</p>
        <div data-faq-accordion></div>
      </div>
      <form data-faq-form>
        <input type="hidden" name="sectionId" value="faq-section" />
        <input type="hidden" name="currentContent" value='{"heading":"FAQ","description":"Description","items":[{"question":"One?","answer":"First."}]}' />
        <input type="hidden" name="content" data-faq-json value="" />
        <input type="hidden" data-faq-heading value="FAQ" />
        <ul data-faq-list>
          <li data-faq-item>
            <input data-faq-question value="One?" required />
            <textarea data-faq-answer required>First.</textarea>
          </li>
          <li data-faq-item>
            <input data-faq-question value="" required />
            <textarea data-faq-answer required></textarea>
          </li>
        </ul>
        <button type="submit">Save</button>
      </form>
    `;

    initFaqEditors();
    const form = document.querySelector<HTMLFormElement>("[data-faq-form]")!;
    const reportValidity = vi.spyOn(form, "reportValidity");

    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(reportValidity).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
