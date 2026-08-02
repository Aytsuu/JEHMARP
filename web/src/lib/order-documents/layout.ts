import type { DocumentOrder, DocumentOrderItem } from "@/lib/order-documents/view";
import { fullName, orderTotal } from "@/lib/order-documents/view";
import { getBrandLines as getSettingsBrandLines } from "@/lib/platform-settings/branding";
import { formatDocumentPaymentLines, formatOrderSlipPaymentLines } from "@/lib/platform-settings/document-payment";
import type { DocumentLayoutOptions } from "@/lib/platform-settings/types";
import { resolvePublicStorageUrl } from "@/lib/supabase/storage";

const orderSlipColumnWidths = [145, 60, 75, 75, 160] as const;
const salesInvoiceColumnWidths = [235, 80, 100, 100] as const;
const defaultSellerName = "Narcisan S. Galamiton";

export type DocumentTableColumn = {
  label: string;
  width: number;
  align?: "left" | "center" | "right";
};

export type DocumentTableRow = {
  cells: string[];
};

export type OrderSlipLayout = {
  brandLines: string[];
  logoUrl: string | null;
  title: string;
  dateLabel: string;
  sellerLabel: string;
  orderedByLabel: string;
  columns: DocumentTableColumn[];
  rows: DocumentTableRow[];
  totalLabel: string;
  deliveryHeading: string;
  deliveryLines: string[];
  paymentHeading: string;
  paymentLines: string[];
  confirmationText: string;
  buyerSignatureLines: string[];
  sellerSignatureHeading: string;
  sellerSignatureLines: string[];
};

export type SalesInvoiceLayout = {
  brandLines: string[];
  logoUrl: string | null;
  title: string;
  dateLabel: string;
  invoiceNumberLabel: string;
  soldToLabel: string;
  addressLabel: string;
  columns: DocumentTableColumn[];
  rows: DocumentTableRow[];
  totalLabel: string;
  paymentHeading: string;
  paymentLines: string[];
  issuerHeading: string;
  issuerName: string;
  issuerSubline: string;
};

export function buildOrderSlipLayout(order: DocumentOrder, options: DocumentLayoutOptions = {}): OrderSlipLayout {
  const sellerName = getSellerName(order, options);
  return {
    brandLines: getBrandLines(options.businessProfile),
    logoUrl: resolveDocumentLogoUrl(options),
    title: "ORDER SLIP",
    dateLabel: `Date: ${formatDocumentDate(order.created_at)}`,
    sellerLabel: `Seller: ${sellerName}`,
    orderedByLabel: `Ordered by: ${fullName(order.customer)}`,
    columns: [
      { label: "Product", width: orderSlipColumnWidths[0] },
      { label: "Quantity", width: orderSlipColumnWidths[1], align: "center" },
      { label: "Unit Price", width: orderSlipColumnWidths[2], align: "right" },
      { label: "Total", width: orderSlipColumnWidths[3], align: "right" },
      { label: "Additional Details", width: orderSlipColumnWidths[4] },
    ],
    rows: order.customer_order_item.map((item) => ({
      cells: [
        item.product?.name ?? "Missing product",
        formatQuantity(item.partial_quantity),
        formatMoney(item.unit_price),
        formatMoney(item.partial_quantity * item.unit_price),
        item.add_details ?? "",
      ],
    })),
    totalLabel: `Total ${formatMoney(orderTotal(order, "partial_quantity"))}`,
    deliveryHeading: "Delivery Preference",
    deliveryLines: [
      "Mode of Delivery: ( ) Pick-Up   ( ) Delivery",
      "Preferred Delivery Date and Time: ___________________",
    ],
    paymentHeading: "Payment Terms (For Order Confirmation)",
    paymentLines: formatOrderSlipPaymentLines(options.documentPayment),
    confirmationText:
      "I hereby confirm the above order and agree to the pricing, delivery arrangement, and payment terms stated herein.",
    buyerSignatureLines: [
      "Confirmed by (Buyer):",
      "Name: ________________________",
      "Signature: ___________________",
      "Date: ________________________",
    ],
    sellerSignatureHeading: "Accepted by (Seller)",
    sellerSignatureLines: [
      `Name: ${sellerName}`,
      "Signature: ___________________",
      "Date: ________________________",
    ],
  };
}

export function buildSalesInvoiceLayout(order: DocumentOrder, options: DocumentLayoutOptions = {}): SalesInvoiceLayout {
  const invoice = order.invoice[0];
  const payment = order.payment?.[0] ?? null;
  const issuerName = getIssuerName(order, options);
  const paymentDetailLines = formatDocumentPaymentLines(options.documentPayment);
  return {
    brandLines: getBrandLines(options.businessProfile),
    logoUrl: resolveDocumentLogoUrl(options),
    title: "SALES INVOICE",
    dateLabel: `Date: ${formatDocumentDate(invoice?.issued_at ?? invoice?.created_at ?? order.created_at)}`,
    invoiceNumberLabel: `Invoice No: ${invoice?.invoice_number ?? ""}`,
    soldToLabel: `Sold to: ${fullName(order.customer)}`,
    addressLabel: `Address: ${order.customer?.address ?? ""}`,
    columns: [
      { label: "Product", width: salesInvoiceColumnWidths[0] },
      { label: "Quantity", width: salesInvoiceColumnWidths[1], align: "center" },
      { label: "Unit Price", width: salesInvoiceColumnWidths[2], align: "right" },
      { label: "Amount", width: salesInvoiceColumnWidths[3], align: "right" },
    ],
    rows: order.customer_order_item.map((item) => ({
      cells: [
        item.product?.name ?? "Missing product",
        formatQuantity(item.final_quantity),
        formatMoney(item.unit_price),
        formatMoney(item.final_quantity * item.unit_price),
      ],
    })),
    totalLabel: `Total Amount Due ${formatMoney(orderTotal(order, "final_quantity"))}`,
    paymentHeading: "Payment Terms (For Order Confirmation)",
    paymentLines: [
      "Mode of Payment (/)",
      `${paymentCheckbox(payment?.payment_method === "Cash")} Cash   ${paymentCheckbox(payment?.payment_method === "Check")} Check`,
      `${paymentCheckbox(payment?.payment_terms === "Cash on Delivery (COD)")} Cash on Delivery (COD)  ${paymentCheckbox(payment?.payment_terms === "Bank Transfer")} Bank Transfer   ${paymentCheckbox(payment?.payment_terms === "Gcash")} Gcash`,
      ...paymentDetailLines,
    ],
    issuerHeading: "Issued by:",
    issuerName,
    issuerSubline: "Owner / Authorized Representative",
  };
}

function paymentCheckbox(checked: boolean) {
  return checked ? "(✓)" : "( )";
}

export function getDocumentColumnTemplate(columns: DocumentTableColumn[]) {
  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
  return columns
    .map((column) => `minmax(0, ${((column.width / totalWidth) * 100).toFixed(4)}fr)`)
    .join(" ");
}

export function getBrandLines(profile?: DocumentLayoutOptions["businessProfile"]) {
  return getSettingsBrandLines(profile);
}

export function resolveDocumentLogoUrl(options: DocumentLayoutOptions = {}) {
  return resolvePublicStorageUrl(options.businessProfile?.logoPath ?? null);
}

export function getSellerName(order: DocumentOrder, options: DocumentLayoutOptions = {}) {
  return order.agent?.display_name
    ?? options.businessProfile?.legalName?.trim()
    ?? options.businessProfile?.tradeName?.trim()
    ?? defaultSellerName;
}

function getIssuerName(order: DocumentOrder, options: DocumentLayoutOptions = {}) {
  return options.businessProfile?.legalName?.trim()
    || options.businessProfile?.tradeName?.trim()
    || getSellerName(order, options);
}

export function formatDocumentDate(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

export function formatMoney(value: number) {
  return `PHP ${value.toFixed(2)}`;
}

export function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

export function documentRowKey(item: DocumentOrderItem, index: number) {
  return `${item.product?.name ?? "item"}-${index}`;
}

export type { DocumentLayoutOptions };
