const initializedFlag = "orderDetailNavInitialized";

export function initOrderDetailNav(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-order-detail-nav]").forEach((nav) => {
    if (nav.dataset[initializedFlag] === "true") return;
    nav.dataset[initializedFlag] = "true";

    const trigger = nav.querySelector<HTMLButtonElement>("[data-order-detail-nav-trigger]");
    const menu = nav.querySelector<HTMLElement>("[data-order-detail-nav-menu]");
    if (!trigger || !menu) return;

    function setOpen(isOpen: boolean) {
      menu.hidden = !isOpen;
      trigger.setAttribute("aria-expanded", String(isOpen));
      nav.dataset.open = String(isOpen);
    }

    trigger.addEventListener("click", () => {
      setOpen(menu.hidden);
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Node) || nav.contains(target)) return;
      setOpen(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    });

    setOpen(false);
  });
}

document.addEventListener("DOMContentLoaded", () => initOrderDetailNav());
document.addEventListener("astro:after-swap", () => initOrderDetailNav());
if (document.readyState === "complete" || document.readyState === "interactive") {
  initOrderDetailNav();
}
