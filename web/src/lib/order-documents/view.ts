export type DocumentOrderItem = {
  partial_quantity: number;
  final_quantity: number;
  unit_price: number;
  add_details: string | null;
  product: {
    name: string;
  } | null;
};

export type DocumentOrder = {
  id: string;
  created_at: string;
  customer: {
    first_name: string;
    last_name: string;
    address: string;
  } | null;
  agent?: {
    display_name: string;
  } | null;
  customer_order_item: DocumentOrderItem[];
  invoice: Array<{
    invoice_number: string;
    issued_at: string | null;
    created_at: string;
  }>;
};

export function fullName(customer: { first_name: string; last_name: string } | null) {
  return customer ? `${customer.first_name} ${customer.last_name}` : "Unassigned customer";
}

export function orderTotal(order: DocumentOrder, quantityKey: "partial_quantity" | "final_quantity") {
  return order.customer_order_item.reduce((total, item) => {
    return total + item[quantityKey] * item.unit_price;
  }, 0);
}
