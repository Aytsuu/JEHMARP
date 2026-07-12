/// <reference types="astro/client" />

interface Window {
  readDashboardFragmentResponse?: (response: Response) => Promise<string>;
  updateSidebarUnreadBadges?: () => void;
}
