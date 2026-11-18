import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/ui";
import { FeedbackPanel } from "@/components/feedback/feedback-panel";
import { requireBusinessContext } from "@/libs/dashboard";
import { routes } from "@/libs/routes";

export const metadata: Metadata = { title: "Send feedback" };

export default function FeedbackPage({ searchParams }: PageProps<"/dashboard/feedback">) {
  return (
    <>
      <PageHeader
        eyebrow="Help shape Swathbook"
        title="Send feedback"
        description="You're one of our first users, so what you tell us decides what we build next. Ideas, problems, praise: it all goes straight to the team."
      />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[1.75rem] bg-paper-deep" />}>
        <Feedback searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Feedback({ searchParams }: { searchParams: PageProps<"/dashboard/feedback">["searchParams"] }) {
  const [{ business }, { from }] = await Promise.all([requireBusinessContext(routes.feedback), searchParams]);
  return <FeedbackPanel from={from} businessId={business.id} timeZone={business.timezone} />;
}
