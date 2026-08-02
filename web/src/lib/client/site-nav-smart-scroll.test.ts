import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  initSiteNavSmartScroll,
  resetSiteNavSmartScrollForTests,
} from "./site-nav-smart-scroll";

function renderSiteNav() {
  document.body.innerHTML = `
    <header class="site-nav" data-site-nav-smart-scroll>
      <div class="site-nav__surface" style="height: 120px">
        <nav class="site-nav__inner">Nav</nav>
      </div>
    </header>
    <main style="height: 3000px">Content</main>
  `;
}

function dispatchScroll(scrollTop: number, previousScrollTop: number) {
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value: scrollTop,
  });
  Object.defineProperty(document.documentElement, "scrollTop", {
    configurable: true,
    value: scrollTop,
  });

  const delta = scrollTop - previousScrollTop;
  for (let index = 0; index < Math.abs(delta); index += 1) {
    window.dispatchEvent(new Event("scroll"));
  }
}

describe("initSiteNavSmartScroll", () => {
  beforeEach(() => {
    resetSiteNavSmartScrollForTests();
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 0,
    });
    Object.defineProperty(document.documentElement, "scrollTop", {
      configurable: true,
      value: 0,
    });
    renderSiteNav();
    initSiteNavSmartScroll();
  });

  afterEach(() => {
    resetSiteNavSmartScrollForTests();
    document.body.innerHTML = "";
  });

  it("hides the navbar when scrolling down past the header", async () => {
    const navbar = document.querySelector(".site-nav")!;

    dispatchScroll(200, 0);

    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });

    expect(navbar.classList.contains("site-nav--hidden")).toBe(true);
  });

  it("shows the navbar when scrolling up", async () => {
    const navbar = document.querySelector(".site-nav")!;

    dispatchScroll(200, 0);
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });
    expect(navbar.classList.contains("site-nav--hidden")).toBe(true);

    dispatchScroll(180, 200);
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });

    expect(navbar.classList.contains("site-nav--hidden")).toBe(false);
  });

  it("always shows the navbar at the top of the page", async () => {
    const navbar = document.querySelector(".site-nav")!;

    dispatchScroll(200, 0);
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });

    dispatchScroll(0, 200);
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });

    expect(navbar.classList.contains("site-nav--hidden")).toBe(false);
  });

  it("uses the admin preview scroll container when present", async () => {
    document.body.innerHTML = `
      <div class="admin-content-preview" data-admin-content-preview>
        <div class="admin-content-preview__scroll" data-admin-content-preview-scroll style="height: 240px; overflow: auto;">
          <div data-public-site-preview>
            <div class="public-site-preview__nav-anchor">
              <header class="site-nav" data-site-nav-smart-scroll>
                <div class="site-nav__surface" style="height: 120px">
                  <nav class="site-nav__inner">Nav</nav>
                </div>
              </header>
            </div>
            <main style="height: 3000px">Content</main>
          </div>
        </div>
      </div>
    `;

    const previewScrollRoot = document.querySelector<HTMLElement>(
      "[data-admin-content-preview-scroll]",
    )!;
    initSiteNavSmartScroll();

    previewScrollRoot.scrollTop = 200;
    previewScrollRoot.dispatchEvent(new Event("scroll"));

    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });

    expect(
      document.querySelector(".site-nav")!.classList.contains("site-nav--hidden"),
    ).toBe(true);
  });
});
