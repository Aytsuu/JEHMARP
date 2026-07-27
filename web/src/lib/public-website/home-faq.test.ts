import { describe, expect, it } from "vitest";

import {
  DEFAULT_FAQ_ITEMS,
  createDefaultFaqItem,
  getFaqItems,
  normalizeFaqItems,
  parseFaqItemsEditorPayload,
  renderFaqAccordionHtml,
} from "./home-faq";

describe("home-faq", () => {
  it("falls back to default FAQ items when content is missing", () => {
    expect(getFaqItems(undefined)).toEqual(DEFAULT_FAQ_ITEMS);
    expect(normalizeFaqItems(null)).toEqual(DEFAULT_FAQ_ITEMS);
  });

  it("normalizes valid FAQ items from content", () => {
    const items = normalizeFaqItems([
      { question: "Custom question?", answer: "Custom answer." },
      { question: "", answer: "Skipped" },
    ]);

    expect(items).toEqual([{ question: "Custom question?", answer: "Custom answer." }]);
  });

  it("parses editor payload and rejects empty lists", () => {
    expect(
      parseFaqItemsEditorPayload(
        JSON.stringify([{ question: "Q?", answer: "A." }]),
      ),
    ).toEqual([{ question: "Q?", answer: "A." }]);

    expect(() => parseFaqItemsEditorPayload("[]")).toThrow(
      "At least one FAQ item is required.",
    );
  });

  it("renders accordion markup for preview sync", () => {
    const html = renderFaqAccordionHtml([createDefaultFaqItem()]);

    expect(html).toContain('class="faq-item"');
    expect(html).toContain("New question");
    expect(html).toContain("Add your answer here.");
  });
});
