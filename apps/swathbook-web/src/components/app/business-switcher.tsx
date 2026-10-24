import { getActiveBusiness, getCurrentUser } from "@/libs/auth";
import { BusinessMenu } from "./business-menu";

/**
 * Header control for moving between a user's businesses. Reads the session,
 * so render it inside <Suspense>.
 */
export async function BusinessSwitcher() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { businesses, active } = await getActiveBusiness(user.id);
  const live = businesses.filter((business) => business.onboarding_completed_at);
  if (!active) return null;

  return (
    <BusinessMenu
      active={{ id: active.id, name: active.name }}
      businesses={live.map((business) => ({ id: business.id, name: business.name, slug: business.slug, role: business.role }))}
    />
  );
}
