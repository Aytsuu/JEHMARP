import { ADMIN_JSON_ACTION_PATH } from "@/lib/admin-dashboard/json-action-path";
import { closeDashboardCellPopover } from "@/lib/client/dashboard-cell-popover";
import {
  resetFormSubmissionState,
  setFormSubmittingState,
} from "@/lib/client/form-submission-state";
import { syncSectionFormsCurrentContent } from "@/lib/client/page-section-form-sync";
import { resolvePublicStorageUrl } from "@/lib/supabase/storage";

type PageSectionForm = HTMLFormElement & {
  dataset: DOMStringMap & {
    pageSectionBound?: string;
  };
};

type AdminActionJsonResponse = {
  success: boolean;
  error?: string;
  sectionContent?: Record<string, unknown>;
};

function isPageSectionEditorForm(form: HTMLFormElement): boolean {
  return (
    form.matches("[data-page-section-form], [data-image-upload-form]") &&
    !form.matches("[data-taglines-form], [data-hero-carousel-form], [data-faq-form]")
  );
}

function getCurrentContentInput(form: HTMLFormElement) {
  return form.querySelector<HTMLInputElement>('input[name="currentContent"]');
}

function getCategoryIndex(form: HTMLFormElement): string | null {
  return form.querySelector<HTMLInputElement>('input[name="categoryIndex"]')?.value?.trim() ?? null;
}

function findTextEditableWrapper(form: HTMLFormElement): HTMLElement | null {
  const sectionId = form.querySelector<HTMLInputElement>('input[name="sectionId"]')?.value?.trim();
  const fieldKey = form.querySelector<HTMLInputElement>('input[name="contentField"]')?.value?.trim();
  const categoryIndex = getCategoryIndex(form);

  if (!sectionId || !fieldKey) {
    return null;
  }

  const categorySelector =
    categoryIndex !== null
      ? `[data-category-index="${categoryIndex}"]`
      : ":not([data-category-index])";

  return document.querySelector<HTMLElement>(
    `[data-page-section-editable][data-section-id="${sectionId}"][data-field-key="${fieldKey}"]${categorySelector}`,
  );
}

function findImageEditableWrapper(form: HTMLFormElement): HTMLElement | null {
  const sectionId = form.querySelector<HTMLInputElement>('input[name="sectionId"]')?.value?.trim();
  const categoryIndex = getCategoryIndex(form);

  if (!sectionId) {
    return null;
  }

  const categorySelector =
    categoryIndex !== null
      ? `[data-category-index="${categoryIndex}"]`
      : ":not([data-category-index])";

  return document.querySelector<HTMLElement>(
    `[data-page-section-image-editable][data-section-id="${sectionId}"]${categorySelector}`,
  );
}

function syncMissionTextToggle(surface: HTMLElement) {
  const wrap = surface.querySelector<HTMLElement>("[data-mission-text-expand]");
  const text = surface.querySelector<HTMLElement>(".mission-card__text");
  const button = surface.querySelector<HTMLButtonElement>("[data-mission-text-toggle]");

  if (!wrap || !text || !button) {
    return;
  }

  wrap.classList.remove("is-expanded");
  button.textContent = "View more";
  button.setAttribute("aria-expanded", "false");
  button.hidden = !(text.scrollHeight > text.clientHeight + 1);
}

export function syncPageSectionTextPreview(wrapper: HTMLElement, value: string) {
  const surface = wrapper.querySelector<HTMLElement>(".admin-content-editable__surface");
  if (!surface) {
    return;
  }

  const missionText = surface.querySelector<HTMLElement>(".mission-card__text");
  if (missionText) {
    missionText.textContent = value;
    syncMissionTextToggle(surface);
    return;
  }

  const target =
    surface.querySelector<HTMLElement>("h1, h2, h3, h4, p, .about-section__title, .about-section__summary, .about-section__body") ??
    surface;

  target.textContent = value;
}

function syncPageSectionImagePreview(wrapper: HTMLElement, content: Record<string, unknown>) {
  const categoryIndex = wrapper.dataset.categoryIndex;
  let imageSrc: unknown = content.imageSrc;

  if (categoryIndex !== undefined) {
    const categories = Array.isArray(content.categories) ? content.categories : [];
    const category = categories[Number(categoryIndex)];
    imageSrc =
      category && typeof category === "object"
        ? (category as Record<string, unknown>).imageSrc
        : undefined;
  }

  if (typeof imageSrc !== "string" || imageSrc.trim().length === 0) {
    return;
  }

  const displaySrc = resolvePublicStorageUrl(imageSrc) ?? imageSrc;
  const image = wrapper.querySelector<HTMLElement>(".admin-content-editable__surface img");

  if (image instanceof HTMLImageElement) {
    image.src = displaySrc;
  }
}

function updateCurrentContent(form: HTMLFormElement, content: Record<string, unknown>) {
  const currentContentInput = getCurrentContentInput(form);
  if (currentContentInput) {
    currentContentInput.value = JSON.stringify(content);
  }
}

async function readAdminJsonResponse(response: Response): Promise<AdminActionJsonResponse> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error("Unexpected server response. Please refresh and try again.");
  }

  return (await response.json()) as AdminActionJsonResponse;
}

async function submitPageSectionForm(
  form: HTMLFormElement,
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
    throw new Error(result.error || "Unable to save this content.");
  }

  return result;
}

function captureTextPreviewRollback(wrapper: HTMLElement): () => void {
  const surface = wrapper.querySelector<HTMLElement>(".admin-content-editable__surface");
  if (!surface) {
    return () => undefined;
  }

  const missionText = surface.querySelector<HTMLElement>(".mission-card__text");
  if (missionText) {
    const previousText = missionText.textContent ?? "";
    const wasExpanded = surface
      .querySelector<HTMLElement>("[data-mission-text-expand]")
      ?.classList.contains("is-expanded");
    return () => {
      missionText.textContent = previousText;
      const wrap = surface.querySelector<HTMLElement>("[data-mission-text-expand]");
      if (wrap && wasExpanded) {
        wrap.classList.add("is-expanded");
      }
      syncMissionTextToggle(surface);
    };
  }

  const target =
    surface.querySelector<HTMLElement>("h1, h2, h3, h4, p, .about-section__title, .about-section__summary, .about-section__body") ??
    surface;
  const previousText = target.textContent ?? "";

  return () => {
    target.textContent = previousText;
  };
}

function captureImagePreviewRollback(wrapper: HTMLElement): () => void {
  const image = wrapper.querySelector<HTMLImageElement>(".admin-content-editable__surface img");
  if (!image) {
    return () => undefined;
  }

  const previousSrc = image.src;
  return () => {
    image.src = previousSrc;
  };
}

function applyOptimisticPreview(form: HTMLFormElement, formData: FormData) {
  const fieldKey = formData.get("contentField");
  const contentValue = formData.get("contentValue");
  const imageFile = formData.get("imageFile");

  if (typeof fieldKey === "string" && typeof contentValue === "string") {
    const wrapper = findTextEditableWrapper(form);
    if (!wrapper) {
      return null;
    }

    const rollback = captureTextPreviewRollback(wrapper);
    syncPageSectionTextPreview(wrapper, contentValue);
    return rollback;
  }

  if (imageFile instanceof File && imageFile.size > 0) {
    const wrapper = findImageEditableWrapper(form);
    if (!wrapper) {
      return null;
    }

    const rollback = captureImagePreviewRollback(wrapper);
    const image = wrapper.querySelector<HTMLImageElement>(".admin-content-editable__surface img");
    if (image) {
      const objectUrl = URL.createObjectURL(imageFile);
      image.src = objectUrl;
      return () => {
        URL.revokeObjectURL(objectUrl);
        rollback();
      };
    }
  }

  return null;
}

function syncPreviewFromSectionContent(form: HTMLFormElement, content: Record<string, unknown>) {
  const fieldKey = form.querySelector<HTMLInputElement>('input[name="contentField"]')?.value?.trim();
  const categoryIndex = getCategoryIndex(form);

  if (fieldKey) {
    let value: unknown = content[fieldKey];

    if (categoryIndex !== null) {
      const categories = Array.isArray(content.categories) ? content.categories : [];
      const category = categories[Number(categoryIndex)];
      value =
        category && typeof category === "object"
          ? (category as Record<string, unknown>)[fieldKey]
          : undefined;
    }

    const wrapper = findTextEditableWrapper(form);
    if (wrapper && typeof value === "string") {
      syncPageSectionTextPreview(wrapper, value);
    }
    return;
  }

  if (form.matches("[data-image-upload-form]")) {
    const wrapper = findImageEditableWrapper(form);
    if (wrapper) {
      syncPageSectionImagePreview(wrapper, content);
    }
  }
}

function bindPageSectionForm(form: PageSectionForm) {
  if (form.dataset.pageSectionBound === "true") {
    return;
  }

  form.dataset.pageSectionBound = "true";

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const submitButton =
      event.submitter instanceof HTMLButtonElement
        ? event.submitter
        : form.querySelector<HTMLButtonElement>('button[type="submit"]');

    if (submitButton?.disabled) {
      return;
    }

    const formData = new FormData(form);
    const rollback = applyOptimisticPreview(form, formData);

    setFormSubmittingState(form, submitButton);

    void (async () => {
      try {
        const result = await submitPageSectionForm(form, formData);

        if (result.sectionContent) {
          const sectionId =
            form.querySelector<HTMLInputElement>('input[name="sectionId"]')?.value?.trim() ?? "";
          updateCurrentContent(form, result.sectionContent);
          syncSectionFormsCurrentContent(sectionId, result.sectionContent);
          syncPreviewFromSectionContent(form, result.sectionContent);
        }

        closeDashboardCellPopover();
      } catch (error) {
        rollback?.();
        window.alert(error instanceof Error ? error.message : "Unable to save this content.");
      } finally {
        resetFormSubmissionState(form);
        form.dispatchEvent(new Event("input", { bubbles: true }));
      }
    })();
  });
}

export function initPageSectionContentEditors(options?: { rebind?: boolean }) {
  document.querySelectorAll<PageSectionForm>("form").forEach((form) => {
    if (!isPageSectionEditorForm(form)) {
      return;
    }

    if (options?.rebind) {
      delete form.dataset.pageSectionBound;
    }

    bindPageSectionForm(form);
  });
}
