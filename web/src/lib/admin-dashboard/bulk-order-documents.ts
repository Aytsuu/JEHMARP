import {
  loadAdminAgentOrder,
  loadAdminOrder,
  type AdminOrder,
} from "@/lib/admin-dashboard/data";
import { buildBulkOrderSlipPdf } from "@/lib/admin-dashboard/order-slip-pdf";
import { buildBulkSalesInvoicePdf } from "@/lib/admin-dashboard/sales-invoice-pdf";
import { loadDocumentPdfLayoutOptions } from "@/lib/platform-settings/document-layout";

export type BulkOrderSelection = {
  id: string;
  rowType: "distributed" | "personal";
};

const selectionPattern = /^(distributed|personal|agent|customer):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function normalizeBulkOrderRowType(value: string): BulkOrderSelection["rowType"] | null {
  const normalized = value.toLowerCase();

  if (normalized === "distributed" || normalized === "agent") {
    return "distributed";
  }

  if (normalized === "personal" || normalized === "customer") {
    return "personal";
  }

  return null;
}

export function parseBulkOrderSelections(values: string[]): BulkOrderSelection[] {
  const selections: BulkOrderSelection[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const match = selectionPattern.exec(value.trim());
    if (!match) continue;

    const rowType = normalizeBulkOrderRowType(match[1]);
    if (!rowType) continue;

    const id = match[2];
    const key = `${rowType}:${id}`;

    if (seen.has(key)) continue;

    seen.add(key);
    selections.push({ id, rowType });
  }

  return selections;
}

export async function resolveCustomerOrdersForBulkDocuments(
  selections: BulkOrderSelection[],
): Promise<AdminOrder[]> {
  const orderIds: string[] = [];
  const seenOrderIds = new Set<string>();

  for (const selection of selections) {
    if (selection.rowType === "personal") {
      if (!seenOrderIds.has(selection.id)) {
        seenOrderIds.add(selection.id);
        orderIds.push(selection.id);
      }
      continue;
    }

    const agentOrder = await loadAdminAgentOrder(selection.id);
    if (!agentOrder) continue;

    for (const customerOrder of agentOrder.customer_order) {
      if (seenOrderIds.has(customerOrder.id)) continue;
      seenOrderIds.add(customerOrder.id);
      orderIds.push(customerOrder.id);
    }
  }

  const orders = await Promise.all(orderIds.map((orderId) => loadAdminOrder(orderId)));

  return orders.filter((order): order is AdminOrder => order !== null);
}

export function filterOrdersWithSalesInvoice(orders: AdminOrder[]): AdminOrder[] {
  return orders.filter((order) => Boolean(order.invoice[0]));
}

export async function buildBulkSalesInvoiceDocument(
  selections: BulkOrderSelection[],
): Promise<Uint8Array | null> {
  const orders = filterOrdersWithSalesInvoice(
    await resolveCustomerOrdersForBulkDocuments(selections),
  );

  if (orders.length === 0) return null;
  const documentLayout = await loadDocumentPdfLayoutOptions();
  return buildBulkSalesInvoicePdf(orders, documentLayout);
}

export async function buildBulkOrderSlipDocument(
  selections: BulkOrderSelection[],
): Promise<Uint8Array | null> {
  const orders = await resolveCustomerOrdersForBulkDocuments(selections);

  if (orders.length === 0) return null;
  const documentLayout = await loadDocumentPdfLayoutOptions();
  return buildBulkOrderSlipPdf(orders, documentLayout);
}
