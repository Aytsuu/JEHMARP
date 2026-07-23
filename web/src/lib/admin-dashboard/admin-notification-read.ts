import type { AdminCustomer, AdminOrder } from "./data";
import { getUnpaidOrderCheckNotificationIds } from "./unpaid-order-checks";

type SupabaseInsertClient = {
  from: (table: string) => {
    upsert: (
      values: Array<{
        notification_id: string;
        admin_read_at: string;
        admin_read_by: string;
      }>,
      options?: { onConflict?: string },
    ) => PromiseLike<{ error: { message: string } | null }>;
  };
};

type SupabaseSelectClient = {
  from: (table: string) => {
    select: (columns: string) => PromiseLike<{
      data: Array<{ notification_id: string }> | null;
      error: { message: string } | null;
    }>;
  };
};

export async function loadReadAdminNotificationIds(
  supabase: SupabaseSelectClient,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("admin_notification_read")
    .select("notification_id");

  if (error) {
    throw new Error("Unable to load admin notification read state.");
  }

  return (data ?? []).map((row) => row.notification_id);
}

export async function upsertAdminNotificationReads(
  supabase: SupabaseInsertClient,
  notificationIds: readonly string[],
  adminUserId: string,
) {
  const uniqueIds = [...new Set(notificationIds.filter((id) => id.length > 0))];
  if (uniqueIds.length === 0) {
    return;
  }

  const timestamp = new Date().toISOString();
  const { error } = await supabase.from("admin_notification_read").upsert(
    uniqueIds.map((notificationId) => ({
      notification_id: notificationId,
      admin_read_at: timestamp,
      admin_read_by: adminUserId,
    })),
    { onConflict: "notification_id" },
  );

  if (error) {
    throw new Error("Unable to mark admin notification as read.");
  }
}

export async function upsertAdminNotificationRead(
  supabase: SupabaseInsertClient,
  notificationId: string,
  adminUserId: string,
) {
  await upsertAdminNotificationReads(supabase, [notificationId], adminUserId);
}

export function getRegularCheckNotificationIdsForCustomer(
  customerId: string,
  orders: readonly AdminOrder[],
  customers: readonly AdminCustomer[],
  now = new Date(),
): string[] {
  return getUnpaidOrderCheckNotificationIds(
    orders.filter((order) => order.customer_id === customerId),
    customers,
    now,
  );
}
