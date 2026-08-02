import type { DocumentLayoutOptions } from "@/lib/order-documents/layout";
import { buildSalesInvoiceLayout } from "@/lib/order-documents/layout";
import type { DocumentOrder, DocumentOrderItem } from "@/lib/order-documents/view";
import { buildPdfDocument, pdfPageWidth } from "@/lib/order-documents/pdf-document";
import { buildLogoImageDrawCommand } from "@/lib/order-documents/pdf-logo";

const pageWidth = pdfPageWidth;
const marginX = 40;
const tableRowsPerPage = 10;

type TextOptions = {
  size?: number;
  align?: "left" | "center" | "right";
};

type SalesInvoicePage = {
  items: DocumentOrderItem[];
  pageNumber: number;
  pageCount: number;
};

export function buildSalesInvoiceContentStreams(order: DocumentOrder, options: DocumentLayoutOptions = {}): string[] {
  const pages = chunkOrderItems(order.customer_order_item);
  return pages.map((items, index) => buildSalesInvoicePageContent(order, {
    items, pageNumber: index + 1, pageCount: pages.length,
  }, options));
}

export function buildSalesInvoicePdf(order: DocumentOrder, options: DocumentLayoutOptions = {}): Uint8Array {
  return buildPdfDocument(buildSalesInvoiceContentStreams(order, options), {
    logoImage: options.logoImage ?? null,
  });
}

export function buildBulkSalesInvoicePdf(orders: DocumentOrder[], options: DocumentLayoutOptions = {}): Uint8Array {
  const contentStreams = orders.flatMap((order) => buildSalesInvoiceContentStreams(order, options));

  if (contentStreams.length === 0) {
    throw new Error("No sales invoice pages to generate.");
  }

  return buildPdfDocument(contentStreams, {
    logoImage: options.logoImage ?? null,
  });
}

function chunkOrderItems(items: DocumentOrderItem[]) {
  if (items.length === 0) return [[]];

  return Array.from({ length: Math.ceil(items.length / tableRowsPerPage) }, (_, index) => {
    const start = index * tableRowsPerPage;
    return items.slice(start, start + tableRowsPerPage);
  });
}

function buildSalesInvoicePageContent(order: DocumentOrder, page: SalesInvoicePage, options: DocumentLayoutOptions = {}) {
  const commands: string[] = [];
  const layout = buildSalesInvoiceLayout(order, options);
  drawHeader(commands, page, layout, options);
  drawInvoiceFields(commands, layout);
  const tableBottomY = drawItemsTable(commands, page.items, options);
  drawInvoiceTotal(commands, layout, tableBottomY);
  drawPaymentAndIssuer(commands, layout);
  return commands.join("\n");
}

function drawHeader(
  commands: string[],
  page: SalesInvoicePage,
  layout: ReturnType<typeof buildSalesInvoiceLayout>,
  options: DocumentLayoutOptions = {},
) {
  addText(commands, pageWidth / 2, 802, layout.brandLines[0], { align: "center", size: 13 });
  addText(commands, pageWidth / 2, 786, layout.brandLines[1], { align: "center", size: 10 });
  addText(commands, pageWidth / 2, 771, layout.brandLines[2], { align: "center", size: 10 });
  addText(commands, pageWidth / 2, 750, page.pageCount > 1 ? `SALES INVOICE - Page ${page.pageNumber}` : "SALES INVOICE", {
    align: "center",
    size: 14,
  });
  drawDocumentLogo(commands, options.logoImage);
}

function drawDocumentLogo(
  commands: string[],
  logoImage: DocumentLayoutOptions["logoImage"],
) {
  if (logoImage) {
    commands.push(
      buildLogoImageDrawCommand(logoImage.name, logoImage.width, logoImage.height, {
        centerX: 525,
        centerY: 780,
        maxSize: 60,
      }),
    );
    return;
  }

  drawCircle(commands, 525, 780, 30);
  addText(commands, 525, 778, "LOGO", { align: "center", size: 9 });
}

function drawInvoiceFields(commands: string[], layout: ReturnType<typeof buildSalesInvoiceLayout>) {

  addText(commands, 40, 717, layout.dateLabel, { size: 10 });
  drawLine(commands, 73, 713, 190, 713);
  addText(commands, 310, 717, layout.invoiceNumberLabel, { size: 10 });
  drawLine(commands, 365, 713, 555, 713);
  addText(commands, 40, 695, layout.soldToLabel, { size: 10 });
  drawLine(commands, 80, 691, 260, 691);
  addText(commands, 310, 695, layout.addressLabel, { size: 10 });
  drawLine(commands, 355, 691, 555, 691);
}

function drawItemsTable(commands: string[], items: DocumentOrderItem[], options: DocumentLayoutOptions = {}) {
  const layout = buildSalesInvoiceLayout({
    id: "", created_at: "", customer: null, agent: null, customer_order_item: items, invoice: [],
  }, options);
  const tableColumnWidths = layout.columns.map((column) => column.width);
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
  addText(commands, tableLeftX + 6, headerY, layout.columns[0].label, { size: 9 });
  addText(commands, tableLeftX + 241, headerY, layout.columns[1].label, { size: 9 });
  addText(commands, tableLeftX + 321, headerY, layout.columns[2].label, { size: 9 });
  addText(commands, tableLeftX + 421, headerY, layout.columns[3].label, { size: 9 });

  layout.rows.forEach((row, index) => {
    const rowY = tableTopY - rowHeight * (index + 1) - 16;

    addText(commands, tableLeftX + 6, rowY, truncate(row.cells[0], 38), { size: 8 });
    addText(commands, tableLeftX + 241, rowY, row.cells[1], { size: 8 });
    addText(commands, tableLeftX + 321, rowY, row.cells[2], { size: 8 });
    addText(commands, tableLeftX + 421, rowY, row.cells[3], { size: 8 });
  });

  return tableBottomY;
}

function drawInvoiceTotal(commands: string[], layout: ReturnType<typeof buildSalesInvoiceLayout>, tableBottomY: number) {
  const totalY = tableBottomY - 24;
  addText(commands, 330, totalY, layout.totalLabel, { size: 11 });
  drawLine(commands, 430, totalY - 4, 555, totalY - 4);
}

function drawPaymentAndIssuer(commands: string[], layout: ReturnType<typeof buildSalesInvoiceLayout>) {
  addText(commands, 40, 348, "Delivery Preference", { size: 10 });
  addText(commands, 40, 330, layout.paymentLines[0] ?? "", { size: 9 });
  addTextWithVectorCheckmarks(commands, 40, 312, layout.paymentLines[1] ?? "", { size: 9 });
  addText(commands, 40, 277, layout.paymentHeading, { size: 10 });
  addTextWithVectorCheckmarks(commands, 40, 259, layout.paymentLines[2] ?? "", { size: 9 });
  layout.paymentLines.slice(3).forEach((line, index) => {
    addText(commands, 40, 241 - index * 18, line, { size: 9 });
  });
  addText(commands, 405, 184, layout.issuerHeading, { size: 10 });
  addText(commands, 340, 156, layout.issuerName, { size: 10 });
  drawLine(commands, 330, 152, 555, 152);
  addText(commands, 360, 136, layout.issuerSubline, { size: 9 });
}

function addText(commands: string[], x: number, y: number, value: string, options: TextOptions = {}) {
  const size = options.size ?? 10;
  const text = sanitizePdfText(value);
  const adjustedX = getAlignedX(x, text, size, options.align ?? "left");

  commands.push(`BT /F1 ${size} Tf 1 0 0 1 ${formatNumber(adjustedX)} ${formatNumber(y)} Tm (${escapePdfText(text)}) Tj ET`);
}

function addTextWithVectorCheckmarks(
  commands: string[],
  x: number,
  y: number,
  value: string,
  options: TextOptions = {},
) {
  const size = options.size ?? 10;
  const displayText = value.replaceAll("✓", " ");
  const sanitizedText = sanitizePdfText(displayText);
  const adjustedX = getAlignedX(x, sanitizedText, size, options.align ?? "left");

  addText(commands, x, y, displayText, options);

  Array.from(value.matchAll(/✓/g)).forEach((match) => {
    if (typeof match.index !== "number") return;
    drawCheckmark(commands, adjustedX + match.index * size * 0.52, y, size);
  });
}

function drawCheckmark(commands: string[], x: number, y: number, size: number) {
  const startX = x - size * 0.08;
  const startY = y + size * 0.25;
  const middleX = x + size * 0.18;
  const middleY = y - size * 0.05;
  const endX = x + size * 0.7;
  const endY = y + size * 0.55;

  commands.push(
    `${formatNumber(startX)} ${formatNumber(startY)} m ${formatNumber(middleX)} ${formatNumber(middleY)} l ${formatNumber(endX)} ${formatNumber(endY)} l S`,
  );
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
