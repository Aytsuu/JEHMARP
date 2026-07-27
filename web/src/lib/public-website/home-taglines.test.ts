import { describe, expect, it } from "vitest";

import {
  createDefaultTaglineItem,
  createDefaultTaglineRun,
  getTaglineMarkClassName,
  mergeAdjacentRuns,
  normalizeTaglineItem,
  normalizeTaglineItems,
  parseTaglineItemsEditorPayload,
  renderTaglineRunsToHtml,
  renderTaglinesEditorHtml,
  taglineItemsFromPlainText,
} from "./home-taglines";

describe("home taglines", () => {
  it("normalizes legacy string tagline items into default runs", () => {
    expect(normalizeTaglineItems([" Fresh ", "", 42, "Trusted"])).toEqual([
      createDefaultTaglineItem("Fresh"),
      createDefaultTaglineItem("Trusted"),
    ]);
  });

  it("normalizes legacy line-level style objects into a single run", () => {
    expect(
      normalizeTaglineItem({
        text: "Fresh - Quality - Trusted",
        fontSize: "xl",
        fontWeight: 700,
        italic: true,
      }),
    ).toEqual({
      runs: [
        {
          text: "Fresh - Quality - Trusted",
          fontSize: "xl",
          fontWeight: 700,
          italic: true,
        },
      ],
    });
  });

  it("parses editor JSON payloads with inline runs", () => {
    expect(
      parseTaglineItemsEditorPayload(
        JSON.stringify([
          {
            runs: [
              { text: "Fresh - ", fontSize: "lg", fontWeight: 600, italic: false },
              { text: "Quality", fontSize: "xl", fontWeight: 700, italic: true },
              { text: " - Trusted", fontSize: "lg", fontWeight: 600, italic: false },
            ],
          },
        ]),
      ),
    ).toEqual([
      {
        runs: [
          { text: "Fresh - ", fontSize: "lg", fontWeight: 600, italic: false },
          { text: "Quality", fontSize: "xl", fontWeight: 700, italic: true },
          { text: " - Trusted", fontSize: "lg", fontWeight: 600, italic: false },
        ],
      },
    ]);
  });

  it("still accepts legacy newline payloads", () => {
    expect(
      parseTaglineItemsEditorPayload(
        "Fresh - Quality - Trusted\nFrom farmers to families - Quality you can trust",
      ),
    ).toEqual([
      createDefaultTaglineItem("Fresh - Quality - Trusted"),
      createDefaultTaglineItem("From farmers to families - Quality you can trust"),
    ]);
  });

  it("requires at least one tagline", () => {
    expect(() => parseTaglineItemsEditorPayload("[]")).toThrow(
      "At least one tagline is required.",
    );
  });

  it("renders styled runs as sanitized inline markup", () => {
    expect(
      renderTaglineRunsToHtml([
        createDefaultTaglineRun("Fresh - "),
        {
          text: "Quality",
          fontSize: "xl",
          fontWeight: 700,
          italic: true,
        },
      ]),
    ).toBe(
      `Fresh - <span class="${getTaglineMarkClassName({
        fontSize: "xl",
        fontWeight: 700,
        italic: true,
      })}" data-tagline-mark="true">Quality</span>`,
    );
  });

  it("merges adjacent runs with identical styles", () => {
    expect(
      mergeAdjacentRuns([
        createDefaultTaglineRun("Fresh"),
        createDefaultTaglineRun(" - Trusted"),
      ]),
    ).toEqual([createDefaultTaglineRun("Fresh - Trusted")]);
  });

  it("renders editor html with one block per tagline line", () => {
    expect(
      renderTaglinesEditorHtml([
        createDefaultTaglineItem("Fresh - Quality - Trusted"),
        createDefaultTaglineItem("From farmers to families"),
      ]),
    ).toBe(
      '<div data-tagline-line="true">Fresh - Quality - Trusted</div><div data-tagline-line="true">From farmers to families</div>',
    );
  });

  it("splits plain text by newline into tagline items", () => {
    expect(taglineItemsFromPlainText("Line one\n\nLine two")).toEqual([
      createDefaultTaglineItem("Line one"),
      createDefaultTaglineItem("Line two"),
    ]);
  });
});
