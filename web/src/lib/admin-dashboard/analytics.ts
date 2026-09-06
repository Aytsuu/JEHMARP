import {
  fullName,
  orderCommissionTotal,
  orderBalance,
  orderPaymentTotal,
  orderReceivableTotal,
  orderTotal,
  formatDate,
  formatWholeCurrency,
} from "./view";
import { formatSignedMetricTrendDiff } from "@/lib/dashboard/metric-trend";
import { formatOrderCode } from "@/lib/order-detail-nav";

import type {
  AdminAgentOrder,
  AdminDashboardData,
  AdminOrder,
} from "./data";

export type DashboardMetricTrend = {
  previousValue: number;
  difference: number;
  direction: "up" | "down" | "flat";
  tooltip: string;
};

export type AnalyticsSummary = {
  grossSales: number;
  netIncome: number;
  totalPaidAmount: number;
  outstandingBalance: number;
  pendingOrderPayments: number;
  pendingOrderPaymentsTrend: DashboardMetricTrend;
  orderCount: number;
  newResellerApplications: number;
  newContactInquiries: number;
  agentMonthlyEarnings: number;
  agentEarnedToday: number;
  agentExpectedCommission: number;
  assignedCustomerCount: number;
};

export type CountMetric = {
  label: string;
  count: number;
};

export type SalesPeriodMetric = {
  label: string;
  orderCount: number;
  grossSales: number;
};

export type ProductSalesMetric = {
  label: string;
  quantitySold: number;
  grossSales: number;
};

export type YearlyOrderActivityCellMetric = {
  date: string | null;
  dayOfMonth: number | null;
  orderCount: number;
  isPadding: boolean;
};

export type YearlyOrderActivityMonthMetric = {
  label: string;
  month: number;
  rows: number;
  cells: YearlyOrderActivityCellMetric[];
};

export type YearlyOrderActivityYearMetric = {
  year: number;
  maxOrderCount: number;
  totalOrders: number;
  months: YearlyOrderActivityMonthMetric[];
};

export type YearlyOrderActivityMetric = {
  defaultYear: number;
  availableYears: number[];
  years: Record<number, YearlyOrderActivityYearMetric>;
};

export type AgentSalesMetric = {
  label: string;
  orderCount: number;
  grossSales: number;
  paidAmount: number;
  earnedCommission: number;
  expectedCommission: number;
};

export type PendingCustomerBalanceOrderMetric = {
  orderId: string;
  orderCode: string;
  createdAt: string;
  grossTotal: number;
  commissionTotal: number;
  receivableTotal: number;
  paidTotal: number;
  unpaidBalance: number;
  hasCommissionAdjustment: boolean;
};

export type PendingCustomerBalanceMetric = {
  customerId: string;
  customerName: string;
  orderCount: number;
  unpaidBalance: number;
  grossTotal: number;
  commissionTotal: number;
  receivableTotal: number;
  paidTotal: number;
  orders: PendingCustomerBalanceOrderMetric[];
};

export type OrderStatusOverviewMetric = {
  key: "pending_order" | "pending_customers" | "processing" | "closed";
  label: string;
  count: number;
  color: string;
};

export type OrderStatusRecentUpdate = {
  id: string;
  orderCode: string;
  partyLabel: string;
  statusLabel: string;
  statusColor: string;
  updatedAt: string;
  updatedLabel: string;
  href: string;
};

export type OrderStatusOverview = {
  totalOrders: number;
  statuses: OrderStatusOverviewMetric[];
  recentUpdates: OrderStatusRecentUpdate[];
};

export type AdminAnalytics = {
  summary: AnalyticsSummary;
  salesByDay: SalesPeriodMetric[];
  salesByMonth: SalesPeriodMetric[];
  ordersByStatus: CountMetric[];
  paymentsByStatus: CountMetric[];
  orderStatusOverview: OrderStatusOverview;
  topProducts: ProductSalesMetric[];
  salesByCategory: ProductSalesMetric[];
  yearlyOrderActivity: YearlyOrderActivityMetric;
  salesByAgent: AgentSalesMetric[];
  pendingCustomerBalances: PendingCustomerBalanceMetric[];
};

const orderStatuses = ["pending", "processing", "closed"] as const;

const paymentStatuses = ["unpaid", "partial", "paid", "refunded"] as const;

const monthShortLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function orderActivityCellOpacity(orderCount: number, maxOrderCount: number): number {
  if (orderCount <= 0 || maxOrderCount <= 0) {
    return 0;
  }

  const minOpacity = 0.22;
  const maxOpacity = 1;
  const normalized = orderCount / maxOrderCount;

  return minOpacity + (maxOpacity - minOpacity) * normalized;
}

function isCompletedPaidOrder(order: AdminOrder): boolean {
  return order.order_status === "closed" && order.payment_status === "paid";
}

function isProcessingReceivable(order: AdminOrder): boolean {
  return order.order_status === "processing" && orderBalance(order) > 0;
}

function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function orderStatusAt(
  order: AdminOrder,
  at: Date,
): AdminOrder["order_status"] | null {
  const atTime = at.getTime();

  if (new Date(order.created_at).getTime() > atTime) {
    return null;
  }

  const latestHistory = order.customer_order_status_history
    .filter((entry) => new Date(entry.changed_at).getTime() <= atTime)
    .sort(
      (left, right) =>
        new Date(right.changed_at).getTime() - new Date(left.changed_at).getTime(),
    )[0];

  if (latestHistory) {
    return latestHistory.to_status;
  }

  if (new Date(order.updated_at).getTime() <= atTime) {
    return order.order_status;
  }

  return "pending";
}

function orderPaymentTotalAt(order: AdminOrder, at: Date): number {
  const atTime = at.getTime();

  return roundCurrency(
    order.payment
      .filter((payment) => new Date(payment.created_at).getTime() <= atTime)
      .reduce((total, payment) => total + payment.amount, 0),
  );
}

function processingReceivableAt(orders: AdminOrder[], at: Date): number {
  return roundCurrency(
    orders
      .filter((order) => orderStatusAt(order, at) === "processing")
      .reduce((total, order) => {
        const balance = Math.max(
          roundCurrency(
            orderReceivableTotal(order, "final_quantity") - orderPaymentTotalAt(order, at),
          ),
          0,
        );

        return total + balance;
      }, 0),
  );
}

export function buildMetricTrend(
  currentValue: number,
  previousValue: number,
): DashboardMetricTrend {
  const difference = roundCurrency(currentValue - previousValue);

  return {
    previousValue,
    difference,
    direction: difference > 0 ? "up" : difference < 0 ? "down" : "flat",
    tooltip: "",
  };
}

function buildReceivablePaymentsTrend(
  currentValue: number,
  previousValue: number,
): DashboardMetricTrend {
  const trend = buildMetricTrend(currentValue, previousValue);
  const diffLabel = formatSignedMetricTrendDiff(trend.difference, formatWholeCurrency);

  return {
    ...trend,
    tooltip: `${diffLabel} compared to the previous 30 days. Current receivable: ${formatWholeCurrency(currentValue)}; 30 days ago: ${formatWholeCurrency(previousValue)}. Based on processing orders with unpaid balance.`,
  };
}

export function buildAdminAnalytics(
  data: AdminDashboardData,
  now = new Date(),
): AdminAnalytics {
  const completedPaidOrders = data.orders.filter(isCompletedPaidOrder);
  const agentOrders = data.orders.filter((order) => getAnalyticsAgentId(order) !== null);
  const currentMonth = monthIdentifier(now);
  const currentDay = dayIdentifier(now);
  const pendingOrderPayments = roundCurrency(data.orders
    .filter(isProcessingReceivable)
    .reduce((total, order) => total + orderBalance(order), 0));
  const pendingOrderPaymentsPrevious = processingReceivableAt(
    data.orders,
    subtractDays(now, 30),
  );

  return {
    summary: {
      grossSales: roundCurrency(completedPaidOrders.reduce(
        (total, order) => total + orderTotal(order, "final_quantity"),
        0,
      )),
      netIncome: roundCurrency(completedPaidOrders.reduce(
        (total, order) => total + orderReceivableTotal(order, "final_quantity"),
        0,
      )),
      totalPaidAmount: roundCurrency(data.orders.reduce((total, order) => total + orderPaymentTotal(order), 0)),
      outstandingBalance: roundCurrency(data.orders
        .filter(isOutstandingBalanceOrder)
        .reduce((total, order) => total + orderBalance(order), 0)),
      pendingOrderPayments,
      pendingOrderPaymentsTrend: buildReceivablePaymentsTrend(
        pendingOrderPayments,
        pendingOrderPaymentsPrevious,
      ),
      orderCount: data.orders.length,
      newResellerApplications: data.resellerApplications.filter(
        (application) => application.application_status === "submitted",
      ).length,
      newContactInquiries: data.contactInquiries.filter((inquiry) => inquiry.inquiry_status === "new").length,
      agentMonthlyEarnings: roundCurrency(agentOrders
        .filter((order) => monthIdentifier(new Date(order.created_at)) === currentMonth)
        .reduce((total, order) => total + orderEarnedCommission(order), 0)),
      agentEarnedToday: roundCurrency(agentOrders
        .filter((order) => dayIdentifier(new Date(order.created_at)) === currentDay)
        .reduce((total, order) => total + orderEarnedCommission(order), 0)),
      agentExpectedCommission: roundCurrency(agentOrders
        .filter((order) => order.payment_status === "unpaid" || order.payment_status === "partial")
        .reduce((total, order) => total + Math.max(orderExpectedCommission(order) - orderEarnedCommission(order), 0), 0)),
      assignedCustomerCount: data.customers.filter((customer) => customer.assigned_agent_id).length,
    },
    salesByDay: Array.from(buildSalesPeriods(completedPaidOrders, "day").values()).sort(byLabel),
    salesByMonth: Array.from(buildSalesPeriods(completedPaidOrders, "month").values()).sort(byLabel),
    ordersByStatus: orderStatuses.map((status) => ({
      label: status,
      count: data.orders.filter((order) => order.order_status === status).length,
    })),
    paymentsByStatus: paymentStatuses.map((status) => ({
      label: status,
      count: data.orders.filter((order) => order.payment_status === status).length,
    })),
    orderStatusOverview: buildOrderStatusOverview(data, now),
    topProducts: buildProductSales(data, completedPaidOrders).slice(0, 5),
    salesByCategory: buildCategorySales(data, completedPaidOrders),
    yearlyOrderActivity: buildYearlyOrderActivity(data, now),
    salesByAgent: buildAgentSales(data),
    pendingCustomerBalances: buildPendingCustomerBalances(data),
  };
}

function buildOrderStatusOverview(
  data: AdminDashboardData,
  now: Date,
): OrderStatusOverview {
  return {
    totalOrders: data.summary.totalOrders,
    statuses: [
      {
        key: "pending_order",
        label: "Pending Order",
        count: data.summary.pendingOrder,
        color: "#f97316",
      },
      {
        key: "pending_customers",
        label: "Pending Customer",
        count: data.summary.pendingCustomer,
        color: "#ecb55d",
      },
      {
        key: "processing",
        label: "Processing",
        count: data.summary.processing,
        color: "#2563eb",
      },
      {
        key: "closed",
        label: "Closed",
        count: data.summary.closed,
        color: "#10b981",
      },
    ],
    recentUpdates: buildRecentOrderStatusUpdates(data, now),
  };
}

const orderStatusPresentation: Record<
  string,
  Pick<OrderStatusOverviewMetric, "label" | "color">
> = {
  pending: { label: "Pending Order", color: "#f97316" },
  pending_order: { label: "Pending Order", color: "#f97316" },
  pending_customers: { label: "Pending Customer", color: "#ecb55d" },
  processing: { label: "Processing", color: "#2563eb" },
  closed: { label: "Closed", color: "#10b981" },
};

export function formatOrderStatusRelativeUpdate(
  value: string,
  now = new Date(),
): string {
  const differenceMs = now.getTime() - new Date(value).getTime();

  if (differenceMs < 60_000) {
    return "Just now";
  }

  const minutes = Math.floor(differenceMs / 60_000);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days}d ago`;
  }

  return formatDate(value);
}

function buildRecentOrderStatusUpdates(
  data: AdminDashboardData,
  now: Date,
): OrderStatusRecentUpdate[] {
  const customerUpdates = data.orders.map((order) => ({
    id: order.id,
    updatedAt: order.updated_at,
    orderStatus: order.order_status,
    partyLabel: fullName(
      order.customer ?? data.customers.find((customer) => customer.id === order.customer_id) ?? null,
    ),
    href: `/admin/orders/customer/${order.id}`,
  }));
  const agentUpdates = data.agentOrders.map((order) => ({
    id: order.id,
    updatedAt: order.updated_at,
    orderStatus: order.order_status,
    partyLabel: getAgentOrderPartyLabel(order, data),
    href: `/admin/orders/agent/${order.id}`,
  }));

  return [...customerUpdates, ...agentUpdates]
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )
    .slice(0, 2)
    .map((update) => {
      const presentation = orderStatusPresentation[update.orderStatus] ?? {
        label: update.orderStatus,
        color: "#6b7280",
      };

      return {
        id: update.id,
        orderCode: formatOrderCode(update.id),
        partyLabel: update.partyLabel,
        statusLabel: presentation.label,
        statusColor: presentation.color,
        updatedAt: update.updatedAt,
        updatedLabel: formatOrderStatusRelativeUpdate(update.updatedAt, now),
        href: update.href,
      };
    });
}

function getAgentOrderPartyLabel(
  order: AdminAgentOrder,
  data: AdminDashboardData,
): string {
  return order.agent?.display_name
    ?? data.agents.find((agent) => agent.id === order.agent_id)?.display_name
    ?? "Unassigned agent";
}

function buildSalesPeriods(
  orders: AdminOrder[],
  period: "day" | "month",
): Map<string, SalesPeriodMetric> {
  return orders.reduce((metrics, order) => {
    const label = period === "day"
      ? dayIdentifier(new Date(order.created_at))
      : monthIdentifier(new Date(order.created_at));
    const current = metrics.get(label) ?? { label, orderCount: 0, grossSales: 0 };

    metrics.set(label, {
      label,
      orderCount: current.orderCount + 1,
      grossSales: roundCurrency(current.grossSales + orderTotal(order, "final_quantity")),
    });

    return metrics;
  }, new Map<string, SalesPeriodMetric>());
}

function buildProductSales(
  data: AdminDashboardData,
  orders: AdminOrder[],
): ProductSalesMetric[] {
  const metrics = new Map<string, ProductSalesMetric>();

  for (const order of orders) {
    for (const item of order.customer_order_item) {
      const label = item.product?.name ?? productName(data, item.product_id);
      const current = metrics.get(item.product_id) ?? {
        label,
        quantitySold: 0,
        grossSales: 0,
      };

      metrics.set(item.product_id, {
        label: current.label,
        quantitySold: roundQuantity(current.quantitySold + item.final_quantity),
        grossSales: roundCurrency(current.grossSales + item.final_quantity * item.unit_price),
      });
    }
  }

  return Array.from(metrics.values()).sort((left, right) => right.grossSales - left.grossSales);
}

function buildCategorySales(
  data: AdminDashboardData,
  orders: AdminOrder[],
): ProductSalesMetric[] {
  const metrics = new Map<string, ProductSalesMetric>();

  for (const order of orders) {
    for (const item of order.customer_order_item) {
      const label = productCategory(data, item.product_id);
      const current = metrics.get(label) ?? {
        label,
        quantitySold: 0,
        grossSales: 0,
      };

      metrics.set(label, {
        label,
        quantitySold: roundQuantity(current.quantitySold + item.final_quantity),
        grossSales: roundCurrency(current.grossSales + item.final_quantity * item.unit_price),
      });
    }
  }

  return Array.from(metrics.values()).sort((left, right) => right.grossSales - left.grossSales);
}

function buildAgentSales(data: AdminDashboardData): AgentSalesMetric[] {
  const metrics = new Map<string, AgentSalesMetric>();

  for (const order of data.orders) {
    const agentId = getAnalyticsAgentId(order);

    if (!agentId) continue;

    const label = getAnalyticsAgentLabel(order, data, agentId)
      ?? "Unassigned agent";
    const current = metrics.get(agentId) ?? {
      label,
      orderCount: 0,
      grossSales: 0,
      paidAmount: 0,
      earnedCommission: 0,
      expectedCommission: 0,
    };

    metrics.set(agentId, {
      label: current.label,
      orderCount: current.orderCount + 1,
      grossSales: roundCurrency(
        current.grossSales + (isCompletedPaidOrder(order)
          ? orderTotal(order, "final_quantity")
          : 0),
      ),
      paidAmount: roundCurrency(current.paidAmount + orderPaymentTotal(order)),
      earnedCommission: roundCurrency(current.earnedCommission + orderEarnedCommission(order)),
      expectedCommission: roundCurrency(current.expectedCommission + Math.max(
        orderExpectedCommission(order) - orderEarnedCommission(order),
        0,
      )),
    });
  }

  return Array.from(metrics.values()).sort((left, right) => right.grossSales - left.grossSales);
}

function buildYearlyOrderActivity(
  data: AdminDashboardData,
  now: Date,
): YearlyOrderActivityMetric {
  const dailyCounts = buildDailyOrderCounts(data);
  const defaultYear = now.getUTCFullYear();
  const availableYears = buildAvailableYears(dailyCounts, defaultYear);
  const years = availableYears.reduce<Record<number, YearlyOrderActivityYearMetric>>(
    (result, year) => ({
      ...result,
      [year]: buildYearlyOrderActivityYear(year, dailyCounts),
    }),
    {},
  );

  return {
    defaultYear,
    availableYears,
    years,
  };
}

function buildDailyOrderCounts(data: AdminDashboardData): Map<string, number> {
  const counts = new Map<string, number>();

  for (const order of data.orders) {
    const dateKey = dayIdentifier(new Date(order.created_at));
    counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1);
  }

  return counts;
}

function buildAvailableYears(
  dailyCounts: Map<string, number>,
  defaultYear: number,
): number[] {
  const years = new Set<number>([defaultYear]);

  for (const dateKey of dailyCounts.keys()) {
    years.add(Number(dateKey.slice(0, 4)));
  }

  return Array.from(years).sort((left, right) => right - left);
}

function buildYearlyOrderActivityYear(
  year: number,
  dailyCounts: Map<string, number>,
): YearlyOrderActivityYearMetric {
  let maxOrderCount = 0;
  let totalOrders = 0;
  const months = monthShortLabels.map((label, monthIndex) => {
    const month = monthIndex + 1;
    const firstDay = new Date(Date.UTC(year, monthIndex, 1));
    const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const startPadding = (firstDay.getUTCDay() + 6) % 7;
    const cells: YearlyOrderActivityCellMetric[] = [];

    for (let index = 0; index < startPadding; index += 1) {
      cells.push({
        date: null,
        dayOfMonth: null,
        orderCount: 0,
        isPadding: true,
      });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const orderCount = dailyCounts.get(date) ?? 0;

      maxOrderCount = Math.max(maxOrderCount, orderCount);
      totalOrders += orderCount;

      cells.push({
        date,
        dayOfMonth: day,
        orderCount,
        isPadding: false,
      });
    }

    while (cells.length % 7 !== 0) {
      cells.push({
        date: null,
        dayOfMonth: null,
        orderCount: 0,
        isPadding: true,
      });
    }

    return {
      label,
      month,
      rows: cells.length / 7,
      cells,
    };
  });

  return {
    year,
    maxOrderCount,
    totalOrders,
    months,
  };
}

function buildPendingCustomerBalances(data: AdminDashboardData): PendingCustomerBalanceMetric[] {
  const metrics = new Map<string, PendingCustomerBalanceMetric>();

  for (const order of data.orders) {
    const balance = roundCurrency(orderBalance(order));

    if (balance <= 0 || !isProcessingReceivable(order)) continue;

    const customerId = order.customer_id;
    if (!customerId) continue;

    const customer = order.customer ?? data.customers.find((item) => item.id === customerId) ?? null;
    const grossTotal = roundCurrency(orderTotal(order, "final_quantity"));
    const commissionTotal = roundCurrency(orderCommissionTotal(order));
    const receivableTotal = roundCurrency(orderReceivableTotal(order, "final_quantity"));
    const paidTotal = roundCurrency(orderPaymentTotal(order));
    const orderMetric: PendingCustomerBalanceOrderMetric = {
      orderId: order.id,
      orderCode: `Order-${order.id.slice(0, 6).toUpperCase()}`,
      createdAt: order.created_at,
      grossTotal,
      commissionTotal,
      receivableTotal,
      paidTotal,
      unpaidBalance: balance,
      hasCommissionAdjustment: commissionTotal > 0,
    };
    const current = metrics.get(customerId) ?? {
      customerId,
      customerName: fullName(customer),
      orderCount: 0,
      unpaidBalance: 0,
      grossTotal: 0,
      commissionTotal: 0,
      receivableTotal: 0,
      paidTotal: 0,
      orders: [],
    };

    metrics.set(customerId, {
      customerId,
      customerName: current.customerName,
      orderCount: current.orderCount + 1,
      unpaidBalance: roundCurrency(current.unpaidBalance + balance),
      grossTotal: roundCurrency(current.grossTotal + grossTotal),
      commissionTotal: roundCurrency(current.commissionTotal + commissionTotal),
      receivableTotal: roundCurrency(current.receivableTotal + receivableTotal),
      paidTotal: roundCurrency(current.paidTotal + paidTotal),
      orders: [...current.orders, orderMetric],
    });
  }

  return Array.from(metrics.values())
    .map((customer) => ({
      ...customer,
      orders: [...customer.orders].sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      ),
    }))
    .sort((left, right) => (
      right.unpaidBalance - left.unpaidBalance ||
      left.customerName.localeCompare(right.customerName)
    ));
}

function getAnalyticsAgentId(order: AdminOrder): string | null {
  return order.agent_id
    ?? order.agent?.id
    ?? null;
}

function getAnalyticsAgentLabel(
  order: AdminOrder,
  data: AdminDashboardData,
  agentId: string,
): string | null {
  return order.agent?.display_name
    ?? data.agents.find((agent) => agent.id === agentId)?.display_name
    ?? null;
}

function orderExpectedCommission(order: AdminOrder): number {
  return orderCommissionTotal(order);
}

function orderEarnedCommission(order: AdminOrder): number {
  const invoiceTotal = orderReceivableTotal(order, "final_quantity");
  const expectedCommission = orderExpectedCommission(order);

  if (invoiceTotal <= 0) return 0;

  return roundCurrency(expectedCommission * Math.min(orderPaymentTotal(order) / invoiceTotal, 1));
}

function isOutstandingBalanceOrder(order: AdminOrder): boolean {
  return order.order_status !== "closed" || order.payment_status !== "paid";
}

function productName(data: AdminDashboardData, productId: string): string {
  return data.products.find((product) => product.id === productId)?.name ?? "Unknown product";
}

function productCategory(data: AdminDashboardData, productId: string): string {
  return data.products.find((product) => product.id === productId)?.category ?? "uncategorized";
}

function monthIdentifier(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dayIdentifier(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function byLabel(left: { label: string }, right: { label: string }): number {
  return left.label.localeCompare(right.label);
}
