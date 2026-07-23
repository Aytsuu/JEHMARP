export type NavigationItem = {
  label: string;
  href: string;
};

export const primaryNavigation = [
  { label: "Home", href: "/" },
  { label: "Our Story", href: "/our-story" },
  { label: "Shop", href: "/shop" },
  { label: "Track Orders", href: "/track" },
  { label: "Business", href: "/business" },
  { label: "Contact", href: "/contact" },
  { label: "Login", href: "/login" },
] as const satisfies readonly NavigationItem[];

export const publicRoutes = primaryNavigation.slice(0, -1);

export const authRoutes = primaryNavigation.slice(-1);

export const adminDashboardRoutes = [
  { label: "Dashboard", href: "/admin" },
  { label: "Products", href: "/admin/products" },
  { label: "Customers", href: "/admin/customers" },
  { label: "Agents", href: "/admin/agents" },
  { label: "Orders", href: "/admin/orders" },
  { label: "Sales", href: "/admin/sales" },
  { label: "Invoices", href: "/admin/invoices" },
  { label: "Inquiries", href: "/admin/inquiries" },
  { label: "Reseller Applications", href: "/admin/reseller-applications" },
  { label: "Activity", href: "/admin/activity" },
  { label: "Notifications", href: "/admin/notifications" },
  { label: "Content", href: "/admin/content" },
] as const satisfies readonly NavigationItem[];

export const agentDashboardRoutes = [
  { label: "Dashboard", href: "/agent" },
  { label: "Customers", href: "/agent/customers" },
  { label: "My Orders", href: "/agent/orders" },
  { label: "Notifications", href: "/agent/notifications" },
  { label: "Profile", href: "/agent/profile" },
] as const satisfies readonly NavigationItem[];
