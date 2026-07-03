import type { DocumentOrder, DocumentOrderItem } from "@/lib/order-documents/view";
import {
  fullName,
  orderTotal,
} from "@/lib/order-documents/view";

const pageWidth = 595;
const pageHeight = 842;
const marginX = 40;
const tableColumnWidths = [235, 80, 100, 100] as const;
const tableRowsPerPage = 10;
const issuedByName = "Narcisan S. Galamiton";

type TextOptions = {
  size?: number;
  align?: "left" | "center" | "right";
};

type SalesInvoicePage = {
  items: DocumentOrderItem[];
  pageNumber: number;
  pageCount: number;
};

export function buildSalesInvoicePdf(order: DocumentOrder): Uint8Array {
  const pages = chunkOrderItems(order.customer_order_item);
  const contentStreams = pages.map((items, index) => buildSalesInvoicePageContent(order, {
    items,
    pageNumber: index + 1,
    pageCount: pages.length,
  }));

  return buildPdfDocument(contentStreams);
}

function chunkOrderItems(items: DocumentOrderItem[]) {
  if (items.length === 0) return [[]];

  return Array.from({ length: Math.ceil(items.length / tableRowsPerPage) }, (_, index) => {
    const start = index * tableRowsPerPage;
    return items.slice(start, start + tableRowsPerPage);
  });
}

function buildSalesInvoicePageContent(order: DocumentOrder, page: SalesInvoicePage) {
  const commands: string[] = [];

  drawHeader(commands, page);
  drawInvoiceFields(commands, order);
  const tableBottomY = drawItemsTable(commands, page.items);
  drawInvoiceTotal(commands, order, tableBottomY);
  drawPaymentAndIssuer(commands);

  return commands.join("\n");
}

function drawHeader(commands: string[], page: SalesInvoicePage) {
  addText(commands, pageWidth / 2, 802, "Meat and Poultry Products", { align: "center", size: 13 });
  addText(commands, pageWidth / 2, 786, "Brgy. Tolo-Tolo Consolacion, Cebu", { align: "center", size: 10 });
  addText(commands, pageWidth / 2, 771, "Cell #: 0917 777 0118 | 0932 215 9289", { align: "center", size: 10 });
  addText(commands, pageWidth / 2, 750, page.pageCount > 1 ? `SALES INVOICE - Page ${page.pageNumber}` : "SALES INVOICE", {
    align: "center",
    size: 14,
  });
  drawCircle(commands, 525, 780, 30);
  addText(commands, 525, 778, "LOGO", { align: "center", size: 9 });
}

function drawInvoiceFields(commands: string[], order: DocumentOrder) {
  const invoice = order.invoice[0];
  const invoiceDate = invoice?.issued_at ?? invoice?.created_at ?? order.created_at;

  addText(commands, 40, 717, `Date: ${formatDate(invoiceDate)}`, { size: 10 });
  drawLine(commands, 73, 713, 190, 713);
  addText(commands, 310, 717, `Invoice No: ${invoice?.invoice_number ?? ""}`, { size: 10 });
  drawLine(commands, 365, 713, 555, 713);
  addText(commands, 40, 695, `Sold to: ${fullName(order.customer)}`, { size: 10 });
  drawLine(commands, 80, 691, 260, 691);
  addText(commands, 310, 695, `Address: ${order.customer?.address ?? ""}`, { size: 10 });
  drawLine(commands, 355, 691, 555, 691);
}

function drawItemsTable(commands: string[], items: DocumentOrderItem[]) {
  const tableTopY = 665;
  const rowHeight = 24;
  const tableWidth = tableColumnWidths.reduce((total, width) => total + width, 0);
  const tableLeftX = marginX;
  const rowCount = items.length + 1;
  const tableBottomY = tableTopY - rowHeight * rowCount;

  drawRect(commands, tableLeftX, tableBottomY, tableWidth, rowHeight * rowCount);

  let currentX = tableLeftX;
  tableColumnWidths.slice(0, -1).forEach((width) => {
    currentX += width;
    drawLine(commands, currentX, tableBottomY, currentX, tableTopY);
  });

  Array.from({ length: rowCount + 1 }).forEach((_, index) => {
    const y = tableTopY - rowHeight * index;
    drawLine(commands, tableLeftX, y, tableLeftX + tableWidth, y);
  });

  const headerY = tableTopY - 16;
  addText(commands, tableLeftX + 6, headerY, "Product", { size: 9 });
  addText(commands, tableLeftX + 241, headerY, "Quantity", { size: 9 });
  addText(commands, tableLeftX + 321, headerY, "Unit Price", { size: 9 });
  addText(commands, tableLeftX + 421, headerY, "Amount", { size: 9 });

  items.forEach((item, index) => {
    const rowY = tableTopY - rowHeight * (index + 1) - 16;
    const quantity = formatQuantity(item.final_quantity);
    const unitPrice = formatMoney(item.unit_price);
    const lineTotal = formatMoney(item.final_quantity * item.unit_price);

    addText(commands, tableLeftX + 6, rowY, truncate(item.product?.name ?? "Missing product", 38), { size: 8 });
    addText(commands, tableLeftX + 241, rowY, quantity, { size: 8 });
    addText(commands, tableLeftX + 321, rowY, unitPrice, { size: 8 });
    addText(commands, tableLeftX + 421, rowY, lineTotal, { size: 8 });
  });

  return tableBottomY;
}

function drawInvoiceTotal(commands: string[], order: DocumentOrder, tableBottomY: number) {
  const totalY = tableBottomY - 24;

  addText(commands, 330, totalY, `Total Amount Due ${formatMoney(orderTotal(order, "final_quantity"))}`, { size: 11 });
  drawLine(commands, 430, totalY - 4, 555, totalY - 4);
}

function drawPaymentAndIssuer(commands: string[]) {
  addText(commands, 40, 348, "Delivery Preference", { size: 10 });
  addText(commands, 40, 330, "Mode of Payment (/)", { size: 9 });
  addText(commands, 40, 312, "( ) Cash   ( ) Check", { size: 9 });

  addText(commands, 40, 277, "Payment Terms (For Order Confirmation)", { size: 10 });
  addText(commands, 40, 259, "( ) Cash on Delivery (COD)  ( ) Bank Transfer   ( ) Gcash", { size: 9 });

  addText(commands, 405, 184, "Issued by:", { size: 10 });
  addText(commands, 340, 156, issuedByName, { size: 10 });
  drawLine(commands, 330, 152, 555, 152);
  addText(commands, 360, 136, "Owner / Authorized Representative", { size: 9 });
}

function buildPdfDocument(contentStreams: string[]) {
  const fontObjectId = 3;
  const pageObjectIds = contentStreams.map((_, index) => 4 + index * 2);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${contentStreams.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...contentStreams.flatMap((content, index) => {
      const pageObjectId = pageObjectIds[index];
      const contentObjectId = pageObjectId + 1;
      const contentLength = new TextEncoder().encode(content).length;

      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
        `<< /Length ${contentLength} >>\nstream\n${content}\nendstream`,
      ];
    }),
  ];

  return encodePdfObjects(objects);
}

function encodePdfObjects(objects: string[]) {
  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(byteLength(chunks.join("")));
    chunks.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  });

  const xrefOffset = byteLength(chunks.join(""));
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push("0000000000 65535 f \n");
  offsets.slice(1).forEach((offset) => {
    chunks.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  });
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new TextEncoder().encode(chunks.join(""));
}

function addText(commands: string[], x: number, y: number, value: string, options: TextOptions = {}) {
  const size = options.size ?? 10;
  const text = sanitizePdfText(value);
  const adjustedX = getAlignedX(x, text, size, options.align ?? "left");

  commands.push(`BT /F1 ${size} Tf 1 0 0 1 ${formatNumber(adjustedX)} ${formatNumber(y)} Tm (${escapePdfText(text)}) Tj ET`);
}

function getAlignedX(x: number, value: string, size: number, align: "left" | "center" | "right") {
  if (align === "left") return x;

  const estimatedWidth = value.length * size * 0.52;

  return align === "center" ? x - estimatedWidth / 2 : x - estimatedWidth;
}

function drawLine(commands: string[], x1: number, y1: number, x2: number, y2: number) {
  commands.push(`${formatNumber(x1)} ${formatNumber(y1)} m ${formatNumber(x2)} ${formatNumber(y2)} l S`);
}

function drawRect(commands: string[], x: number, y: number, width: number, height: number) {
  commands.push(`${formatNumber(x)} ${formatNumber(y)} ${formatNumber(width)} ${formatNumber(height)} re S`);
}

function drawCircle(commands: string[], centerX: number, centerY: number, radius: number) {
  const c = radius * 0.5522847498;
  const x = centerX;
  const y = centerY;

  commands.push([
    `${formatNumber(x + radius)} ${formatNumber(y)} m`,
    `${formatNumber(x + radius)} ${formatNumber(y + c)} ${formatNumber(x + c)} ${formatNumber(y + radius)} ${formatNumber(x)} ${formatNumber(y + radius)} c`,
    `${formatNumber(x - c)} ${formatNumber(y + radius)} ${formatNumber(x - radius)} ${formatNumber(y + c)} ${formatNumber(x - radius)} ${formatNumber(y)} c`,
    `${formatNumber(x - radius)} ${formatNumber(y - c)} ${formatNumber(x - c)} ${formatNumber(y - radius)} ${formatNumber(x)} ${formatNumber(y - radius)} c`,
    `${formatNumber(x + c)} ${formatNumber(y - radius)} ${formatNumber(x + radius)} ${formatNumber(y - c)} ${formatNumber(x + radius)} ${formatNumber(y)} c`,
    "S",
  ].join(" "));
}

function formatDate(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function formatMoney(value: number) {
  return `PHP ${value.toFixed(2)}`;
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function sanitizePdfText(value: string) {
  return value.replace(/[^\x20-\x7E]/g, "?");
}

function escapePdfText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}
