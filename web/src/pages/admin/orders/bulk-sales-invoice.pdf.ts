import type { APIRoute } from "astro";

import {
  buildBulkSalesInvoiceDocument,
  parseBulkOrderSelections,
} from "@/lib/admin-dashboard/bulk-order-documents";
import { requireAdminRoute } from "@/lib/admin-dashboard/page";

export const prerender = false;

function readSelections(context: Parameters<APIRoute>[0]) {
  return parseBulkOrderSelections(context.url.searchParams.getAll("selection"));
}

function toPdfResponse(pdf: Uint8Array, fileName: string) {
  const body = new ArrayBuffer(pdf.byteLength);
  new Uint8Array(body).set(pdf);

  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const GET: APIRoute = async (context) => {
  const adminRoute = await requireAdminRoute(context);

  if (!adminRoute.ready) {
    return adminRoute.response;
  }

  const selections = readSelections(context);

  if (selections.length === 0) {
    return new Response("Select at least one order.", { status: 400 });
  }

  const pdf = await buildBulkSalesInvoiceDocument(selections);

  if (!pdf) {
    return new Response("No sales invoices found for the selected orders.", { status: 404 });
  }

  return toPdfResponse(pdf, "sales-invoices.pdf");
};
