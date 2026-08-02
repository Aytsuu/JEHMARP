const HIDDEN_CLASS = "site-nav--hidden";
const SMART_SCROLL_ATTR = "data-site-nav-smart-scroll";
const PREVIEW_SCROLL_ROOT_SELECTOR = "[data-admin-content-preview-scroll]";
const SCROLL_HIDE_OFFSET = 6;
const SCROLL_SHOW_OFFSET = 4;

type SiteNavWindow = Window & {
  __siteNavSmartScrollHidden?: boolean;
};

type ScrollRoot = HTMLElement | Window;

let activeScrollRoot: ScrollRoot | null = null;
let activeOnScroll: (() => void) | null = null;
let activeOnResize: (() => void) | null = null;

function getNavbar() {
  return document.querySelector<HTMLElement>(".site-nav");
}

function getNavbarSurface() {
  return document.querySelector<HTMLElement>(".site-nav__surface");
}

function getNavbarHeight() {
  return getNavbarSurface()?.offsetHeight ?? getNavbar()?.offsetHeight ?? 0;
}

function isSmartScrollEnabled() {
  return Boolean(getNavbar()?.hasAttribute(SMART_SCROLL_ATTR));
}

function resolveScrollRoot(): ScrollRoot {
  const navbar = getNavbar();
  if (!navbar) {
    return window;
  }

  const previewFrame = navbar.closest("[data-admin-content-preview]");
  if (previewFrame) {
    const previewScrollRoot = previewFrame.querySelector<HTMLElement>(
      PREVIEW_SCROLL_ROOT_SELECTOR,
    );
    if (previewScrollRoot) {
      return previewScrollRoot;
    }
  }

  const legacyPreviewScrollRoot = navbar
    .closest("[data-public-site-preview]")
    ?.parentElement;

  if (
    legacyPreviewScrollRoot instanceof HTMLElement
    && legacyPreviewScrollRoot.matches(PREVIEW_SCROLL_ROOT_SELECTOR)
  ) {
    return legacyPreviewScrollRoot;
  }

  return window;
}

function getScrollTop(scrollRoot: ScrollRoot) {
  if (scrollRoot === window) {
    return window.scrollY || document.documentElement.scrollTop || 0;
  }

  return scrollRoot.scrollTop;
}

function teardownSmartScrollListeners() {
  if (activeScrollRoot && activeOnScroll) {
    activeScrollRoot.removeEventListener("scroll", activeOnScroll);
  }

  if (activeOnResize) {
    window.removeEventListener("resize", activeOnResize);
  }

  activeScrollRoot = null;
  activeOnScroll = null;
  activeOnResize = null;
}

function setNavbarHidden(hidden: boolean) {
  const win = window as SiteNavWindow;
  if (win.__siteNavSmartScrollHidden === hidden) {
    return;
  }

  const navbar = getNavbar();
  const surface = getNavbarSurface();
  if (!navbar || !surface) {
    return;
  }

  surface.style.removeProperty("transform");
  navbar.classList.toggle(HIDDEN_CLASS, hidden);
  win.__siteNavSmartScrollHidden = hidden;
}

export function initSiteNavSmartScroll() {
  teardownSmartScrollListeners();

  if (!isSmartScrollEnabled()) {
    return;
  }

  const navbar = getNavbar();
  if (!navbar) {
    return;
  }

  const scrollRoot = resolveScrollRoot();
  const win = window as SiteNavWindow;

  win.__siteNavSmartScrollHidden = navbar.classList.contains(HIDDEN_CLASS);
  getNavbarSurface()?.style.removeProperty("transform");

  if (getScrollTop(scrollRoot) <= 0) {
    setNavbarHidden(false);
  }

  let lastScrollTop = getScrollTop(scrollRoot);
  let navbarHeight = getNavbarHeight();
  let ticking = false;

  const onResize = () => {
    if (!getNavbar()) {
      return;
    }

    navbarHeight = getNavbarHeight();
  };

  const updateNavbar = () => {
    ticking = false;

    if (!isSmartScrollEnabled()) {
      return;
    }

    const scrollTop = getScrollTop(scrollRoot);

    if (scrollTop <= 0) {
      setNavbarHidden(false);
      lastScrollTop = scrollTop;
      return;
    }

    const delta = scrollTop - lastScrollTop;

    if (delta > SCROLL_HIDE_OFFSET && scrollTop > navbarHeight) {
      setNavbarHidden(true);
    } else if (delta < -SCROLL_SHOW_OFFSET) {
      setNavbarHidden(false);
    }

    lastScrollTop = scrollTop;
  };

  const onScroll = () => {
    if (ticking) {
      return;
    }

    ticking = true;
    requestAnimationFrame(updateNavbar);
  };

  scrollRoot.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });

  activeScrollRoot = scrollRoot;
  activeOnScroll = onScroll;
  activeOnResize = onResize;
}

export function resetSiteNavSmartScrollForTests() {
  teardownSmartScrollListeners();
  delete (window as SiteNavWindow).__siteNavSmartScrollHidden;
}
