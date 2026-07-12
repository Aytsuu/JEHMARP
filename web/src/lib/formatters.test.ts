import { describe, expect, it } from "vitest";
import {
  autoCapitalize,
  formatOrderSource,
  parseContactNumber,
  parseEmailAddress,
} from "./formatters";

describe("autoCapitalize", () => {
  it("should capitalize a single word", () => {
    expect(autoCapitalize("submitted")).toBe("Submitted");
  });

  it("should capitalize multiple words separated by spaces, dashes, or underscores", () => {
    expect(autoCapitalize("out_of_stock")).toBe("Out Of Stock");
    expect(autoCapitalize("agent-submitted")).toBe("Agent Submitted");
  });

  it("should return an empty string for null, undefined, or empty values", () => {
    expect(autoCapitalize(null)).toBe("");
    expect(autoCapitalize(undefined)).toBe("");
    expect(autoCapitalize("")).toBe("");
  });
});

describe("formatOrderSource", () => {
  it("should map guest_shop to Shop", () => {
    expect(formatOrderSource("guest_shop")).toBe("Shop");
  });

  it("should map agent_submitted to Agent", () => {
    expect(formatOrderSource("agent_submitted")).toBe("Agent");
  });

  it("should map admin_manual to Manual", () => {
    expect(formatOrderSource("admin_manual")).toBe("Manual");
  });

  it("should fall back to autoCapitalize for unmapped values", () => {
    expect(formatOrderSource("custom_source")).toBe("Custom Source");
  });

  it("should return N/A for null/undefined", () => {
    expect(formatOrderSource(null)).toBe("N/A");
  });
});

describe("parseEmailAddress", () => {
  it("normalizes and validates email addresses", () => {
    expect(parseEmailAddress(" Agent@Example.Test ")).toBe("agent@example.test");
  });

  it("rejects invalid email addresses", () => {
    expect(() => parseEmailAddress("not-an-email")).toThrow("Enter a valid email address.");
  });
});

describe("parseContactNumber", () => {
  it("accepts digit-only contact numbers", () => {
    expect(parseContactNumber(" 09171234567 ")).toBe("09171234567");
  });

  it("rejects contact numbers that are not exactly 11 digits", () => {
    expect(() => parseContactNumber("0917123456")).toThrow(
      "Contact number must be exactly 11 digits.",
    );
    expect(() => parseContactNumber("091712345678")).toThrow(
      "Contact number must be exactly 11 digits.",
    );
  });

  it("rejects contact numbers with non-digit characters", () => {
    expect(() => parseContactNumber("0917-123-4567")).toThrow(
      "Contact number must be exactly 11 digits.",
    );
  });
});
