"use client";

import { useSearchParams } from "next/navigation";
import { FormMessage } from "@/components/ui/field";

/*
 * Tiny Client Components that read the query string. Pages wrap them in
 * <Suspense> so the rest of each auth page stays in the static shell.
 */

/** Hidden input that forwards a query param (e.g. `next`) to the form's action. */
export function HiddenParamInput({ name }: { name: string }) {
  const value = useSearchParams().get(name);
  return value ? <input type="hidden" name={name} value={value} /> : null;
}

/** Shows a message when `?<param>=<code>` (default `error`) matches one of `messages`. */
export function ErrorParamNotice({
  messages,
  param = "error",
  tone = "info",
}: {
  messages: Record<string, string>;
  param?: string;
  tone?: "info" | "success";
}) {
  const code = useSearchParams().get(param);
  const message = code ? messages[code] : undefined;
  if (!message) return null;
  return (
    <div className="mb-6">
      <FormMessage tone={tone}>{message}</FormMessage>
    </div>
  );
}

/** Renders the value of a query param, or `fallback` when it's missing. */
export function ParamText({ name, fallback }: { name: string; fallback: string }) {
  const value = useSearchParams().get(name);
  return <>{value || fallback}</>;
}
