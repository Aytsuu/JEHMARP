const FORM_SUBMISSION_STATE_FLAG = "formSubmissionStateInitialized";
const SUBMITTING_FLAG = "isSubmitting";
const LOADING_CLASS = "form-submit-button--loading";
const initializedDocuments = new WeakSet<Document>();

type FormSubmissionStateOptions = {
  onSubmit?: (form: HTMLFormElement) => void;
};

function isPostForm(form: HTMLFormElement) {
  return (form.getAttribute("method") || "get").toLowerCase() === "post";
}

function getSubmitButtons(form: HTMLFormElement) {
  const root = form.ownerDocument;
  const buttons = Array.from(
    form.querySelectorAll<HTMLButtonElement>('button[type="submit"]'),
  );

  const formId = form.id;
  if (!formId) {
    return buttons;
  }

  const externalButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>(
      `button[type="submit"][form="${formId}"]`,
    ),
  );

  return [...new Set([...buttons, ...externalButtons])];
}

function applySubmittingState(
  form: HTMLFormElement,
  submitter: HTMLButtonElement | null,
) {
  form.dataset[SUBMITTING_FLAG] = "true";

  const submitButtons = getSubmitButtons(form);
  const buttonsToDisable = new Set(submitButtons);
  if (submitter) {
    buttonsToDisable.add(submitter);
  }

  buttonsToDisable.forEach((button) => {
    button.disabled = true;
  });

  if (submitter) {
    submitter.classList.add(LOADING_CLASS);
    submitter.setAttribute("aria-busy", "true");
  }
}

export function resetFormSubmissionState(form: HTMLFormElement) {
  delete form.dataset[SUBMITTING_FLAG];

  getSubmitButtons(form).forEach((button) => {
    button.disabled = false;
    button.classList.remove(LOADING_CLASS);
    button.removeAttribute("aria-busy");
  });
}

export function initFormSubmissionState(
  root: Document = document,
  options: FormSubmissionStateOptions = {},
) {
  const body = root.body;
  if (!body || initializedDocuments.has(root)) return;

  initializedDocuments.add(root);
  body.dataset[FORM_SUBMISSION_STATE_FLAG] = "true";

  root.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (!isPostForm(form)) return;
    if (form.dataset.skipSubmitState === "true") return;
    if (event.defaultPrevented) return;

    if (form.dataset[SUBMITTING_FLAG] === "true") {
      event.preventDefault();
      return;
    }

    const submitter =
      event.submitter instanceof HTMLButtonElement ? event.submitter : null;

    options.onSubmit?.(form);
    applySubmittingState(form, submitter);
  });
}
