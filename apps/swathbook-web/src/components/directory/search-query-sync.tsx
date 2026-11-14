"use client";

import { useEffect } from "react";

/**
 * Puts the current ?q= into the search box once the page loads. The form
 * itself is part of the static shell, so it's typeable straight away and is
 * never swapped out under someone mid-word; this only fills it in when
 * they haven't started typing yet.
 */
export function SearchQuerySync({ inputId }: { inputId: string }) {
  useEffect(() => {
    const input = document.getElementById(inputId);
    const query = new URLSearchParams(window.location.search).get("q");
    if (input instanceof HTMLInputElement && query && !input.value) input.value = query.slice(0, 100);
  }, [inputId]);
  return null;
}
