import { autoCapitalize } from "@/lib/formatters";

export function getOrderStatusBadgeLabel(status: string): string {
  return autoCapitalize(status);
}

export function getOrderStatusOptionLabel(
  currentStatus: string,
  targetStatus: string,
): string {
  if (currentStatus === "closed" && targetStatus === "processing") {
    return "Open";
  }

  return autoCapitalize(targetStatus);
}
