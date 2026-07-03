import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import type {
  CommissionStatus,
  InquiryStatus,
  InvoiceStatus,
  OrderStatus,
  PageStatus,
  ProductCategory,
  StockStatus,
} from "./actions";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

const adminOrderSelect = `
  id,
  customer_id,
  agent_id,
  source,
  order_status,
  payment_status,
  discount_amount,
  delivery_fee,
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
  agent:agent_id (
    id,
    display_name
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
  customer_order_update (
    id,
    update_type,
    title,
    details,
    created_at
  ),
  customer_order_status_history (
    id,
    from_status,
    to_status,
    changed_at,
    notes
  )
`;

export type AdminPage = {
  id: string;
  slug: string;
  title: string;
  status: PageStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminPageSection = {
  id: string;
  page_id: string;
  type: string;
  sort_order: number;
  content: Record<string, unknown>;
  status: PageStatus;
  created_at: string;
  updated_at: string;
};

export type AdminProduct = {
  id: string;
  name: string;
  category: ProductCategory;
  description: string | null;
  unit_label: string;
  default_price: number;
  reseller_price: number;
  stock_status: StockStatus;
  image_path: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminAgent = {
  id: string;
  user_id: string;
  display_name: string;
  status: "active" | "inactive" | "suspended";
  created_at: string;
  updated_at: string;
};

export type AdminCustomer = {
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

export type AdminOrderCustomer = Pick<
  AdminCustomer,
  "id" | "first_name" | "last_name" | "phone_number" | "email" | "address" | "is_reseller"
>;

export type AdminOrderItem = {
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
  product: Pick<AdminProduct, "id" | "name" | "unit_label" | "default_price"> | null;
};

export type AdminPayment = {
  id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
};

export type AdminInvoice = {
  id: string;
  order_id: string;
  invoice_number: string;
  status: InvoiceStatus;
  issued_at: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminOrderUpdate = {
  id: string;
  update_type: string;
  title: string;
  details: string | null;
  created_at: string;
};

export type AdminOrderStatusHistory = {
  id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  changed_at: string;
  notes: string | null;
};

export type AdminOrder = {
  id: string;
  customer_id: string;
  agent_id: string | null;
  source: "guest_shop" | "agent_submitted" | "admin_manual";
  order_status: OrderStatus;
  payment_status: "unpaid" | "partial" | "paid" | "refunded" | "void";
  discount_amount: number;
  delivery_fee: number;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  customer: AdminOrderCustomer | null;
  agent: Pick<AdminAgent, "id" | "display_name"> | null;
  customer_order_item: AdminOrderItem[];
  payment: AdminPayment[];
  invoice: AdminInvoice[];
  customer_order_update: AdminOrderUpdate[];
  customer_order_status_history: AdminOrderStatusHistory[];
};

export type AdminContactInquiry = {
  id: string;
  name: string;
  email: string | null;
  phone_number: string | null;
  message: string;
  inquiry_status: InquiryStatus;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminDashboardData = {
  pages: AdminPage[];
  pageSections: AdminPageSection[];
  products: AdminProduct[];
  agents: AdminAgent[];
  customers: AdminCustomer[];
  orders: AdminOrder[];
  contactInquiries: AdminContactInquiry[];
  summary: {
    submittedOrders: number;
    openInquiries: number;
    customers: number;
    activeProducts: number;
  };
};

export async function loadAdminDashboardData(): Promise<AdminDashboardData> {
  // Called only after the /admin route verifies the signed-in user has an active admin role.
  // Keep reseller_price protected from non-admin authenticated clients by reading through
  // the server-only service-role client instead of broadening product SELECT grants.
  const supabase = createSupabaseAdminClient();
  const [
    pages,
    pageSections,
    products,
    agents,
    customers,
    orders,
    contactInquiries,
  ] = await Promise.all([
    loadPages(supabase),
    loadPageSections(supabase),
    loadProducts(supabase),
    loadAgents(supabase),
    loadCustomers(supabase),
    loadOrders(supabase),
    loadContactInquiries(supabase),
  ]);

  return {
    pages,
    pageSections,
    products,
    agents,
    customers,
    orders,
    contactInquiries,
    summary: {
      submittedOrders: orders.filter((order) => order.order_status === "submitted").length,
      openInquiries: contactInquiries.filter((inquiry) => inquiry.inquiry_status !== "closed").length,
      customers: customers.length,
      activeProducts: products.filter((product) => product.is_active).length,
    },
  };
}

export async function loadAdminOrder(orderId: string): Promise<AdminOrder | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("customer_order")
    .select(adminOrderSelect)
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error("Unable to load admin order.");

  return data ? normalizeAdminOrder(data) : null;
}

async function loadPages(supabase: SupabaseAdminClient) {
  const { data, error } = await supabase
    .from("page")
    .select("id, slug, title, status, published_at, created_at, updated_at")
    .order("slug", { ascending: true });

  if (error) throw new Error("Unable to load admin pages.");

  return (data ?? []) as AdminPage[];
}

async function loadPageSections(supabase: SupabaseAdminClient) {
  const { data, error } = await supabase
    .from("page_section")
    .select("id, page_id, type, sort_order, content, status, created_at, updated_at")
    .order("sort_order", { ascending: true });

  if (error) throw new Error("Unable to load admin page sections.");

  return (data ?? []) as AdminPageSection[];
}

async function loadProducts(supabase: SupabaseAdminClient) {
  const { data, error } = await supabase
    .from("product")
    .select(
      "id, name, category, description, unit_label, default_price, reseller_price, stock_status, image_path, is_active, created_at, updated_at",
    )
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw new Error("Unable to load admin products.");

  return (data ?? []) as AdminProduct[];
}

async function loadAgents(supabase: SupabaseAdminClient) {
  const { data, error } = await supabase
    .from("agent_profile")
    .select("id, user_id, display_name, status, created_at, updated_at")
    .order("display_name", { ascending: true });

  if (error) throw new Error("Unable to load admin agents.");

  return (data ?? []) as AdminAgent[];
}

async function loadCustomers(supabase: SupabaseAdminClient) {
  const { data, error } = await supabase
    .from("customer")
    .select(
      "id, first_name, last_name, phone_number, email, address, assigned_agent_id, is_reseller, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error("Unable to load admin customers.");

  return (data ?? []) as AdminCustomer[];
}

async function loadOrders(supabase: SupabaseAdminClient) {
  const { data, error } = await supabase
    .from("customer_order")
    .select(adminOrderSelect)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error("Unable to load admin orders.");

  return ((data ?? []) as unknown[]).map(normalizeAdminOrder);
}

function normalizeAdminOrder(order: unknown): AdminOrder {
  const adminOrder = order as AdminOrder;

  return {
    ...adminOrder,
    customer_order_item: Array.isArray(adminOrder.customer_order_item) ? adminOrder.customer_order_item : [],
    payment: Array.isArray(adminOrder.payment) ? adminOrder.payment : [],
    invoice: normalizeRelationArray(adminOrder.invoice),
    customer_order_update: Array.isArray(adminOrder.customer_order_update) ? adminOrder.customer_order_update : [],
    customer_order_status_history: Array.isArray(adminOrder.customer_order_status_history)
      ? adminOrder.customer_order_status_history
      : [],
  };
}

function normalizeRelationArray<T>(value: T[] | T | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

async function loadContactInquiries(supabase: SupabaseAdminClient) {
  const { data, error } = await supabase
    .from("contact_inquiry")
    .select(
      "id, name, email, phone_number, message, inquiry_status, internal_notes, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error("Unable to load admin contact inquiries.");

  return (data ?? []) as AdminContactInquiry[];
}
