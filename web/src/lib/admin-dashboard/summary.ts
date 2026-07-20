import type { AdminAgentOrder, AdminOrder } from "./data";

export type AdminOrderStatusCounts = {
  totalOrders: number;
  pendingOrders: number;
  processingOrders: number;
};

type OrderStatusRow = Pick<AdminOrder, "order_status">;
type AgentOrderStatusRow = Pick<AdminAgentOrder, "order_status">;

export function computeAdminOrderStatusCounts(
  customerOrders: readonly OrderStatusRow[],
  agentOrders: readonly AgentOrderStatusRow[],
): AdminOrderStatusCounts {
  const customerPending = customerOrders.filter((order) => order.order_status === "pending").length;
  const customerProcessing = customerOrders.filter((order) => order.order_status === "processing").length;
  const agentPending = agentOrders.filter(
    (order) => order.order_status === "pending_customers" || order.order_status === "pending_order",
  ).length;
  const agentProcessing = agentOrders.filter((order) => order.order_status === "processing").length;

  return {
    totalOrders: customerOrders.length + agentOrders.length,
    pendingOrders: customerPending + agentPending,
    processingOrders: customerProcessing + agentProcessing,
  };
}
