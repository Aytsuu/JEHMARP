import type { DocumentLayoutOptions } from "@/lib/order-documents/layout";
import {
  buildOrderSlipLayout,
} from "@/lib/order-documents/layout";
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

type OrderSlipPage = {
  items: DocumentOrderItem[];
  pageNumber: number;
  pageCount: number;
};

export function buildOrderSlipContentStreams(order: DocumentOrder, options: DocumentLayoutOptions = {}): string[] {
  const pages = chunkOrderItems(order.customer_order_item);
  return pages.map((items, index) => buildOrderSlipPageContent(order, {
    items, pageNumber: index + 1, pageCount: pages.length,
  }, options));
}

export function buildOrderSlipPdf(order: DocumentOrder, options: DocumentLayoutOptions = {}): Uint8Array {
  return buildPdfDocument(buildOrderSlipContentStreams(order, options), {
    logoImage: options.logoImage ?? null,
  });
}

export function buildBulkOrderSlipPdf(orders: DocumentOrder[], options: DocumentLayoutOptions = {}): Uint8Array {
  const contentStreams = orders.flatMap((order) => buildOrderSlipContentStreams(order, options));

  if (contentStreams.length === 0) {
    throw new Error("No order slip pages to generate.");
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

function buildOrderSlipPageContent(order: DocumentOrder, page: OrderSlipPage, options: DocumentLayoutOptions = {}) {
  const commands: string[] = [];
  const layout = buildOrderSlipLayout(order, options);
  drawHeader(commands, page, layout, options);
  drawOrderFields(commands, layout);
  const tableBottomY = drawItemsTable(commands, page.items, options);
  drawOrderTotal(commands, layout, tableBottomY);
  drawTermsAndSignatures(commands, layout);
  return commands.join("\n");
}

function drawHeader(
  commands: string[],
  page: OrderSlipPage,
  layout: ReturnType<typeof buildOrderSlipLayout>,
  options: DocumentLayoutOptions = {},
) {
  addText(commands, pageWidth / 2, 802, layout.brandLines[0], { align: "center", size: 13 });
  addText(commands, pageWidth / 2, 786, layout.brandLines[1], { align: "center", size: 10 });
  addText(commands, pageWidth / 2, 771, layout.brandLines[2], { align: "center", size: 10 });
  addText(commands, pageWidth / 2, 750, page.pageCount > 1 ? `ORDER SLIP - Page ${page.pageNumber}` : "ORDER SLIP", {
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

function drawOrderFields(commands: string[], layout: ReturnType<typeof buildOrderSlipLayout>) {
  addText(commands, 40, 717, layout.dateLabel, { size: 10 });
  drawLine(commands, 73, 713, 190, 713);
  addText(commands, 40, 695, layout.sellerLabel, { size: 10 });
  drawLine(commands, 80, 691, 230, 691);
  addText(commands, 310, 695, layout.orderedByLabel, { size: 10 });
  drawLine(commands, 370, 691, 555, 691);
}

function drawItemsTable(commands: string[], items: DocumentOrderItem[], options: DocumentLayoutOptions = {}) {
  const layout = buildOrderSlipLayout({
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
  addText(commands, tableLeftX + 151, headerY, layout.columns[1].label, { size: 9 });
  addText(commands, tableLeftX + 211, headerY, layout.columns[2].label, { size: 9 });
  addText(commands, tableLeftX + 286, headerY, layout.columns[3].label, { size: 9 });
  addText(commands, tableLeftX + 361, headerY, layout.columns[4].label, { size: 9 });

  layout.rows.forEach((row, index) => {
    const rowY = tableTopY - rowHeight * (index + 1) - 16;

    addText(commands, tableLeftX + 6, rowY, truncate(row.cells[0], 24), { size: 8 });
    addText(commands, tableLeftX + 151, rowY, row.cells[1], { size: 8 });
    addText(commands, tableLeftX + 211, rowY, row.cells[2], { size: 8 });
    addText(commands, tableLeftX + 286, rowY, row.cells[3], { size: 8 });
    addText(commands, tableLeftX + 361, rowY, truncate(row.cells[4], 28), { size: 8 });
  });

  return tableBottomY;
}

function drawOrderTotal(commands: string[], layout: ReturnType<typeof buildOrderSlipLayout>, tableBottomY: number) {
  const totalY = tableBottomY - 24;
  addText(commands, 390, totalY, layout.totalLabel, { size: 11 });
  drawLine(commands, 440, totalY - 4, 555, totalY - 4);
}

function drawTermsAndSignatures(commands: string[], layout: ReturnType<typeof buildOrderSlipLayout>) {

  addText(commands, 40, 348, layout.deliveryHeading, { size: 10 });
  addText(commands, 40, 330, layout.deliveryLines[0], { size: 9 });
  addText(commands, 40, 312, layout.deliveryLines[1], { size: 9 });

  addText(commands, 40, 277, layout.paymentHeading, { size: 10 });
  layout.paymentLines.slice(0, 2).forEach((line, index) => {
    addText(commands, 40, 259 - index * 18, line, { size: 9 });
  });
  addText(commands, 40, 184, layout.confirmationText, { size: 8 });

  addText(commands, 40, 145, layout.buyerSignatureLines[0], { size: 10 });
  addText(commands, 40, 120, layout.buyerSignatureLines[1], { size: 9 });
  addText(commands, 40, 98, layout.buyerSignatureLines[2], { size: 9 });
  addText(commands, 40, 76, layout.buyerSignatureLines[3], { size: 9 });

  addText(commands, 330, 145, layout.sellerSignatureHeading, { size: 10 });
  addText(commands, 330, 120, layout.sellerSignatureLines[0], { size: 9 });
  drawLine(commands, 360, 116, 520, 116);
  addText(commands, 330, 98, layout.sellerSignatureLines[1], { size: 9 });
  addText(commands, 330, 76, layout.sellerSignatureLines[2], { size: 9 });
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
