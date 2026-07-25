import type {
  AdminAgent,
  AdminAgentOrder,
  AdminAgentReceivedPayment,
  AdminCustomer,
  AdminOrder,
  AdminProduct,
} from "@/lib/admin-dashboard/data";
import type { AdminOrderFilters } from "@/lib/admin-dashboard/order-filters";
import { parseAdminOrderFilters } from "@/lib/admin-dashboard/order-filters";
import type { AdminPaginationPageSize } from "@/lib/admin-dashboard/pagination";
import { buildAdminPagination } from "@/lib/admin-dashboard/pagination";
import {
  agentOrderCommissionTotal,
  agentOrderPaymentStatus,
  agentOrderTotal,
  fullName,
  orderBalance,
  orderCommissionTotal,
} from "@/lib/admin-dashboard/view";
import { autoCapitalize, formatOrderSource } from "@/lib/formatters";
import { formatOrderCode } from "@/lib/order-detail-nav";

export type AgentRecordTab =
  | "orders"
  | "sales"
  | "invoices"
  | "payments"
  | "customers"
  | "previous-orders";

export type AgentRecordOrderType = "customer" | "agent";

export const agentRecordOrderTypes = ["customer", "agent"] as const;

export type AgentRecordFilters = AdminOrderFilters & {
  orderType?: AgentRecordOrderType;
};

export type AgentAssignedCustomerRow = {
  id: string;
  created_at: string;
  name: string;
  phone_number: string;
  email: string | null;
  address: string;
  is_reseller: boolean;
  href: string;
};

export type AgentRecordOrderRow = {
  id: string;
  created_at: string;
  order_type: AgentRecordOrderType;
  order_type_label: string;
  source: AdminOrder["source"] | null;
  source_label: string;
  order_status: string;
  payment_status: string;
  amount: number;
  href: string;
};

export type AgentPreviousOrderRow = {
  id: string;
  created_at: string;
  source_label: string;
  order_status: AdminOrder["order_status"];
  payment_status: AdminOrder["payment_status"];
  balance: number;
  total_amount: number;
  can_convert: boolean;
  block_reason: string | null;
  converted_parent_order_id: string | null;
  converted_at: string | null;
  order_href: string;
  converted_order_href: string | null;
};

const customerLikeTabs = new Set<AgentRecordTab>([
  "sales",
  "invoices",
  "payments",
]);

export function isAgentCustomerLikeTab(tab: AgentRecordTab) {
  return customerLikeTabs.has(tab);
}

export function parseAgentRecordTab(value: string | null): AgentRecordTab {
  if (value === "agent-orders") {
    return "orders";
  }

  if (
    value === "sales"
    || value === "invoices"
    || value === "payments"
    || value === "customers"
    || value === "previous-orders"
  ) {
    return value;
  }

  return "orders";
}

export function parseAgentRecordFilters(url: URL): AgentRecordFilters {
  const filters: AgentRecordFilters = { ...parseAdminOrderFilters(url) };
  const orderType = url.searchParams.get("orderType");

  if (orderType === "customer" || orderType === "agent") {
    filters.orderType = orderType;
  }

  return filters;
}

export function serializeAgentRecordFilters(filters: AgentRecordFilters): string {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.source) params.set("source", filters.source);
  if (filters.orderStatus) params.set("orderStatus", filters.orderStatus);
  if (filters.paymentStatus) params.set("paymentStatus", filters.paymentStatus);
  if (filters.orderType) params.set("orderType", filters.orderType);

  return params.toString();
}

export function buildAgentRecordOrderRows(
  customerOrders: AdminOrder[],
  agentOrders: AdminAgentOrder[],
  agentReturnTo: string,
): AgentRecordOrderRow[] {
  const customerRows = customerOrders.map((order) => ({
    id: order.id,
    created_at: order.created_at,
    order_type: "customer" as const,
    order_type_label: "Customer",
    source: order.source,
    source_label: formatOrderSource(order.source),
    order_status: order.order_status,
    payment_status: order.payment_status,
    amount: orderBalance(order),
    href: `/admin/orders/customer/${order.id}?returnTo=${agentReturnTo}`,
  }));

  const agentRows = agentOrders.map((order) => ({
    id: order.id,
    created_at: order.created_at,
    order_type: "agent" as const,
    order_type_label: "Agent",
    source: null,
    source_label: "Agent order",
    order_status: order.order_status,
    payment_status: agentOrderPaymentStatus(order),
    amount: agentOrderTotal(order),
    href: `/admin/orders/agent/${order.id}?returnTo=${agentReturnTo}`,
  }));

  return [...customerRows, ...agentRows].sort(
    (left, right) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
}

export function filterAgentRecordOrderRows(
  rows: AgentRecordOrderRow[],
  filters: AgentRecordFilters,
) {
  const search = filters.search?.trim().toLowerCase() ?? "";

  return rows.filter((row) => {
    if (filters.orderType && row.order_type !== filters.orderType) {
      return false;
    }

    if (filters.source && (row.order_type !== "customer" || row.source !== filters.source)) {
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
      row.order_type_label,
      row.source_label,
      row.order_status,
      row.payment_status,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(search);
  });
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function agentRecordOrderCounts(
  customerOrders: AdminOrder[],
  agentOrders: AdminAgentOrder[],
) {
  const customerCounts = {
    pending: customerOrders.filter((order) => order.order_status === "pending").length,
    processing: customerOrders.filter((order) => order.order_status === "processing").length,
    closed: customerOrders.filter((order) => order.order_status === "closed").length,
  };
  const agentPending = agentOrders.filter(
    (order) => order.order_status === "pending_customers" || order.order_status === "pending_order",
  ).length;
  const agentProcessing = agentOrders.filter((order) => order.order_status === "processing").length;
  const agentClosed = agentOrders.filter((order) => order.order_status === "closed").length;

  return {
    total: customerOrders.length + agentOrders.length,
    pending: customerCounts.pending + agentPending,
    processing: customerCounts.processing + agentProcessing,
    closed: customerCounts.closed + agentClosed,
  };
}

export function agentRecordCommissionTotal(
  customerOrders: AdminOrder[],
  agentOrders: AdminAgentOrder[],
) {
  return roundCurrency(
    customerOrders.reduce((total, order) => total + orderCommissionTotal(order), 0)
    + agentOrders.reduce((total, order) => total + agentOrderCommissionTotal(order), 0),
  );
}

export function agentRecordPaymentsSubmitted(
  agentId: string,
  customerOrders: AdminOrder[],
  agentOrders: AdminAgentOrder[],
) {
  const seenPaymentIds = new Set<string>();
  let total = 0;

  const addOrderPayments = (order: AdminOrder) => {
    for (const payment of order.agent_received_payment ?? []) {
      if (payment.agent_id !== agentId || seenPaymentIds.has(payment.id)) {
        continue;
      }

      seenPaymentIds.add(payment.id);
      total += payment.amount;
    }
  };

  for (const order of customerOrders) {
    addOrderPayments(order);
  }

  for (const agentOrder of agentOrders) {
    for (const customerOrder of agentOrder.customer_order) {
      addOrderPayments(customerOrder);
    }
  }

  return roundCurrency(total);
}

export function agentAccountLabel(status: AdminAgent["status"]) {
  return status === "active" ? "Active" : "Inactive";
}

export function buildAgentAssignedCustomerRows(
  customers: AdminCustomer[],
  agentReturnTo: string,
): AgentAssignedCustomerRow[] {
  return customers
    .map((customer) => ({
      id: customer.id,
      created_at: customer.created_at,
      name: fullName(customer),
      phone_number: customer.phone_number,
      email: customer.email,
      address: customer.address,
      is_reseller: customer.is_reseller,
      href: `/admin/customers/${customer.id}?returnTo=${agentReturnTo}`,
    }))
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    );
}

export function filterAgentAssignedCustomerRows(
  rows: AgentAssignedCustomerRow[],
  search: string | undefined,
) {
  const normalizedSearch = search?.trim().toLowerCase() ?? "";

  if (!normalizedSearch) {
    return rows;
  }

  return rows.filter((row) => {
    const haystack = [
      row.name,
      row.phone_number,
      row.email,
      row.address,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedSearch);
  });
}

export function buildAgentPreviousOrderRows(
  orders: AdminOrder[],
  agentReturnTo: string,
  options: {
    getBlockReason: (order: AdminOrder) => string | null;
    canConvert: (order: AdminOrder) => boolean;
    getBalance: (order: AdminOrder) => number;
    getTotalAmount: (order: AdminOrder) => number;
  },
): AgentPreviousOrderRow[] {
  return orders
    .map((order) => ({
      id: order.id,
      created_at: order.created_at,
      source_label: formatOrderSource(order.source),
      order_status: order.order_status,
      payment_status: order.payment_status,
      balance: options.getBalance(order),
      total_amount: options.getTotalAmount(order),
      can_convert: options.canConvert(order),
      block_reason: options.getBlockReason(order),
      converted_parent_order_id: order.parent_order_id ?? null,
      converted_at: order.converted_at ?? null,
      order_href: `/admin/orders/customer/${order.id}?returnTo=${agentReturnTo}`,
      converted_order_href: order.parent_order_id
        ? `/admin/orders/agent/${order.parent_order_id}?returnTo=${agentReturnTo}`
        : null,
    }))
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    );
}

export function filterAgentPreviousOrderRows(
  rows: AgentPreviousOrderRow[],
  search: string | undefined,
) {
  const normalizedSearch = search?.trim().toLowerCase() ?? "";

  if (!normalizedSearch) {
    return rows;
  }

  return rows.filter((row) => {
    const haystack = [
      formatOrderCode(row.id),
      row.id,
      row.source_label,
      row.order_status,
      row.payment_status,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedSearch);
  });
}

export function paginateAgentRecords<T>(
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

export type AgentCommissionEarnedEntry = {
  id: string;
  earned_at: string;
  amount: number;
  order_label: string;
  href: string;
};

export type AgentRemittancePerformance = {
  submissionCount: number;
  confirmedCount: number;
  pendingCount: number;
  rejectedCount: number;
  confirmationRate: number;
  averageDaysToRemit: number | null;
  recentSubmissions30Days: number;
  totalRemitted: number;
  performanceLabel: string | null;
  performanceTooltip: string | null;
};

export type AgentKgSoldTrend = {
  diff: number;
  current30Days: number;
  previous30Days: number;
  tooltip: string;
};

export type AgentPerformanceQuickStats = {
  kgSold: number;
  kgSoldTrend: AgentKgSoldTrend;
  topCategory: {
    label: string;
    quantity: number;
  } | null;
  remittance: AgentRemittancePerformance;
  commissionEntries: AgentCommissionEarnedEntry[];
  commissionEarnedTotal: number;
};

const remittancePerformanceLabels = {
  excellent: "Excellent",
  good: "Good",
  needsImprovement: "Needs improvement",
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_WINDOW_DAYS = 30;

export function formatKgSoldTrendDiff(diff: number) {
  if (diff > 0) {
    return `+${diff.toLocaleString("en-PH", { maximumFractionDigits: 1 })}`;
  }

  return diff.toLocaleString("en-PH", { maximumFractionDigits: 1 });
}

export function buildAgentPerformanceQuickStats(
  agentId: string,
  customerOrders: AdminOrder[],
  agentOrders: AdminAgentOrder[],
  products: Pick<AdminProduct, "id" | "category">[],
  agentReturnTo: string,
): AgentPerformanceQuickStats {
  const scopedCustomerOrders = collectAgentCustomerOrders(customerOrders, agentOrders);
  const categoryByProductId = new Map(
    products.map((product) => [product.id, product.category]),
  );

  const commissionEntries = buildAgentCommissionEarnedEntries(
    scopedCustomerOrders,
    agentOrders,
    agentReturnTo,
  );

  return {
    kgSold: roundQuantity(
      sumClosedCustomerOrderKg(scopedCustomerOrders)
      + sumClosedAgentOrderKg(agentOrders),
    ),
    kgSoldTrend: buildKgSoldTrend(scopedCustomerOrders, agentOrders),
    topCategory: buildTopSoldCategory(
      scopedCustomerOrders,
      agentOrders,
      categoryByProductId,
    ),
    remittance: buildAgentRemittancePerformance(
      agentId,
      scopedCustomerOrders,
      agentOrders,
    ),
    commissionEntries,
    commissionEarnedTotal: roundCurrency(
      commissionEntries.reduce((total, entry) => total + entry.amount, 0),
    ),
  };
}

function collectAgentCustomerOrders(
  customerOrders: AdminOrder[],
  agentOrders: AdminAgentOrder[],
) {
  const seen = new Set<string>();
  const orders: AdminOrder[] = [];

  const addOrder = (order: AdminOrder) => {
    if (seen.has(order.id)) {
      return;
    }

    seen.add(order.id);
    orders.push(order);
  };

  for (const order of customerOrders) {
    addOrder(order);
  }

  for (const agentOrder of agentOrders) {
    for (const childOrder of agentOrder.customer_order) {
      addOrder(childOrder);
    }
  }

  return orders;
}

function sumClosedCustomerOrderKg(orders: AdminOrder[]) {
  return orders
    .filter((order) => order.order_status === "closed")
    .reduce((total, order) => {
      return total + order.customer_order_item.reduce(
        (itemTotal, item) => itemTotal + Number(item.final_quantity ?? 0),
        0,
      );
    }, 0);
}

function sumClosedAgentOrderKg(agentOrders: AdminAgentOrder[]) {
  return agentOrders
    .filter((order) => order.order_status === "closed")
    .reduce((total, order) => {
      return total + order.agent_order_item.reduce(
        (itemTotal, item) => itemTotal + Number(item.quantity ?? 0),
        0,
      );
    }, 0);
}

function resolveClosedOrderDate(
  value: Pick<AdminOrder, "sale_date" | "updated_at" | "created_at">,
) {
  return value.sale_date ?? value.updated_at ?? value.created_at;
}

function sumClosedKgInRange(
  customerOrders: AdminOrder[],
  agentOrders: AdminAgentOrder[],
  rangeStartMs: number,
  rangeEndMs: number,
) {
  let total = 0;

  for (const order of customerOrders) {
    if (order.order_status !== "closed") {
      continue;
    }

    const orderDateMs = new Date(resolveClosedOrderDate(order)).getTime();
    if (!Number.isFinite(orderDateMs) || orderDateMs < rangeStartMs || orderDateMs >= rangeEndMs) {
      continue;
    }

    total += order.customer_order_item.reduce(
      (itemTotal, item) => itemTotal + Number(item.final_quantity ?? 0),
      0,
    );
  }

  for (const agentOrder of agentOrders) {
    if (agentOrder.order_status !== "closed") {
      continue;
    }

    const orderDateMs = new Date(resolveClosedOrderDate(agentOrder)).getTime();
    if (!Number.isFinite(orderDateMs) || orderDateMs < rangeStartMs || orderDateMs >= rangeEndMs) {
      continue;
    }

    total += agentOrder.agent_order_item.reduce(
      (itemTotal, item) => itemTotal + Number(item.quantity ?? 0),
      0,
    );
  }

  return total;
}

function buildKgSoldTrend(
  customerOrders: AdminOrder[],
  agentOrders: AdminAgentOrder[],
  nowMs = Date.now(),
): AgentKgSoldTrend {
  const currentStartMs = nowMs - (TREND_WINDOW_DAYS * DAY_MS);
  const previousStartMs = nowMs - (TREND_WINDOW_DAYS * 2 * DAY_MS);

  const current30Days = roundQuantity(
    sumClosedKgInRange(customerOrders, agentOrders, currentStartMs, nowMs + 1),
  );
  const previous30Days = roundQuantity(
    sumClosedKgInRange(customerOrders, agentOrders, previousStartMs, currentStartMs),
  );
  const diff = roundQuantity(current30Days - previous30Days);
  const formatKg = (value: number) => value.toLocaleString("en-PH", { maximumFractionDigits: 1 });

  return {
    diff,
    current30Days,
    previous30Days,
    tooltip: `${formatKgSoldTrendDiff(diff)} compared to the previous 30 days. Last 30 days: ${formatKg(current30Days)} kg; prior 30 days: ${formatKg(previous30Days)} kg. Based on closed orders using sale date.`,
  };
}

function buildTopSoldCategory(
  customerOrders: AdminOrder[],
  agentOrders: AdminAgentOrder[],
  categoryByProductId: Map<string, string>,
) {
  const categoryTotals = new Map<string, number>();

  const addQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      return;
    }

    const category = categoryByProductId.get(productId) ?? "uncategorized";
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + quantity);
  };

  for (const order of customerOrders) {
    if (order.order_status !== "closed") {
      continue;
    }

    for (const item of order.customer_order_item) {
      addQuantity(item.product_id, Number(item.final_quantity ?? 0));
    }
  }

  for (const agentOrder of agentOrders) {
    if (agentOrder.order_status !== "closed") {
      continue;
    }

    for (const item of agentOrder.agent_order_item) {
      addQuantity(item.product_id, Number(item.quantity ?? 0));
    }
  }

  const topCategory = Array.from(categoryTotals.entries())
    .sort((left, right) => right[1] - left[1])[0];

  if (!topCategory) {
    return null;
  }

  return {
    label: formatCategoryLabel(topCategory[0]),
    quantity: roundQuantity(topCategory[1]),
  };
}

function buildAgentRemittancePerformance(
  agentId: string,
  customerOrders: AdminOrder[],
  agentOrders: AdminAgentOrder[],
): AgentRemittancePerformance {
  const remittanceRecords = collectAgentRemittanceRecords(
    agentId,
    customerOrders,
    agentOrders,
  );
  const confirmedRecords = remittanceRecords.filter(
    (record) => record.payment.status === "confirmed",
  );
  const pendingCount = remittanceRecords.filter(
    (record) => record.payment.status === "pending_admin_confirmation",
  ).length;
  const rejectedCount = remittanceRecords.filter(
    (record) => record.payment.status === "rejected",
  ).length;
  const remittanceLags = confirmedRecords
    .map((record) => diffDays(
      record.payment.payment_date,
      resolveOrderAnchorDate(record.order),
    ))
    .filter((days) => Number.isFinite(days));
  const averageDaysToRemit = remittanceLags.length > 0
    ? roundQuantity(
      remittanceLags.reduce((total, days) => total + days, 0) / remittanceLags.length,
    )
    : null;
  const recentThreshold = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const recentSubmissions30Days = remittanceRecords.filter(
    (record) => new Date(record.payment.created_at).getTime() >= recentThreshold,
  ).length;
  const confirmationRate = remittanceRecords.length > 0
    ? Math.round((confirmedRecords.length / remittanceRecords.length) * 100)
    : 0;
  const performanceLabel = resolveRemittancePerformanceLabel(
    remittanceRecords.length,
    confirmationRate,
    averageDaysToRemit,
  );

  return {
    submissionCount: remittanceRecords.length,
    confirmedCount: confirmedRecords.length,
    pendingCount,
    rejectedCount,
    confirmationRate,
    averageDaysToRemit,
    recentSubmissions30Days,
    totalRemitted: roundCurrency(
      confirmedRecords.reduce((total, record) => total + record.payment.amount, 0),
    ),
    performanceLabel,
    performanceTooltip: resolveRemittancePerformanceTooltip(
      remittanceRecords.length,
      confirmationRate,
      averageDaysToRemit,
      performanceLabel,
    ),
  };
}

function buildAgentCommissionEarnedEntries(
  customerOrders: AdminOrder[],
  agentOrders: AdminAgentOrder[],
  agentReturnTo: string,
): AgentCommissionEarnedEntry[] {
  const entries: AgentCommissionEarnedEntry[] = [];

  for (const order of customerOrders) {
    if (!isCustomerOrderCommissionEarned(order)) {
      continue;
    }

    entries.push({
      id: order.id,
      earned_at: resolveCommissionEarnedDate(order),
      amount: orderCommissionTotal(order),
      order_label: formatOrderCode(order.id),
      href: `/admin/orders/customer/${order.id}?returnTo=${agentReturnTo}`,
    });
  }

  for (const agentOrder of agentOrders) {
    if (!isAgentOrderCommissionEarned(agentOrder)) {
      continue;
    }

    const amount = agentOrderCommissionTotal(agentOrder);

    if (amount <= 0) {
      continue;
    }

    entries.push({
      id: agentOrder.id,
      earned_at: resolveAgentOrderCommissionEarnedDate(agentOrder),
      amount,
      order_label: formatOrderCode(agentOrder.id),
      href: `/admin/orders/agent/${agentOrder.id}?returnTo=${agentReturnTo}`,
    });
  }

  return entries.sort(
    (left, right) => new Date(right.earned_at).getTime() - new Date(left.earned_at).getTime(),
  );
}

function collectAgentRemittanceRecords(
  agentId: string,
  customerOrders: AdminOrder[],
  agentOrders: AdminAgentOrder[],
) {
  const seenPaymentIds = new Set<string>();
  const records: Array<{ payment: AdminAgentReceivedPayment; order: AdminOrder }> = [];

  const addOrderPayments = (order: AdminOrder) => {
    for (const payment of order.agent_received_payment ?? []) {
      if (payment.agent_id !== agentId || seenPaymentIds.has(payment.id)) {
        continue;
      }

      seenPaymentIds.add(payment.id);
      records.push({ payment, order });
    }
  };

  for (const order of customerOrders) {
    addOrderPayments(order);
  }

  for (const agentOrder of agentOrders) {
    for (const childOrder of agentOrder.customer_order) {
      addOrderPayments(childOrder);
    }
  }

  return records;
}

function isCustomerOrderCommissionEarned(order: AdminOrder) {
  return order.order_status === "closed" && order.payment_status === "paid";
}

function isAgentOrderCommissionEarned(agentOrder: AdminAgentOrder) {
  return agentOrder.order_status === "closed"
    && agentOrderPaymentStatus(agentOrder) === "paid";
}

function resolveCommissionEarnedDate(order: AdminOrder) {
  const latestPaymentDate = order.payment
    .map((payment) => payment.payment_date)
    .sort((left, right) => right.localeCompare(left))[0];

  return latestPaymentDate ?? order.sale_date ?? order.updated_at ?? order.created_at;
}

function resolveAgentOrderCommissionEarnedDate(agentOrder: AdminAgentOrder) {
  const childPaymentDates = agentOrder.customer_order.flatMap((order) =>
    order.payment.map((payment) => payment.payment_date),
  );
  const latestPaymentDate = childPaymentDates.sort((left, right) => right.localeCompare(left))[0];

  return latestPaymentDate ?? agentOrder.sale_date ?? agentOrder.updated_at ?? agentOrder.created_at;
}

function resolveOrderAnchorDate(order: AdminOrder) {
  return order.sale_date ?? order.created_at;
}

function resolveRemittancePerformanceLabel(
  submissionCount: number,
  confirmationRate: number,
  averageDaysToRemit: number | null,
): string | null {
  if (submissionCount === 0) {
    return null;
  }

  if (confirmationRate >= 90 && (averageDaysToRemit ?? 0) <= 5) {
    return remittancePerformanceLabels.excellent;
  }

  if (confirmationRate >= 75 && (averageDaysToRemit ?? Number.MAX_SAFE_INTEGER) <= 10) {
    return remittancePerformanceLabels.good;
  }

  return remittancePerformanceLabels.needsImprovement;
}

function resolveRemittancePerformanceTooltip(
  submissionCount: number,
  confirmationRate: number,
  averageDaysToRemit: number | null,
  performanceLabel: string | null,
): string | null {
  if (!performanceLabel || submissionCount === 0) {
    return null;
  }

  const speedDetail = averageDaysToRemit === null
    ? "no confirmed remittance timing yet"
    : `${averageDaysToRemit}-day average from sale to remittance`;

  if (performanceLabel === remittancePerformanceLabels.excellent) {
    return `Rated Excellent: ${confirmationRate}% of remittances confirmed with ${speedDetail}. Threshold is at least 90% confirmed and within 5 days on average.`;
  }

  if (performanceLabel === remittancePerformanceLabels.good) {
    return `Rated Good: ${confirmationRate}% confirmed with ${speedDetail}. Threshold is at least 75% confirmed and within 10 days on average.`;
  }

  return `Rated Needs improvement: ${confirmationRate}% confirmed with ${speedDetail}. Excellent requires at least 90% confirmed within 5 days; Good requires 75% within 10 days.`;
}

function formatCategoryLabel(category: string) {
  return autoCapitalize(category.replace(/[-_]+/g, " "));
}

function diffDays(later: string, earlier: string) {
  const differenceMs = new Date(later).getTime() - new Date(earlier).getTime();

  if (!Number.isFinite(differenceMs)) {
    return Number.NaN;
  }

  return Math.max(0, Math.round(differenceMs / (1000 * 60 * 60 * 24)));
}

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}
