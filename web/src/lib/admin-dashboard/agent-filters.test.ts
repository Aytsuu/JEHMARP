import { describe, expect, it } from "vitest";

import { parseAdminAgentFilters, serializeAdminAgentFilters } from "./agent-filters";

describe("parseAdminAgentFilters", () => {
  it("parses supported search and status filters", () => {
    expect(
      parseAdminAgentFilters(
        new URL("https://example.test/admin/agents?search= maria   dela cruz &status=active"),
      ),
    ).toEqual({
      search: "maria dela cruz",
      status: "active",
    });
  });
});

describe("serializeAdminAgentFilters", () => {
  it("serializes filters in a stable query order", () => {
    expect(
      serializeAdminAgentFilters({
        search: "Ana",
        status: "inactive",
      }),
    ).toBe("search=Ana&status=inactive");
  });
});
