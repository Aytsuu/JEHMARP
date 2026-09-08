import { formatSidebarUnreadCount } from "@/lib/dashboard/sidebar-navigation";

export function initDashboardSidebarUnreadBadges() {
  const badges = document.querySelectorAll<HTMLElement>("[data-sidebar-unread-badge]");

  badges.forEach((badge) => {
    const storageKey = badge.dataset.storageKey;
    const rawIds = badge.dataset.unreadIds;
    if (!storageKey || !rawIds) return;

    let notificationIds: string[];
    let readIds: string[];

    try {
      const parsedIds = JSON.parse(rawIds);
      notificationIds = Array.isArray(parsedIds)
        ? parsedIds.filter((value): value is string => typeof value === "string")
        : [];
    } catch {
      notificationIds = [];
    }

    try {
      const parsedReadIds = JSON.parse(localStorage.getItem(storageKey) || "[]");
      readIds = Array.isArray(parsedReadIds)
        ? parsedReadIds.filter((value): value is string => typeof value === "string")
        : [];
    } catch {
      readIds = [];
    }

    const unreadCount = notificationIds.filter((id) => !readIds.includes(id)).length;
    badge.dataset.unreadCount = String(unreadCount);
    badge.textContent = formatSidebarUnreadCount(unreadCount);
    badge.hidden = unreadCount < 1;
  });

  (window as Window & { updateSidebarUnreadBadges?: () => void }).updateSidebarUnreadBadges =
    initDashboardSidebarUnreadBadges;
}
