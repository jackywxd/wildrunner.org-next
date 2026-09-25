"use client";

import { useEffect } from "react";

/**
 * What every overlay on the site owes the page underneath it: the page does
 * not scroll while it is covered, and Escape dismisses it.
 *
 * Without the lock, on a phone, a swipe on a dialog's backdrop scrolls the
 * editor or article behind it, and the dialog is found again somewhere else
 * when it closes. Three overlays needed this — the mobile menu and the two
 * media dialogs — and each had grown its own half of it.
 */
export function useDialogLock(onClose: () => void) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
}
