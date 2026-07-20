import { describe, expect, it } from "vitest";
import {
  bindPopoverFormSaveState,
  captureFormSnapshot,
  formHasChanges,
} from "./dashboard-cell-popover-form-state";

function renderForm(markup: string) {
  document.body.innerHTML = markup;
  return document.querySelector<HTMLFormElement>("form")!;
}

describe("dashboard-cell-popover-form-state", () => {
  it("treats whitespace-only edits as unchanged", () => {
    const form = renderForm(`
      <form>
        <input name="firstName" value="Pat" />
        <textarea name="notes">Hello</textarea>
        <button type="submit">Save</button>
      </form>
    `);

    const snapshot = captureFormSnapshot(form);
    form.querySelector<HTMLInputElement>('input[name="firstName"]')!.value =
      "  Pat  ";
    form.querySelector<HTMLTextAreaElement>('textarea[name="notes"]')!.value =
      "Hello   ";

    expect(formHasChanges(form, snapshot)).toBe(false);
  });

  it("detects real field changes", () => {
    const form = renderForm(`
      <form>
        <input name="firstName" value="Pat" />
        <select name="status">
          <option value="active" selected>Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button type="submit">Save</button>
      </form>
    `);

    const snapshot = captureFormSnapshot(form);
    form.querySelector<HTMLSelectElement>('select[name="status"]')!.value =
      "inactive";

    expect(formHasChanges(form, snapshot)).toBe(true);
  });

  it("disables save until a change is made", () => {
    const form = renderForm(`
      <form>
        <input name="employeeId" value="A-100" />
        <button type="submit">Save</button>
      </form>
    `);

    const cleanup = bindPopoverFormSaveState(form);
    const saveButton = form.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;

    expect(saveButton.disabled).toBe(true);

    form.querySelector<HTMLInputElement>('input[name="employeeId"]')!.value =
      "A-101";
    form.dispatchEvent(new Event("input", { bubbles: true }));

    expect(saveButton.disabled).toBe(false);

    cleanup();
  });
});
