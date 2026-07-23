import type { APIContext } from "astro";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { throwLoadError } from "@/lib/load-error";
import {
  agentWithProfileSelect,
  customerWithProfileSelect,
  mapAgentWithProfile,
  mapCustomerWithProfile,
  mapNestedOrderCustomer,
  profileIdentitySelect,
} from "@/lib/profile-identity";
import type { InvoiceStatus, OrderStatus, ProductCategory, StockStatus } from "@/lib/admin-dashboard/actions";
import { buildAgentPaymentSummary, buildAgentSummary, isAgentMyOrder } from "./view";

type AgentDashboardContext = Pick<APIContext, "cookies" | "request">;
type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

const agentOrderSelect = `
  id,
  agent_order_id,
  converted_to_agent_order_id,
  customer_id,
  agent_id,
  source,
  order_status,
  payment_status,
  release_date,
  sale_date,
  approved_at,
  created_at,
  updated_at,
  customer:customer_id (
    id,
    is_reseller,
    profile:profile_id (${profileIdentitySelect})
  ),
  customer_order_item (
    id,
    product_id,
    partial_quantity,
    final_quantity,
    unit_price,
    price_type,
    add_details,
    agent_order_quantity_increase,
    agent_commission_amount,
    agent_commission_paid,
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
    payment_terms,
    payment_date,
    reference_number,
    notes,
    created_at
  ),
  agent_received_payment (
    id,
    order_id,
    agent_id,
    amount,
    payment_method,
    payment_terms,
    payment_date,
    reference_number,
    notes,
    status,
    confirmed_at,
    created_at,
    updated_at
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

const agentOrderClusterSelect = `
  id,
  agent_id,
  order_status,
  release_date,
  sale_date,
  notes,
  submitted_by,
  admin_read_at,
  admin_read_by,
  created_at,
  updated_at,
  agent_order_item (
    id,
    product_id,
    quantity,
    add_details,
    agent_commission_amount,
    agent_commission_updated_by,
    agent_commission_updated_at,
    created_at,
    updated_at,
    product:product_id (
      id,
      name,
      unit_label,
      default_price
    )
  ),
  customer_order!customer_order_agent_order_id_fkey (
    id,
    agent_order_id,
    converted_to_agent_order_id,
    customer_id,
    agent_id,
    source,
    order_status,
    payment_status,
    release_date,
    sale_date,
    approved_at,
    created_at,
    updated_at,
    customer:customer_id (
      id,
      is_reseller,
      profile:profile_id (${profileIdentitySelect})
    ),
    customer_order_item (
      id,
      product_id,
      partial_quantity,
      final_quantity,
      unit_price,
      price_type,
      add_details,
      agent_order_quantity_increase,
      agent_commission_amount,
      agent_commission_paid,
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
      payment_terms,
      payment_date,
      reference_number,
      notes,
      created_at
    ),
    agent_received_payment (
      id,
      order_id,
      agent_id,
      amount,
      payment_method,
      payment_terms,
      payment_date,
      reference_number,
      notes,
      status,
      confirmed_at,
      created_at,
      updated_at
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
  )
`;

export type AgentProfile = {
  id: string;
  user_id: string;
  customer_id: string | null;
  employee_id: string | null;
  first_name: string;
  last_name: string;
  display_name: string;
  contact: string | null;
  email: string | null;
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
  credit_limit: number;
  credit_limit_exceeded: boolean;
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
  agent_order_quantity_increase?: number;
  agent_commission_amount: number;
  agent_commission_paid: boolean;
  product: Pick<AgentProduct, "id" | "name" | "unit_label" | "default_price"> | null;
};

export type AgentPayment = {
  id: string;
  amount: number;
  payment_method: string;
  payment_terms: string;
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

export type AgentReceivedPayment = {
  id: string;
  order_id: string;
  agent_id: string;
  amount: number;
  payment_method: string;
  payment_terms: string;
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  status: "pending_admin_confirmation" | "confirmed" | "rejected";
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentOrderClusterStatus =
  | "pending_customers"
  | "pending_order"
  | "processing"
  | "closed";

export type AgentOrderClusterItem = {
  id: string;
  product_id: string;
  quantity: number;
  add_details: string | null;
  agent_commission_amount: number;
  agent_commission_updated_by: string | null;
  agent_commission_updated_at: string | null;
  created_at: string;
  updated_at: string;
  product: Pick<AgentProduct, "id" | "name" | "unit_label" | "default_price"> | null;
};

export type AgentOrder = {
  id: string;
  agent_order_id?: string | null;
  converted_to_agent_order_id?: string | null;
  customer_id: string;
  agent_id: string | null;
  source: "guest_shop" | "agent_submitted" | "admin_manual";
  order_status: OrderStatus;
  payment_status: "unpaid" | "partial" | "paid" | "refunded";
  release_date?: string | null;
  sale_date?: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  customer: AgentOrderCustomer | null;
  customer_order_item: AgentOrderItem[];
  payment: AgentPayment[];
  agent_received_payment?: AgentReceivedPayment[];
  invoice: AgentInvoice[];
  customer_order_status_history: AgentOrderStatusHistory[];
};

export type AgentOrderCluster = {
  id: string;
  agent_id: string;
  order_status: AgentOrderClusterStatus;
  release_date?: string | null;
  sale_date?: string | null;
  notes: string | null;
  submitted_by: string | null;
  admin_read_at?: string | null;
  admin_read_by?: string | null;
  created_at: string;
  updated_at: string;
  agent_order_item: AgentOrderClusterItem[];
  customer_order: AgentOrder[];
};

export type AgentCustomerRegistrationLink = {
  id: string;
  token: string;
  expires_at: string;
  created_at: string;
  use_count: number;
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
  agentOrders: AgentOrderCluster[];
  registrationLinks: AgentCustomerRegistrationLink[];
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
  const [customers, products, agentOrders, registrationLinks, orders] = await Promise.all([
    loadAssignedCustomers(supabase),
    loadActiveProducts(supabase),
    loadAccessibleAgentOrders(supabase),
    loadAgentRegistrationLinks(supabase),
    loadAccessibleOrders(supabase),
  ]);

  const myOrders = orders.filter((order) => isAgentMyOrder(order, agent));

  return {
    agent,
    customers,
    products,
    agentOrders,
    registrationLinks,
    orders,
    summary: buildAgentSummary({ agent, customers, agentOrders, orders: myOrders }),
    paymentSummary: buildAgentPaymentSummary(myOrders),
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

  if (error) throwLoadError("Unable to load agent order.", error);

  return data ? normalizeAgentOrder(data) : null;
}

async function loadAgentProfile(supabase: SupabaseServerClient, userId: string) {
  const [{ data, error }, { data: authData, error: authError }] = await Promise.all([
    supabase
      .from("agent")
      .select(agentWithProfileSelect)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (error) throwLoadError("Unable to load agent profile.", error);
  if (!data) throw new Error("Active agent profile was not found.");

  const email =
    authError || authData.user?.id !== userId ? null : authData.user.email ?? null;

  return mapAgentWithProfile(
    data as Parameters<typeof mapAgentWithProfile>[0],
    email,
  ) as AgentProfile;
}

async function loadAssignedCustomers(supabase: SupabaseServerClient) {
  const { data, error } = await supabase
    .from("customer")
    .select(customerWithProfileSelect)
    .order("created_at", { ascending: false });

  if (error) throwLoadError("Unable to load assigned customers.", error);

  return ((data ?? []) as Parameters<typeof mapCustomerWithProfile>[0][]).map((row) =>
    mapCustomerWithProfile(row),
  ) as AgentCustomer[];
}

async function loadActiveProducts(supabase: SupabaseServerClient) {
  const { data, error } = await supabase
    .from("product")
    .select("id, name, category, description, unit_label, default_price, stock_status, image_path, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throwLoadError("Unable to load active products.", error);

  return (data ?? []) as AgentProduct[];
}

async function loadAccessibleOrders(supabase: SupabaseServerClient) {
  const { data, error } = await supabase
    .from("customer_order")
    .select(agentOrderSelect)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throwLoadError("Unable to load agent orders.", error);

  return ((data ?? []) as unknown[]).map(normalizeAgentOrder);
}

async function loadAccessibleAgentOrders(supabase: SupabaseServerClient) {
  const { data, error } = await supabase
    .from("agent_order")
    .select(agentOrderClusterSelect)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throwLoadError("Unable to load agent orders.", error);

  return ((data ?? []) as unknown[]).map(normalizeAgentOrderCluster);
}

async function loadAgentRegistrationLinks(supabase: SupabaseServerClient) {
  const { data, error } = await supabase
    .from("customer_registration_link")
    .select("id, token, expires_at, created_at, use_count")
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throwLoadError("Unable to load customer registration links.", error);

  return (data ?? []) as AgentCustomerRegistrationLink[];
}

function normalizeAgentOrder(order: unknown): AgentOrder {
  const raw = order as Record<string, unknown>;
  const agentOrder = order as AgentOrder;

  const normalizedCustomer = raw.customer
    ? (() => {
        const mapped = mapNestedOrderCustomer(raw.customer as Parameters<typeof mapNestedOrderCustomer>[0]);
        return {
          id: mapped.id,
          first_name: mapped.first_name,
          last_name: mapped.last_name,
          phone_number: mapped.phone_number,
          email: mapped.email,
          address: mapped.address,
          is_reseller: mapped.is_reseller,
        };
      })()
    : null;

  return {
    ...agentOrder,
    customer: normalizedCustomer,
    customer_order_item: Array.isArray(agentOrder.customer_order_item) ? agentOrder.customer_order_item : [],
    payment: Array.isArray(agentOrder.payment) ? agentOrder.payment : [],
    agent_received_payment: Array.isArray(agentOrder.agent_received_payment)
      ? agentOrder.agent_received_payment
      : [],
    invoice: normalizeRelationArray(agentOrder.invoice),
    customer_order_status_history: Array.isArray(agentOrder.customer_order_status_history)
      ? agentOrder.customer_order_status_history
      : [],
  };
}

function normalizeAgentOrderCluster(order: unknown): AgentOrderCluster {
  const agentOrder = order as AgentOrderCluster;

  return {
    ...agentOrder,
    agent_order_item: Array.isArray(agentOrder.agent_order_item) ? agentOrder.agent_order_item : [],
    customer_order: Array.isArray(agentOrder.customer_order)
      ? agentOrder.customer_order.map(normalizeAgentOrder)
      : [],
  };
}

function normalizeRelationArray<T>(value: T[] | T | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}
