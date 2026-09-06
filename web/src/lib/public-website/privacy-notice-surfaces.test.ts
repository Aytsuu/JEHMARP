import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { PRIVACY_NOTICE_PATH } from "@/lib/platform-settings/privacy-notice";

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath: string) {
  return readFileSync(resolve(srcRoot, relativePath), "utf8");
}

const collectionForms = [
  "components/public-website/PublicShopPageContent.astro",
  "components/public-website/PublicContactPageContent.astro",
  "components/public-website/PublicBusinessPageContent.astro",
  "pages/login.astro",
  "pages/customer-registration/[token].astro",
] as const;

describe("public privacy notice surfaces", () => {
  it("uses /privacy as the sole canonical public privacy route", () => {
    const privacyPage = readSrc("pages/privacy.astro");
    const footer = readSrc("components/SiteFooter.astro");

    expect(privacyPage).toContain('export const prerender = false');
    expect(privacyPage).toContain("isPrivacyNoticePublishable");
    expect(privacyPage).toContain('status: 404');
    expect(footer).toContain("resolvePrivacyNoticeHref");
    expect(footer).toContain('href={linkHref(privacyNoticeHref)}');
    expect(footer).not.toMatch(/href=["']\/data-privacy["']/);
    expect(readSrc("config/navigation.ts")).not.toContain("/privacy");
  });

  it("does not expose a placeholder privacy footer link", () => {
    const footer = readSrc("components/SiteFooter.astro");

    expect(footer).not.toMatch(/Privacy[^<]*href=["']#["']/);
    expect(footer).toContain("Privacy &amp; Data Privacy Notice");
  });

  it("links every personal-data collection form to the notice before submission", () => {
    const noticeComponent = readSrc("components/public-website/PrivacyCollectionNotice.astro");
    expect(noticeComponent).toContain("PRIVACY_NOTICE_PATH");

    for (const relativePath of collectionForms) {
      const source = readSrc(relativePath);
      const submitIndex = source.indexOf('type="submit"');
      const noticeIndex = source.indexOf("PrivacyCollectionNotice");

      expect(noticeIndex, `${relativePath} must render PrivacyCollectionNotice`).toBeGreaterThan(-1);
      expect(
        noticeIndex < submitIndex || submitIndex === -1,
        `${relativePath} must place the notice before the submit control`,
      ).toBe(true);
      expect(
        source.includes("privacyHref") || source.includes("getPrivacyCollectionContext"),
        `${relativePath} must resolve the privacy notice href from platform settings`,
      ).toBe(true);
    }
  });

  it("uses privacy acknowledgement without bundled marketing consent", () => {
    const noticeComponent = readSrc("components/public-website/PrivacyCollectionNotice.astro");

    expect(noticeComponent).toContain("PRIVACY_NOTICE_ACK_FIELD");
    expect(noticeComponent).toContain(PRIVACY_NOTICE_PATH);
    expect(noticeComponent).not.toMatch(/marketing/i);

    for (const relativePath of collectionForms) {
      const source = readSrc(relativePath);
      expect(source).not.toMatch(/marketing\s+consent/i);
      expect(source).not.toMatch(/newsletter/i);
    }
  });
});
