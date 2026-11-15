import { getActiveBusiness, getCurrentUser } from "@/libs/auth";
import { EMPTY_FEED, type NotificationFeed } from "@/libs/notifications";
import { createClient } from "@/libs/supabase/server";
import { NotificationBell } from "./notification-bell";

/** The header bell, loaded for the signed-in member's active business. */
export async function NotificationsSlot() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { active } = await getActiveBusiness(user.id);
  if (!active) return null;

  const supabase = await createClient();
  const [{ data: business }, { data: feed }] = await Promise.all([
    supabase.from("businesses").select("timezone, currency").eq("id", active.id).single(),
    supabase.rpc("my_notifications", { p_business_id: active.id, p_limit: 20 }),
  ]);

  return (
    <NotificationBell
      // A fresh bell (and subscription) when switching businesses.
      key={active.id}
      businessId={active.id}
      userId={user.id}
      timeZone={business?.timezone ?? "UTC"}
      currency={business?.currency ?? "usd"}
      initial={(feed as NotificationFeed | null) ?? EMPTY_FEED}
    />
  );
}
