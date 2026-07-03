import type { APIRoute } from "astro";

import { buildSalesInvoicePdf } from "@/lib/admin-dashboard/sales-invoice-pdf";
import { loadAgentOrder } from "@/lib/agent-dashboard/data";
import { requireAgentRoute } from "@/lib/agent-dashboard/page";
import { fullName } from "@/lib/order-documents/view";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const agentRoute = await requireAgentRoute(context);

  if (!agentRoute.ready) {
    return agentRoute.response;
  }

  const orderId = context.params.orderId;

  if (!orderId) {
    return new Response("Order not found.", { status: 404 });
  }

  const order = await loadAgentOrder(context, orderId);

  if (!order) {
    return new Response("Order not found.", { status: 404 });
  }

  const invoice = order.invoice[0];

  if (!invoice) {
    return new Response("Invoice not found.", { status: 404 });
  }

  const pdf = buildSalesInvoicePdf(order);
  const body = new ArrayBuffer(pdf.byteLength);
  new Uint8Array(body).set(pdf);
  const fileName = `sales-invoice-${sanitizeFileName(fullName(order.customer))}-${invoice.invoice_number}.pdf`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
};

function sanitizeFileName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "") || "invoice";
}
