import type { AdminAgent, AdminCustomer } from "./data";

type CustomerPaymentNotice = "" | "unpaid" | "partial";

export type AdminOrderCustomerTargetOption = {
  type: "customer";
  customer: AdminCustomer;
  label: string;
  paymentNotice: CustomerPaymentNotice;
  balance: number;
  creditLimit: number;
  creditExceeded: boolean;
};

export type AdminOrderAgentTargetOption = {
  type: "agent";
  agent: AdminAgent;
  label: string;
};

export type AdminOrderTargetOption =
  | AdminOrderCustomerTargetOption
  | AdminOrderAgentTargetOption;

export function buildAdminOrderTargetOptions(input: {
  customers: AdminCustomer[];
  agents: AdminAgent[];
  customerPaymentNoticeById?: ReadonlyMap<string, CustomerPaymentNotice>;
  customerBalances?: Record<string, number>;
}): AdminOrderTargetOption[] {
  const customerPaymentNoticeById = input.customerPaymentNoticeById ?? new Map();
  const customerBalances = input.customerBalances ?? {};
  const customerTargets = input.customers.map<AdminOrderCustomerTargetOption>((customer) => ({
    type: "customer",
    customer,
    label: fullCustomerName(customer),
    paymentNotice: customerPaymentNoticeById.get(customer.id) ?? "",
    balance: customerBalances[customer.id] ?? 0,
    creditLimit: customer.credit_limit,
    creditExceeded: customer.credit_limit_exceeded,
  }));
  const agentTargets = input.agents
    .filter((agent) => agent.status === "active")
    .map<AdminOrderAgentTargetOption>((agent) => ({
      type: "agent",
      agent,
      label: agent.display_name,
    }));

  return [...customerTargets, ...agentTargets].sort((first, second) =>
    first.label.localeCompare(second.label),
  );
}

function fullCustomerName(customer: Pick<AdminCustomer, "first_name" | "last_name">) {
  return `${customer.first_name} ${customer.last_name}`.trim();
}
