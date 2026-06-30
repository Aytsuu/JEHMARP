export type NavigationItem = {
  label: string;
  href: string;
};

export const primaryNavigation = [
  { label: "Home", href: "/" },
  { label: "Our Story", href: "/our-story" },
  { label: "Shop", href: "/shop" },
  { label: "Business", href: "/business" },
  { label: "Contact", href: "/contact" },
  { label: "Admin Login", href: "/admin/login" },
  { label: "Agent Login", href: "/agent/login" },
] as const satisfies readonly NavigationItem[];

export const publicRoutes = primaryNavigation.slice(0, 5);

export const authRoutes = primaryNavigation.slice(5);
