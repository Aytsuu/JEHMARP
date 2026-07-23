import type { AdminAgentOrder, AdminOrder } from "./data";

export type AdminOrderStatusCounts = {
  totalOrders: number;
  pendingOrders: number;
  processingOrders: number;
  pendingOrder: number;
  pendingCustomer: number;
  processing: number;
  closed: number;
};

type OrderStatusRow = Pick<AdminOrder, "order_status">;
type AgentOrderStatusRow = Pick<AdminAgentOrder, "order_status">;

export function computeAdminOrderStatusCounts(
  customerOrders: readonly OrderStatusRow[],
  agentOrders: readonly AgentOrderStatusRow[],
): AdminOrderStatusCounts {
  const customerPending = customerOrders.filter((order) => order.order_status === "pending").length;
  const customerProcessing = customerOrders.filter((order) => order.order_status === "processing").length;
  const customerClosed = customerOrders.filter((order) => order.order_status === "closed").length;
  const agentPendingOrder = agentOrders.filter((order) => order.order_status === "pending_order").length;
  const agentPendingCustomer = agentOrders.filter(
    (order) => order.order_status === "pending_customers",
  ).length;
  const agentProcessing = agentOrders.filter((order) => order.order_status === "processing").length;
  const agentClosed = agentOrders.filter((order) => order.order_status === "closed").length;
  const pendingOrder = customerPending + agentPendingOrder;
  const pendingCustomer = agentPendingCustomer;
  const processing = customerProcessing + agentProcessing;
  const closed = customerClosed + agentClosed;

  return {
    totalOrders: customerOrders.length + agentOrders.length,
    pendingOrders: pendingOrder + pendingCustomer,
    processingOrders: processing,
    pendingOrder,
    pendingCustomer,
    processing,
    closed,
  };
}
