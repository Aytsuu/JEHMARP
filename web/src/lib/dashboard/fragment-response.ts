import type { AstroGlobal } from "astro";

export function setDashboardFragmentResponseHeaders(
  astro: Pick<AstroGlobal, "response">,
) {
  astro.response.headers.set("Cache-Control", "no-store");
}
