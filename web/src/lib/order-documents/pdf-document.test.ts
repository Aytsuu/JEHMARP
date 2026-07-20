import { describe, expect, it } from "vitest";

import { buildPdfDocument } from "./pdf-document";

describe("buildPdfDocument", () => {
  it("combines multiple content streams into one multipage PDF", () => {
    const pdf = buildPdfDocument([
      "BT /F1 12 Tf 1 0 0 1 40 800 Tm (Page one) Tj ET",
      "BT /F1 12 Tf 1 0 0 1 40 800 Tm (Page two) Tj ET",
    ]);
    const text = new TextDecoder().decode(pdf);

    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/Count 2");
    expect(text).toContain("(Page one)");
    expect(text).toContain("(Page two)");
  });
});
