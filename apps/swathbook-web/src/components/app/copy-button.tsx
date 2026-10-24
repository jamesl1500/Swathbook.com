"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/libs/utils";

export function CopyButton({
  value,
  label = "Copy link",
  copiedLabel = "Copied",
  variant = "secondary",
  className,
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  variant?: "primary" | "secondary" | "accent";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Older browsers / insecure contexts: fall back to a hidden textarea.
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" onClick={copy} className={cn(buttonStyles({ variant, size: "sm" }), className)}>
      {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  );
}
