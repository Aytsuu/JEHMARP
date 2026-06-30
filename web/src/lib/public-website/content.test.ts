import { describe, expect, it } from "vitest";

import { getSectionEntries, getSectionHeading } from "./content";

describe("public content helpers", () => {
  it("uses explicit section heading content when present", () => {
    expect(
      getSectionHeading({
        type: "intro",
        content: {
          heading: "Fresh products",
        },
      }),
    ).toBe("Fresh products");
  });

  it("falls back to a readable section type heading", () => {
    expect(
      getSectionHeading({
        type: "farm_story",
        content: {},
      }),
    ).toBe("Farm Story");
  });

  it("returns displayable primitive content entries only", () => {
    expect(
      getSectionEntries({
        content: {
          heading: "Ignored heading",
          summary: "Local farm supply",
          sortOrder: 2,
          hidden: null,
          nested: { unsafe: "ignored" },
        },
      }),
    ).toEqual([
      ["Summary", "Local farm supply"],
      ["Sort Order", "2"],
    ]);
  });
});
