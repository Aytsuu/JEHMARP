export function syncSectionFormsCurrentContent(
  sectionId: string,
  content: Record<string, unknown>,
) {
  const serialized = JSON.stringify(content);

  document.querySelectorAll<HTMLInputElement>('input[name="sectionId"]').forEach((input) => {
    if (input.value.trim() !== sectionId) {
      return;
    }

    const form = input.form;
    if (!form) {
      return;
    }

    const currentContentInput = form.querySelector<HTMLInputElement>(
      'input[name="currentContent"]',
    );
    if (currentContentInput) {
      currentContentInput.value = serialized;
    }
  });
}
