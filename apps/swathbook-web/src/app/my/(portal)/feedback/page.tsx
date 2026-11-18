import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/ui";
import { FeedbackPanel } from "@/components/feedback/feedback-panel";
import { noIndex } from "@/libs/seo";

export const metadata: Metadata = { title: "Send feedback", robots: noIndex };

export default function CustomerFeedbackPage({ searchParams }: PageProps<"/my/feedback">) {
  return (
    <>
      <PageHeader
        eyebrow="Help shape Swathbook"
        title="Send feedback"
        description="Booking with Swathbook is brand new, and you're one of the first to try it. Tell us what's working and what isn't."
      />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[1.5rem] bg-paper-deep" />}>
        <Feedback searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Feedback({ searchParams }: { searchParams: PageProps<"/my/feedback">["searchParams"] }) {
  const { from } = await searchParams;
  // Customers aren't tied to one business's time zone; dates are a day at most out.
  return <FeedbackPanel from={from} timeZone="UTC" />;
}
