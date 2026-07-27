import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabasePublicClient: vi.fn(),
}));

vi.mock("@/lib/supabase/public", () => ({
  createSupabasePublicClient: mocks.createSupabasePublicClient,
}));

import {
  getFeaturedPublicProducts,
  getSectionEntries,
  getSectionFieldEntries,
  getSectionHeading,
} from "./content";

beforeEach(() => {
  mocks.createSupabasePublicClient.mockReset();
});

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

  it("returns keyed primitive content entries for inline editing", () => {
    expect(
      getSectionFieldEntries({
        content: {
          heading: "Ignored heading",
          email: "hello@example.com",
          nested: { unsafe: "ignored" },
        },
      }),
    ).toEqual([
      {
        key: "email",
        label: "Email",
        value: "hello@example.com",
      },
    ]);
  });
});

describe("public product content loading", () => {
  it("uses the non-auth public Supabase client for component-safe reads", async () => {
    const limit = vi.fn(async () => ({
      data: [
        {
          id: "product-1",
          name: "Chicken Breast",
          description: null,
          image_path: null,
          category: "chicken",
        },
      ],
      error: null,
    }));
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    mocks.createSupabasePublicClient.mockReturnValue({ from });

    const products = await getFeaturedPublicProducts(
      {
        cookies: {},
        request: new Request("https://example.test"),
      } as never,
      1,
    );

    expect(mocks.createSupabasePublicClient).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("product");
    expect(select).toHaveBeenCalledWith("id, name, description, image_path, category");
    expect(limit).toHaveBeenCalledWith(1);
    expect(products).toEqual([
      {
        id: "product-1",
        name: "Chicken Breast",
        description: null,
        image_path: null,
        category: "chicken",
      },
    ]);
  });
});
