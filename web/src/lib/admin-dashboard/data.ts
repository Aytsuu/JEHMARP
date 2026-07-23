import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { throwLoadError } from "@/lib/load-error";
import {
  agentSummaryWithProfileSelect,
  agentWithProfileSelect,
  buildDisplayName,
  customerWithProfileSelect,
  mapAgentSummaryWithProfile,
  mapAgentWithProfile,
  mapCustomerWithProfile,
  mapNestedOrderCustomer,
  profileIdentitySelect,
  resolveRelation,
  type ProfileIdentityRow,
} from "@/lib/profile-identity";

import type { AdminActivityFilters } from "./activity-filters";
import type { AdminAgentFilters } from "./agent-filters";
import type { AdminCustomerFilters } from "./customer-filters";
import type { AdminInvoiceFilters } from "./invoice-filters";
import type { AdminInquiryFilters } from "./inquiry-filters";
import type { AdminOrderFilters } from "./order-filters";
import {
  adminPaginationRange,
  buildAdminPagination,
  defaultAdminPagination,
  type AdminPaginatedResult,
  type AdminPaginationParams,
} from "./pagination";
import type { AdminProductFilters } from "./product-filters";
import type { AdminResellerApplicationFilters } from "./reseller-application-filters";
import { computeAdminOrderStatusCounts, type AdminOrderStatusCounts } from "./summary";
import { agentCustomerBalance } from "./view";
import type {
  InquiryStatus,
  InvoiceStatus,
  OrderStatus,
  ProductAmountType,
  PageStatus,
  ProductCategory,
  StockStatus,
} from "./actions";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

const customerOrderStatuses = new Set(["pending", "processing", "closed"]);
const agentOrderStatuses = new Set(["pending_customers", "pending_order", "processing", "closed"]);

const adminOrderSelect = `
  id,
  agent_order_id,
  customer_id,
  agent_id,
  source,
  order_status,
  payment_status,
  release_date,
  sale_date,
  notes,
  approved_at,
  admin_read_at,
  admin_read_by,
  converted_to_agent_order_id,
  converted_to_agent_order_at,
  converted_to_agent_order_by,
  created_at,
  updated_at,
  customer:customer_id (
    id,
    assigned_agent_id,
    is_reseller,
    credit_limit,
    credit_limit_exceeded,
    promoted_to_agent_id,
    promoted_to_agent_at,
    profile:profile_id (${profileIdentitySelect}),
    assigned_agent:assigned_agent_id (
      id,
      user_id,
      status,
      created_at,
      updated_at,
      profile:profile_id (
        display_name,
        phone_number,
        email
      )
    )
  ),
  agent:agent_id (
    id,
    user_id,
    status,
    created_at,
    updated_at,
    profile:profile_id (
      display_name,
      phone_number,
      email,
      first_name,
      last_name
    )
  ),
  agent_order:agent_order!customer_order_agent_order_id_fkey (
    id,
    agent_id,
    agent:agent_id (
      id,
      user_id,
      status,
      created_at,
      updated_at,
      profile:profile_id (
        display_name,
        phone_number,
        email
      )
    )
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
      default_price,
      agent_commission_type,
      agent_commission_value
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
    updated_at,
    agent:agent_id (
      id,
      profile:profile_id (
        display_name
      )
    )
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

const adminAgentOrderSelect = `
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
  agent:agent_id (
    id,
    user_id,
    status,
    created_at,
    updated_at,
    profile:profile_id (
      display_name,
      phone_number,
      email,
      first_name,
      last_name
    )
  ),
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
      default_price,
      reseller_price,
      agent_commission_type,
      agent_commission_value
    )
  ),
  customer_order!customer_order_agent_order_id_fkey (
    id,
    agent_order_id,
    customer_id,
    agent_id,
    source,
    order_status,
    payment_status,
    release_date,
    sale_date,
    notes,
    approved_at,
    admin_read_at,
    admin_read_by,
    converted_to_agent_order_id,
    converted_to_agent_order_at,
    converted_to_agent_order_by,
    created_at,
    updated_at,
    customer:customer_id (
      id,
      assigned_agent_id,
      is_reseller,
      credit_limit,
      credit_limit_exceeded,
      promoted_to_agent_id,
      promoted_to_agent_at,
      profile:profile_id (${profileIdentitySelect}),
      assigned_agent:assigned_agent_id (
        id,
        user_id,
        status,
        created_at,
        updated_at,
        profile:profile_id (
          display_name,
          phone_number,
          email
        )
      )
    ),
    agent:agent_id (
      id,
      user_id,
      status,
      created_at,
      updated_at,
      profile:profile_id (
        display_name,
        phone_number,
        email,
        first_name,
        last_name
      )
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
        default_price,
        reseller_price,
        agent_commission_type,
        agent_commission_value
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
      updated_at,
      agent:agent_id (
        id,
        profile:profile_id (
          display_name
        )
      )
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
  reseller_deduction_type: ProductAmountType;
  reseller_deduction_value: number;
  agent_commission_type: ProductAmountType;
  agent_commission_value: number;
  stock_status: StockStatus;
  image_path: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminAgent = {
  id: string;
  user_id: string | null;
  customer_id?: string | null;
  promoted_from_customer_id?: string | null;
  promoted_from_customer_at?: string | null;
  employee_id: string | null;
  first_name: string;
  last_name: string;
  display_name: string;
  status: "active" | "inactive" | "suspended";
  email: string | null;
  contact: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminCustomer = {
  id: string;
  tracking_number: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  email: string | null;
  address: string;
  assigned_agent_id: string | null;
  is_reseller: boolean;
  credit_limit: number;
  credit_limit_exceeded: boolean;
  promoted_to_agent_id?: string | null;
  promoted_to_agent_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminOrderCustomer = Pick<
  AdminCustomer,
  | "id"
  | "first_name"
  | "last_name"
  | "phone_number"
  | "email"
  | "address"
  | "is_reseller"
  | "assigned_agent_id"
  | "promoted_to_agent_id"
  | "promoted_to_agent_at"
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
  agent_order_quantity_increase?: number;
  agent_commission_amount: number;
  agent_commission_paid: boolean;
  product: (Pick<AdminProduct, "id" | "name" | "unit_label" | "default_price" | "agent_commission_type" | "agent_commission_value"> & {
    reseller_price?: number;
  }) | null;
};

export type AdminPayment = {
  id: string;
  amount: number;
  payment_method: string;
  payment_terms: string;
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

export type AdminAgentReceivedPayment = {
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
  agent: Pick<AdminAgent, "id" | "display_name"> | null;
};

export type AdminAgentOrderStatus =
  | "pending_customers"
  | "pending_order"
  | "processing"
  | "closed";

export type AdminAgentOrderItem = {
  id: string;
  product_id: string;
  quantity: number;
  add_details: string | null;
  agent_commission_amount: number;
  agent_commission_updated_by: string | null;
  agent_commission_updated_at: string | null;
  created_at: string;
  updated_at: string;
  product: Pick<AdminProduct, "id" | "name" | "unit_label" | "default_price" | "agent_commission_type" | "agent_commission_value"> | null;
};

export type AdminAgentSummary = Pick<AdminAgent, "id" | "user_id" | "display_name" | "email" | "contact">;

export type AdminOrderParentAgentOrder = {
  id: string;
  agent_id: string;
  agent: AdminAgentSummary | null;
};

export type AdminOrder = {
  id: string;
  agent_order_id?: string | null;
  customer_id: string;
  agent_id: string | null;
  source: "guest_shop" | "agent_submitted" | "admin_manual";
  order_status: OrderStatus;
  payment_status: "unpaid" | "partial" | "paid" | "refunded";
  release_date?: string | null;
  sale_date?: string | null;
  notes: string | null;
  approved_at: string | null;
  admin_read_at?: string | null;
  admin_read_by?: string | null;
  converted_to_agent_order_id?: string | null;
  converted_to_agent_order_at?: string | null;
  converted_to_agent_order_by?: string | null;
  created_at: string;
  updated_at: string;
  customer: AdminOrderCustomer | null;
  agent: Pick<AdminAgent, "id" | "display_name" | "email" | "contact"> | null;
  agent_order?: AdminOrderParentAgentOrder | null;
  customer_order_item: AdminOrderItem[];
  payment: AdminPayment[];
  agent_received_payment?: AdminAgentReceivedPayment[];
  invoice: AdminInvoice[];
  customer_order_status_history: AdminOrderStatusHistory[];
};

export type AdminAgentOrder = {
  id: string;
  agent_id: string;
  order_status: AdminAgentOrderStatus;
  release_date?: string | null;
  sale_date?: string | null;
  notes: string | null;
  submitted_by: string | null;
  admin_read_at?: string | null;
  admin_read_by?: string | null;
  created_at: string;
  updated_at: string;
  agent: AdminAgentSummary | null;
  agent_order_item: AdminAgentOrderItem[];
  customer_order: AdminOrder[];
  converted_source_order?: AdminOrder | null;
};

export type AdminOrderTableRow = {
  id: string;
  row_type: "agent" | "customer";
  created_at: string;
  status: string;
  customer_label: string;
  source_label: string;
  payment_status: AdminOrder["payment_status"];
  release_date?: string | null;
  total_amount: number;
  commission_total: number;
  paid_total: number;
  remaining_receivable: number;
  href: string;
  linked_customer_count: number | null;
  pending_customer_order_count: number | null;
};

export type AdminSalesTableRow = {
  id: string;
  created_at: string;
  sale_date: string | null;
  release_date: string | null;
  customer_label: string;
  source_label: string;
  order_status: OrderStatus;
  payment_status: AdminOrder["payment_status"];
  invoice_number: string | null;
  order_total: number;
  paid_total: number;
  balance: number;
  payment_count: number;
  href: string;
};

export type AdminInvoiceTableRow = {
  order_id: string;
  invoice_id: string;
  invoice_number: string;
  customer_label: string;
  invoice_created_at: string;
  invoice_total: number;
  paid_total: number;
  balance: number;
  payment_status: AdminOrder["payment_status"];
};

export type AdminCustomerTableRow = AdminCustomer & {
  assigned_agent_name: string | null;
  outstanding_credit_balance: number;
};

export type AdminCustomerRegistrationLink = {
  id: string;
  token: string;
  expires_at: string;
  created_at: string;
  use_count: number;
};

export type AdminActivityTableRow = {
  id: string;
  category: "order" | "customer" | "product" | "invoice" | "content" | "inquiry" | "reseller";
  title: string;
  detail: string;
  occurredAt: string;
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
  agents: AdminAgent[];
  customers: AdminCustomer[];
  agentOrders: AdminAgentOrder[];
  orders: AdminOrder[];
  contactInquiries: AdminContactInquiry[];
  resellerApplications: AdminResellerApplication[];
  summary: AdminDashboardSummary;
};

export type AdminDashboardSummary = AdminOrderStatusCounts & {
  agents: number;
  inquiries: number;
  customers: number;
  products: number;
  resellerApplications: number;
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
  "products"
> & {
  pagination: AdminPaginatedResult<AdminProduct>["pagination"];
};

export type AdminOrderManagementData = Pick<
  AdminDashboardData,
  "agents" | "customers" | "agentOrders" | "orders" | "products"
> & {
  orderRows: AdminOrderTableRow[];
  customerBalances: Record<string, number>;
  pagination: AdminPaginatedResult<AdminOrderTableRow>["pagination"];
};

export type AdminCustomerManagementData = {
  customers: AdminCustomerTableRow[];
  agents: AdminAgent[];
  pagination: AdminPaginatedResult<AdminCustomerTableRow>["pagination"];
};

export type AdminAgentManagementData = Pick<
  AdminDashboardData,
  "agents"
> & {
  pagination: AdminPaginatedResult<AdminAgent>["pagination"];
};

export type AdminInvoiceManagementData = {
  invoiceRows: AdminInvoiceTableRow[];
  pagination: AdminPaginatedResult<AdminInvoiceTableRow>["pagination"];
};

export type AdminSalesManagementData = {
  salesRows: AdminSalesTableRow[];
  pagination: AdminPaginatedResult<AdminSalesTableRow>["pagination"];
};

export type AdminInquiryManagementData = Pick<
  AdminDashboardData,
  "contactInquiries"
> & {
  pagination?: AdminPaginatedResult<AdminContactInquiry>["pagination"];
};

export type AdminResellerApplicationManagementData = Pick<
  AdminDashboardData,
  "resellerApplications"
> & {
  pagination?: AdminPaginatedResult<AdminResellerApplication>["pagination"];
};

export type AdminActivityManagementData = {
  activityItems: AdminActivityTableRow[];
  pagination: AdminPaginatedResult<AdminActivityTableRow>["pagination"];
};

export type AdminAgentDetailsData = {
  agent: AdminAgent;
  assignedCustomers: AdminCustomer[];
  customerOrders: AdminOrder[];
  previousCustomerOrders: AdminOrder[];
  agentOrders: AdminAgentOrder[];
  remainingBalance: number;
  agentRemainingBalance: number;
};

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
    agents,
    customers,
    agentOrders,
    orders,
    contactInquiries,
    resellerApplications,
  ] = await Promise.all([
    loadPages(supabase),
    loadPageSections(supabase),
    loadProducts(supabase, options.productFilters),
    loadAgents(supabase),
    loadCustomers(supabase),
    loadAgentOrders(supabase, options.orderLimit ?? 50, options.orderFilters),
    loadOrders(supabase, options.orderLimit ?? 50, options.orderFilters),
    loadContactInquiries(supabase, options.contactInquiryLimit ?? 50),
    loadResellerApplications(supabase, options.resellerApplicationLimit ?? 50),
  ]);

  return {
    pages,
    pageSections,
    products,
    agents,
    customers,
    agentOrders,
    orders,
    contactInquiries,
    resellerApplications,
    summary: buildAdminDashboardSummary({
      orders,
      agentOrders,
      customers,
      products,
      contactInquiries,
      resellerApplications,
      agents,
    }),
  };
}

export async function loadAdminDashboardSummaryData(): Promise<AdminDashboardSummary> {
  const supabase = createSupabaseAdminClient();
  const [orders, agentOrders, customers, products, contactInquiries, resellerApplications, agents] =
    await Promise.all([
      loadDashboardSummaryOrders(supabase),
      loadDashboardSummaryAgentOrders(supabase),
      loadDashboardSummaryCustomers(supabase),
      loadDashboardSummaryProducts(supabase),
      loadDashboardSummaryContactInquiries(supabase),
      loadDashboardSummaryResellerApplications(supabase),
      loadDashboardSummaryAgents(supabase),
    ]);

  return buildAdminDashboardSummary({
    orders,
    agentOrders,
    customers,
    products,
    contactInquiries,
    resellerApplications,
    agents,
  });
}

export async function loadAdminOrderManagementData(
  orderFilters: AdminOrderFilters = {},
  pagination: AdminPaginationParams = defaultAdminPagination,
): Promise<AdminOrderManagementData> {
  const supabase = createSupabaseAdminClient();
  const [products, agents, customers, orderRows, orders, customerBalances] = await Promise.all([
    loadProducts(supabase),
    loadAgents(supabase),
    loadCustomers(supabase),
    loadPaginatedAdminOrderRows(supabase, orderFilters, pagination),
    loadOrders(supabase, 50),
    loadCustomerOutstandingBalances(supabase),
  ]);

  return {
    products,
    agents,
    customers,
    agentOrders: [],
    orders,
    orderRows: orderRows.records,
    customerBalances,
    pagination: orderRows.pagination,
  };
}

export async function loadAdminProductManagementData(
  productFilters: AdminProductFilters = {},
  pagination: AdminPaginationParams = defaultAdminPagination,
): Promise<AdminProductManagementData> {
  // Product filtering is used by the products fragment endpoint. Keep the query
  // server-side without loading the rest of the dashboard page payload.
  const supabase = createSupabaseAdminClient();
  const products = await loadPaginatedProducts(supabase, productFilters, pagination);

  return {
    products: products.records,
    pagination: products.pagination,
  };
}

export async function loadAdminProductOptionData(): Promise<Pick<AdminDashboardData, "products">> {
  const supabase = createSupabaseAdminClient();

  return {
    products: await loadProducts(supabase),
  };
}

export async function loadAdminInvoiceManagementData(
  invoiceFilters: AdminInvoiceFilters = {},
  pagination: AdminPaginationParams = defaultAdminPagination,
): Promise<AdminInvoiceManagementData> {
  const supabase = createSupabaseAdminClient();
  const invoices = await loadPaginatedAdminInvoiceRows(supabase, invoiceFilters, pagination);

  return {
    invoiceRows: invoices.records,
    pagination: invoices.pagination,
  };
}

export async function loadAdminSalesManagementData(
  salesFilters: AdminOrderFilters = {},
  pagination: AdminPaginationParams = defaultAdminPagination,
): Promise<AdminSalesManagementData> {
  const supabase = createSupabaseAdminClient();
  const sales = await loadPaginatedAdminSalesRows(supabase, salesFilters, pagination);

  return {
    salesRows: sales.records,
    pagination: sales.pagination,
  };
}

export async function loadAdminCustomerManagementData(
  customerFilters: AdminCustomerFilters = {},
  pagination: AdminPaginationParams = defaultAdminPagination,
): Promise<AdminCustomerManagementData> {
  const supabase = createSupabaseAdminClient();
  const [customers, agents] = await Promise.all([
    loadPaginatedAdminCustomerRows(supabase, customerFilters, pagination),
    loadAgents(supabase),
  ]);

  return {
    customers: customers.records,
    agents,
    pagination: customers.pagination,
  };
}

export async function loadAdminCustomerRecord(customerId: string): Promise<AdminCustomer | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("customer")
    .select(customerWithProfileSelect)
    .eq("id", customerId)
    .maybeSingle();

  if (error) throwLoadError("Unable to load admin customer record.", error);

  return data
    ? normalizeAdminCustomer(mapCustomerWithProfile(data as Parameters<typeof mapCustomerWithProfile>[0]))
    : null;
}

export async function loadAdminAgentManagementData(
  agentFilters: AdminAgentFilters = {},
  pagination: AdminPaginationParams = defaultAdminPagination,
): Promise<AdminAgentManagementData> {
  const supabase = createSupabaseAdminClient();
  const agents = await loadPaginatedAgents(supabase, agentFilters, pagination);

  return {
    agents: agents.records,
    pagination: agents.pagination,
  };
}

export async function loadAdminInquiryManagementData(
  inquiryFilters: AdminInquiryFilters = {},
  pagination: AdminPaginationParams = defaultAdminPagination,
): Promise<AdminInquiryManagementData> {
  const supabase = createSupabaseAdminClient();
  const inquiries = await loadPaginatedContactInquiries(
    supabase,
    inquiryFilters,
    pagination,
  );

  return {
    contactInquiries: inquiries.records,
    pagination: inquiries.pagination,
  };
}

export async function loadAdminResellerApplicationManagementData(
  resellerApplicationFilters: AdminResellerApplicationFilters = {},
  pagination: AdminPaginationParams = defaultAdminPagination,
): Promise<AdminResellerApplicationManagementData> {
  const supabase = createSupabaseAdminClient();
  const applications = await loadPaginatedResellerApplications(
    supabase,
    resellerApplicationFilters,
    pagination,
  );

  return {
    resellerApplications: applications.records,
    pagination: applications.pagination,
  };
}

export async function loadAdminActivityManagementData(
  activityFilters: AdminActivityFilters = {},
  pagination: AdminPaginationParams = defaultAdminPagination,
): Promise<AdminActivityManagementData> {
  const supabase = createSupabaseAdminClient();
  const activity = await loadPaginatedAdminActivityRows(supabase, activityFilters, pagination);

  return {
    activityItems: activity.records,
    pagination: activity.pagination,
  };
}

export async function loadAdminOrder(orderId: string): Promise<AdminOrder | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("customer_order")
    .select(adminOrderSelect)
    .eq("id", orderId)
    .maybeSingle();

  if (error) throwLoadError("Unable to load admin order.", error);

  if (!data) {
    return null;
  }

  const [order] = await enrichOrdersWithAgentEmails(supabase, [normalizeAdminOrder(data)]);
  return order ?? null;
}

export async function loadAdminAgentOrder(agentOrderId: string): Promise<AdminAgentOrder | null> {
  const supabase = createSupabaseAdminClient();
  const [{ data, error }, { data: sourceOrderData, error: sourceOrderError }] = await Promise.all([
    supabase
      .from("agent_order")
      .select(adminAgentOrderSelect)
      .eq("id", agentOrderId)
      .maybeSingle(),
    supabase
      .from("customer_order")
      .select(adminOrderSelect)
      .eq("converted_to_agent_order_id", agentOrderId)
      .maybeSingle(),
  ]);

  if (error) throwLoadError("Unable to load admin agent order.", error);
  if (sourceOrderError) throwLoadError("Unable to load converted source order.", sourceOrderError);

  if (!data) {
    return null;
  }

  const [agentOrder] = await enrichAgentOrdersWithAgentEmails(
    supabase,
    [normalizeAdminAgentOrder(data)],
  );
  if (!agentOrder) {
    return null;
  }

  const [convertedSourceOrder] = sourceOrderData
    ? await enrichOrdersWithAgentEmails(supabase, [normalizeAdminOrder(sourceOrderData)])
    : [null];

  return {
    ...agentOrder,
    converted_source_order: convertedSourceOrder ?? null,
  };
}

export async function loadAdminAgentDetailsData(
  agentId: string,
): Promise<AdminAgentDetailsData | null> {
  const supabase = createSupabaseAdminClient();
  const agent = await loadAgentById(supabase, agentId);

  if (!agent) {
    return null;
  }

  const agentCustomerId = agent.customer_id ?? null;
  const assignedCustomers = (await loadCustomersForAgent(supabase, agentId))
    .filter((customer) => customer.id !== agentCustomerId);
  const promotedCustomerId = agent.promoted_from_customer_id ?? null;
  const [customerOrders, agentOrders, agentCustomerOrders, previousCustomerOrders] = await Promise.all([
    loadOrdersForCustomers(supabase, assignedCustomers.map((customer) => customer.id)),
    loadAgentOrdersForAgent(supabase, agentId),
    agentCustomerId
      ? loadOrdersForCustomers(supabase, [agentCustomerId])
      : Promise.resolve([]),
    promotedCustomerId
      ? loadOrdersForCustomers(supabase, [promotedCustomerId], { includeConverted: true })
      : Promise.resolve([]),
  ]);

  return {
    agent,
    assignedCustomers,
    customerOrders,
    previousCustomerOrders,
    agentOrders,
    remainingBalance: customerOrders.reduce(
      (total, order) => total + adminOrderRemainingBalance(order),
      0,
    ),
    agentRemainingBalance: agentCustomerBalance(agentCustomerOrders, agentCustomerId),
  };
}

async function loadPages(supabase: SupabaseAdminClient) {
  const { data, error } = await supabase
    .from("page")
    .select("id, slug, title, status, published_at, created_at, updated_at")
    .order("slug", { ascending: true });

  if (error) throwLoadError("Unable to load admin pages.", error);

  return (data ?? []) as AdminPage[];
}

async function loadPageSections(supabase: SupabaseAdminClient) {
  const { data, error } = await supabase
    .from("page_section")
    .select("id, page_id, type, sort_order, content, status, created_at, updated_at")
    .order("sort_order", { ascending: true });

  if (error) throwLoadError("Unable to load admin page sections.", error);

  return (data ?? []) as AdminPageSection[];
}

async function loadProducts(
  supabase: SupabaseAdminClient,
  filters: AdminProductFilters = {},
) {
  let query = supabase
    .from("product")
    .select(
      "id, name, category, description, unit_label, default_price, reseller_price, reseller_deduction_type, reseller_deduction_value, agent_commission_type, agent_commission_value, stock_status, image_path, is_active, created_at, updated_at",
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

  const { data, error } = await query
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  if (error) throwLoadError("Unable to load admin products.", error);

  return (data ?? []) as AdminProduct[];
}

async function loadPaginatedProducts(
  supabase: SupabaseAdminClient,
  filters: AdminProductFilters,
  pagination: AdminPaginationParams,
): Promise<AdminPaginatedResult<AdminProduct>> {
  let query = supabase
    .from("product")
    .select(
      "id, name, category, description, unit_label, default_price, reseller_price, reseller_deduction_type, reseller_deduction_value, agent_commission_type, agent_commission_value, stock_status, image_path, is_active, created_at, updated_at",
      { count: "exact" },
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

  const { from, to } = adminPaginationRange(pagination);
  const { data, error, count } = await query
    .order("is_active", { ascending: false })
    .order("name", { ascending: true })
    .range(from, to);

  if (error) throwLoadError("Unable to load admin products.", error);

  return {
    records: (data ?? []) as AdminProduct[],
    pagination: buildAdminPagination(count ?? 0, pagination),
  };
}

type AdminPaginatedRpcResponse = {
  records?: unknown;
  total_rows?: number | string | null;
};

function readPaginatedRpcResponse<T>(
  data: unknown,
  pagination: AdminPaginationParams,
): AdminPaginatedResult<T> {
  const rpcRow = Array.isArray(data)
    ? data[0] as AdminPaginatedRpcResponse | undefined
    : data as AdminPaginatedRpcResponse | undefined;
  const rawRecords = Array.isArray(rpcRow?.records) ? rpcRow.records : [];
  const totalRows = Number(rpcRow?.total_rows ?? rawRecords.length);

  return {
    records: rawRecords as T[],
    pagination: buildAdminPagination(Number.isFinite(totalRows) ? totalRows : 0, pagination),
  };
}

async function loadPaginatedAdminOrderRows(
  supabase: SupabaseAdminClient,
  filters: AdminOrderFilters,
  pagination: AdminPaginationParams,
): Promise<AdminPaginatedResult<AdminOrderTableRow>> {
  const { data, error } = await supabase.rpc("list_admin_order_rows", {
    search_query: filters.search ?? null,
    source_filter: filters.source ?? null,
    order_status_filter: filters.orderStatus ?? null,
    payment_status_filter: filters.paymentStatus ?? null,
    page_number: pagination.page,
    page_size: pagination.pageSize,
  });

  if (error) throwLoadError("Unable to load admin order rows.", error);

  const result = readPaginatedRpcResponse<AdminOrderTableRow>(data, pagination);

  return {
    ...result,
    records: result.records.map((row) => ({
      ...row,
      release_date: row.release_date ?? null,
      total_amount: Math.max(
        roundCurrency(
          Number(row.total_amount ?? 0) - Number(row.commission_total ?? 0),
        ),
        0,
      ),
      commission_total: Number(row.commission_total ?? 0),
      paid_total: Number(row.paid_total ?? 0),
      remaining_receivable: Number(row.remaining_receivable ?? 0),
      linked_customer_count: row.linked_customer_count === null
        ? null
        : Number(row.linked_customer_count),
      pending_customer_order_count: row.pending_customer_order_count === null
        ? null
        : Number(row.pending_customer_order_count),
    })),
  };
}

async function loadPaginatedAdminInvoiceRows(
  supabase: SupabaseAdminClient,
  filters: AdminInvoiceFilters,
  pagination: AdminPaginationParams,
): Promise<AdminPaginatedResult<AdminInvoiceTableRow>> {
  const { data, error } = await supabase.rpc("list_admin_invoice_rows", {
    search_query: filters.search ?? null,
    balance_status_filter: filters.balanceStatus ?? null,
    page_number: pagination.page,
    page_size: pagination.pageSize,
  });

  if (error) throwLoadError("Unable to load admin invoice rows.", error);

  const result = readPaginatedRpcResponse<AdminInvoiceTableRow>(data, pagination);

  return {
    ...result,
    records: result.records.map((row) => ({
      ...row,
      invoice_total: Number(row.invoice_total ?? 0),
      paid_total: Number(row.paid_total ?? 0),
      balance: Number(row.balance ?? 0),
    })),
  };
}

async function loadPaginatedAdminSalesRows(
  supabase: SupabaseAdminClient,
  filters: AdminOrderFilters,
  pagination: AdminPaginationParams,
): Promise<AdminPaginatedResult<AdminSalesTableRow>> {
  const { data, error } = await supabase.rpc("list_admin_sales_rows", {
    search_query: filters.search ?? null,
    source_filter: filters.source ?? null,
    order_status_filter: filters.orderStatus ?? null,
    payment_status_filter: filters.paymentStatus ?? null,
    page_number: pagination.page,
    page_size: pagination.pageSize,
  });

  if (error) throwLoadError("Unable to load admin sales rows.", error);

  const result = readPaginatedRpcResponse<AdminSalesTableRow>(data, pagination);

  return {
    ...result,
    records: result.records.map((row) => ({
      ...row,
      sale_date: row.sale_date ?? null,
      release_date: row.release_date ?? null,
      invoice_number: row.invoice_number ?? null,
      order_total: Number(row.order_total ?? 0),
      paid_total: Number(row.paid_total ?? 0),
      balance: Number(row.balance ?? 0),
      payment_count: Number(row.payment_count ?? 0),
    })),
  };
}

async function loadPaginatedAdminCustomerRows(
  supabase: SupabaseAdminClient,
  filters: AdminCustomerFilters,
  pagination: AdminPaginationParams,
): Promise<AdminPaginatedResult<AdminCustomerTableRow>> {
  const { data, error } = await supabase.rpc("list_admin_customer_rows", {
    search_query: filters.search ?? null,
    customer_type_filter: filters.customerType ?? null,
    page_number: pagination.page,
    page_size: pagination.pageSize,
  });

  if (error) throwLoadError("Unable to load admin customer rows.", error);

  const result = readPaginatedRpcResponse<AdminCustomerTableRow>(data, pagination);

  return {
    ...result,
    records: result.records.map((row) => ({
      ...row,
      credit_limit: Number(row.credit_limit ?? 1000),
      credit_limit_exceeded: Boolean(row.credit_limit_exceeded),
      outstanding_credit_balance: Number(row.outstanding_credit_balance ?? 0),
    })),
  };
}

async function loadPaginatedAdminActivityRows(
  supabase: SupabaseAdminClient,
  filters: AdminActivityFilters,
  pagination: AdminPaginationParams,
): Promise<AdminPaginatedResult<AdminActivityTableRow>> {
  const { data, error } = await supabase.rpc("list_admin_activity_rows", {
    search_query: filters.search ?? null,
    page_number: pagination.page,
    page_size: pagination.pageSize,
  });

  if (error) throwLoadError("Unable to load admin activity rows.", error);

  const result = readPaginatedRpcResponse<AdminActivityTableRow & { occurred_at?: string }>(
    data,
    pagination,
  );

  return {
    ...result,
    records: result.records.map((row) => ({
      id: row.id,
      category: row.category,
      title: row.title,
      detail: row.detail,
      occurredAt: row.occurredAt ?? row.occurred_at ?? "",
    })),
  };
}

async function loadCustomerOutstandingBalances(
  supabase: SupabaseAdminClient,
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("customer_order")
    .select(`
      id,
      customer_id,
      order_status,
      payment_status,
      customer_order_item (
        final_quantity,
        unit_price
      ),
      payment (
        amount
      )
    `)
    .neq("order_status", "closed")
    .in("payment_status", ["unpaid", "partial"])
    .is("converted_to_agent_order_id", null);

  if (error) throwLoadError("Unable to load customer outstanding balances.", error);

  return ((data ?? []) as Array<{
    customer_id?: unknown;
    customer_order_item?: Array<{ final_quantity?: unknown; unit_price?: unknown }> | null;
    payment?: Array<{ amount?: unknown }> | null;
  }>).reduce<Record<string, number>>((balances, order) => {
    if (typeof order.customer_id !== "string") return balances;

    const orderTotal = (order.customer_order_item ?? []).reduce((total, item) => {
      const quantity = Number(item.final_quantity ?? 0);
      const unitPrice = Number(item.unit_price ?? 0);
      return total + (Number.isFinite(quantity) && Number.isFinite(unitPrice) ? quantity * unitPrice : 0);
    }, 0);
    const paidTotal = (order.payment ?? []).reduce((total, payment) => {
      const amount = Number(payment.amount ?? 0);
      return total + (Number.isFinite(amount) ? amount : 0);
    }, 0);
    const balance = Math.max(roundCurrency(orderTotal - paidTotal), 0);

    return {
      ...balances,
      [order.customer_id]: roundCurrency((balances[order.customer_id] ?? 0) + balance),
    };
  }, {});
}

function escapePostgrestFilterValue(value: string) {
  return value.replace(/[%_,.]/g, (character) => `\\${character}`);
}

async function loadPaginatedAgents(
  supabase: SupabaseAdminClient,
  filters: AdminAgentFilters,
  pagination: AdminPaginationParams,
): Promise<AdminPaginatedResult<AdminAgent>> {
  const { data, error } = await supabase.rpc("list_admin_agent_rows", {
    search_query: filters.search ?? null,
    status_filter: filters.status ?? null,
    page_number: pagination.page,
    page_size: pagination.pageSize,
  });

  if (error) throwLoadError("Unable to load admin agents.", error);

  return readPaginatedRpcResponse<AdminAgent>(data, pagination);
}

async function loadAgents(
  supabase: SupabaseAdminClient,
  filters: AdminAgentFilters = {},
) {
  const { data, error } = await supabase
    .from("agent")
    .select(agentWithProfileSelect);

  if (error) throwLoadError("Unable to load admin agents.", error);

  const emailByUserId = await loadAuthEmailsByUserId(
    supabase,
    (data ?? [])
      .map((agent) => (agent as { user_id?: string | null }).user_id)
      .filter((userId): userId is string => Boolean(userId)),
  );

  const agents = (data ?? [])
    .map((row) => mapAgentWithProfile(
      row as Parameters<typeof mapAgentWithProfile>[0],
      (row as { user_id?: string | null }).user_id
        ? emailByUserId.get(String((row as { user_id?: string | null }).user_id)) ?? null
        : null,
    ))
    .sort((left, right) => left.display_name.localeCompare(right.display_name));

  if (!filters.search && !filters.status) {
    return agents;
  }

  return filterAdminAgents(agents, filters);
}

async function loadAgentById(
  supabase: SupabaseAdminClient,
  agentId: string,
): Promise<AdminAgent | null> {
  const { data, error } = await supabase
    .from("agent")
    .select(agentWithProfileSelect)
    .eq("id", agentId)
    .maybeSingle();

  if (error) throwLoadError("Unable to load admin agent.", error);
  if (!data) return null;

  const emailByUserId = await loadAuthEmailsByUserId(
    supabase,
    (data as { user_id?: string | null }).user_id ? [String((data as { user_id?: string | null }).user_id)] : [],
  );

  return mapAgentWithProfile(
    data as Parameters<typeof mapAgentWithProfile>[0],
    (data as { user_id?: string | null }).user_id
      ? emailByUserId.get(String((data as { user_id?: string | null }).user_id)) ?? null
      : null,
  );
}

async function loadCustomersForAgent(
  supabase: SupabaseAdminClient,
  agentId: string,
) {
  const { data, error } = await supabase
    .from("customer")
    .select(customerWithProfileSelect)
    .eq("assigned_agent_id", agentId)
    .is("promoted_to_agent_id", null)
    .order("created_at", { ascending: false });

  if (error) throwLoadError("Unable to load assigned customers.", error);

  return ((data ?? []) as Parameters<typeof mapCustomerWithProfile>[0][]).map((row) =>
    normalizeAdminCustomer(mapCustomerWithProfile(row)),
  );
}

async function loadOrdersForCustomers(
  supabase: SupabaseAdminClient,
  customerIds: string[],
  options: { includeConverted?: boolean } = {},
) {
  if (customerIds.length === 0) {
    return [];
  }

  let query = supabase
    .from("customer_order")
    .select(adminOrderSelect)
    .in("customer_id", customerIds);

  if (!options.includeConverted) {
    query = query.is("converted_to_agent_order_id", null);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) throwLoadError("Unable to load assigned customer orders.", error);

  return enrichOrdersWithAgentEmails(
    supabase,
    ((data ?? []) as unknown[]).map(normalizeAdminOrder),
  );
}

async function loadAgentOrdersForAgent(
  supabase: SupabaseAdminClient,
  agentId: string,
) {
  const { data, error } = await supabase
    .from("agent_order")
    .select(adminAgentOrderSelect)
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (error) throwLoadError("Unable to load admin agent orders.", error);

  return enrichAgentOrdersWithAgentEmails(
    supabase,
    ((data ?? []) as unknown[]).map(normalizeAdminAgentOrder),
  );
}

async function loadCustomers(
  supabase: SupabaseAdminClient,
  filters: AdminCustomerFilters = {},
) {
  const { data, error } = await supabase
    .from("customer")
    .select(customerWithProfileSelect)
    .is("promoted_to_agent_id", null)
    .order("created_at", { ascending: false });

  if (error) throwLoadError("Unable to load admin customers.", error);

  const customers = ((data ?? []) as Parameters<typeof mapCustomerWithProfile>[0][]).map((row) =>
    normalizeAdminCustomer(mapCustomerWithProfile(row)),
  );

  if (!filters.search && !filters.customerType) {
    return customers;
  }

  const agentNamesById = new Map<string, string>();

  if (filters.search) {
    const { data: agentData, error: agentError } = await supabase
      .from("agent")
      .select(agentSummaryWithProfileSelect);

    if (agentError) throwLoadError("Unable to load admin customers.", agentError);

    (agentData ?? []).forEach((agent) => {
      const mapped = mapAgentSummaryWithProfile(agent as Parameters<typeof mapAgentSummaryWithProfile>[0]);
      agentNamesById.set(mapped.id, mapped.display_name);
    });
  }

  return filterAdminCustomers(customers, filters, agentNamesById);
}

async function loadOrders(
  supabase: SupabaseAdminClient,
  limit: number,
  filters: AdminOrderFilters = {},
) {
  let query = supabase
    .from("customer_order")
    .select(adminOrderSelect)
    .is("converted_to_agent_order_id", null);

  if (filters.source) {
    query = query.eq("source", filters.source);
  }

  if (filters.orderStatus) {
    if (!customerOrderStatuses.has(filters.orderStatus)) {
      return [];
    }

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

  if (error) throwLoadError("Unable to load admin orders.", error);

  const orders = await enrichOrdersWithAgentEmails(
    supabase,
    ((data ?? []) as unknown[]).map(normalizeAdminOrder),
  );
  const filteredOrders = shouldPostFilter
    ? filterAdminOrders(orders, filters)
    : orders;

  return filteredOrders.slice(0, limit);
}

function adminOrderRemainingBalance(order: AdminOrder) {
  const invoiceTotal = order.customer_order_item.reduce((total, item) => {
    return total + item.final_quantity * item.unit_price;
  }, 0);
  const paymentTotal = order.payment.reduce((total, payment) => total + payment.amount, 0);

  return Math.max(invoiceTotal - paymentTotal, 0);
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function loadAgentOrders(
  supabase: SupabaseAdminClient,
  limit: number,
  filters: AdminOrderFilters = {},
) {
  if (filters.source && filters.source !== "agent_submitted") {
    return [];
  }

  if (filters.paymentStatus) {
    return [];
  }

  let query = supabase
    .from("agent_order")
    .select(adminAgentOrderSelect);

  if (filters.orderStatus) {
    if (!agentOrderStatuses.has(filters.orderStatus)) {
      return [];
    }

    query = query.eq("order_status", filters.orderStatus);
  }

  const shouldPostFilter = hasComputedOrderFilters(filters);
  let orderedQuery = query.order("created_at", { ascending: false });

  if (!shouldPostFilter) {
    orderedQuery = orderedQuery.limit(limit);
  }

  const { data, error } = await orderedQuery;

  if (error) throwLoadError("Unable to load admin agent orders.", error);

  const agentOrders = await enrichAgentOrdersWithAgentEmails(
    supabase,
    ((data ?? []) as unknown[]).map(normalizeAdminAgentOrder),
  );
  const filteredAgentOrders = shouldPostFilter
    ? filterAdminAgentOrders(agentOrders, filters)
    : agentOrders;

  return filteredAgentOrders.slice(0, limit);
}

function normalizeAdminOrder(order: unknown): AdminOrder {
  const raw = order as Record<string, unknown>;
  const adminOrder = order as AdminOrder;

  const normalizedCustomer = raw.customer
    ? mapNestedOrderCustomer(raw.customer as Parameters<typeof mapNestedOrderCustomer>[0])
    : null;

  const normalizedAgent = raw.agent
    ? normalizeAgentSummaryWithProfile(raw.agent)
    : null;
  const normalizedAgentOrder = normalizeAdminOrderParentAgentOrder(raw.agent_order);

  const agentReceivedPayment = (adminOrder.agent_received_payment ?? []).map((payment) => {
    const paymentRecord = payment as {
      agent?: {
        id?: string;
        profile?: ProfileIdentityRow | ProfileIdentityRow[] | null;
      };
    };

    if (!paymentRecord.agent?.profile) {
      return payment;
    }

    const profile = resolveRelation(paymentRecord.agent.profile);

    return {
      ...payment,
      agent: {
        id: String(paymentRecord.agent.id),
        display_name: profile ? buildDisplayName(profile) : "Agent",
      },
    };
  });

  return {
    ...adminOrder,
    customer: normalizedCustomer,
    agent: normalizedAgent,
    agent_order: normalizedAgentOrder,
    customer_order_item: Array.isArray(adminOrder.customer_order_item) ? adminOrder.customer_order_item : [],
    payment: Array.isArray(adminOrder.payment) ? adminOrder.payment : [],
    agent_received_payment: agentReceivedPayment,
    invoice: normalizeRelationArray(adminOrder.invoice),
    customer_order_status_history: Array.isArray(adminOrder.customer_order_status_history)
      ? adminOrder.customer_order_status_history
      : [],
  };
}

function normalizeAdminOrderParentAgentOrder(value: unknown): AdminOrderParentAgentOrder | null {
  const agentOrder = Array.isArray(value)
    ? value[0]
    : value;
  const normalizedAgentOrder = agentOrder as {
    id: string;
    agent_id: string;
    agent?: unknown;
  } | null | undefined;

  if (!normalizedAgentOrder) {
    return null;
  }

  const agent = Array.isArray(normalizedAgentOrder.agent)
    ? normalizedAgentOrder.agent[0]
    : normalizedAgentOrder.agent;

  return {
    id: normalizedAgentOrder.id,
    agent_id: normalizedAgentOrder.agent_id,
    agent: agent
      ? normalizeAgentSummaryWithProfile(agent)
      : null,
  };
}

function normalizeAgentSummaryWithProfile(agent: unknown): AdminAgentSummary {
  const mapped = mapAgentSummaryWithProfile(agent as Parameters<typeof mapAgentSummaryWithProfile>[0]);

  return {
    ...mapped,
    user_id: mapped.user_id ?? null,
  };
}

function normalizeAdminCustomer(customer: AdminCustomer): AdminCustomer {
  return {
    ...customer,
    credit_limit: Number(customer.credit_limit ?? 1000),
    credit_limit_exceeded: Boolean(customer.credit_limit_exceeded),
  };
}

function normalizeAdminAgentOrder(order: unknown): AdminAgentOrder {
  const adminAgentOrder = order as AdminAgentOrder;

  return {
    ...adminAgentOrder,
    agent: adminAgentOrder.agent
      ? normalizeAgentSummaryWithProfile(adminAgentOrder.agent)
      : null,
    agent_order_item: Array.isArray(adminAgentOrder.agent_order_item)
      ? adminAgentOrder.agent_order_item
      : [],
    customer_order: Array.isArray(adminAgentOrder.customer_order)
      ? adminAgentOrder.customer_order.map(normalizeAdminOrder)
      : [],
  };
}

function hasComputedOrderFilters(filters: AdminOrderFilters) {
  return Boolean(filters.search);
}

function filterAdminOrders(orders: AdminOrder[], filters: AdminOrderFilters) {
  const search = filters.search?.toLowerCase();

  return orders.filter((order) => {
    const matchesSearch = !search || getAdminOrderSearchText(order).includes(search);

    return matchesSearch;
  });
}

function filterAdminAgentOrders(agentOrders: AdminAgentOrder[], filters: AdminOrderFilters) {
  const search = filters.search?.toLowerCase();

  return agentOrders.filter((order) => {
    const matchesSearch = !search || getAdminAgentOrderSearchText(order).includes(search);

    return matchesSearch;
  });
}

function filterAdminAgents(agents: AdminAgent[], filters: AdminAgentFilters) {
  const searchTerms = filters.search
    ?.toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);

  return agents.filter((agent) => {
    const searchText = [agent.employee_id, agent.first_name, agent.last_name, agent.display_name, agent.email, agent.contact]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" ")
      .toLowerCase();
    const matchesSearch = !searchTerms || searchTerms.every((term) => searchText.includes(term));
    const matchesStatus = !filters.status || agent.status === filters.status;

    return matchesSearch && matchesStatus;
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

function getAdminOrderSearchText(order: AdminOrder) {
  const customer = order.customer;
  const agent = order.agent;
  const values = [
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

function getAdminAgentOrderSearchText(order: AdminAgentOrder) {
  const values = [
    order.order_status,
    order.agent?.display_name,
    order.agent?.email,
    ...order.agent_order_item.flatMap((item) => [
      item.product?.name,
      item.product?.unit_label,
    ]),
    ...order.customer_order.flatMap((customerOrder) => [
      customerOrder.customer?.first_name,
      customerOrder.customer?.last_name,
      customerOrder.customer?.phone_number,
      customerOrder.customer?.email,
      customerOrder.customer?.address,
    ]),
  ];

  return values
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
}

function getAdminCustomerSearchText(customer: AdminCustomer, assignedAgent: string) {
  const values = [
    customer.tracking_number,
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
                email: emailByUserId.get(
                  (order.customer.assigned_agent as { user_id?: string }).user_id ?? "",
                ) ?? null,
                contact: order.customer.assigned_agent.contact ?? null,
              }
            : null,
        }
      : null,
  }));
}

async function enrichAgentOrdersWithAgentEmails(
  supabase: SupabaseAdminClient,
  agentOrders: AdminAgentOrder[],
): Promise<AdminAgentOrder[]> {
  const agentUserIds = agentOrders
    .flatMap((order) => [
      order.agent,
      ...order.customer_order.flatMap((customerOrder) => [
        customerOrder.agent,
        customerOrder.customer?.assigned_agent ?? null,
      ]),
    ])
    .filter((agent): agent is NonNullable<AdminOrder["agent"]> & { user_id?: string } => Boolean(agent))
    .map((agent) => agent.user_id)
    .filter((userId): userId is string => typeof userId === "string" && userId.length > 0);

  const emailByUserId = await loadAuthEmailsByUserId(supabase, agentUserIds);

  return agentOrders.map((order) => ({
    ...order,
    agent: order.agent
      ? {
          id: order.agent.id,
          user_id: order.agent.user_id,
          display_name: order.agent.display_name,
          email: emailByUserId.get((order.agent as { user_id?: string }).user_id ?? "") ?? null,
          contact: order.agent.contact ?? null,
        }
      : null,
    customer_order: order.customer_order.map((customerOrder) => ({
      ...customerOrder,
      agent: customerOrder.agent
        ? {
            id: customerOrder.agent.id,
            display_name: customerOrder.agent.display_name,
            email: emailByUserId.get((customerOrder.agent as { user_id?: string }).user_id ?? "") ?? null,
            contact: customerOrder.agent.contact ?? null,
          }
        : null,
      customer: customerOrder.customer
        ? {
            ...customerOrder.customer,
            assigned_agent: customerOrder.customer.assigned_agent
              ? {
                  id: customerOrder.customer.assigned_agent.id,
                  display_name: customerOrder.customer.assigned_agent.display_name,
                  email: emailByUserId.get(
                    (customerOrder.customer.assigned_agent as { user_id?: string }).user_id ?? "",
                  ) ?? null,
                  contact: customerOrder.customer.assigned_agent.contact ?? null,
                }
              : null,
          }
        : null,
    })),
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
    throwLoadError("Unable to load admin agents.", error);
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

  if (error) throwLoadError("Unable to load admin contact inquiries.", error);

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

async function loadPaginatedContactInquiries(
  supabase: SupabaseAdminClient,
  filters: AdminInquiryFilters,
  pagination: AdminPaginationParams,
): Promise<AdminPaginatedResult<AdminContactInquiry>> {
  let query = supabase
    .from("contact_inquiry")
    .select(
      "id, name, email, phone_number, message, inquiry_status, internal_notes, admin_read_at, admin_read_by, created_at, updated_at",
      { count: "exact" },
    );

  if (filters.search) {
    const escapedSearch = escapePostgrestFilterValue(filters.search);
    query = query.or(`name.ilike.%${escapedSearch}%,email.ilike.%${escapedSearch}%,phone_number.ilike.%${escapedSearch}%`);
  }

  if (filters.status) {
    query = query.eq("inquiry_status", filters.status);
  }

  const { from, to } = adminPaginationRange(pagination);
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throwLoadError("Unable to load admin contact inquiries.", error);

  return {
    records: (data ?? []) as AdminContactInquiry[],
    pagination: buildAdminPagination(count ?? 0, pagination),
  };
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

  if (error) throwLoadError("Unable to load admin reseller applications.", error);

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

async function loadPaginatedResellerApplications(
  supabase: SupabaseAdminClient,
  filters: AdminResellerApplicationFilters,
  pagination: AdminPaginationParams,
): Promise<AdminPaginatedResult<AdminResellerApplication>> {
  let query = supabase
    .from("reseller_application")
    .select(
      "id, name, email, contact_number, planned_transaction_type, expected_quantity_per_week, message, application_status, email_delivery_status, price_list_sent_at, email_error, admin_read_at, admin_read_by, created_at, updated_at",
      { count: "exact" },
    );

  if (filters.search) {
    const escapedSearch = escapePostgrestFilterValue(filters.search);
    query = query.or(`name.ilike.%${escapedSearch}%,email.ilike.%${escapedSearch}%,contact_number.ilike.%${escapedSearch}%`);
  }

  if (filters.status) {
    query = query.eq("application_status", filters.status);
  }

  const { from, to } = adminPaginationRange(pagination);
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throwLoadError("Unable to load admin reseller applications.", error);

  return {
    records: (data ?? []) as AdminResellerApplication[],
    pagination: buildAdminPagination(count ?? 0, pagination),
  };
}

function buildAdminDashboardSummary({
  orders,
  agentOrders,
  customers,
  products,
  contactInquiries,
  resellerApplications,
  agents,
}: {
  orders: Array<Pick<AdminOrder, "order_status">>;
  agentOrders: Array<Pick<AdminAgentOrder, "order_status">>;
  customers: Array<Pick<AdminCustomer, "id">>;
  products: Array<Pick<AdminProduct, "id">>;
  contactInquiries: Array<Pick<AdminContactInquiry, "id">>;
  resellerApplications: Array<Pick<AdminResellerApplication, "id">>;
  agents: Array<Pick<AdminAgent, "id">>;
}): AdminDashboardSummary {
  return {
    ...computeAdminOrderStatusCounts(orders, agentOrders),
    agents: agents.length,
    inquiries: contactInquiries.length,
    customers: customers.length,
    products: products.length,
    resellerApplications: resellerApplications.length,
  };
}

async function loadDashboardSummaryOrders(
  supabase: SupabaseAdminClient,
): Promise<Array<Pick<AdminOrder, "order_status">>> {
  const { data, error } = await supabase
    .from("customer_order")
    .select("order_status")
    .is("converted_to_agent_order_id", null);

  if (error) throwLoadError("Unable to load admin orders.", error);

  return (data ?? []) as Array<Pick<AdminOrder, "order_status">>;
}

async function loadDashboardSummaryAgentOrders(
  supabase: SupabaseAdminClient,
): Promise<Array<Pick<AdminAgentOrder, "order_status">>> {
  const { data, error } = await supabase
    .from("agent_order")
    .select("order_status");

  if (error) throwLoadError("Unable to load admin agent orders.", error);

  return (data ?? []) as Array<Pick<AdminAgentOrder, "order_status">>;
}

async function loadDashboardSummaryAgents(
  supabase: SupabaseAdminClient,
): Promise<AdminAgent[]> {
  const { data, error } = await supabase
    .from("agent")
    .select("id");

  if (error) throwLoadError("Unable to load admin agents.", error);

  return (data ?? []) as AdminAgent[];
}

async function loadDashboardSummaryCustomers(
  supabase: SupabaseAdminClient,
): Promise<AdminCustomer[]> {
  const { data, error } = await supabase
    .from("customer")
    .select("id");

  if (error) throwLoadError("Unable to load admin customers.", error);

  return (data ?? []) as AdminCustomer[];
}

async function loadDashboardSummaryProducts(
  supabase: SupabaseAdminClient,
): Promise<AdminProduct[]> {
  const { data, error } = await supabase
    .from("product")
    .select("id");

  if (error) throwLoadError("Unable to load admin products.", error);

  return (data ?? []) as AdminProduct[];
}

async function loadDashboardSummaryContactInquiries(
  supabase: SupabaseAdminClient,
): Promise<AdminContactInquiry[]> {
  const { data, error } = await supabase
    .from("contact_inquiry")
    .select("id")
    .order("created_at", { ascending: false });

  if (error) throwLoadError("Unable to load admin contact inquiries.", error);

  return (data ?? []) as AdminContactInquiry[];
}

async function loadDashboardSummaryResellerApplications(
  supabase: SupabaseAdminClient,
): Promise<AdminResellerApplication[]> {
  const { data, error } = await supabase
    .from("reseller_application")
    .select("id")
    .order("created_at", { ascending: false });

  if (error) throwLoadError("Unable to load admin reseller applications.", error);

  return (data ?? []) as AdminResellerApplication[];
}
