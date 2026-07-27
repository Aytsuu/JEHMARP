import {
  removeHomeHeroSlideAt,
  syncHomeHeroCarouselFromSectionContent,
} from "@/lib/client/home-hero-carousel";
import { ADMIN_JSON_ACTION_PATH } from "@/lib/admin-dashboard/json-action-path";
import { normalizeHeroSlides } from "@/lib/public-website/home-hero-slides";
import { resolvePublicStorageUrl } from "@/lib/supabase/storage";

const NEW_SLIDE_MARKER = "__NEW__";
const DEFAULT_SLIDE_ALT = "Hero slide image";
const DRAGGING_BODY_CLASS = "admin-hero-carousel-dragging";
const SAVING_FLAG = "heroCarouselSaving";

type HeroCarouselEditorForm = HTMLFormElement & {
  dataset: DOMStringMap & {
    heroCarouselBound?: string;
    heroCarouselSaving?: string;
  };
};

type AdminActionJsonResponse = {
  success: boolean;
  error?: string;
  sectionContent?: Record<string, unknown>;
};

function getList(form: HeroCarouselEditorForm) {
  return form.querySelector<HTMLUListElement>("[data-hero-carousel-list]");
}

function getHiddenJson(form: HeroCarouselEditorForm) {
  return form.querySelector<HTMLInputElement>("[data-hero-slides-json]");
}

function getHiddenIndexes(form: HeroCarouselEditorForm) {
  return form.querySelector<HTMLInputElement>("[data-hero-new-image-indexes]");
}

function getAddInput(form: HeroCarouselEditorForm) {
  return form.querySelector<HTMLInputElement>("[data-hero-carousel-add-input]");
}

function getCurrentContentInput(form: HeroCarouselEditorForm) {
  return form.querySelector<HTMLInputElement>('input[name="currentContent"]');
}

function getFormActionUrl() {
  return ADMIN_JSON_ACTION_PATH;
}

async function readAdminJsonResponse(response: Response): Promise<AdminActionJsonResponse> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error("Unexpected server response. Please refresh and try again.");
  }

  return (await response.json()) as AdminActionJsonResponse;
}

async function submitCarouselAction(
  form: HeroCarouselEditorForm,
  formData: FormData,
): Promise<AdminActionJsonResponse> {
  const response = await fetch(getFormActionUrl(), {
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
    throw new Error(result.error || "Unable to update the carousel.");
  }

  if (result.sectionContent) {
    updateCurrentContent(form, result.sectionContent);
  }

  return result;
}

function getPersistedItems(list: HTMLUListElement) {
  return [...list.querySelectorAll<HTMLElement>("[data-hero-carousel-item]")].filter(
    (item) => !item.hasAttribute("data-new-slide"),
  );
}

function gripIconMarkup() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.5" fill="currentColor"></circle><circle cx="9" cy="12" r="1.5" fill="currentColor"></circle><circle cx="9" cy="18" r="1.5" fill="currentColor"></circle><circle cx="15" cy="6" r="1.5" fill="currentColor"></circle><circle cx="15" cy="12" r="1.5" fill="currentColor"></circle><circle cx="15" cy="18" r="1.5" fill="currentColor"></circle></svg>`;
}

function removeIconMarkup() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
}

function refreshSlideLabels(list: HTMLUListElement) {
  list.querySelectorAll<HTMLElement>("[data-hero-carousel-item]").forEach((item, index) => {
    const label = item.querySelector<HTMLElement>("[data-hero-carousel-label]");
    if (label) {
      label.textContent = `Carousel image ${index + 1}`;
    }

    const grip = item.querySelector<HTMLElement>("[data-hero-carousel-grip]");
    if (grip) {
      grip.setAttribute("aria-label", `Reorder carousel image ${index + 1}`);
    }

    const remove = item.querySelector<HTMLElement>("[data-hero-carousel-remove]");
    if (remove) {
      remove.setAttribute("aria-label", `Remove carousel image ${index + 1}`);
    }
  });
}

function refreshPersistedSlideIndexes(list: HTMLUListElement) {
  getPersistedItems(list).forEach((item, index) => {
    item.dataset.slideIndex = String(index);
  });
}

function updateCurrentContent(form: HeroCarouselEditorForm, content: Record<string, unknown>) {
  const currentContentInput = getCurrentContentInput(form);
  if (currentContentInput) {
    currentContentInput.value = JSON.stringify(content);
  }
}

function updateCurrentContentAfterDelete(form: HeroCarouselEditorForm, slideIndex: number) {
  const currentContentInput = getCurrentContentInput(form);
  if (!currentContentInput?.value) {
    return;
  }

  const content = JSON.parse(currentContentInput.value) as Record<string, unknown>;
  const slides = normalizeHeroSlides(content.slides);
  updateCurrentContent(form, {
    ...content,
    slides: slides.filter((_, index) => index !== slideIndex),
  });
}

function createSlideRow(file?: File) {
  const item = document.createElement("li");
  item.className = "admin-hero-carousel-item";
  item.setAttribute("data-hero-carousel-item", "");
  item.setAttribute("data-new-slide", "true");
  item.setAttribute("data-slide-alt", DEFAULT_SLIDE_ALT);

  item.innerHTML = `
    <button type="button" class="admin-hero-carousel-item__grip" data-hero-carousel-grip aria-label="Reorder carousel image">
      ${gripIconMarkup()}
    </button>
    <div class="admin-hero-carousel-item__main">
      <div class="admin-hero-carousel-item__preview" data-hero-carousel-preview>
        <span class="admin-hero-carousel-item__preview-placeholder">New image</span>
      </div>
      <span class="admin-hero-carousel-item__label" data-hero-carousel-label>Carousel image</span>
    </div>
    <input type="file" name="slideImages" accept="image/*" data-hero-carousel-file class="sr-only" />
    <button type="button" class="admin-hero-carousel-item__remove" data-hero-carousel-remove aria-label="Remove carousel image">
      ${removeIconMarkup()}
    </button>
  `;

  const fileInput = item.querySelector<HTMLInputElement>("[data-hero-carousel-file]");
  if (file && fileInput) {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
    updatePreviewFromFile(item);
  }

  return item;
}

function updatePreviewFromFile(item: HTMLElement) {
  const fileInput = item.querySelector<HTMLInputElement>("[data-hero-carousel-file]");
  const preview = item.querySelector<HTMLElement>("[data-hero-carousel-preview]");
  if (!fileInput || !preview) {
    return;
  }

  const file = fileInput.files?.[0];
  if (!file) {
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  preview.innerHTML = `<img src="${objectUrl}" alt="" class="admin-hero-carousel-item__image" />`;
}

function serializeForm(form: HeroCarouselEditorForm) {
  const list = getList(form);
  const hiddenJson = getHiddenJson(form);
  const hiddenIndexes = getHiddenIndexes(form);
  if (!list || !hiddenJson || !hiddenIndexes) {
    return false;
  }

  const items = [...list.querySelectorAll<HTMLElement>("[data-hero-carousel-item]")];
  if (items.length === 0) {
    window.alert("At least one carousel image is required.");
    return false;
  }

  const slides: Array<{ src: string; alt: string }> = [];
  const newImageIndexes: number[] = [];

  for (const item of items) {
    const fileInput = item.querySelector<HTMLInputElement>("[data-hero-carousel-file]");
    const existingSrc = item.dataset.slideSrc?.trim() ?? "";
    const alt = item.dataset.slideAlt?.trim() || DEFAULT_SLIDE_ALT;
    const hasFile = Boolean(fileInput?.files?.[0]);
    const isNew = item.hasAttribute("data-new-slide");

    if (isNew) {
      if (!hasFile) {
        window.alert("Choose an image file for each new slide.");
        return false;
      }

      const slideIndex = slides.length;
      slides.push({ src: NEW_SLIDE_MARKER, alt });
      newImageIndexes.push(slideIndex);
      continue;
    }

    if (!existingSrc) {
      continue;
    }

    slides.push({ src: existingSrc, alt });
  }

  if (slides.length === 0) {
    window.alert("Add at least one carousel image before saving.");
    return false;
  }

  hiddenJson.value = JSON.stringify(slides);
  hiddenIndexes.value = newImageIndexes.join(",");
  return true;
}

async function saveCarouselSlides(form: HeroCarouselEditorForm) {
  if (!serializeForm(form)) {
    throw new Error("Unable to prepare carousel changes.");
  }

  const formData = new FormData(form);
  const result = await submitCarouselAction(form, formData);

  if (result.sectionContent) {
    syncHomeHeroCarouselFromSectionContent(result.sectionContent);
    syncEditorSlidesFromSectionContent(form, result.sectionContent);
  }

  return result;
}

function syncEditorSlidesFromSectionContent(
  form: HeroCarouselEditorForm,
  content: Record<string, unknown>,
) {
  const list = getList(form);
  if (!list) {
    return;
  }

  const slides = normalizeHeroSlides(content.slides);
  list.innerHTML = slides
    .map((slide, index) => {
      const displaySrc = resolvePublicStorageUrl(slide.src) ?? slide.src;
      return `<li class="admin-hero-carousel-item" data-hero-carousel-item data-slide-src="${slide.src}" data-slide-alt="${slide.alt}" data-slide-index="${index}">
        <button type="button" class="admin-hero-carousel-item__grip" data-hero-carousel-grip aria-label="Reorder carousel image ${index + 1}">
          ${gripIconMarkup()}
        </button>
        <div class="admin-hero-carousel-item__main">
          <div class="admin-hero-carousel-item__preview" data-hero-carousel-preview>
            <img src="${displaySrc}" alt="" class="admin-hero-carousel-item__image" />
          </div>
          <span class="admin-hero-carousel-item__label" data-hero-carousel-label>Carousel image ${index + 1}</span>
        </div>
        <button type="button" class="admin-hero-carousel-item__remove" data-hero-carousel-remove aria-label="Remove carousel image ${index + 1}">
          ${removeIconMarkup()}
        </button>
      </li>`;
    })
    .join("");

  delete list.dataset.heroCarouselDragBound;
  bindDragAndDrop(list, form);
}

async function deleteCarouselSlide(
  form: HeroCarouselEditorForm,
  list: HTMLUListElement,
  item: HTMLElement,
  slideIndex: number,
) {
  const formData = new FormData(form);
  formData.set("slideAction", "delete");
  formData.set("slideIndex", String(slideIndex));
  const slideSrc = item.dataset.slideSrc?.trim();
  if (slideSrc) {
    formData.set("slideSrc", slideSrc);
  }
  formData.delete("contentField");
  formData.delete("contentValue");
  formData.delete("slideNewImageIndexes");

  const result = await submitCarouselAction(form, formData);
  item.remove();
  refreshPersistedSlideIndexes(list);
  refreshSlideLabels(list);
  removeHomeHeroSlideAt(slideIndex);

  if (result.sectionContent) {
    updateCurrentContent(form, result.sectionContent);
  } else {
    updateCurrentContentAfterDelete(form, slideIndex);
  }
}

function getDragAfterElement(list: HTMLUListElement, y: number) {
  const items = [
    ...list.querySelectorAll<HTMLElement>(
      "[data-hero-carousel-item]:not(.admin-hero-carousel-item--dragging)",
    ),
  ];

  return (
    items.reduce<{ offset: number; element: HTMLElement } | null>((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;

      if (offset < 0 && offset > (closest?.offset ?? Number.NEGATIVE_INFINITY)) {
        return { offset, element: child };
      }

      return closest;
    }, null)?.element ?? null
  );
}

function setDragCursor(active: boolean) {
  document.body.classList.toggle(DRAGGING_BODY_CLASS, active);
}

function setFormSaving(form: HeroCarouselEditorForm, saving: boolean) {
  form.dataset[SAVING_FLAG] = saving ? "true" : "false";
  form.querySelectorAll<HTMLButtonElement>("[data-hero-carousel-remove], [data-hero-carousel-add]").forEach(
    (button) => {
      button.disabled = saving;
    },
  );
}

function bindDragAndDrop(list: HTMLUListElement, form: HeroCarouselEditorForm) {
  if (list.dataset.heroCarouselDragBound === "true") {
    return;
  }

  list.dataset.heroCarouselDragBound = "true";
  let draggedItem: HTMLElement | null = null;

  list.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const grip = target.closest<HTMLElement>("[data-hero-carousel-grip]");
    if (!grip) {
      return;
    }

    const item = grip.closest<HTMLElement>("[data-hero-carousel-item]");
    if (!item) {
      return;
    }

    draggedItem = item;
    item.classList.add("admin-hero-carousel-item--dragging");
    setDragCursor(true);
    grip.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  list.addEventListener("pointermove", (event) => {
    if (!draggedItem) {
      return;
    }

    const afterElement = getDragAfterElement(list, event.clientY);
    if (afterElement == null) {
      list.appendChild(draggedItem);
      return;
    }

    list.insertBefore(draggedItem, afterElement);
  });

  const finishDrag = async () => {
    if (!draggedItem) {
      return;
    }

    draggedItem.classList.remove("admin-hero-carousel-item--dragging");
    draggedItem = null;
    setDragCursor(false);
    refreshSlideLabels(list);

    if (form.dataset[SAVING_FLAG] === "true") {
      return;
    }

    setFormSaving(form, true);
    try {
      await saveCarouselSlides(form);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to reorder carousel images.");
    } finally {
      setFormSaving(form, false);
    }
  };

  list.addEventListener("pointerup", finishDrag);
  list.addEventListener("pointercancel", finishDrag);
}

function bindHeroCarouselForm(form: HeroCarouselEditorForm) {
  if (form.dataset.heroCarouselBound === "true") {
    return;
  }

  form.dataset.heroCarouselBound = "true";
  const list = getList(form);
  const addInput = getAddInput(form);
  if (!list) {
    return;
  }

  bindDragAndDrop(list, form);

  form.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const addButton = target.closest<HTMLButtonElement>("[data-hero-carousel-add]");
    if (addButton) {
      event.preventDefault();
      event.stopPropagation();
      addInput?.click();
      return;
    }

    const removeButton = target.closest<HTMLButtonElement>("[data-hero-carousel-remove]");
    if (!removeButton) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const item = removeButton.closest<HTMLElement>("[data-hero-carousel-item]");
    if (!item) {
      return;
    }

    const items = list.querySelectorAll("[data-hero-carousel-item]");
    if (items.length <= 1) {
      window.alert("At least one carousel image is required.");
      return;
    }

    if (form.dataset[SAVING_FLAG] === "true") {
      return;
    }

    if (item.hasAttribute("data-new-slide")) {
      item.remove();
      refreshSlideLabels(list);
      return;
    }

    const slideIndex = getPersistedItems(list).indexOf(item);
    if (slideIndex < 0) {
      return;
    }

    setFormSaving(form, true);
    try {
      await deleteCarouselSlide(form, list, item, slideIndex);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to remove carousel image.");
    } finally {
      setFormSaving(form, false);
    }
  });

  addInput?.addEventListener("change", async () => {
    const files = [...(addInput.files ?? [])];
    if (files.length === 0) {
      return;
    }

    for (const file of files) {
      list.appendChild(createSlideRow(file));
    }

    refreshSlideLabels(list);
    addInput.value = "";

    if (form.dataset[SAVING_FLAG] === "true") {
      return;
    }

    setFormSaving(form, true);
    try {
      await saveCarouselSlides(form);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to add carousel image.");
    } finally {
      setFormSaving(form, false);
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
  });
}

export function initHeroCarouselEditors(options?: { rebind?: boolean }) {
  document
    .querySelectorAll<HeroCarouselEditorForm>("[data-hero-carousel-form]")
    .forEach((form) => {
      if (options?.rebind) {
        delete form.dataset.heroCarouselBound;
        const list = getList(form);
        if (list) {
          delete list.dataset.heroCarouselDragBound;
        }
      }

      bindHeroCarouselForm(form);
    });
}
