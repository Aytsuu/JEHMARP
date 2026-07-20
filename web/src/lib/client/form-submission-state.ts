const FORM_SUBMISSION_STATE_FLAG = "formSubmissionStateInitialized";
const SUBMITTING_FLAG = "isSubmitting";
const LOADING_CLASS = "form-submit-button--loading";
const initializedDocuments = new WeakSet<Document>();

function isPostForm(form: HTMLFormElement) {
  return (form.getAttribute("method") || "get").toLowerCase() === "post";
}

function getSubmitButtons(form: HTMLFormElement) {
  return Array.from(
    form.querySelectorAll<HTMLButtonElement>('button[type="submit"]'),
  );
}

export function initFormSubmissionState(root: Document = document) {
  const body = root.body;
  if (!body || initializedDocuments.has(root)) return;

  initializedDocuments.add(root);
  body.dataset[FORM_SUBMISSION_STATE_FLAG] = "true";

  root.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (!isPostForm(form)) return;
      if (form.dataset.skipSubmitState === "true") return;

      if (form.dataset[SUBMITTING_FLAG] === "true") {
        event.preventDefault();
        return;
      }

      form.dataset[SUBMITTING_FLAG] = "true";

      const submitButtons = getSubmitButtons(form);
      const submitter =
        event.submitter instanceof HTMLButtonElement ? event.submitter : null;

      const buttonsToDisable = new Set(submitButtons);
      if (submitter) buttonsToDisable.add(submitter);

      buttonsToDisable.forEach((button) => {
        button.disabled = true;
      });

      if (submitter) {
        submitter.classList.add(LOADING_CLASS);
        submitter.setAttribute("aria-busy", "true");
      }
    },
    true,
  );
}
