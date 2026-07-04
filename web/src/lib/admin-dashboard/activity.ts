import type { AdminDashboardData } from "./data";

export type AdminActivityItem = {
  id: string;
  category: "order" | "customer" | "product" | "invoice" | "content" | "reseller";
  title: string;
  detail: string;
  occurredAt: string;
};

export function buildAdminActivityItems(
  data: AdminDashboardData,
  limit = 50,
): AdminActivityItem[] {
  const items = [
    ...buildOrderActivity(data),
    ...buildCustomerActivity(data),
    ...buildProductActivity(data),
    ...buildInvoiceActivity(data),
    ...buildContentActivity(data),
    ...buildResellerApplicationActivity(data),
  ];

  return items
    .sort((left, right) => timestamp(right.occurredAt) - timestamp(left.occurredAt))
    .slice(0, limit);
}

function buildOrderActivity(data: AdminDashboardData): AdminActivityItem[] {
  return data.orders.flatMap((order) => {
    const orderLabel = `Order ${order.id.slice(0, 8)}`;
    const customerName = order.customer
      ? `${order.customer.first_name} ${order.customer.last_name}`
      : "Unknown customer";
    const created: AdminActivityItem = {
      id: `order-created:${order.id}`,
      category: "order",
      title: "Created order",
      detail: `${orderLabel} for ${customerName}`,
      occurredAt: order.created_at,
    };
    const updated = hasChanged(order.created_at, order.updated_at)
      ? [{
          id: `order-updated:${order.id}`,
          category: "order" as const,
          title: "Updated order",
          detail: `${orderLabel} is ${order.order_status} with payment ${order.payment_status}`,
          occurredAt: order.updated_at,
        }]
      : [];
    const statusHistory = order.customer_order_status_history.map((history) => ({
      id: `order-status:${history.id}`,
      category: "order" as const,
      title: "Updated order status",
      detail: `${orderLabel} moved from ${history.from_status ?? "new"} to ${history.to_status}`,
      occurredAt: history.changed_at,
    }));

    return [created, ...updated, ...statusHistory];
  });
}

function buildCustomerActivity(data: AdminDashboardData): AdminActivityItem[] {
  return data.customers.map((customer) => ({
    id: `customer-created:${customer.id}`,
    category: "customer",
    title: "Added new customer",
    detail: `${customer.first_name} ${customer.last_name}${customer.is_reseller ? " - reseller" : ""}`,
    occurredAt: customer.created_at,
  }));
}

function buildProductActivity(data: AdminDashboardData): AdminActivityItem[] {
  return data.products.flatMap((product) => {
    const created: AdminActivityItem = {
      id: `product-created:${product.id}`,
      category: "product",
      title: "Added product",
      detail: `${product.name} - ${product.category}`,
      occurredAt: product.created_at,
    };
    const updated = hasChanged(product.created_at, product.updated_at)
      ? [{
          id: `product-updated:${product.id}`,
          category: "product" as const,
          title: "Updated product",
          detail: `${product.name} is ${product.is_active ? "active" : "inactive"} and ${product.stock_status}`,
          occurredAt: product.updated_at,
        }]
      : [];

    return [created, ...updated];
  });
}

function buildInvoiceActivity(data: AdminDashboardData): AdminActivityItem[] {
  return data.orders.flatMap((order) =>
    order.invoice.flatMap((invoice) => {
      const created: AdminActivityItem = {
        id: `invoice-created:${invoice.id}`,
        category: "invoice",
        title: "Created invoice",
        detail: `${invoice.invoice_number} for order ${order.id.slice(0, 8)}`,
        occurredAt: invoice.created_at,
      };
      const updated = hasChanged(invoice.created_at, invoice.updated_at)
        ? [{
            id: `invoice-updated:${invoice.id}`,
            category: "invoice" as const,
            title: "Updated invoice",
            detail: `${invoice.invoice_number} is ${invoice.status}`,
            occurredAt: invoice.updated_at,
          }]
        : [];

      return [created, ...updated];
    }),
  );
}

function buildContentActivity(data: AdminDashboardData): AdminActivityItem[] {
  const pageItems = data.pages.flatMap((page) => {
    const created: AdminActivityItem = {
      id: `page-created:${page.id}`,
      category: "content",
      title: "Created content page",
      detail: `${page.title} (${page.status})`,
      occurredAt: page.created_at,
    };
    const updated = hasChanged(page.created_at, page.updated_at)
      ? [{
          id: `page-updated:${page.id}`,
          category: "content" as const,
          title: "Updated content page",
          detail: `${page.title} (${page.status})`,
          occurredAt: page.updated_at,
        }]
      : [];

    return [created, ...updated];
  });
  const sectionItems = data.pageSections.flatMap((section) => {
    const created: AdminActivityItem = {
      id: `page-section-created:${section.id}`,
      category: "content",
      title: "Created content section",
      detail: `${section.type} section (${section.status})`,
      occurredAt: section.created_at,
    };
    const updated = hasChanged(section.created_at, section.updated_at)
      ? [{
          id: `page-section-updated:${section.id}`,
          category: "content" as const,
          title: "Updated content section",
          detail: `${section.type} section (${section.status})`,
          occurredAt: section.updated_at,
        }]
      : [];

    return [created, ...updated];
  });

  return [...pageItems, ...sectionItems];
}

function buildResellerApplicationActivity(data: AdminDashboardData): AdminActivityItem[] {
  return data.resellerApplications.map((application) => ({
    id: `reseller-application-created:${application.id}`,
    category: "reseller",
    title: "New reseller application",
    detail: `${application.name} - ${application.planned_transaction_type}, price list ${application.email_delivery_status}`,
    occurredAt: application.created_at,
  }));
}

function hasChanged(createdAt: string, updatedAt: string): boolean {
  return timestamp(updatedAt) > timestamp(createdAt);
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : 0;
}
