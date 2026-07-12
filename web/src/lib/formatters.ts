import { z } from "zod";

export function autoCapitalize(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function formatOrderSource(source: string | null | undefined): string {
  if (!source) return "N/A";
  const mapping: Record<string, string> = {
    guest_shop: "Shop",
    agent_submitted: "Agent",
    admin_manual: "Manual",
  };
  return mapping[source] || autoCapitalize(source);
}

export const emailAddressSchema = z.email("Enter a valid email address.");

export const contactNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{11}$/, "Contact number must be exactly 11 digits.");

export function parseEmailAddress(value: string) {
  return emailAddressSchema.parse(value.trim().toLowerCase());
}

export function parseContactNumber(value: string) {
  return contactNumberSchema.parse(value);
}
