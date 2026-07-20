import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initSiteNavMobileMenu } from "./site-nav-mobile-menu";

function renderSiteNav() {
  document.body.innerHTML = `
    <button type="button" data-site-nav-toggle aria-expanded="false">Menu</button>
    <div id="site-nav-mobile-menu" class="site-nav__mobile-menu" hidden aria-hidden="true">
      <div data-site-nav-backdrop class="site-nav__mobile-menu-backdrop"></div>
      <a href="/shop" class="site-nav__mobile-link">Shop</a>
    </div>
  `;
}

describe("initSiteNavMobileMenu", () => {
  beforeEach(() => {
    delete (window as Window & { __siteNavMobileMenuInitialized?: boolean })
      .__siteNavMobileMenuInitialized;
    renderSiteNav();
    initSiteNavMobileMenu();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    document.body.classList.remove("site-nav-menu-open");
  });

  it("opens and closes the menu when the toggle is clicked", () => {
    const toggle = document.querySelector<HTMLButtonElement>(
      "[data-site-nav-toggle]",
    )!;
    const menu = document.getElementById("site-nav-mobile-menu")!;

    toggle.click();
    expect(menu.classList.contains("site-nav__mobile-menu--open")).toBe(true);
    expect(menu.hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    toggle.click();
    expect(menu.classList.contains("site-nav__mobile-menu--open")).toBe(false);
    expect(menu.hidden).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes the menu when the backdrop is clicked", () => {
    const toggle = document.querySelector<HTMLButtonElement>(
      "[data-site-nav-toggle]",
    )!;
    const backdrop = document.querySelector<HTMLElement>(
      "[data-site-nav-backdrop]",
    )!;
    const menu = document.getElementById("site-nav-mobile-menu")!;

    toggle.click();
    backdrop.click();

    expect(menu.classList.contains("site-nav__mobile-menu--open")).toBe(false);
    expect(menu.hidden).toBe(true);
  });
});
