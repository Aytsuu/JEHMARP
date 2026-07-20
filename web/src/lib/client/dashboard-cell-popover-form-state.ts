function normalizeTextValue(value: string): string {
  return value.trim();
}

export function captureFormSnapshot(form: HTMLFormElement): Record<string, string> {
  const checkboxGroups: Record<string, string[]> = {};
  const snapshot: Record<string, string> = {};
  const radioNames = new Set<string>();

  for (const element of Array.from(form.elements)) {
    if (element instanceof HTMLButtonElement) continue;
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      )
    ) {
      continue;
    }

    const { name } = element;
    if (!name) continue;

    if (element instanceof HTMLInputElement) {
      if (element.type === "submit" || element.type === "button") continue;

      if (element.type === "file") {
        snapshot[name] =
          element.files && element.files.length > 0 ? "__file__" : "";
        continue;
      }

      if (element.type === "checkbox") {
        if (!checkboxGroups[name]) checkboxGroups[name] = [];
        if (element.checked) {
          checkboxGroups[name].push(normalizeTextValue(element.value || "on"));
        }
        continue;
      }

      if (element.type === "radio") {
        radioNames.add(name);
        if (element.checked) {
          snapshot[name] = normalizeTextValue(element.value);
        }
        continue;
      }

      snapshot[name] = normalizeTextValue(element.value);
      continue;
    }

    if (element instanceof HTMLSelectElement) {
      if (element.multiple) {
        snapshot[name] = Array.from(element.selectedOptions)
          .map((option) => normalizeTextValue(option.value))
          .sort()
          .join("\u0001");
      } else {
        snapshot[name] = normalizeTextValue(element.value);
      }
      continue;
    }

    snapshot[name] = normalizeTextValue(element.value);
  }

  for (const [name, values] of Object.entries(checkboxGroups)) {
    snapshot[name] = values.sort().join("\u0001");
  }

  for (const name of radioNames) {
    if (!(name in snapshot)) {
      snapshot[name] = "";
    }
  }

  return snapshot;
}

export function formHasChanges(
  form: HTMLFormElement,
  snapshot: Record<string, string>,
): boolean {
  const current = captureFormSnapshot(form);

  return Object.keys({ ...snapshot, ...current }).some((key) => {
    return (snapshot[key] ?? "") !== (current[key] ?? "");
  });
}

export function bindPopoverFormSaveState(form: HTMLFormElement): () => void {
  const snapshot = captureFormSnapshot(form);
  const controller = new AbortController();
  const { signal } = controller;

  const sync = () => {
    const hasChanges = formHasChanges(form, snapshot);
    form.querySelectorAll<HTMLButtonElement>('button[type="submit"]').forEach((button) => {
      button.disabled = !hasChanges;
    });
  };

  sync();
  form.addEventListener("input", sync, { signal });
  form.addEventListener("change", sync, { signal });

  return () => controller.abort();
}
