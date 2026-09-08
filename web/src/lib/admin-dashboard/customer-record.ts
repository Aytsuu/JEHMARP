import type { AdminOrder } from "@/lib/admin-dashboard/data";
import type { AdminPaginationPageSize } from "@/lib/admin-dashboard/pagination";
import { buildAdminPagination } from "@/lib/admin-dashboard/pagination";
import type { AdminOrderFilters } from "@/lib/admin-dashboard/order-filters";
import { formatOrderSource } from "@/lib/formatters";
import { formatOrderCode } from "@/lib/order-detail-nav";
import { sortOrderPaymentsDescending } from "@/lib/order-payments";
import {
  orderBalance,
  orderPaymentTotal,
  orderReceivableTotal,
  orderTotal,
  formatCurrency,
} from "@/lib/admin-dashboard/view";

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export type CustomerRecordTab = "orders" | "sales" | "invoices" | "payments";

export type CustomerReceivableBucket = "paid" | "partial" | "unpaid" | "pending";

export type CustomerReceivableSegment = {
  bucket: CustomerReceivableBucket;
  label: string;
  invoiceCount: number;
  receivable: number;
  color: string;
  tooltip: string;
};

export type CustomerSalesRow = {
  id: string;
  created_at: string;
  sale_date: string | null;
  source_label: string;
  order_status: AdminOrder["order_status"];
  payment_status: AdminOrder["payment_status"];
  invoice_number: string | null;
  order_total: number;
  paid_total: number;
  balance: number;
  payment_count: number;
  href: string;
};

export type CustomerInvoiceRow = {
  order_id: string;
  invoice_id: string;
  invoice_number: string;
  invoice_created_at: string;
  invoice_total: number;
  paid_total: number;
  balance: number;
  payment_status: AdminOrder["payment_status"];
  href: string;
};

export type CustomerPaymentRow = {
  id: string;
  payment_date: string;
  created_at: string;
  order_id: string;
  payment_method: string;
  payment_terms: string;
  amount: number;
  reference_number: string | null;
  notes: string | null;
  href: string;
};

const receivableBucketMeta: Array<{
  bucket: CustomerReceivableBucket;
  label: string;
  color: string;
}> = [
  { bucket: "paid", label: "Paid", color: "#16a34a" },
  { bucket: "partial", label: "Partial", color: "#d97706" },
  { bucket: "unpaid", label: "Unpaid", color: "#dc2626" },
  { bucket: "pending", label: "Pending", color: "#6b7280" },
];

function invoiceCountLabel(count: number) {
  return `${count} invoice${count === 1 ? "" : "s"}`;
}

function receivableSegmentLabel(bucket: CustomerReceivableBucket) {
  return receivableBucketMeta.find((entry) => entry.bucket === bucket)?.label ?? bucket;
}

function receivableAmountForOrder(order: AdminOrder, bucket: CustomerReceivableBucket) {
  if (bucket === "paid" || bucket === "pending") {
    return orderReceivableTotal(order, "final_quantity");
  }

  return orderBalance(order);
}

function orderMatchesReceivableBucket(
  order: AdminOrder,
  bucket: CustomerReceivableBucket,
) {
  if (bucket === "pending") {
    return order.order_status === "pending";
  }

  if (order.order_status === "pending") {
    return false;
  }

  if (bucket === "paid") {
    return order.payment_status === "paid";
  }

  if (bucket === "partial") {
    return order.payment_status === "partial";
  }

  return order.payment_status !== "paid" && order.payment_status !== "partial";
}

function sumCustomerOrdersBySourceForBucket(
  orders: AdminOrder[],
  bucket: CustomerReceivableBucket,
) {
  const totalsBySource = new Map<string, { amount: number; count: number }>();

  for (const order of orders) {
    if (!orderMatchesReceivableBucket(order, bucket)) {
      continue;
    }

    const sourceLabel = formatOrderSource(order.source);
    const current = totalsBySource.get(sourceLabel) ?? { amount: 0, count: 0 };

    totalsBySource.set(sourceLabel, {
      amount: roundCurrency(current.amount + receivableAmountForOrder(order, bucket)),
      count: current.count + 1,
    });
  }

  return Array.from(totalsBySource.entries())
    .map(([label, totals]) => ({
      label,
      amount: totals.amount,
      count: totals.count,
    }))
    .sort((left, right) => right.amount - left.amount);
}

function buildCustomerReceivableSegmentTooltip(
  bucket: CustomerReceivableBucket,
  orders: AdminOrder[],
) {
  const segmentLabel = receivableSegmentLabel(bucket);
  const lines = sumCustomerOrdersBySourceForBucket(orders, bucket);

  if (lines.length === 0) {
    return `No ${segmentLabel.toLowerCase()} orders.`;
  }

  return [
    segmentLabel,
    ...lines.map(
      (line) =>
        `${line.label}: ${formatCurrency(line.amount)} (${invoiceCountLabel(line.count)})`,
    ),
  ].join("\n");
}

export function parseCustomerRecordTab(value: string | null): CustomerRecordTab {
  if (value === "sales" || value === "invoices" || value === "payments") {
    return value;
  }

  return "orders";
}

export function customerOrderCounts(orders: AdminOrder[]) {
  return {
    total: orders.length,
    pending: orders.filter((order) => order.order_status === "pending").length,
    processing: orders.filter((order) => order.order_status === "processing").length,
    closed: orders.filter((order) => order.order_status === "closed").length,
  };
}

export function customerOutstandingCreditBalance(orders: AdminOrder[]) {
  return roundCurrency(
    orders
      .filter((order) => order.order_status !== "closed")
      .reduce((total, order) => total + orderBalance(order), 0),
  );
}

export function customerProcessingReceivableTotal(orders: AdminOrder[]) {
  return roundCurrency(
    orders
      .filter((order) => order.order_status === "processing")
      .reduce((total, order) => total + orderBalance(order), 0),
  );
}

export function customerEstimatedInvoiceTotal(orders: AdminOrder[]) {
  return roundCurrency(
    orders
      .filter((order) => ["pending", "processing", "closed"].includes(order.order_status))
      .reduce((total, order) => total + orderReceivableTotal(order, "final_quantity"), 0),
  );
}

export function buildCustomerReceivableSegments(orders: AdminOrder[]): CustomerReceivableSegment[] {
  const buckets: Record<CustomerReceivableBucket, { count: number; receivable: number }> = {
    paid: { count: 0, receivable: 0 },
    partial: { count: 0, receivable: 0 },
    unpaid: { count: 0, receivable: 0 },
    pending: { count: 0, receivable: 0 },
  };

  for (const order of orders) {
    if (order.order_status === "pending") {
      buckets.pending.count += 1;
      buckets.pending.receivable += orderReceivableTotal(order, "final_quantity");
      continue;
    }

    const receivable = orderBalance(order);

    if (order.payment_status === "paid") {
      buckets.paid.count += 1;
      buckets.paid.receivable += orderReceivableTotal(order, "final_quantity");
      continue;
    }

    if (order.payment_status === "partial") {
      buckets.partial.count += 1;
      buckets.partial.receivable += receivable;
      continue;
    }

    buckets.unpaid.count += 1;
    buckets.unpaid.receivable += receivable;
  }

  return receivableBucketMeta
    .map(({ bucket, label, color }) => ({
      bucket,
      label,
      color,
      invoiceCount: buckets[bucket].count,
      receivable: roundCurrency(buckets[bucket].receivable),
      tooltip: buildCustomerReceivableSegmentTooltip(bucket, orders),
    }))
    .filter((segment) => segment.receivable > 0 || segment.invoiceCount > 0)
    .sort((left, right) => right.receivable - left.receivable);
}

export function filterCustomerOrders(orders: AdminOrder[], filters: AdminOrderFilters) {
  const search = filters.search?.trim().toLowerCase() ?? "";

  return orders.filter((order) => {
    if (filters.source && order.source !== filters.source) {
      return false;
    }

    if (filters.orderStatus && order.order_status !== filters.orderStatus) {
      return false;
    }

    if (filters.paymentStatus && order.payment_status !== filters.paymentStatus) {
      return false;
    }

    if (!search) {
      return true;
    }

    const haystack = [
      formatOrderCode(order.id),
      order.id,
      formatOrderSource(order.source),
      order.order_status,
      order.payment_status,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(search);
  });
}

export function buildCustomerSalesRows(
  orders: AdminOrder[],
  customerReturnTo: string,
): CustomerSalesRow[] {
  return orders
    .filter((order) => order.order_status === "closed")
    .map((order) => {
      const invoice = order.invoice[0] ?? null;
      const orderTotalAmount = orderTotal(order, invoice ? "final_quantity" : "partial_quantity");

      return {
        id: order.id,
        created_at: order.created_at,
        sale_date: order.sale_date ?? order.updated_at,
        source_label: formatOrderSource(order.source),
        order_status: order.order_status,
        payment_status: order.payment_status,
        invoice_number: invoice?.invoice_number ?? null,
        order_total: orderTotalAmount,
        paid_total: orderPaymentTotal(order),
        balance: orderBalance(order),
        payment_count: order.payment.length,
        href: `/admin/orders/customer/${order.id}?returnTo=${customerReturnTo}`,
      };
    })
    .sort(
      (left, right) =>
        new Date(right.sale_date ?? right.created_at).getTime()
        - new Date(left.sale_date ?? left.created_at).getTime(),
    );
}

export function buildCustomerInvoiceRows(
  orders: AdminOrder[],
  customerReturnTo: string,
): CustomerInvoiceRow[] {
  return orders.flatMap((order) =>
    order.invoice.map((invoice) => ({
      order_id: order.id,
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      invoice_created_at: invoice.created_at,
      invoice_total: orderTotal(order, "final_quantity"),
      paid_total: orderPaymentTotal(order),
      balance: orderBalance(order),
      payment_status: order.payment_status,
      href: `/admin/orders/customer/${order.id}?returnTo=${customerReturnTo}&tab=sales-invoice`,
    })),
  ).sort(
    (left, right) =>
      new Date(right.invoice_created_at).getTime() - new Date(left.invoice_created_at).getTime(),
  );
}

export function filterCustomerSalesRows(rows: CustomerSalesRow[], filters: AdminOrderFilters) {
  const search = filters.search?.trim().toLowerCase() ?? "";

  return rows.filter((row) => {
    if (filters.source && row.source_label.toLowerCase() !== formatOrderSource(filters.source).toLowerCase()) {
      return false;
    }

    if (filters.orderStatus && row.order_status !== filters.orderStatus) {
      return false;
    }

    if (filters.paymentStatus && row.payment_status !== filters.paymentStatus) {
      return false;
    }

    if (!search) {
      return true;
    }

    const haystack = [
      formatOrderCode(row.id),
      row.id,
      row.invoice_number,
      row.source_label,
      row.order_status,
      row.payment_status,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(search);
  });
}

export function filterCustomerInvoiceRows(rows: CustomerInvoiceRow[], search: string | undefined) {
  const normalizedSearch = search?.trim().toLowerCase() ?? "";

  if (!normalizedSearch) {
    return rows;
  }

  return rows.filter((row) => {
    const haystack = [
      row.invoice_number,
      formatOrderCode(row.order_id),
      row.order_id,
      row.payment_status,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedSearch);
  });
}

export function buildCustomerPaymentRows(
  orders: AdminOrder[],
  customerReturnTo: string,
): CustomerPaymentRow[] {
  const rows = orders.flatMap((order) =>
    order.payment.map((payment) => ({
      id: payment.id,
      payment_date: payment.payment_date,
      created_at: payment.created_at,
      order_id: order.id,
      payment_method: payment.payment_method,
      payment_terms: payment.payment_terms,
      amount: payment.amount,
      reference_number: payment.reference_number,
      notes: payment.notes,
      href: `/admin/orders/customer/${order.id}?returnTo=${customerReturnTo}&tab=payment-record`,
    })),
  );

  return sortOrderPaymentsDescending(rows);
}

export function filterCustomerPaymentRows(rows: CustomerPaymentRow[], search: string | undefined) {
  const normalizedSearch = search?.trim().toLowerCase() ?? "";

  if (!normalizedSearch) {
    return rows;
  }

  return rows.filter((row) => {
    const haystack = [
      formatOrderCode(row.order_id),
      row.order_id,
      row.payment_method,
      row.payment_terms,
      row.reference_number,
      row.notes,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedSearch);
  });
}

export function paginateCustomerRecords<T>(
  records: T[],
  page: number,
  pageSize: AdminPaginationPageSize,
) {
  const pagination = buildAdminPagination(records.length, { page, pageSize });
  const start = (pagination.page - 1) * pagination.pageSize;

  return {
    records: records.slice(start, start + pagination.pageSize),
    pagination,
  };
}
