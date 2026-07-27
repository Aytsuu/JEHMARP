export type FaqItem = {
  question: string;
  answer: string;
};

export const DEFAULT_FAQ_ITEMS: FaqItem[] = [
  {
    question: "Is the meat fresh or frozen?",
    answer:
      "Fresh cuts are prepared daily and packed on-site for the day's orders.",
  },
  {
    question: "Do you accept custom cuts?",
    answer:
      "Yes. You can request preferred thickness, portioning, and preparation when ordering.",
  },
  {
    question: "Can I order in bulk?",
    answer:
      "Yes. Family packs, party orders, and business quantities can be arranged ahead of time.",
  },
  {
    question: "Do you offer pickup and delivery?",
    answer:
      "Pickup is supported directly, and delivery can be coordinated based on your area.",
  },
];

export const DEFAULT_FAQ_HEADING = "FREQUENTLY ASKED QUESTIONS";
export const DEFAULT_FAQ_DESCRIPTION =
  "Find quick answers to common questions about our fresh meat cuts, ordering process, and pickup/delivery options.";

export function escapeFaqText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseFaqItem(value: unknown): FaqItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const question =
    typeof record.question === "string" ? record.question.trim() : "";
  const answer = typeof record.answer === "string" ? record.answer.trim() : "";

  if (!question || !answer) {
    return null;
  }

  return { question, answer };
}

export function normalizeFaqItems(value: unknown): FaqItem[] {
  if (!Array.isArray(value)) {
    return DEFAULT_FAQ_ITEMS.map((item) => ({ ...item }));
  }

  const items = value.flatMap((item) => {
    const parsed = parseFaqItem(item);
    return parsed ? [parsed] : [];
  });

  if (items.length === 0) {
    return DEFAULT_FAQ_ITEMS.map((item) => ({ ...item }));
  }

  return items;
}

export function parseFaqItemsEditorPayload(value: string): FaqItem[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("FAQ items must be valid JSON.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("FAQ items must be an array.");
  }

  const items = parsed.flatMap((item) => {
    const faqItem = parseFaqItem(item);
    return faqItem ? [faqItem] : [];
  });

  if (items.length === 0) {
    throw new Error("At least one FAQ item is required.");
  }

  return items;
}

export function createDefaultFaqItem(): FaqItem {
  return {
    question: "New question",
    answer: "Add your answer here.",
  };
}

export function renderFaqAccordionHtml(items: FaqItem[]): string {
  return items
    .map(
      (item) => `<article class="faq-item">
  <button class="faq-item__trigger" type="button">
    ${escapeFaqText(item.question)}
    <span class="faq-item__icon">+</span>
  </button>
  <div class="faq-item__content">
    <p>${escapeFaqText(item.answer)}</p>
  </div>
</article>`,
    )
    .join("\n");
}

export function getFaqHeading(content: Record<string, unknown> | undefined): string {
  const heading =
    typeof content?.heading === "string" ? content.heading.trim() : "";

  return heading.length > 0 ? heading : DEFAULT_FAQ_HEADING;
}

export function getFaqDescription(
  content: Record<string, unknown> | undefined,
): string {
  const description =
    typeof content?.description === "string" ? content.description.trim() : "";

  return description.length > 0 ? description : DEFAULT_FAQ_DESCRIPTION;
}

export function getFaqItems(
  content: Record<string, unknown> | undefined,
): FaqItem[] {
  return normalizeFaqItems(content?.items);
}
