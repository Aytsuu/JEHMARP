import { describe, expect, it } from "vitest";

import { formatSidebarUnreadCount } from "./sidebar-navigation";

describe("formatSidebarUnreadCount", () => {
  it("returns the exact count up to 99", () => {
    expect(formatSidebarUnreadCount(1)).toBe("1");
    expect(formatSidebarUnreadCount(99)).toBe("99");
  });

  it("caps the display at 99+", () => {
    expect(formatSidebarUnreadCount(100)).toBe("99+");
    expect(formatSidebarUnreadCount(250)).toBe("99+");
  });

  it("returns 0 for non-positive counts", () => {
    expect(formatSidebarUnreadCount(0)).toBe("0");
    expect(formatSidebarUnreadCount(-3)).toBe("0");
  });
});
