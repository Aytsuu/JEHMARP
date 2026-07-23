import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;
type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;
type SupabaseBalanceClient = SupabaseServerClient | SupabaseAdminClient;

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function ensureSalesInvoiceWhenOrderFullyPaid(
  supabase: SupabaseServerClient,
  orderId: string,
) {
  const { data: existingInvoice, error: invoiceLookupError } = await supabase
    .from("invoice")
    .select("id")
    .eq("order_id", orderId)
    .limit(1)
    .maybeSingle();

  if (invoiceLookupError) {
    throw new Error("Unable to verify sales invoice before completing payment.");
  }

  const orderBalance = await loadOrderInvoiceBalance(createSupabaseAdminClient(), orderId);

  if (!orderBalance || orderBalance.orderStatus !== "processing") {
    return;
  }

  if (roundCurrency(orderBalance.remainingBalance) > 0) {
    return;
  }

  const now = new Date().toISOString();
  if (!existingInvoice?.id) {
    const { error: invoiceError } = await supabase.from("invoice").insert({
      order_id: orderId,
      status: "issued",
      issued_at: now,
      due_at: null,
      updated_at: now,
    });

    if (invoiceError) {
      throw new Error("Unable to create sales invoice.");
    }
  }

  await closeFullyPaidProcessingOrder(supabase, orderId, now);
}

export async function ensureSalesInvoiceBeforeAgentPaymentConfirmation(
  supabase: SupabaseServerClient,
  agentPaymentId: string,
) {
  const { data: pendingPayment, error: pendingPaymentError } = await supabase
    .from("agent_received_payment")
    .select("order_id, amount")
    .eq("id", agentPaymentId)
    .maybeSingle();

  if (pendingPaymentError) {
    throw new Error("Unable to verify agent received payment before confirmation.");
  }

  if (!pendingPayment?.order_id) {
    throw new Error("Agent received payment was not found.");
  }

  const orderId = String(pendingPayment.order_id);
  const { data: existingInvoice, error: invoiceLookupError } = await supabase
    .from("invoice")
    .select("id")
    .eq("order_id", orderId)
    .limit(1)
    .maybeSingle();

  if (invoiceLookupError) {
    throw new Error("Unable to verify sales invoice before confirming agent payment.");
  }

  if (existingInvoice?.id) {
    return;
  }

  const paymentAmount = Number(pendingPayment.amount ?? 0);
  const orderBalance = await loadOrderInvoiceBalance(createSupabaseAdminClient(), orderId, {
    additionalPaymentAmount: paymentAmount,
    errorMessage: "Unable to verify order balance before confirming agent payment.",
  });

  if (
    !orderBalance ||
    !Number.isFinite(paymentAmount) ||
    roundCurrency(orderBalance.remainingBalance) > 0
  ) {
    return;
  }

  if (orderBalance.orderStatus !== "processing") {
    return;
  }

  const now = new Date().toISOString();
  const { error: invoiceError } = await supabase.from("invoice").insert({
    order_id: orderId,
    status: "issued",
    issued_at: now,
    due_at: null,
    updated_at: now,
  });

  if (invoiceError) {
    throw new Error("Unable to create sales invoice.");
  }
}

type OrderInvoiceBalanceOptions = {
  additionalPaymentAmount?: number;
  errorMessage?: string;
};

type OrderInvoiceBalance = {
  orderStatus: string;
  remainingBalance: number;
};

async function loadOrderInvoiceBalance(
  supabase: SupabaseBalanceClient,
  orderId: string,
  options: OrderInvoiceBalanceOptions = {},
): Promise<OrderInvoiceBalance | null> {
  const { data: order, error } = await supabase
    .from("order")
    .select(`
      order_status,
      agent_id,
      parent_order_id,
      payment (
        amount
      ),
      order_item (
        final_quantity,
        unit_price,
        agent_commission_amount,
        product:product_id (
          agent_commission_type,
          agent_commission_value
        )
      )
    `)
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    const message = options.errorMessage ?? "Unable to verify order balance before creating sales invoice.";
    console.error("[admin:invoice] Unable to load order balance.", {
      orderId,
      error,
    });
    throw new Error(message, { cause: error });
  }

  if (!order) {
    return null;
  }

  const normalizedOrder = order as {
    order_status?: unknown;
    agent_id?: unknown;
    parent_order_id?: unknown;
    payment?: Array<{ amount?: unknown }> | null;
    order_item?: Array<{
      final_quantity?: unknown;
      unit_price?: unknown;
      agent_commission_amount?: unknown;
      product?: unknown;
    }> | null;
  };
  const orderStatus = typeof normalizedOrder.order_status === "string"
    ? normalizedOrder.order_status
    : "";
  const commissionEffective = Boolean(
    normalizedOrder.agent_id ||
    normalizedOrder.parent_order_id,
  );
  const totals = (normalizedOrder.order_item ?? []).reduce((current, item) => {
    const finalQuantity = Number(item.final_quantity ?? 0);
    const unitPrice = Number(item.unit_price ?? 0);
    const agentCommissionAmount = Number(item.agent_commission_amount ?? 0);

    if (!Number.isFinite(finalQuantity) || !Number.isFinite(unitPrice)) {
      return current;
    }

    return {
      gross: current.gross + finalQuantity * unitPrice,
      commission: current.commission + (
        commissionEffective
          ? orderItemCommissionAmount({
              finalQuantity,
              unitPrice,
              agentCommissionAmount,
              product: item.product,
            })
          : 0
      ),
    };
  }, { gross: 0, commission: 0 });
  const paidTotal = (normalizedOrder.payment ?? []).reduce((total, payment) => {
    const amount = Number(payment.amount ?? 0);
    return total + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  const additionalPaymentAmount = Number(options.additionalPaymentAmount ?? 0);
  const totalPaid = paidTotal + (Number.isFinite(additionalPaymentAmount) ? additionalPaymentAmount : 0);

  return {
    orderStatus,
    remainingBalance: Math.max(
      roundCurrency(totals.gross - totals.commission - totalPaid),
      0,
    ),
  };
}

function orderItemCommissionAmount(input: {
  finalQuantity: number;
  unitPrice: number;
  agentCommissionAmount: number;
  product: unknown;
}) {
  if (input.agentCommissionAmount > 0) {
    return Math.max(roundCurrency(input.agentCommissionAmount), 0);
  }

  const product = normalizeProduct(input.product);

  if (!product) {
    return 0;
  }

  const commissionValue = Number(product.agent_commission_value ?? 0);

  if (!Number.isFinite(commissionValue)) {
    return 0;
  }

  const commissionAmount = product.agent_commission_type === "percentage"
    ? input.unitPrice * input.finalQuantity * commissionValue / 100
    : input.finalQuantity * commissionValue;

  return Math.max(roundCurrency(commissionAmount), 0);
}

async function closeFullyPaidProcessingOrder(
  supabase: SupabaseServerClient,
  orderId: string,
  updatedAt: string,
) {
  const { error } = await supabase
    .from("order")
    .update({
      order_status: "closed",
      updated_at: updatedAt,
    })
    .eq("id", orderId);

  if (error) {
    throw new Error("Unable to close fully paid order.");
  }
}

function normalizeProduct(product: unknown) {
  const row = Array.isArray(product) ? product[0] : product;

  if (!row || typeof row !== "object") {
    return null;
  }

  return row as {
    agent_commission_type?: unknown;
    agent_commission_value?: unknown;
  };
}
