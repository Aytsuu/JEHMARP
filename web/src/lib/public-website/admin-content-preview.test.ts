import { describe, expect, it } from "vitest";

import {
  ADMIN_CONTENT_PREVIEW_ROOT,
  isAdminContentPreviewPath,
  toAdminContentPreviewHref,
  toPublicPathFromAdminPreview,
} from "./admin-content-preview";

describe("admin-content-preview", () => {
  it("maps public routes to admin preview routes", () => {
    expect(toAdminContentPreviewHref("/")).toBe(ADMIN_CONTENT_PREVIEW_ROOT);
    expect(toAdminContentPreviewHref("/shop")).toBe(
      `${ADMIN_CONTENT_PREVIEW_ROOT}/shop`,
    );
    expect(toAdminContentPreviewHref("/track")).toBe(
      `${ADMIN_CONTENT_PREVIEW_ROOT}/track`,
    );
    expect(toAdminContentPreviewHref("/login")).toBe("/admin/login");
  });

  it("maps admin preview paths back to public paths", () => {
    expect(toPublicPathFromAdminPreview(ADMIN_CONTENT_PREVIEW_ROOT)).toBe("/");
    expect(toPublicPathFromAdminPreview(`${ADMIN_CONTENT_PREVIEW_ROOT}/contact`)).toBe(
      "/contact",
    );
  });

  it("detects valid admin preview paths", () => {
    expect(isAdminContentPreviewPath(ADMIN_CONTENT_PREVIEW_ROOT)).toBe(true);
    expect(isAdminContentPreviewPath(`${ADMIN_CONTENT_PREVIEW_ROOT}/shop`)).toBe(
      true,
    );
    expect(isAdminContentPreviewPath(`${ADMIN_CONTENT_PREVIEW_ROOT}/track`)).toBe(
      true,
    );
    expect(isAdminContentPreviewPath("/admin/settings")).toBe(false);
    expect(isAdminContentPreviewPath("/shop")).toBe(false);
  });
});
