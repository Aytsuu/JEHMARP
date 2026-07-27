import type { DocumentPaymentSettings } from "./types";

const ORDER_SLIP_PAYMENT_TEMPLATE = [
  "( ) Cash on Delivery (COD)  ( ) Bank Transfer   ( ) Gcash",
  "Payment Due: ( ) Upon Delivery  ( ) Within___days",
] as const;

export function formatDocumentPaymentLines(payment: DocumentPaymentSettings | undefined): string[] {
  const lines: string[] = [];
  const instructions = payment?.instructions?.trim() ?? "";
  if (instructions) {
    lines.push(...instructions.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  }
  const structured = [
    payment?.bankName?.trim() ? `Bank: ${payment.bankName.trim()}` : "",
    payment?.accountName?.trim() && payment?.accountNumber?.trim()
      ? `Account: ${payment.accountName.trim()} — ${payment.accountNumber.trim()}`
      : payment?.accountName?.trim()
        ? `Account name: ${payment.accountName.trim()}`
        : payment?.accountNumber?.trim()
          ? `Account no.: ${payment.accountNumber.trim()}`
          : "",
    payment?.gcashNumber?.trim() ? `GCash: ${payment.gcashNumber.trim()}` : "",
    payment?.mayaNumber?.trim() ? `Maya: ${payment.mayaNumber.trim()}` : "",
  ].filter(Boolean);
  lines.push(...structured);
  return lines;
}

export function formatOrderSlipPaymentLines(payment: DocumentPaymentSettings | undefined): string[] {
  const custom = formatDocumentPaymentLines(payment);
  return custom.length > 0 ? custom : [...ORDER_SLIP_PAYMENT_TEMPLATE];
}
