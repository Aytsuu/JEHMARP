export function getClientIp(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  return headers.get("cf-connecting-ip") ?? forwardedFor ?? headers.get("x-real-ip") ?? null;
}
