type AgentOrderDistributionItem = {
  product_id: string;
  quantity: number;
};

type AgentOrderDistributionCustomerOrder = {
  order_status: string;
  customer_order_item: Array<{
    product_id: string;
    partial_quantity: number;
    agent_order_quantity_increase?: number | null;
    unit_price?: number | null;
  }>;
};

export type AgentOrderDistributionSource = {
  agent_order_item: AgentOrderDistributionItem[];
  customer_order: AgentOrderDistributionCustomerOrder[];
};

export type AgentOrderProductDistribution = {
  productId: string;
  totalQuantity: number;
  approvedDistributedQuantity: number;
  remainingQuantity: number;
  pendingQuantityIncrease: number;
  displayQuantity: number;
};

export function isApprovedCustomerOrderStatus(orderStatus: string) {
  return orderStatus !== "pending";
}

export type AgentOrderAttachEligibilitySource = {
  order_status: string;
  customer_order: Array<{ payment_status: string }>;
};

export function isAgentOrderCompletedAndPaid(order: AgentOrderAttachEligibilitySource) {
  if (order.order_status !== "closed" || order.customer_order.length === 0) {
    return false;
  }

  return order.customer_order.every((customerOrder) => customerOrder.payment_status === "paid");
}

export function canAttachCustomerToAgentOrder(order: AgentOrderAttachEligibilitySource) {
  if (order.order_status === "pending_order") {
    return false;
  }

  return !isAgentOrderCompletedAndPaid(order);
}

export function sumApprovedDistributedQuantity(
  agentOrder: AgentOrderDistributionSource,
  productId: string,
) {
  return agentOrder.customer_order.reduce((total, customerOrder) => {
    if (!isApprovedCustomerOrderStatus(customerOrder.order_status)) {
      return total;
    }

    return total + customerOrder.customer_order_item.reduce((itemTotal, item) => {
      return item.product_id === productId
        ? itemTotal + Number(item.partial_quantity ?? 0)
        : itemTotal;
    }, 0);
  }, 0);
}

export function sumPendingQuantityIncrease(
  agentOrder: AgentOrderDistributionSource,
  productId: string,
) {
  return agentOrder.customer_order.reduce((total, customerOrder) => {
    if (customerOrder.order_status !== "pending") {
      return total;
    }

    return total + customerOrder.customer_order_item.reduce((itemTotal, item) => {
      if (item.product_id !== productId) {
        return itemTotal;
      }

      return itemTotal + Number(item.agent_order_quantity_increase ?? 0);
    }, 0);
  }, 0);
}

export function buildAgentOrderProductDistributions(
  agentOrder: AgentOrderDistributionSource,
): AgentOrderProductDistribution[] {
  const productIds = new Set(agentOrder.agent_order_item.map((item) => item.product_id));

  for (const customerOrder of agentOrder.customer_order) {
    for (const item of customerOrder.customer_order_item) {
      productIds.add(item.product_id);
    }
  }

  return [...productIds].map((productId) => {
    const agentItem = agentOrder.agent_order_item.find((item) => item.product_id === productId);
    const totalQuantity = Number(agentItem?.quantity ?? 0);
    const approvedDistributedQuantity = sumApprovedDistributedQuantity(agentOrder, productId);
    const pendingQuantityIncrease = sumPendingQuantityIncrease(agentOrder, productId);
    const remainingQuantity = Math.max(totalQuantity - approvedDistributedQuantity, 0);

    return {
      productId,
      totalQuantity,
      approvedDistributedQuantity,
      remainingQuantity,
      pendingQuantityIncrease,
      displayQuantity: totalQuantity + pendingQuantityIncrease,
    };
  });
}

export function getAgentOrderProductDistribution(
  agentOrder: AgentOrderDistributionSource,
  productId: string,
) {
  return buildAgentOrderProductDistributions(agentOrder).find(
    (distribution) => distribution.productId === productId,
  ) ?? {
    productId,
    totalQuantity: 0,
    approvedDistributedQuantity: 0,
    remainingQuantity: 0,
    pendingQuantityIncrease: 0,
    displayQuantity: 0,
  };
}

export function canDecreaseAgentOrderItemQuantity(input: {
  currentQuantity: number;
  newQuantity: number;
  approvedDistributedQuantity: number;
}) {
  if (input.newQuantity >= input.currentQuantity) {
    return false;
  }

  const remainingQuantity = Math.max(
    input.currentQuantity - input.approvedDistributedQuantity,
    0,
  );

  return input.currentQuantity - input.newQuantity <= remainingQuantity;
}

export function minimumAgentOrderItemQuantity(approvedDistributedQuantity: number) {
  return Math.max(approvedDistributedQuantity, 0);
}

export function formatAgentOrderDistributionStatus(input: {
  remainingQuantity: number;
  unitLabel: string;
}) {
  if (input.remainingQuantity <= 0) {
    return "Fully Distributed";
  }

  return `${input.remainingQuantity} ${input.unitLabel} remaining for distribution`;
}

export function sumPendingCustomerOrderAmount(
  agentOrder: AgentOrderDistributionSource,
) {
  return agentOrder.customer_order.reduce((total, customerOrder) => {
    if (customerOrder.order_status !== "pending") {
      return total;
    }

    return total + customerOrder.customer_order_item.reduce((itemTotal, item) => {
      const quantity = Number(item.partial_quantity ?? 0);
      const unitPrice = Number(item.unit_price ?? 0);
      return itemTotal + quantity * unitPrice;
    }, 0);
  }, 0);
}

export function formatPendingIndicator(value: number, formatter: (value: number) => string) {
  if (value <= 0) {
    return null;
  }

  return `+${formatter(value)}`;
}

export function buildAttachCustomerProductOptions(input: {
  agentOrder: AgentOrderDistributionSource;
  products: Array<{
    id: string;
    name: string;
    unit_label: string;
    default_price: number;
    is_active?: boolean;
  }>;
}) {
  const distributions = buildAgentOrderProductDistributions(input.agentOrder);
  const distributionByProductId = new Map(
    distributions.map((distribution) => [distribution.productId, distribution]),
  );

  return input.products
    .filter((product) => product.is_active !== false)
    .map((product) => ({
      id: product.id,
      name: product.name,
      unitLabel: product.unit_label,
      defaultPrice: product.default_price,
      remainingQuantity: distributionByProductId.get(product.id)?.remainingQuantity ?? 0,
    }));
}
