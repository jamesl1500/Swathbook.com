import Link from "next/link";
import { routes } from "@/libs/routes";
import { ArrowRight, Check } from "lucide-react";
import { BrandPin } from "@/components/brand/logo";
import { ClaimLinkForm } from "./claim-link-form";
import { Container } from "./section";

export function CtaBand({
  title = "Your link could be live before your coffee's cold.",
  description = "Set up your services, deposits and hours in about five minutes. No credit card to start.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <section className="pb-20 pt-12">
      <Container>
        <div className="map-grid relative overflow-hidden rounded-[2rem] px-6 py-14 text-paper sm:px-14 sm:py-16">
          <BrandPin className="absolute right-10 top-8 hidden h-36 w-28 drop-shadow-xl md:block" />
          <div className="relative max-w-2xl">
            <h2 className="text-3xl font-bold leading-tight sm:text-5xl">{title}</h2>
            <p className="mt-4 text-lg text-paper/80">{description}</p>
            <ClaimLinkForm tone="dark" id="cta-claim-slug" className="mt-8" />
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-paper/85">
              {["Free to start", "No credit card", "Cancel anytime"].map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5">
                  <Check className="size-4 text-sky" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href={routes.pricing}
              className="mt-6 inline-flex min-h-11 items-center gap-1.5 font-semibold text-paper underline-offset-4 hover:underline"
            >
              See pricing
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
