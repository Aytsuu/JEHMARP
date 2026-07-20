let activeMenu: HTMLElement | null = null;

const initializedDocuments = new WeakSet<Document>();

function closeMenu(menu: HTMLElement | null) {
  if (!menu) return;

  const trigger = menu.querySelector<HTMLElement>("[data-table-action-menu-trigger]");
  const content = menu.querySelector<HTMLElement>("[data-table-action-menu-content]");

  if (content) {
    content.hidden = true;
    content.style.left = "";
    content.style.top = "";
  }

  trigger?.setAttribute("aria-expanded", "false");

  if (activeMenu === menu) {
    activeMenu = null;
  }
}

function positionMenu(menu: HTMLElement) {
  const trigger = menu.querySelector<HTMLElement>("[data-table-action-menu-trigger]");
  const content = menu.querySelector<HTMLElement>("[data-table-action-menu-content]");
  if (!trigger || !content) return;

  const triggerRect = trigger.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const gutter = 12;

  content.hidden = false;

  const applyPosition = () => {
    const contentRect = content.getBoundingClientRect();
    if (contentRect.width === 0 && contentRect.height === 0) {
      window.requestAnimationFrame(applyPosition);
      return;
    }

    let left = triggerRect.right - contentRect.width;
    let top = triggerRect.bottom + 8;

    if (left < gutter) left = gutter;
    if (left + contentRect.width > viewportWidth - gutter) {
      left = viewportWidth - contentRect.width - gutter;
    }

    if (top + contentRect.height > viewportHeight - gutter) {
      top = triggerRect.top - contentRect.height - 8;
    }

    if (top < gutter) top = gutter;

    content.style.left = `${left}px`;
    content.style.top = `${top}px`;
  };

  applyPosition();
}

function openMenu(menu: HTMLElement) {
  if (activeMenu && activeMenu !== menu) {
    closeMenu(activeMenu);
  }

  const trigger = menu.querySelector<HTMLElement>("[data-table-action-menu-trigger]");
  trigger?.setAttribute("aria-expanded", "true");
  positionMenu(menu);
  activeMenu = menu;
}

function toggleMenu(menu: HTMLElement) {
  const trigger = menu.querySelector<HTMLElement>("[data-table-action-menu-trigger]");
  if (trigger?.hasAttribute("disabled")) return;

  const content = menu.querySelector<HTMLElement>("[data-table-action-menu-content]");
  if (!content || content.hidden) {
    openMenu(menu);
    return;
  }

  closeMenu(menu);
}

function handleDocumentClick(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const trigger = target.closest<HTMLElement>("[data-table-action-menu-trigger]");
  if (trigger) {
    event.preventDefault();
    event.stopPropagation();

    const menu = trigger.closest<HTMLElement>("[data-table-action-menu]");
    if (menu) {
      toggleMenu(menu);
    }
    return;
  }

  const menuAction = target.closest<HTMLElement>(".table-action-menu__item");
  if (menuAction) {
    closeMenu(menuAction.closest<HTMLElement>("[data-table-action-menu]"));
    return;
  }

  if (activeMenu && !target.closest("[data-table-action-menu-content]")) {
    closeMenu(activeMenu);
  }
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && activeMenu) {
    closeMenu(activeMenu);
  }
}

function handleWindowResize() {
  if (activeMenu) {
    positionMenu(activeMenu);
  }
}

function handleDocumentScroll() {
  if (activeMenu) {
    closeMenu(activeMenu);
  }
}

export function initTableActionMenus(root: Document = document) {
  if (!root.body || initializedDocuments.has(root)) return;
  initializedDocuments.add(root);

  root.addEventListener("click", handleDocumentClick);
  root.addEventListener("keydown", handleDocumentKeydown);
  window.addEventListener("resize", handleWindowResize);
  root.addEventListener("scroll", handleDocumentScroll, true);

  root.addEventListener("astro:after-swap", () => {
    closeMenu(activeMenu);
  });
}

export function closeActiveTableActionMenu() {
  closeMenu(activeMenu);
}
