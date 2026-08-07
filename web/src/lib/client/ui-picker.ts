export type UiPickerSelection = {
  value: string;
  label: string;
};

export type InitUiPickerOptions = {
  root: HTMLElement;
  optionTemplate: HTMLTemplateElement;
  multiple?: boolean;
  maxSelections?: number;
  hiddenInputContainer?: HTMLElement | null;
  hiddenInputName?: string;
  onChange?: (selection: UiPickerSelection[]) => void;
};

type UiPickerOptionNode = HTMLElement & {
  dataset: DOMStringMap & {
    uiPickerOptionValue?: string;
    uiPickerOptionLabel?: string;
    uiPickerOptionSearch?: string;
  };
};

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

type UiPickerController = {
  getSelectedValues: () => UiPickerSelection[];
  destroy: () => void;
};

type UiPickerRoot = HTMLElement & {
  __uiPickerController?: UiPickerController;
};

export function initUiPicker(options: InitUiPickerOptions) {
  const {
    root,
    optionTemplate,
    multiple = false,
    maxSelections,
    hiddenInputContainer = null,
    hiddenInputName = "orderId",
    onChange,
  } = options;

  const picker = root.matches("[data-customer-picker]")
    ? root
    : root.querySelector<HTMLElement>("[data-customer-picker]");
  if (!picker) {
    return {
      getSelectedValues: () => [] as UiPickerSelection[],
      destroy: () => undefined,
    };
  }

  const pickerRoot = picker as UiPickerRoot;
  pickerRoot.__uiPickerController?.destroy();

  if (pickerRoot.dataset.uiPickerInitialized === "true") {
    delete pickerRoot.dataset.uiPickerInitialized;
  }

  pickerRoot.dataset.uiPickerInitialized = "true";

  const isMultiple = multiple || pickerRoot.dataset.uiPickerMultiple === "true";
  const selectionLimit = maxSelections
    ?? Number.parseInt(pickerRoot.dataset.uiPickerMaxSelections ?? "", 10);
  const resolvedMaxSelections = Number.isFinite(selectionLimit) && selectionLimit > 0
    ? selectionLimit
    : undefined;

  const searchInput = pickerRoot.querySelector<HTMLInputElement>(
    "[data-customer-search-input], [data-ui-picker-search]",
  );
  const pickerToggle = pickerRoot.querySelector<HTMLButtonElement>("[data-customer-picker-toggle]");
  const pickerMenu = pickerRoot.querySelector<HTMLElement>("[data-customer-picker-menu]");
  const optionsContainer = pickerRoot.querySelector<HTMLElement>("[data-customer-options]");
  const optionsEmpty = pickerRoot.querySelector<HTMLElement>("[data-customer-options-empty]");
  const pickerSummary = pickerRoot.querySelector<HTMLElement>("[data-customer-picker-summary]");
  const badgesContainer = pickerRoot.querySelector<HTMLElement>("[data-ui-picker-badges]");
  const control = pickerRoot.querySelector<HTMLElement>("[data-ui-picker-control]");

  const sourceOptions = Array.from(
    optionTemplate.content.querySelectorAll<UiPickerOptionNode>("[data-ui-picker-option]"),
  ).map((option) => option.cloneNode(true) as UiPickerOptionNode);

  const selected = new Map<string, UiPickerSelection>();
  let currentSearch = searchInput?.value ?? "";

  function setPickerOpen(isOpen: boolean) {
    if (!pickerMenu || !pickerToggle) return;
    pickerMenu.hidden = !isOpen;
    pickerToggle.setAttribute("aria-expanded", String(isOpen));
    pickerRoot.dataset.open = String(isOpen);
  }

  function getOptionValue(option: UiPickerOptionNode) {
    return option.dataset.uiPickerOptionValue
      ?? option.querySelector<HTMLInputElement>("[data-ui-picker-option-checkbox]")?.value
      ?? "";
  }

  function getOptionLabel(option: UiPickerOptionNode) {
    return option.dataset.uiPickerOptionLabel
      ?? option.querySelector<HTMLElement>(".order-customer-picker__option-name")?.textContent?.trim()
      ?? option.querySelector<HTMLElement>("[data-ui-picker-option-label]")?.textContent?.trim()
      ?? "";
  }

  function getOptionSearchText(option: UiPickerOptionNode) {
    return normalizeSearchValue(
      option.dataset.uiPickerOptionSearch
      ?? `${getOptionLabel(option)} ${option.textContent ?? ""}`,
    );
  }

  function isOptionDisabled(option: UiPickerOptionNode) {
    const checkbox = option.querySelector<HTMLInputElement>("[data-ui-picker-option-checkbox]");
    return checkbox?.disabled ?? option.dataset.uiPickerOptionDisabled === "true";
  }

  function syncHiddenInputs() {
    if (!hiddenInputContainer) return;

    hiddenInputContainer.replaceChildren(
      ...Array.from(selected.values()).map((entry) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = hiddenInputName;
        input.value = entry.value;
        return input;
      }),
    );
  }

  function handleBadgeRemove(event: Event, value: string) {
    event.preventDefault();
    event.stopPropagation();
    removeSelection(value);
    focusSearchInput();
  }

  function bindBadgeRemoveButton(removeButton: HTMLButtonElement, value: string) {
    removeButton.addEventListener("click", (event) => {
      handleBadgeRemove(event, value);
    });
    removeButton.addEventListener("pointerup", (event) => {
      if (event.pointerType === "mouse") return;
      handleBadgeRemove(event, value);
    });
    removeButton.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      handleBadgeRemove(event, value);
    });
  }

  function renderBadges() {
    if (!badgesContainer) return;

    badgesContainer.replaceChildren(
      ...Array.from(selected.values()).map((entry) => {
        const badge = document.createElement("span");
        badge.className = "ui-picker__badge";
        badge.dataset.uiPickerBadge = entry.value;

        const label = document.createElement("span");
        label.className = "ui-picker__badge-label";
        label.textContent = entry.label;

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "ui-picker__badge-remove";
        removeButton.dataset.uiPickerRemoveValue = entry.value;
        removeButton.setAttribute("aria-label", `Remove ${entry.label}`);
        removeButton.innerHTML = `
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 6 6 18"></path>
            <path d="m6 6 12 12"></path>
          </svg>
        `;
        bindBadgeRemoveButton(removeButton, entry.value);

        badge.append(label, removeButton);
        return badge;
      }),
    );
  }

  function notifyChange() {
    const selection = Array.from(selected.values());
    syncHiddenInputs();
    onChange?.(selection);
  }

  function updateOptionCheckboxState(option: UiPickerOptionNode) {
    const checkbox = option.querySelector<HTMLInputElement>("[data-ui-picker-option-checkbox]");
    if (!checkbox) return;

    const value = getOptionValue(option);
    checkbox.checked = selected.has(value);

    const limitReached = resolvedMaxSelections !== undefined
      && selected.size >= resolvedMaxSelections;
    checkbox.disabled = isOptionDisabled(option)
      || (limitReached && !selected.has(value));
  }

  function renderOptions(searchTerm = currentSearch) {
    if (!optionsContainer || !optionsEmpty) return;

    const normalizedSearch = normalizeSearchValue(searchTerm);
    const matchingOptions = sourceOptions.filter((option) => {
      if (normalizedSearch.length === 0) return true;
      return getOptionSearchText(option).includes(normalizedSearch);
    });

    optionsContainer.replaceChildren(
      ...matchingOptions.map((option) => {
        const clone = option.cloneNode(true) as UiPickerOptionNode;
        updateOptionCheckboxState(clone);
        return clone;
      }),
    );

    const hasOptions = matchingOptions.length > 0;
    optionsEmpty.hidden = hasOptions;
    optionsContainer.hidden = !hasOptions;

    if (pickerSummary) {
      pickerSummary.hidden = hasOptions || normalizedSearch.length > 0;
    }
  }

  function addSelection(option: UiPickerOptionNode) {
    const value = getOptionValue(option);
    const label = getOptionLabel(option);
    if (!value || !label || isOptionDisabled(option)) return false;
    if (selected.has(value)) return true;
    if (resolvedMaxSelections !== undefined && selected.size >= resolvedMaxSelections) {
      return false;
    }

    selected.set(value, { value, label });
    renderBadges();
    renderOptions();
    notifyChange();
    return true;
  }

  function removeSelection(value: string) {
    if (!selected.delete(value)) return;
    renderBadges();
    renderOptions();
    notifyChange();
  }

  function focusSearchInput() {
    searchInput?.focus();
  }

  function handleOptionsContainerChange(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches("[data-ui-picker-option-checkbox]")) return;

    const option = target.closest<UiPickerOptionNode>("[data-ui-picker-option]");
    if (!option) return;

    if (target.checked) {
      const added = addSelection(option);
      if (!added) {
        target.checked = false;
      }
    } else {
      removeSelection(target.value);
    }

    if (searchInput) {
      searchInput.value = "";
      currentSearch = "";
      renderOptions("");
    }

    focusSearchInput();
  }

  function handleSearchInput() {
    currentSearch = searchInput?.value ?? "";
    renderOptions(currentSearch);
    setPickerOpen(true);
  }

  function handleToggleClick() {
    const willOpen = pickerToggle?.getAttribute("aria-expanded") !== "true";
    setPickerOpen(willOpen);
    if (willOpen) {
      focusSearchInput();
    }
  }

  function handleControlFocus() {
    setPickerOpen(true);
  }

  function handleDocumentClick(event: Event) {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (pickerRoot.contains(target)) return;
    setPickerOpen(false);
  }

  const pickerEventOptions = { capture: true } as const;

  optionsContainer?.addEventListener("change", handleOptionsContainerChange);
  searchInput?.addEventListener("input", handleSearchInput);
  searchInput?.addEventListener("focus", handleControlFocus);
  control?.addEventListener("focusin", handleControlFocus);
  pickerToggle?.addEventListener("click", handleToggleClick);
  document.addEventListener("click", handleDocumentClick, pickerEventOptions);

  setPickerOpen(false);
  renderBadges();
  renderOptions("");

  const controller = {
    getSelectedValues: () => Array.from(selected.values()),
    destroy: () => {
      optionsContainer?.removeEventListener("change", handleOptionsContainerChange);
      searchInput?.removeEventListener("input", handleSearchInput);
      searchInput?.removeEventListener("focus", handleControlFocus);
      control?.removeEventListener("focusin", handleControlFocus);
      pickerToggle?.removeEventListener("click", handleToggleClick);
      document.removeEventListener("click", handleDocumentClick, pickerEventOptions);
      delete pickerRoot.dataset.uiPickerInitialized;
      delete pickerRoot.__uiPickerController;
    },
  };

  (pickerRoot as UiPickerRoot).__uiPickerController = controller;

  if (!isMultiple) {
    return controller;
  }

  return controller;
}
