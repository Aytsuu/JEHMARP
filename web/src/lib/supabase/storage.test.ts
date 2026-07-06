import { describe, expect, it, vi } from "vitest";

import { PRODUCT_IMAGE_BUCKET, isManagedStoragePath, resolvePublicStorageUrl } from "./storage";

vi.stubEnv("PUBLIC_SUPABASE_URL", "https://project.supabase.co");
vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");

describe("resolvePublicStorageUrl", () => {
  it("builds a public storage url for managed object paths", () => {
    expect(resolvePublicStorageUrl("products/pork belly.png")).toBe(
      `https://project.supabase.co/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/products/pork%20belly.png`,
    );
  });

  it("preserves absolute and app-local paths", () => {
    expect(resolvePublicStorageUrl("https://cdn.example.test/pork.png")).toBe(
      "https://cdn.example.test/pork.png",
    );
    expect(resolvePublicStorageUrl("/images/pork.png")).toBe("/images/pork.png");
  });
});

describe("isManagedStoragePath", () => {
  it("detects Supabase-managed object paths only", () => {
    expect(isManagedStoragePath("products/pork.png")).toBe(true);
    expect(isManagedStoragePath("/images/pork.png")).toBe(false);
    expect(isManagedStoragePath("https://cdn.example.test/pork.png")).toBe(false);
  });
});
