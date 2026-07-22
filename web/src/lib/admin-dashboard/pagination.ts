export const adminPaginationPageSizes = [10, 50, 100] as const;

export type AdminPaginationPageSize = (typeof adminPaginationPageSizes)[number];

export type AdminPaginationParams = {
  page: number;
  pageSize: AdminPaginationPageSize;
};

export type AdminPagination = AdminPaginationParams & {
  totalRows: number;
  totalPages: number;
  fromRow: number;
  toRow: number;
};

export type AdminPaginatedResult<T> = {
  records: T[];
  pagination: AdminPagination;
};

export const defaultAdminPagination: AdminPaginationParams = {
  page: 1,
  pageSize: 10,
};

export function formatRecordCount(totalRows: number) {
  const count = Math.max(Math.trunc(totalRows), 0);
  const label = count === 1 ? "record" : "records";

  return `${count} ${label}`;
}

export function parseAdminPagination(url: URL): AdminPaginationParams {
  const page = positiveInteger(url.searchParams.get("page")) ?? defaultAdminPagination.page;
  const requestedPageSize = positiveInteger(url.searchParams.get("pageSize"));
  const pageSize = adminPaginationPageSizes.find((size) => size === requestedPageSize) ??
    defaultAdminPagination.pageSize;

  return {
    page,
    pageSize,
  };
}

export function serializeAdminPagination(pagination: AdminPaginationParams): string {
  const params = new URLSearchParams();

  if (pagination.page > defaultAdminPagination.page) {
    params.set("page", String(pagination.page));
  }

  if (pagination.pageSize !== defaultAdminPagination.pageSize) {
    params.set("pageSize", String(pagination.pageSize));
  }

  return params.toString();
}

export function mergeAdminPaginationQuery(
  query: string,
  pagination: AdminPaginationParams,
): string {
  const params = new URLSearchParams(query);
  const paginationQuery = new URLSearchParams(serializeAdminPagination(pagination));

  paginationQuery.forEach((value, key) => {
    params.set(key, value);
  });

  if (pagination.page <= defaultAdminPagination.page) {
    params.delete("page");
  }

  if (pagination.pageSize === defaultAdminPagination.pageSize) {
    params.delete("pageSize");
  }

  return params.toString();
}

export function adminPaginationRange(pagination: AdminPaginationParams) {
  const from = (pagination.page - 1) * pagination.pageSize;

  return {
    from,
    to: from + pagination.pageSize - 1,
  };
}

export function buildAdminPagination(
  count: number,
  pagination: AdminPaginationParams,
): AdminPagination {
  const totalRows = Math.max(Math.trunc(count), 0);
  const totalPages = Math.max(Math.ceil(totalRows / pagination.pageSize), 1);
  const page = Math.min(Math.max(pagination.page, 1), totalPages);
  const fromRow = totalRows === 0 ? 0 : (page - 1) * pagination.pageSize + 1;
  const toRow = totalRows === 0 ? 0 : Math.min(page * pagination.pageSize, totalRows);

  return {
    page,
    pageSize: pagination.pageSize,
    totalRows,
    totalPages,
    fromRow,
    toRow,
  };
}

function positiveInteger(value: string | null) {
  if (!value) return undefined;

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
