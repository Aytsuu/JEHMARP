const CSS_VAR = "--public-site-header-height";

export function syncPublicSiteHeaderHeight() {
  const nav = document.querySelector<HTMLElement>(".site-nav");
  if (!nav) {
    return;
  }

  document.documentElement.style.setProperty(CSS_VAR, `${nav.offsetHeight}px`);
}

export function initPublicSiteHeaderHeight() {
  syncPublicSiteHeaderHeight();
  window.addEventListener("resize", syncPublicSiteHeaderHeight);
}
