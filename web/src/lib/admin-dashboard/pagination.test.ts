import { describe, expect, it } from "vitest";

import {
  adminPaginationRange,
  buildAdminPagination,
  dashboardTableRowNumber,
  formatRecordCount,
  mergeAdminPaginationQuery,
  parseAdminPagination,
  serializeAdminPagination,
} from "./pagination";

describe("formatRecordCount", () => {
  it("uses singular record for one row", () => {
    expect(formatRecordCount(1)).toBe("1 record");
  });

  it("uses plural records for zero or multiple rows", () => {
    expect(formatRecordCount(0)).toBe("0 records");
    expect(formatRecordCount(2)).toBe("2 records");
  });
});

describe("parseAdminPagination", () => {
  it("parses supported page and page size values", () => {
    expect(parseAdminPagination(new URL("https://example.test/admin/products?page=3&pageSize=50"))).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it("falls back to defaults for invalid values", () => {
    expect(parseAdminPagination(new URL("https://example.test/admin/products?page=0&pageSize=25"))).toEqual({
      page: 1,
      pageSize: 10,
    });
  });
});

describe("serializeAdminPagination", () => {
  it("omits default pagination values from URLs", () => {
    expect(serializeAdminPagination({ page: 1, pageSize: 10 })).toBe("");
  });

  it("serializes non-default pagination values", () => {
    expect(serializeAdminPagination({ page: 2, pageSize: 50 })).toBe("page=2&pageSize=50");
  });
});

describe("mergeAdminPaginationQuery", () => {
  it("merges pagination into an existing filter query", () => {
    expect(mergeAdminPaginationQuery("search=belly&category=pork", {
      page: 2,
      pageSize: 50,
    })).toBe("search=belly&category=pork&page=2&pageSize=50");
  });

  it("removes default pagination values from a query", () => {
    expect(mergeAdminPaginationQuery("search=belly&page=4&pageSize=100", {
      page: 1,
      pageSize: 10,
    })).toBe("search=belly");
  });
});

describe("adminPaginationRange", () => {
  it("calculates the Supabase range for the requested page", () => {
    expect(adminPaginationRange({ page: 3, pageSize: 50 })).toEqual({
      from: 100,
      to: 149,
    });
  });
});

describe("buildAdminPagination", () => {
  it("builds display metadata for a populated page", () => {
    expect(buildAdminPagination(125, { page: 3, pageSize: 50 })).toEqual({
      page: 3,
      pageSize: 50,
      totalRows: 125,
      totalPages: 3,
      fromRow: 101,
      toRow: 125,
    });
  });

  it("clamps the current page when the requested page is beyond the total", () => {
    expect(buildAdminPagination(12, { page: 9, pageSize: 10 })).toEqual({
      page: 2,
      pageSize: 10,
      totalRows: 12,
      totalPages: 2,
      fromRow: 11,
      toRow: 12,
    });
  });

  it("keeps an empty result on page one", () => {
    expect(buildAdminPagination(0, { page: 4, pageSize: 10 })).toEqual({
      page: 1,
      pageSize: 10,
      totalRows: 0,
      totalPages: 1,
      fromRow: 0,
      toRow: 0,
    });
  });
});

describe("dashboardTableRowNumber", () => {
  it("uses pagination offset when available", () => {
    expect(dashboardTableRowNumber({ fromRow: 11 }, 0)).toBe(11);
    expect(dashboardTableRowNumber({ fromRow: 11 }, 4)).toBe(15);
  });

  it("falls back to one-based index when pagination is missing", () => {
    expect(dashboardTableRowNumber(null, 0)).toBe(1);
    expect(dashboardTableRowNumber(undefined, 2)).toBe(3);
  });
});
