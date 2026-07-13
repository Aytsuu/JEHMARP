import { describe, expect, it, vi } from "vitest";

import { initFormSubmissionState } from "./form-submission-state";

function createTestDocument(html: string) {
  const testDocument = document.implementation.createHTMLDocument("test");
  testDocument.body.innerHTML = html;

  return testDocument;
}

function submitForm(form: HTMLFormElement, submitter?: HTMLElement) {
  const event = new SubmitEvent("submit", {
    bubbles: true,
    cancelable: true,
    submitter,
  });

  form.dispatchEvent(event);

  return event;
}

describe("initFormSubmissionState", () => {
  it("disables post form submit buttons and shows a loader on the clicked submitter", () => {
    const testDocument = createTestDocument(`
      <form method="post">
        <button type="submit">Primary action</button>
        <button type="submit">Alternate action</button>
      </form>
    `);
    const form = testDocument.querySelector("form")!;
    const [primaryButton, alternateButton] = Array.from(
      form.querySelectorAll("button"),
    );

    initFormSubmissionState(testDocument);
    const event = submitForm(form, primaryButton);

    expect(event.defaultPrevented).toBe(false);
    expect(form.dataset.isSubmitting).toBe("true");
    expect(primaryButton.disabled).toBe(true);
    expect(alternateButton.disabled).toBe(true);
    expect(primaryButton.classList.contains("form-submit-button--loading")).toBe(
      true,
    );
    expect(primaryButton.getAttribute("aria-busy")).toBe("true");
    expect(
      alternateButton.classList.contains("form-submit-button--loading"),
    ).toBe(false);
  });

  it("prevents a repeated post submission after a form is already submitting", () => {
    const testDocument = createTestDocument(`
      <form method="post">
        <button type="submit">Send</button>
      </form>
    `);
    const form = testDocument.querySelector("form")!;
    const button = form.querySelector("button")!;

    initFormSubmissionState(testDocument);
    submitForm(form, button);
    const repeatedEvent = submitForm(form, button);

    expect(repeatedEvent.defaultPrevented).toBe(true);
  });

  it("does not change get forms or forms that opt out of submit state", () => {
    const testDocument = createTestDocument(`
      <form method="get">
        <button type="submit">Search</button>
      </form>
      <form method="post" data-skip-submit-state="true">
        <button type="submit">Skip</button>
      </form>
    `);
    const [getForm, skippedForm] = Array.from(
      testDocument.querySelectorAll("form"),
    );
    const [getButton, skippedButton] = Array.from(
      testDocument.querySelectorAll("button"),
    );

    initFormSubmissionState(testDocument);
    submitForm(getForm, getButton);
    submitForm(skippedForm, skippedButton);

    expect(getForm.dataset.isSubmitting).toBeUndefined();
    expect(skippedForm.dataset.isSubmitting).toBeUndefined();
    expect(getButton.disabled).toBe(false);
    expect(skippedButton.disabled).toBe(false);
  });

  it("only installs one submit listener", () => {
    const testDocument = createTestDocument(`
      <form method="post">
        <button type="submit">Send</button>
      </form>
    `);
    const form = testDocument.querySelector("form")!;
    const button = form.querySelector("button")!;
    const addEventListenerSpy = vi.spyOn(testDocument, "addEventListener");

    initFormSubmissionState(testDocument);
    initFormSubmissionState(testDocument);
    submitForm(form, button);

    expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);

    addEventListenerSpy.mockRestore();
  });
});
