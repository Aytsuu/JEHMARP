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
