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
  { label: "Login", href: "/login" },
] as const satisfies readonly NavigationItem[];

export const publicRoutes = primaryNavigation.slice(0, 5);

export const authRoutes = primaryNavigation.slice(5);

export const adminDashboardRoutes = [
  { label: "Dashboard", href: "/admin" },
  { label: "Products", href: "/admin/products" },
  { label: "Customers", href: "/admin/customers" },
  { label: "Agents", href: "/admin/agents" },
  { label: "Orders", href: "/admin/orders" },
  { label: "Invoices", href: "/admin/invoices" },
  { label: "Inquiries", href: "/admin/inquiries" },
  { label: "Content", href: "/admin/content" },
] as const satisfies readonly NavigationItem[];

export const agentDashboardRoutes = [
  { label: "Dashboard", href: "/agent#agent-dashboard-title" },
  { label: "Earnings", href: "/agent#agent-earnings" },
  { label: "Customers", href: "/agent#agent-customers" },
  { label: "Orders", href: "/agent#agent-orders" },
  { label: "Payments", href: "/agent#agent-payments" },
  { label: "Timeline", href: "/agent#agent-timeline" },
] as const satisfies readonly NavigationItem[];
