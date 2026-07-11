import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import type { AdminAgentFilters } from "./agent-filters";
import type { AdminCustomerFilters } from "./customer-filters";
import type { AdminInvoiceFilters } from "./invoice-filters";
import type { AdminInquiryFilters } from "./inquiry-filters";
import type { AdminOrderFilters } from "./order-filters";
import type { AdminProductFilters } from "./product-filters";
import type { AdminResellerApplicationFilters } from "./reseller-application-filters";
import type {
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
  notes,
  approved_at,
  admin_read_at,
  admin_read_by,
  created_at,
  updated_at,
  customer:customer_id (
    id,
    first_name,
    last_name,
    phone_number,
    email,
    address,
    is_reseller,
    assigned_agent_id,
    assigned_agent:assigned_agent_id (
      id,
      user_id,
      display_name,
      status,
      created_at,
      updated_at
    )
  ),
  agent:agent_id (
    id,
    user_id,
    display_name,
    status,
    created_at,
    updated_at
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
    agent_commission_paid,
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

const adminOrderRangeSelect = `
  id,
  customer_order_item (
    id,
    partial_quantity,
    final_quantity,
    unit_price
  ),
  invoice (
    id
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
  email: string | null;
  contact: string | null;
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
  "id" | "first_name" | "last_name" | "phone_number" | "email" | "address" | "is_reseller" | "assigned_agent_id"
> & {
  assigned_agent: Pick<AdminAgent, "id" | "display_name" | "email" | "contact"> | null;
};

export type AdminOrderItem = {
  id: string;
  product_id: string;
  partial_quantity: number;
  final_quantity: number;
  unit_price: number;
  price_type: "retail" | "reseller";
  add_details: string | null;
  agent_commission_amount: number;
  agent_commission_paid: boolean;
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
  payment_status: "unpaid" | "partial" | "paid" | "refunded";
  notes: string | null;
  approved_at: string | null;
  admin_read_at?: string | null;
  admin_read_by?: string | null;
  created_at: string;
  updated_at: string;
  customer: AdminOrderCustomer | null;
  agent: Pick<AdminAgent, "id" | "display_name" | "email" | "contact"> | null;
  customer_order_item: AdminOrderItem[];
  payment: AdminPayment[];
  invoice: AdminInvoice[];
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
  admin_read_at?: string | null;
  admin_read_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminResellerApplication = {
  id: string;
  name: string;
  email: string;
  contact_number: string;
  planned_transaction_type: string;
  expected_quantity_per_week: string;
  message: string | null;
  application_status: "submitted" | "contacted" | "closed";
  email_delivery_status: "pending" | "sent" | "failed";
  price_list_sent_at: string | null;
  email_error: string | null;
  admin_read_at?: string | null;
  admin_read_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminDashboardData = {
  pages: AdminPage[];
  pageSections: AdminPageSection[];
  products: AdminProduct[];
  productPriceRange: AdminProductPriceRange;
  orderTotalRange: AdminOrderTotalRange;
  agents: AdminAgent[];
  customers: AdminCustomer[];
  orders: AdminOrder[];
  contactInquiries: AdminContactInquiry[];
  resellerApplications: AdminResellerApplication[];
  summary: {
    submittedOrders: number;
    openInquiries: number;
    customers: number;
    activeProducts: number;
    newResellerApplications: number;
  };
};

export type AdminProductPriceRange = {
  min: number;
  max: number;
};

export type AdminOrderTotalRange = {
  min: number;
  max: number;
};

export type AdminInvoiceTotalRange = {
  min: number;
  max: number;
};

export type AdminDashboardDataOptions = {
  productFilters?: AdminProductFilters;
  orderFilters?: AdminOrderFilters;
  orderLimit?: number;
  contactInquiryLimit?: number;
  resellerApplicationLimit?: number;
};

export type AdminProductManagementData = Pick<
  AdminDashboardData,
  "products" | "productPriceRange"
>;

export type AdminOrderManagementData = Pick<
  AdminDashboardData,
  "agents" | "customers" | "orders" | "orderTotalRange" | "products"
>;

export type AdminCustomerManagementData = Pick<
  AdminDashboardData,
  "agents" | "customers"
>;

export type AdminAgentManagementData = Pick<
  AdminDashboardData,
  "agents"
>;

export type AdminInvoiceManagementData = {
  orders: AdminOrder[];
  invoiceTotalRange: AdminInvoiceTotalRange;
};

export type AdminInquiryManagementData = Pick<
  AdminDashboardData,
  "contactInquiries"
>;

export type AdminResellerApplicationManagementData = Pick<
  AdminDashboardData,
  "resellerApplications"
>;

export async function loadAdminDashboardData(
  options: AdminDashboardDataOptions = {},
): Promise<AdminDashboardData> {
  // Called only after the /admin route verifies the signed-in user has an active admin role.
  // Keep reseller_price protected from non-admin authenticated clients by reading through
  // the server-only service-role client instead of broadening product SELECT grants.
  const supabase = createSupabaseAdminClient();
  const [
    pages,
    pageSections,
    products,
    productPriceRange,
    orderTotalRange,
    agents,
    customers,
    orders,
    contactInquiries,
    resellerApplications,
  ] = await Promise.all([
    loadPages(supabase),
    loadPageSections(supabase),
    loadProducts(supabase, options.productFilters),
    loadProductPriceRange(supabase),
    loadOrderTotalRange(supabase),
    loadAgents(supabase),
    loadCustomers(supabase),
    loadOrders(supabase, options.orderLimit ?? 50, options.orderFilters),
    loadContactInquiries(supabase, options.contactInquiryLimit ?? 50),
    loadResellerApplications(supabase, options.resellerApplicationLimit ?? 50),
  ]);

  return {
    pages,
    pageSections,
    products,
    productPriceRange,
    orderTotalRange,
    agents,
    customers,
    orders,
    contactInquiries,
    resellerApplications,
    summary: {
      submittedOrders: orders.filter((order) => order.order_status === "pending").length,
      openInquiries: contactInquiries.filter((inquiry) => inquiry.inquiry_status !== "closed").length,
      customers: customers.length,
      activeProducts: products.filter((product) => product.is_active).length,
      newResellerApplications: resellerApplications.filter(
        (application) => application.application_status === "submitted",
      ).length,
    },
  };
}

export async function loadAdminOrderManagementData(
  orderFilters: AdminOrderFilters = {},
): Promise<AdminOrderManagementData> {
  const supabase = createSupabaseAdminClient();
  const [products, orderTotalRange, agents, customers, orders] = await Promise.all([
    loadProducts(supabase),
    loadOrderTotalRange(supabase),
    loadAgents(supabase),
    loadCustomers(supabase),
    loadOrders(supabase, 50, orderFilters),
  ]);

  return {
    products,
    orderTotalRange,
    agents,
    customers,
    orders,
  };
}

export async function loadAdminProductManagementData(
  productFilters: AdminProductFilters = {},
): Promise<AdminProductManagementData> {
  // Product filtering is used by the products fragment endpoint. Keep the query
  // server-side without loading the rest of the dashboard page payload.
  const supabase = createSupabaseAdminClient();
  const [products, productPriceRange] = await Promise.all([
    loadProducts(supabase, productFilters),
    loadProductPriceRange(supabase),
  ]);

  return {
    products,
    productPriceRange,
  };
}

export async function loadAdminInvoiceManagementData(
  invoiceFilters: AdminInvoiceFilters = {},
): Promise<AdminInvoiceManagementData> {
  const supabase = createSupabaseAdminClient();
  const [orders, invoiceTotalRange] = await Promise.all([
    loadInvoices(supabase, 50, invoiceFilters),
    loadInvoiceTotalRange(supabase),
  ]);

  return {
    orders,
    invoiceTotalRange,
  };
}

export async function loadAdminCustomerManagementData(
  customerFilters: AdminCustomerFilters = {},
): Promise<AdminCustomerManagementData> {
  const supabase = createSupabaseAdminClient();
  const [agents, customers] = await Promise.all([
    loadAgents(supabase),
    loadCustomers(supabase, customerFilters),
  ]);

  return {
    agents,
    customers,
  };
}

export async function loadAdminAgentManagementData(
  agentFilters: AdminAgentFilters = {},
): Promise<AdminAgentManagementData> {
  const supabase = createSupabaseAdminClient();

  return {
    agents: await loadAgents(supabase, agentFilters),
  };
}

export async function loadAdminInquiryManagementData(
  inquiryFilters: AdminInquiryFilters = {},
): Promise<AdminInquiryManagementData> {
  const supabase = createSupabaseAdminClient();

  return {
    contactInquiries: await loadContactInquiries(supabase, 50, inquiryFilters),
  };
}

export async function loadAdminResellerApplicationManagementData(
  resellerApplicationFilters: AdminResellerApplicationFilters = {},
): Promise<AdminResellerApplicationManagementData> {
  const supabase = createSupabaseAdminClient();

  return {
    resellerApplications: await loadResellerApplications(supabase, 50, resellerApplicationFilters),
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

  if (!data) {
    return null;
  }

  const [order] = await enrichOrdersWithAgentEmails(supabase, [normalizeAdminOrder(data)]);
  return order ?? null;
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

async function loadProductPriceRange(
  supabase: SupabaseAdminClient,
): Promise<AdminProductPriceRange> {
  const { data, error } = await supabase
    .from("product")
    .select("default_price");

  if (error) throw new Error("Unable to load admin product price range.");

  const prices = (data ?? [])
    .map((product) => Number((product as { default_price?: unknown }).default_price))
    .filter((price) => Number.isFinite(price) && price >= 0);

  if (prices.length === 0) {
    return {
      min: 0,
      max: 0,
    };
  }

  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
  };
}

async function loadProducts(
  supabase: SupabaseAdminClient,
  filters: AdminProductFilters = {},
) {
  let query = supabase
    .from("product")
    .select(
      "id, name, category, description, unit_label, default_price, reseller_price, stock_status, image_path, is_active, created_at, updated_at",
    );

  if (filters.search) {
    const escapedSearch = escapePostgrestFilterValue(filters.search);
    query = query.or(`name.ilike.%${escapedSearch}%,description.ilike.%${escapedSearch}%`);
  }

  if (filters.category) {
    query = query.eq("category", filters.category);
  }

  if (filters.stockStatus) {
    query = query.eq("stock_status", filters.stockStatus);
  }

  if (typeof filters.minPrice === "number") {
    query = query.gte("default_price", filters.minPrice);
  }

  if (typeof filters.maxPrice === "number") {
    query = query.lte("default_price", filters.maxPrice);
  }

  const { data, error } = await query
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw new Error("Unable to load admin products.");

  return (data ?? []) as AdminProduct[];
}

function escapePostgrestFilterValue(value: string) {
  return value.replace(/[%_,.]/g, (character) => `\\${character}`);
}

async function loadAgents(
  supabase: SupabaseAdminClient,
  filters: AdminAgentFilters = {},
) {
  const { data, error } = await supabase
    .from("agent_profile")
    .select("id, user_id, display_name, status, created_at, updated_at")
    .order("display_name", { ascending: true });

  if (error) throw new Error("Unable to load admin agents.");

  const baseAgents = (data ?? []) as Array<
    Omit<AdminAgent, "email" | "contact"> & { email?: never; contact?: never }
  >;
  const emailByUserId = await loadAuthEmailsByUserId(
    supabase,
    baseAgents.map((agent) => agent.user_id),
  );

  const agents = baseAgents.map((agent) => ({
    ...agent,
    email: emailByUserId.get(agent.user_id) ?? null,
    contact: null,
  })) as AdminAgent[];

  if (!filters.search && !filters.status) {
    return agents;
  }

  return filterAdminAgents(agents, filters);
}

async function loadCustomers(
  supabase: SupabaseAdminClient,
  filters: AdminCustomerFilters = {},
) {
  const { data, error } = await supabase
    .from("customer")
    .select(
      "id, first_name, last_name, phone_number, email, address, assigned_agent_id, is_reseller, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error("Unable to load admin customers.");

  const customers = (data ?? []) as AdminCustomer[];

  if (!filters.search && !filters.customerType) {
    return customers;
  }

  const agentNamesById = new Map<string, string>();

  if (filters.search) {
    const { data: agentData, error: agentError } = await supabase
      .from("agent_profile")
      .select("id, display_name");

    if (agentError) throw new Error("Unable to load admin customers.");

    (agentData ?? []).forEach((agent) => {
      const normalizedAgent = agent as { id?: unknown; display_name?: unknown };

      if (
        typeof normalizedAgent.id === "string" &&
        typeof normalizedAgent.display_name === "string"
      ) {
        agentNamesById.set(normalizedAgent.id, normalizedAgent.display_name);
      }
    });
  }

  return filterAdminCustomers(customers, filters, agentNamesById);
}

async function loadOrderTotalRange(
  supabase: SupabaseAdminClient,
): Promise<AdminOrderTotalRange> {
  const { data, error } = await supabase
    .from("customer_order")
    .select(adminOrderRangeSelect);

  if (error) throw new Error("Unable to load admin order total range.");

  const totals = ((data ?? []) as unknown[])
    .map(normalizeAdminOrder)
    .map(getAdminOrderDisplayTotal)
    .filter((total) => Number.isFinite(total) && total >= 0);

  if (totals.length === 0) {
    return {
      min: 0,
      max: 0,
    };
  }

  return {
    min: Math.min(...totals),
    max: Math.max(...totals),
  };
}

async function loadInvoiceTotalRange(
  supabase: SupabaseAdminClient,
): Promise<AdminInvoiceTotalRange> {
  const { data, error } = await supabase
    .from("customer_order")
    .select(adminOrderRangeSelect)
    .order("created_at", { ascending: false });

  if (error) throw new Error("Unable to load admin invoice total range.");

  const totals = ((data ?? []) as unknown[])
    .map(normalizeAdminOrder)
    .filter(hasInvoice)
    .map(getAdminInvoiceDisplayTotal)
    .filter((total) => Number.isFinite(total) && total >= 0);

  if (totals.length === 0) {
    return {
      min: 0,
      max: 0,
    };
  }

  return {
    min: Math.min(...totals),
    max: Math.max(...totals),
  };
}

async function loadOrders(
  supabase: SupabaseAdminClient,
  limit: number,
  filters: AdminOrderFilters = {},
) {
  let query = supabase
    .from("customer_order")
    .select(adminOrderSelect);

  if (filters.source) {
    query = query.eq("source", filters.source);
  }

  if (filters.orderStatus) {
    query = query.eq("order_status", filters.orderStatus);
  }

  if (filters.paymentStatus) {
    query = query.eq("payment_status", filters.paymentStatus);
  }

  const shouldPostFilter = hasComputedOrderFilters(filters);
  let orderedQuery = query.order("created_at", { ascending: false });

  if (!shouldPostFilter) {
    orderedQuery = orderedQuery.limit(limit);
  }

  const { data, error } = await orderedQuery;

  if (error) throw new Error("Unable to load admin orders.");

  const orders = await enrichOrdersWithAgentEmails(
    supabase,
    ((data ?? []) as unknown[]).map(normalizeAdminOrder),
  );
  const filteredOrders = shouldPostFilter
    ? filterAdminOrders(orders, filters)
    : orders;

  return filteredOrders.slice(0, limit);
}

function normalizeAdminOrder(order: unknown): AdminOrder {
  const adminOrder = order as AdminOrder;

  return {
    ...adminOrder,
    customer_order_item: Array.isArray(adminOrder.customer_order_item) ? adminOrder.customer_order_item : [],
    payment: Array.isArray(adminOrder.payment) ? adminOrder.payment : [],
    invoice: normalizeRelationArray(adminOrder.invoice),
    customer_order_status_history: Array.isArray(adminOrder.customer_order_status_history)
      ? adminOrder.customer_order_status_history
      : [],
  };
}

function hasComputedOrderFilters(filters: AdminOrderFilters) {
  return Boolean(
    filters.search ||
      typeof filters.minTotal === "number" ||
      typeof filters.maxTotal === "number",
  );
}

function filterAdminOrders(orders: AdminOrder[], filters: AdminOrderFilters) {
  const search = filters.search?.toLowerCase();

  return orders.filter((order) => {
    const total = getAdminOrderDisplayTotal(order);
    const matchesSearch = !search || getAdminOrderSearchText(order).includes(search);
    const matchesMinTotal = typeof filters.minTotal !== "number" || total >= filters.minTotal;
    const matchesMaxTotal = typeof filters.maxTotal !== "number" || total <= filters.maxTotal;

    return matchesSearch && matchesMinTotal && matchesMaxTotal;
  });
}

async function loadInvoices(
  supabase: SupabaseAdminClient,
  limit: number,
  filters: AdminInvoiceFilters = {},
) {
  const { data, error } = await supabase
    .from("customer_order")
    .select(adminOrderSelect)
    .order("created_at", { ascending: false });

  if (error) throw new Error("Unable to load admin invoices.");

  const orders = await enrichOrdersWithAgentEmails(
    supabase,
    ((data ?? []) as unknown[]).map(normalizeAdminOrder),
  );

  return filterAdminInvoices(orders, filters).slice(0, limit);
}

function filterAdminAgents(agents: AdminAgent[], filters: AdminAgentFilters) {
  const searchTerms = filters.search
    ?.toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);

  return agents.filter((agent) => {
    const searchText = [agent.display_name, agent.email, agent.contact]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" ")
      .toLowerCase();
    const matchesSearch = !searchTerms || searchTerms.every((term) => searchText.includes(term));
    const matchesStatus = !filters.status || agent.status === filters.status;

    return matchesSearch && matchesStatus;
  });
}

function filterAdminInvoices(orders: AdminOrder[], filters: AdminInvoiceFilters) {
  const search = filters.search?.toLowerCase();

  return orders.filter((order) => {
    if (!hasInvoice(order)) {
      return false;
    }

    const total = getAdminInvoiceDisplayTotal(order);
    const matchesSearch = !search || getAdminInvoiceSearchText(order).includes(search);
    const matchesBalanceStatus =
      !filters.balanceStatus || order.payment_status === filters.balanceStatus;
    const matchesMinTotal = typeof filters.minTotal !== "number" || total >= filters.minTotal;
    const matchesMaxTotal = typeof filters.maxTotal !== "number" || total <= filters.maxTotal;

    return matchesSearch && matchesBalanceStatus && matchesMinTotal && matchesMaxTotal;
  });
}

function filterAdminCustomers(
  customers: AdminCustomer[],
  filters: AdminCustomerFilters,
  agentNamesById: ReadonlyMap<string, string>,
) {
  const searchTerms = filters.search
    ?.toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);

  return customers.filter((customer) => {
    const assignedAgent = customer.assigned_agent_id
      ? agentNamesById.get(customer.assigned_agent_id) ?? ""
      : "";
    const searchText = getAdminCustomerSearchText(customer, assignedAgent);
    const matchesSearch =
      !searchTerms || searchTerms.every((term) => searchText.includes(term));
    const matchesType =
      !filters.customerType ||
      (filters.customerType === "reseller" ? customer.is_reseller : !customer.is_reseller);

    return matchesSearch && matchesType;
  });
}

function getAdminOrderDisplayTotal(order: AdminOrder) {
  const quantityKey = order.invoice.length > 0 ? "final_quantity" : "partial_quantity";

  return order.customer_order_item.reduce((total, item) => {
    return total + item[quantityKey] * item.unit_price;
  }, 0);
}

function getAdminInvoiceDisplayTotal(order: AdminOrder) {
  return order.customer_order_item.reduce((total, item) => {
    return total + item.final_quantity * item.unit_price;
  }, 0);
}

function getAdminOrderSearchText(order: AdminOrder) {
  const customer = order.customer;
  const agent = order.agent;
  const values = [
    order.id,
    order.source,
    order.order_status,
    order.payment_status,
    customer?.first_name,
    customer?.last_name,
    customer?.phone_number,
    customer?.email,
    customer?.address,
    agent?.display_name,
  ];

  return values
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
}

function getAdminInvoiceSearchText(order: AdminOrder) {
  const customer = order.customer;
  const invoice = order.invoice[0];
  const values = [
    invoice?.invoice_number,
    customer?.first_name,
    customer?.last_name,
    `${customer?.first_name ?? ""} ${customer?.last_name ?? ""}`.trim(),
  ];

  return values
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
}

function getAdminCustomerSearchText(customer: AdminCustomer, assignedAgent: string) {
  const values = [
    customer.first_name,
    customer.last_name,
    `${customer.first_name} ${customer.last_name}`.trim(),
    customer.email,
    customer.phone_number,
    assignedAgent,
  ];

  return values
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
}

function hasInvoice(order: AdminOrder) {
  return order.invoice.length > 0;
}

function normalizeRelationArray<T>(value: T[] | T | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

async function enrichOrdersWithAgentEmails(
  supabase: SupabaseAdminClient,
  orders: AdminOrder[],
): Promise<AdminOrder[]> {
  const agentUserIds = orders
    .flatMap((order) => [order.agent, order.customer?.assigned_agent ?? null])
    .filter((agent): agent is NonNullable<AdminOrder["agent"]> & { user_id?: string } => Boolean(agent))
    .map((agent) => agent.user_id)
    .filter((userId): userId is string => typeof userId === "string" && userId.length > 0);

  if (agentUserIds.length === 0) {
    return orders.map((order) => ({
      ...order,
      agent: order.agent
        ? {
            id: order.agent.id,
            display_name: order.agent.display_name,
            email: order.agent.email ?? null,
            contact: order.agent.contact ?? null,
          }
        : null,
      customer: order.customer
        ? {
            ...order.customer,
            assigned_agent: order.customer.assigned_agent
              ? {
                  id: order.customer.assigned_agent.id,
                  display_name: order.customer.assigned_agent.display_name,
                  email: order.customer.assigned_agent.email ?? null,
                  contact: order.customer.assigned_agent.contact ?? null,
                }
              : null,
          }
        : null,
    }));
  }

  const emailByUserId = await loadAuthEmailsByUserId(supabase, agentUserIds);

  return orders.map((order) => ({
    ...order,
    agent: order.agent
      ? {
          id: order.agent.id,
          display_name: order.agent.display_name,
          email: emailByUserId.get((order.agent as { user_id?: string }).user_id ?? "") ?? null,
          contact: null,
        }
      : null,
    customer: order.customer
      ? {
          ...order.customer,
          assigned_agent: order.customer.assigned_agent
            ? {
                id: order.customer.assigned_agent.id,
                display_name: order.customer.assigned_agent.display_name,
                email: emailByUserId.get(
                  (order.customer.assigned_agent as { user_id?: string }).user_id ?? "",
                ) ?? null,
                contact: null,
              }
            : null,
        }
      : null,
  }));
}

async function loadAuthEmailsByUserId(
  supabase: SupabaseAdminClient,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const uniqueUserIds = [...new Set(userIds)];
  const emailByUserId = new Map<string, string | null>();

  if (uniqueUserIds.length === 0) {
    return emailByUserId;
  }

  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: Math.max(uniqueUserIds.length, 1),
  });

  if (error) {
    throw new Error("Unable to load admin agents.");
  }

  (data?.users ?? []).forEach((user) => {
    if (typeof user.id === "string" && uniqueUserIds.includes(user.id)) {
      emailByUserId.set(user.id, user.email ?? null);
    }
  });

  return emailByUserId;
}

async function loadContactInquiries(
  supabase: SupabaseAdminClient,
  limit: number,
  filters: AdminInquiryFilters = {},
) {
  const { data, error } = await supabase
    .from("contact_inquiry")
    .select(
      "id, name, email, phone_number, message, inquiry_status, internal_notes, admin_read_at, admin_read_by, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error("Unable to load admin contact inquiries.");

  const inquiries = (data ?? []) as AdminContactInquiry[];

  if (!filters.search && !filters.status) {
    return inquiries;
  }

  const searchTerms = filters.search
    ?.toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);

  return inquiries.filter((inquiry) => {
    const searchText = [inquiry.name, inquiry.email, inquiry.phone_number]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" ")
      .toLowerCase();
    const matchesSearch = !searchTerms || searchTerms.every((term) => searchText.includes(term));
    const matchesStatus = !filters.status || inquiry.inquiry_status === filters.status;

    return matchesSearch && matchesStatus;
  });
}

async function loadResellerApplications(
  supabase: SupabaseAdminClient,
  limit: number,
  filters: AdminResellerApplicationFilters = {},
) {
  const { data, error } = await supabase
    .from("reseller_application")
    .select(
      "id, name, email, contact_number, planned_transaction_type, expected_quantity_per_week, message, application_status, email_delivery_status, price_list_sent_at, email_error, admin_read_at, admin_read_by, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error("Unable to load admin reseller applications.");

  const applications = (data ?? []) as AdminResellerApplication[];

  if (!filters.search && !filters.status) {
    return applications;
  }

  const searchTerms = filters.search
    ?.toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);

  return applications.filter((application) => {
    const searchText = [application.name, application.email, application.contact_number]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" ")
      .toLowerCase();
    const matchesSearch = !searchTerms || searchTerms.every((term) => searchText.includes(term));
    const matchesStatus = !filters.status || application.application_status === filters.status;

    return matchesSearch && matchesStatus;
  });
}
