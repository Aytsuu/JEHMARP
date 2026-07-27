import type { BusinessProfileSettings } from "./types";
import { DEFAULT_BRAND_LINES } from "./defaults";

export function getBrandLines(profile?: Partial<BusinessProfileSettings> | null): string[] {
  if (!profile) return [...DEFAULT_BRAND_LINES];
  const tradeName = profile.tradeName?.trim() || DEFAULT_BRAND_LINES[0];
  const address = profile.address?.trim() || DEFAULT_BRAND_LINES[1];
  const phone = profile.phone?.trim() ?? "";
  const phoneLine = !phone
    ? DEFAULT_BRAND_LINES[2]
    : phone.toLowerCase().includes("cell")
      ? phone
      : `Cell #: ${phone}`;
  return [tradeName, address, phoneLine];
}
