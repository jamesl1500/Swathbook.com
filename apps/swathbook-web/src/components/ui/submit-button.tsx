"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { Button } from "./button";

/**
 * Submit button that shows a spinner while its parent form's action is pending.
 */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} aria-disabled={pending} {...props}>
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
