"use client";

import Script from "next/script";
import { useEffect } from "react";

const TAG_ID = "GTM-P59QDT3T";

// Production hosts only, so previews, local runs and E2E stay out of the data.
const SNIPPET = `if (location.hostname === "www.swathbook.com" || location.hostname === "swathbook.com") {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag("js", new Date());
  var tag = document.createElement("script");
  tag.async = true;
  tag.src = "https://www.googletagmanager.com/gtm.js?id=${TAG_ID}";
  document.head.appendChild(tag);
}`;

/**
 * Google tag for the public marketing pages. Booking, invite and sign-in URLs
 * can carry private tokens, so when a visitor moves on to those parts of the
 * app the page reloads once, which drops the tag before it can report them.
 */
export function GoogleTag() {
  useEffect(
    () => () => {
      if ("gtag" in window) window.location.reload();
    },
    [],
  );

  return (
    <Script id="google-tag" strategy="afterInteractive">
      {SNIPPET}
    </Script>
  );
}
