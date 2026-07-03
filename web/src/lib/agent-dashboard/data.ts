import type { APIContext } from "astro";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CommissionStatus, InvoiceStatus, OrderStatus, ProductCategory, StockStatus } from "@/lib/admin-dashboard/actions";
import { buildAgentPaymentSummary, buildAgentSummary } from "./view";

type AgentDashboardContext = Pick<APIContext, "cookies" | "request">;
type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

const agentOrderSelect = `
  id,
  customer_id,
  agent_id,
  source,
  order_status,
  payment_status,
  approved_at,
  created_at,
  updated_at,
  customer:customer_id (
    id,
    first_name,
    last_name,
    phone_number,
    email,
    address,
    is_reseller
  ),
  customer_order_item (
    id,
    product_id,
    partial_quantity,
    final_quantity,
    unit_price,
    price_type,
    add_details,
    agent_commission_amount,
    agent_commission_status,
    agent_commission_notes,
    product:product_id (
      id,
      name,
      unit_label,
      default_price
    )
  ),
  payment (
    id,
    amount,
    payment_method,
    payment_date,
    reference_number,
    notes,
    created_at
  ),
  invoice (
    id,
    order_id,
    invoice_number,
    status,
    issued_at,
    due_at,
    created_at,
    updated_at
  ),
  customer_order_status_history (
    id,
    from_status,
    to_status,
    changed_at,
    notes
  )
`;

export type AgentProfile = {
  id: string;
  user_id: string;
  display_name: string;
  status: "active" | "inactive" | "suspended";
};

export type AgentCustomer = {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  email: string | null;
  address: string;
  assigned_agent_id: string | null;
  is_reseller: boolean;
  created_at: string;
  updated_at: string;
};

export type AgentProduct = {
  id: string;
  name: string;
  category: ProductCategory;
  description: string | null;
  unit_label: string;
  default_price: number;
  stock_status: StockStatus;
  image_path: string | null;
  is_active: boolean;
};

export type AgentOrderCustomer = Pick<
  AgentCustomer,
  "id" | "first_name" | "last_name" | "phone_number" | "email" | "address" | "is_reseller"
>;

export type AgentOrderItem = {
  id: string;
  product_id: string;
  partial_quantity: number;
  final_quantity: number;
  unit_price: number;
  price_type: "retail" | "reseller";
  add_details: string | null;
  agent_commission_amount: number;
  agent_commission_status: CommissionStatus;
  agent_commission_notes: string | null;
  product: Pick<AgentProduct, "id" | "name" | "unit_label" | "default_price"> | null;
};

export type AgentPayment = {
  id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
};

export type AgentInvoice = {
  id: string;
  order_id: string;
  invoice_number: string;
  status: InvoiceStatus;
  issued_at: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentOrderStatusHistory = {
  id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  changed_at: string;
  notes: string | null;
};

export type AgentOrder = {
  id: string;
  customer_id: string;
  agent_id: string | null;
  source: "guest_shop" | "agent_submitted" | "admin_manual";
  order_status: OrderStatus;
  payment_status: "unpaid" | "partial" | "paid" | "refunded" | "void";
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  customer: AgentOrderCustomer | null;
  customer_order_item: AgentOrderItem[];
  payment: AgentPayment[];
  invoice: AgentInvoice[];
  customer_order_status_history: AgentOrderStatusHistory[];
};

export type AgentPaymentSummary = Record<AgentOrder["payment_status"], number>;

export type AgentDashboardSummary = {
  assignedCustomers: number;
  submittedOrders: number;
  monthlyEarnings: number;
  earnedToday: number;
  expectedCommission: number;
  outstandingBalance: number;
};

export type AgentDashboardData = {
  agent: AgentProfile;
  customers: AgentCustomer[];
  products: AgentProduct[];
  orders: AgentOrder[];
  summary: AgentDashboardSummary;
  paymentSummary: AgentPaymentSummary;
};

export async function loadAgentDashboardData(
  context: AgentDashboardContext,
  userId: string,
): Promise<AgentDashboardData> {
  const supabase = createSupabaseServerClient(context);
  const agent = await loadAgentProfile(supabase, userId);
  const [customers, products, orders] = await Promise.all([
    loadAssignedCustomers(supabase),
    loadActiveProducts(supabase),
    loadAccessibleOrders(supabase),
  ]);

  return {
    agent,
    customers,
    products,
    orders,
    summary: buildAgentSummary({ agent, customers, orders }),
    paymentSummary: buildAgentPaymentSummary(orders),
  };
}

export async function loadAgentProfileForUser(
  context: AgentDashboardContext,
  userId: string,
): Promise<AgentProfile> {
  return loadAgentProfile(createSupabaseServerClient(context), userId);
}

export async function loadAgentOrder(
  context: AgentDashboardContext,
  orderId: string,
): Promise<AgentOrder | null> {
  const supabase = createSupabaseServerClient(context);
  const { data, error } = await supabase
    .from("customer_order")
    .select(agentOrderSelect)
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error("Unable to load agent order.");

  return data ? normalizeAgentOrder(data) : null;
}

async function loadAgentProfile(supabase: SupabaseServerClient, userId: string) {
  const { data, error } = await supabase
    .from("agent_profile")
    .select("id, user_id, display_name, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw new Error("Unable to load agent profile.");
  if (!data) throw new Error("Active agent profile was not found.");

  return data as AgentProfile;
}

async function loadAssignedCustomers(supabase: SupabaseServerClient) {
  const { data, error } = await supabase
    .from("customer")
    .select("id, first_name, last_name, phone_number, email, address, assigned_agent_id, is_reseller, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error("Unable to load assigned customers.");

  return (data ?? []) as AgentCustomer[];
}

async function loadActiveProducts(supabase: SupabaseServerClient) {
  const { data, error } = await supabase
    .from("product")
    .select("id, name, category, description, unit_label, default_price, stock_status, image_path, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw new Error("Unable to load active products.");

  return (data ?? []) as AgentProduct[];
}

async function loadAccessibleOrders(supabase: SupabaseServerClient) {
  const { data, error } = await supabase
    .from("customer_order")
    .select(agentOrderSelect)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error("Unable to load agent orders.");

  return ((data ?? []) as unknown[]).map(normalizeAgentOrder);
}

function normalizeAgentOrder(order: unknown): AgentOrder {
  const agentOrder = order as AgentOrder;

  return {
    ...agentOrder,
    customer_order_item: Array.isArray(agentOrder.customer_order_item) ? agentOrder.customer_order_item : [],
    payment: Array.isArray(agentOrder.payment) ? agentOrder.payment : [],
    invoice: normalizeRelationArray(agentOrder.invoice),
    customer_order_status_history: Array.isArray(agentOrder.customer_order_status_history)
      ? agentOrder.customer_order_status_history
      : [],
  };
}

function normalizeRelationArray<T>(value: T[] | T | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}
