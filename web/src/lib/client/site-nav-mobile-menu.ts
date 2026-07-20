const MENU_OPEN_CLASS = "site-nav__mobile-menu--open";
const BODY_OPEN_CLASS = "site-nav-menu-open";

type SiteNavWindow = Window & {
  __siteNavMobileMenuInitialized?: boolean;
};

function getMenu() {
  return document.getElementById("site-nav-mobile-menu");
}

function getToggle() {
  return document.querySelector<HTMLButtonElement>("[data-site-nav-toggle]");
}

function portalMenuToBody() {
  const menu = getMenu();
  if (!menu || menu.parentElement === document.body) return;
  document.body.appendChild(menu);
}

function setMenuOpen(open: boolean) {
  const menu = getMenu();
  const toggle = getToggle();
  if (!menu || !toggle) return;

  if (open) {
    portalMenuToBody();
  }

  menu.classList.toggle(MENU_OPEN_CLASS, open);
  menu.hidden = !open;
  menu.setAttribute("aria-hidden", open ? "false" : "true");
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  toggle.setAttribute(
    "aria-label",
    open ? "Close navigation menu" : "Open navigation menu",
  );
  document.body.classList.toggle(BODY_OPEN_CLASS, open);
}

function closeMenu() {
  setMenuOpen(false);
}

function toggleMenu() {
  const menu = getMenu();
  if (!menu) return;
  setMenuOpen(!menu.classList.contains(MENU_OPEN_CLASS));
}

export function initSiteNavMobileMenu() {
  const win = window as SiteNavWindow;
  portalMenuToBody();

  if (win.__siteNavMobileMenuInitialized) return;
  win.__siteNavMobileMenuInitialized = true;

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest("[data-site-nav-toggle]")) {
      event.preventDefault();
      toggleMenu();
      return;
    }

    if (target.closest("[data-site-nav-backdrop]")) {
      closeMenu();
      return;
    }

    if (target.closest(".site-nav__mobile-link")) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const menu = getMenu();
    if (!menu?.classList.contains(MENU_OPEN_CLASS)) return;
    closeMenu();
    getToggle()?.focus();
  });
}
