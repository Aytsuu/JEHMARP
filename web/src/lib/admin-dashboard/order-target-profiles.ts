import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { throwLoadError } from "@/lib/load-error";

import type { AdminAgent, AdminCustomerTableRow } from "./data";
import {
  adminPaginationPageSizes,
  buildAdminPagination,
  defaultAdminPagination,
  type AdminPaginationPageSize,
  type AdminPaginationParams,
} from "./pagination";

export const ORDER_TARGET_COMBINED_PAGE_SIZE = 10;
export const ORDER_TARGET_CUSTOMER_ONLY_PAGE_SIZE = 10;
const RPC_FETCH_BATCH_SIZE = 100;

export type OrderTargetProfileScope = "customer-agent" | "customer";

export type OrderTargetProfileCustomer = {
  type: "customer";
  id: string;
  label: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  address: string;
  assignedAgentId: string;
  isReseller: boolean;
  paymentNotice: "" | "unpaid" | "partial";
  balance: number;
  creditLimit: number;
  creditExceeded: boolean;
};

export type OrderTargetProfileAgent = {
  type: "agent";
  id: string;
  label: string;
  phoneNumber: string;
  email: string;
};

export type OrderTargetProfile = OrderTargetProfileCustomer | OrderTargetProfileAgent;

export type OrderTargetProfilesResult = {
  items: OrderTargetProfile[];
  totalProfiles: number;
  customerTotal: number;
  agentTotal: number;
  page: number;
  pageSize: number;
  segmentPageSize: number;
  totalPages: number;
  hasPagination: boolean;
  suggestedCount: number;
  search: string;
  scope: OrderTargetProfileScope;
};

type AdminPaginatedRpcResponse = {
  records?: unknown;
  total_rows?: number | string | null;
};

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

type PaginatedRpcFetchResult<T> = {
  records: T[];
  pagination: ReturnType<typeof buildAdminPagination>;
};

export function parseOrderTargetProfileQuery(url: URL): {
  page: number;
  scope: OrderTargetProfileScope;
  search: string;
} {
  const page = positiveInteger(url.searchParams.get("page")) ?? 1;
  const scope: OrderTargetProfileScope = url.searchParams.get("scope") === "customer"
    ? "customer"
    : "customer-agent";
  const search = normalizeSearch(url.searchParams.get("q"));

  return {
    page,
    scope,
    search,
  };
}

export async function loadOrderTargetProfiles(input: {
  search?: string | null;
  page?: number;
  scope?: OrderTargetProfileScope;
}): Promise<OrderTargetProfilesResult> {
  const supabase = createSupabaseAdminClient();
  const page = Math.max(Math.trunc(input.page ?? 1), 1);
  const scope = input.scope ?? "customer-agent";
  const search = normalizeSearch(input.search);

  if (scope === "customer") {
    return loadCustomerOnlyOrderTargetProfiles(supabase, search, page);
  }

  return loadCustomerAgentOrderTargetProfiles(supabase, search, page);
}

async function loadCustomerAgentOrderTargetProfiles(
  supabase: SupabaseAdminClient,
  search: string,
  page: number,
): Promise<OrderTargetProfilesResult> {
  const pageSize = ORDER_TARGET_COMBINED_PAGE_SIZE;
  const [customerMeta, agentMeta] = await Promise.all([
    fetchCustomerRows(supabase, search, 1, 1),
    fetchAgentRows(supabase, search, 1, 1),
  ]);

  const customerTotal = customerMeta.pagination.totalRows;
  const agentTotal = agentMeta.pagination.totalRows;
  const totalProfiles = customerTotal + agentTotal;
  const totalPages = Math.max(Math.ceil(totalProfiles / pageSize), 1);
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const globalStart = (safePage - 1) * pageSize;
  const globalEnd = Math.min(globalStart + pageSize, totalProfiles);

  const customerSliceStart = Math.min(globalStart, customerTotal);
  const customerSliceEnd = Math.min(globalEnd, customerTotal);
  const agentSliceStart = Math.max(0, globalStart - customerTotal);
  const agentSliceEnd = Math.min(globalEnd - customerTotal, agentTotal);
  const customerSliceCount = Math.max(0, customerSliceEnd - customerSliceStart);
  const agentSliceCount = Math.max(0, agentSliceEnd - agentSliceStart);

  const [customerRecords, agentRecords] = await Promise.all([
    fetchRpcSlice(
      (pageNumber, batchSize) => fetchCustomerRows(supabase, search, pageNumber, batchSize),
      customerSliceStart,
      customerSliceCount,
    ),
    fetchRpcSlice(
      (pageNumber, batchSize) => fetchAgentRows(supabase, search, pageNumber, batchSize),
      agentSliceStart,
      agentSliceCount,
    ),
  ]);

  const paymentNoticeById = await loadCustomerPaymentNoticesById(
    supabase,
    customerRecords.map((customer) => customer.id),
  );

  const customerItems = customerRecords.map((customer) =>
    mapCustomerProfile(customer, paymentNoticeById.get(customer.id) ?? ""),
  );
  const agentItems = agentRecords.map(mapAgentProfile);
  const items = [...customerItems, ...agentItems];

  return {
    items,
    totalProfiles,
    customerTotal,
    agentTotal,
    page: safePage,
    pageSize,
    segmentPageSize: pageSize,
    totalPages,
    hasPagination: totalPages > 1,
    suggestedCount: items.length,
    search,
    scope: "customer-agent",
  };
}

async function loadCustomerOnlyOrderTargetProfiles(
  supabase: SupabaseAdminClient,
  search: string,
  page: number,
): Promise<OrderTargetProfilesResult> {
  const pageSize = ORDER_TARGET_CUSTOMER_ONLY_PAGE_SIZE;
  const customers = await fetchCustomerRows(supabase, search, page, pageSize);
  const paymentNoticeById = await loadCustomerPaymentNoticesById(
    supabase,
    customers.records.map((customer) => customer.id),
  );
  const items = customers.records.map((customer) =>
    mapCustomerProfile(customer, paymentNoticeById.get(customer.id) ?? ""),
  );
  const totalProfiles = customers.pagination.totalRows;
  const totalPages = customers.pagination.totalPages;

  return {
    items,
    totalProfiles,
    customerTotal: totalProfiles,
    agentTotal: 0,
    page: customers.pagination.page,
    pageSize,
    segmentPageSize: pageSize,
    totalPages,
    hasPagination: totalPages > 1,
    suggestedCount: items.length,
    search,
    scope: "customer",
  };
}

async function fetchCustomerRows(
  supabase: SupabaseAdminClient,
  search: string,
  pageNumber: number,
  pageSize: number,
): Promise<PaginatedRpcFetchResult<AdminCustomerTableRow>> {
  const { data, error } = await supabase.rpc("list_admin_customer_rows", {
    search_query: search || null,
    customer_type_filter: null,
    page_number: pageNumber,
    page_size: pageSize,
  });

  if (error) {
    throwLoadError("Unable to load customer profiles.", error);
  }

  return readPaginatedRpcRecords<AdminCustomerTableRow>(data, {
    page: pageNumber,
    pageSize: normalizeAdminPageSize(pageSize),
  });
}

async function fetchAgentRows(
  supabase: SupabaseAdminClient,
  search: string,
  pageNumber: number,
  pageSize: number,
): Promise<PaginatedRpcFetchResult<AdminAgent>> {
  const { data, error } = await supabase.rpc("list_admin_agent_rows", {
    search_query: search || null,
    status_filter: "active",
    page_number: pageNumber,
    page_size: pageSize,
  });

  if (error) {
    throwLoadError("Unable to load agent profiles.", error);
  }

  return readPaginatedRpcRecords<AdminAgent>(data, {
    page: pageNumber,
    pageSize: normalizeAdminPageSize(pageSize),
  });
}

async function fetchRpcSlice<T>(
  fetchPage: (pageNumber: number, pageSize: number) => Promise<PaginatedRpcFetchResult<T>>,
  sliceStart: number,
  sliceCount: number,
): Promise<T[]> {
  if (sliceCount <= 0) {
    return [];
  }

  const batchSize = RPC_FETCH_BATCH_SIZE;
  const pageNumber = Math.floor(sliceStart / batchSize) + 1;
  const offsetInPage = sliceStart % batchSize;
  const firstPage = await fetchPage(pageNumber, batchSize);
  const firstSlice = firstPage.records.slice(offsetInPage, offsetInPage + sliceCount);

  if (firstSlice.length >= sliceCount) {
    return firstSlice;
  }

  const secondPage = await fetchPage(pageNumber + 1, batchSize);
  return [...firstSlice, ...secondPage.records].slice(0, sliceCount);
}

function mapCustomerProfile(
  customer: AdminCustomerTableRow,
  paymentNotice: "" | "unpaid" | "partial",
): OrderTargetProfileCustomer {
  return {
    type: "customer",
    id: customer.id,
    label: fullCustomerName(customer),
    firstName: customer.first_name,
    lastName: customer.last_name,
    phoneNumber: customer.phone_number,
    email: customer.email ?? "",
    address: customer.address,
    assignedAgentId: customer.assigned_agent_id ?? "",
    isReseller: customer.is_reseller,
    paymentNotice,
    balance: Number(customer.outstanding_credit_balance ?? 0),
    creditLimit: Number(customer.credit_limit ?? 1000),
    creditExceeded: Boolean(customer.credit_limit_exceeded),
  };
}

function mapAgentProfile(agent: AdminAgent): OrderTargetProfileAgent {
  return {
    type: "agent",
    id: agent.id,
    label: agent.display_name,
    phoneNumber: agent.contact ?? "",
    email: agent.email ?? "",
  };
}

async function loadCustomerPaymentNoticesById(
  supabase: SupabaseAdminClient,
  customerIds: readonly string[],
) {
  const notices = new Map<string, "unpaid" | "partial">();

  if (customerIds.length === 0) {
    return notices;
  }

  const { data, error } = await supabase
    .from("order")
    .select("customer_id, payment_status")
    .in("customer_id", customerIds)
    .in("order_kind", ["customer", "personal"])
    .neq("order_status", "closed")
    .in("payment_status", ["unpaid", "partial"]);

  if (error) {
    throwLoadError("Unable to load customer payment notices.", error);
  }

  for (const row of data ?? []) {
    const customerId = typeof row.customer_id === "string" ? row.customer_id : "";
    const paymentStatus = row.payment_status;

    if (!customerId || (paymentStatus !== "unpaid" && paymentStatus !== "partial")) {
      continue;
    }

    if (notices.get(customerId) === "unpaid") {
      continue;
    }

    if (paymentStatus === "unpaid") {
      notices.set(customerId, "unpaid");
      continue;
    }

    if (!notices.has(customerId)) {
      notices.set(customerId, "partial");
    }
  }

  return notices;
}

function parseRpcRecordArray(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function readPaginatedRpcRecords<T>(
  data: unknown,
  pagination: AdminPaginationParams,
) {
  const rpcRow = Array.isArray(data)
    ? data[0] as AdminPaginatedRpcResponse | undefined
    : data as AdminPaginatedRpcResponse | undefined;
  const rawRecords = parseRpcRecordArray(rpcRow?.records);
  const totalRowsValue = rpcRow?.total_rows;
  const totalRows = totalRowsValue !== null && totalRowsValue !== undefined
    ? Number(totalRowsValue)
    : rawRecords.length;

  return {
    records: rawRecords as T[],
    pagination: buildAdminPagination(Number.isFinite(totalRows) ? totalRows : 0, pagination),
  };
}

function normalizeAdminPageSize(pageSize: number): AdminPaginationPageSize {
  return adminPaginationPageSizes.find((size) => size === pageSize)
    ?? defaultAdminPagination.pageSize;
}

function fullCustomerName(customer: Pick<AdminCustomerTableRow, "first_name" | "last_name">) {
  return `${customer.first_name} ${customer.last_name}`.trim();
}

function normalizeSearch(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function positiveInteger(value: string | null | undefined) {
  if (!value) return undefined;

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function buildOrderTargetPickerSummary(result: OrderTargetProfilesResult) {
  if (result.search.length > 0) {
    return "";
  }

  return "Try entering a customer or agent name.";
}
