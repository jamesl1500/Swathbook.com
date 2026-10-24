import Link from "next/link";
import { MessageCircleQuestion } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { siteConfig } from "@/libs/globals/site";
import { routes } from "@/libs/routes";
import { cn } from "@/libs/utils";

/** Sits beside FAQ lists so the question column never ends in empty space. */
export function TalkToUsCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-[1.5rem] border border-line bg-card p-6", className)}>
      <p className="flex items-center gap-2 font-bold">
        <MessageCircleQuestion className="size-5 text-brand-600" aria-hidden="true" />
        Talk to a person
      </p>
      <p className="mt-2 text-ink-soft">
        Not sure it fits how you work? Tell us about your business and we&apos;ll help you set it up.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={routes.contact} className={buttonStyles({ variant: "secondary", size: "sm", className: "min-h-11" })}>
          Contact us
        </Link>
        <a href={`mailto:${siteConfig.supportEmail}`} className={buttonStyles({ variant: "ghost", size: "sm", className: "min-h-11" })}>
          {siteConfig.supportEmail}
        </a>
      </div>
    </div>
  );
}
