import { ADMIN_JSON_ACTION_PATH } from "@/lib/admin-dashboard/json-action-path";
import { jsonTextareaValue } from "@/lib/admin-dashboard/view";
import { closeDashboardCellPopover } from "@/lib/client/dashboard-cell-popover";
import {
  resetFormSubmissionState,
  setFormSubmittingState,
} from "@/lib/client/form-submission-state";
import { syncSectionFormsCurrentContent } from "@/lib/client/page-section-form-sync";
import {
  getFaqDescription,
  getFaqHeading,
  normalizeFaqItems,
  parseFaqItemsEditorPayload,
  renderFaqAccordionHtml,
  type FaqItem,
} from "@/lib/public-website/home-faq";

type FaqEditorForm = HTMLFormElement & {
  dataset: DOMStringMap & {
    faqBound?: string;
  };
};

type AdminActionJsonResponse = {
  success: boolean;
  error?: string;
  sectionContent?: Record<string, unknown>;
};

const bindAbortControllers = new WeakMap<FaqEditorForm, AbortController>();

function getList(form: FaqEditorForm) {
  return form.querySelector<HTMLUListElement>("[data-faq-list]");
}

function getHiddenJson(form: FaqEditorForm) {
  return form.querySelector<HTMLInputElement>("[data-faq-json]");
}

function getCurrentContentInput(form: FaqEditorForm) {
  return form.querySelector<HTMLInputElement>('input[name="currentContent"]');
}

function getHeadingInput(form: FaqEditorForm) {
  return form.querySelector<HTMLInputElement>("[data-faq-heading]");
}

function resolveFaqDescriptionValue(form: FaqEditorForm): string {
  const root = getFaqPreviewRoot(form);
  const fromPreview =
    root?.querySelector<HTMLElement>(".faq-section__desc")?.textContent?.trim() ?? "";

  if (fromPreview.length > 0) {
    return fromPreview;
  }

  const currentContentInput = getCurrentContentInput(form);
  if (!currentContentInput?.value) {
    return "";
  }

  try {
    return getFaqDescription(JSON.parse(currentContentInput.value) as Record<string, unknown>);
  } catch {
    return "";
  }
}

function removeIconMarkup() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
}

function syncFaqTextareaHeight(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function syncFaqTextareaHeights(form: FaqEditorForm) {
  form.querySelectorAll<HTMLTextAreaElement>("textarea").forEach(syncFaqTextareaHeight);
}

const FAQ_FIELD_REQUIRED_MESSAGE = "Please fill out this field.";

function clearFaqFieldValidity(field: HTMLInputElement | HTMLTextAreaElement) {
  field.setCustomValidity("");
}

function validateFaqFields(form: FaqEditorForm): boolean {
  form.querySelectorAll<HTMLInputElement>("[data-faq-question]").forEach((input) => {
    input.setCustomValidity(
      input.value.trim().length === 0 ? FAQ_FIELD_REQUIRED_MESSAGE : "",
    );
  });

  form.querySelectorAll<HTMLTextAreaElement>("[data-faq-answer]").forEach((textarea) => {
    textarea.setCustomValidity(
      textarea.value.trim().length === 0 ? FAQ_FIELD_REQUIRED_MESSAGE : "",
    );
  });

  return form.reportValidity();
}

function refreshItemLabels(list: HTMLUListElement) {
  list.querySelectorAll<HTMLElement>("[data-faq-item]").forEach((item, index) => {
    const label = item.querySelector<HTMLElement>("[data-faq-item-label]");
    const remove = item.querySelector<HTMLButtonElement>("[data-faq-remove]");

    if (label) {
      label.textContent = `Question ${index + 1}`;
    }

    if (remove) {
      remove.setAttribute("aria-label", `Remove question ${index + 1}`);
    }
  });
}

function serializeItems(form: FaqEditorForm): FaqItem[] {
  const list = getList(form);
  if (!list) {
    return [];
  }

  return [...list.querySelectorAll<HTMLElement>("[data-faq-item]")].flatMap((item) => {
    const question =
      item.querySelector<HTMLInputElement>("[data-faq-question]")?.value.trim() ?? "";
    const answer =
      item.querySelector<HTMLTextAreaElement>("[data-faq-answer]")?.value.trim() ?? "";

    if (!question || !answer) {
      return [];
    }

    return [{ question, answer }];
  });
}

function serializeFormContent(form: FaqEditorForm): Record<string, unknown> {
  const heading = getHeadingInput(form)?.value.trim() ?? "";
  const description = resolveFaqDescriptionValue(form);
  const items = serializeItems(form);

  if (!description) {
    throw new Error("Section description is required.");
  }

  const payload = {
    heading,
    description,
    items: parseFaqItemsEditorPayload(JSON.stringify(items)),
  };

  const hiddenJson = getHiddenJson(form);
  if (hiddenJson) {
    hiddenJson.value = jsonTextareaValue(payload);
  }

  return payload;
}

function syncFaqFormDraft(form: FaqEditorForm) {
  try {
    serializeFormContent(form);
  } catch {
    // Allow partial edits before save.
  }

  form.dispatchEvent(new Event("input", { bubbles: true }));
}

function updateCurrentContent(form: FaqEditorForm, content: Record<string, unknown>) {
  const currentContentInput = getCurrentContentInput(form);
  if (currentContentInput) {
    currentContentInput.value = JSON.stringify(content);
  }
}

function getFaqPreviewRoot(form: FaqEditorForm): HTMLElement | null {
  const sectionId = form.querySelector<HTMLInputElement>('input[name="sectionId"]')?.value?.trim();
  if (!sectionId) {
    return null;
  }

  return document.querySelector<HTMLElement>(`[data-faq-preview-root="${sectionId}"]`);
}

function syncFaqPreview(form: FaqEditorForm, content: Record<string, unknown>) {
  const root = getFaqPreviewRoot(form);
  if (!root) {
    return;
  }

  const heading = getFaqHeading(content);
  const description = getFaqDescription(content);
  const items = normalizeFaqItems(content.items);

  const title = root.querySelector<HTMLElement>(".faq-section__title");
  const desc = root.querySelector<HTMLElement>(".faq-section__desc");
  const accordion = root.querySelector<HTMLElement>("[data-faq-accordion]");

  if (title) {
    title.textContent = heading;
  }

  if (desc) {
    desc.textContent = description;
  }

  if (accordion) {
    accordion.innerHTML = renderFaqAccordionHtml(items);
    delete accordion.dataset.faqAccordionBound;
    document.dispatchEvent(new CustomEvent("faq-accordion:refresh"));
  }
}

function createFaqItemElement(item: FaqItem, index: number): HTMLLIElement {
  const listItem = document.createElement("li");
  listItem.className = "admin-faq-item";
  listItem.setAttribute("data-faq-item", "");
  listItem.innerHTML = `<div class="admin-faq-item__header">
  <span class="admin-faq-item__label" data-faq-item-label>Question ${index + 1}</span>
  <button type="button" class="admin-faq-item__remove" data-faq-remove aria-label="Remove question ${index + 1}">
    ${removeIconMarkup()}
  </button>
</div>
<label class="admin-faq-form__field">
  <span>Question</span>
  <input type="text" data-faq-question required placeholder="New question" />
</label>
<label class="admin-faq-form__field">
  <span>Answer</span>
  <textarea data-faq-answer rows="3" required placeholder="Add your answer here."></textarea>
</label>`;

  const questionInput = listItem.querySelector<HTMLInputElement>("[data-faq-question]");
  const answerInput = listItem.querySelector<HTMLTextAreaElement>("[data-faq-answer]");

  if (questionInput) {
    questionInput.value = item.question;
  }

  if (answerInput) {
    answerInput.value = item.answer;
    syncFaqTextareaHeight(answerInput);
  }

  return listItem;
}

async function readAdminJsonResponse(response: Response): Promise<AdminActionJsonResponse> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error("Unexpected server response. Please refresh and try again.");
  }

  return (await response.json()) as AdminActionJsonResponse;
}

async function submitFaqForm(
  form: FaqEditorForm,
  formData: FormData,
): Promise<AdminActionJsonResponse> {
  const response = await fetch(ADMIN_JSON_ACTION_PATH, {
    method: "POST",
    body: formData,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  const result = await readAdminJsonResponse(response);
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Unable to save FAQs.");
  }

  return result;
}

function unbindFaqForm(form: FaqEditorForm) {
  bindAbortControllers.get(form)?.abort();
  bindAbortControllers.delete(form);
  delete form.dataset.faqBound;
}

function bindFaqForm(form: FaqEditorForm) {
  if (form.dataset.faqBound === "true") {
    return;
  }

  unbindFaqForm(form);

  const controller = new AbortController();
  bindAbortControllers.set(form, controller);
  const { signal } = controller;

  form.dataset.faqBound = "true";
  const list = getList(form);
  if (!list) {
    return;
  }

  form.addEventListener(
    "click",
    (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const addButton = target.closest<HTMLButtonElement>("[data-faq-add]");
    if (addButton) {
      event.preventDefault();
      const item = createFaqItemElement({ question: "", answer: "" }, list.children.length);
      list.append(item);
      refreshItemLabels(list);
      syncFaqTextareaHeights(form);
      syncFaqFormDraft(form);
      item.querySelector<HTMLInputElement>("[data-faq-question]")?.focus();
      return;
    }

    const removeButton = target.closest<HTMLButtonElement>("[data-faq-remove]");
    if (!removeButton) {
      return;
    }

    event.preventDefault();

    const item = removeButton.closest<HTMLElement>("[data-faq-item]");
    if (!item) {
      return;
    }

    if (list.querySelectorAll("[data-faq-item]").length <= 1) {
      window.alert("At least one FAQ item is required.");
      return;
    }

    item.remove();
    refreshItemLabels(list);
    syncFaqFormDraft(form);
  },
    { signal },
  );

  form.addEventListener(
    "input",
    (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.matches("[data-faq-question]")) {
      clearFaqFieldValidity(target);
    }

    if (target instanceof HTMLTextAreaElement) {
      if (target.matches("[data-faq-answer]")) {
        clearFaqFieldValidity(target);
      }

      syncFaqTextareaHeight(target);
    }

    try {
      serializeFormContent(form);
    } catch {
      // Allow partial edits before save.
    }
  },
    { signal },
  );

  form.addEventListener(
    "submit",
    (event) => {
    event.preventDefault();

    const submitButton =
      event.submitter instanceof HTMLButtonElement
        ? event.submitter
        : form.querySelector<HTMLButtonElement>('button[type="submit"]');

    if (submitButton?.disabled) {
      return;
    }

    if (!validateFaqFields(form)) {
      return;
    }

    let content: Record<string, unknown>;
    try {
      content = serializeFormContent(form);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to save FAQs.");
      return;
    }

    const rollbackContent = getCurrentContentInput(form)?.value ?? "";
    const root = getFaqPreviewRoot(form);
    const previousHeading = root?.querySelector(".faq-section__title")?.textContent ?? "";
    const previousDescription = root?.querySelector(".faq-section__desc")?.textContent ?? "";
    const previousAccordionHtml =
      root?.querySelector<HTMLElement>("[data-faq-accordion]")?.innerHTML ?? "";

    syncFaqPreview(form, content);
    setFormSubmittingState(form, submitButton);

    const formData = new FormData(form);

    void (async () => {
      try {
        const result = await submitFaqForm(form, formData);

        if (result.sectionContent) {
          updateCurrentContent(form, result.sectionContent);
          syncSectionFormsCurrentContent(
            form.querySelector<HTMLInputElement>('input[name="sectionId"]')?.value?.trim() ?? "",
            result.sectionContent,
          );
          syncFaqPreview(form, result.sectionContent);
        }

        closeDashboardCellPopover();
      } catch (error) {
        const currentContentInput = getCurrentContentInput(form);
        if (currentContentInput) {
          currentContentInput.value = rollbackContent;
        }

        const title = root?.querySelector<HTMLElement>(".faq-section__title");
        const desc = root?.querySelector<HTMLElement>(".faq-section__desc");
        const accordion = root?.querySelector<HTMLElement>("[data-faq-accordion]");

        if (title) {
          title.textContent = previousHeading;
        }

        if (desc) {
          desc.textContent = previousDescription;
        }

        if (accordion) {
          accordion.innerHTML = previousAccordionHtml;
          delete accordion.dataset.faqAccordionBound;
          document.dispatchEvent(new CustomEvent("faq-accordion:refresh"));
        }

        window.alert(error instanceof Error ? error.message : "Unable to save FAQs.");
      } finally {
        resetFormSubmissionState(form);
        form.dispatchEvent(new Event("input", { bubbles: true }));
      }
    })();
  },
    { signal },
  );

  syncFaqTextareaHeights(form);
}

export function initFaqEditors(options?: { rebind?: boolean }) {
  document.querySelectorAll<FaqEditorForm>("[data-faq-form]").forEach((form) => {
    if (options?.rebind) {
      unbindFaqForm(form);
    }

    bindFaqForm(form);
  });
}
