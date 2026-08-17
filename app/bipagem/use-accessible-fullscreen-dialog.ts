"use client";

import { type RefObject, useEffect, useRef } from "react";

const MOBILE_FULLSCREEN_QUERY = "(max-width: 1279px)";
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type AccessibleFullscreenDialogOptions = {
  open: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  initialFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
};

function getFocusableElements(dialog: HTMLElement) {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      element.getClientRects().length > 0 &&
      element.getAttribute("aria-hidden") !== "true",
  );
}

export function useAccessibleFullscreenDialog({
  open,
  dialogRef,
  initialFocusRef,
  onClose,
}: AccessibleFullscreenDialogOptions) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    const dialogElement: HTMLElement = dialog;

    const mobileViewport = window.matchMedia(MOBILE_FULLSCREEN_QUERY);
    let releaseDialog: (() => void) | null = null;

    function activateDialog() {
      releaseDialog?.();
      releaseDialog = null;

      if (
        !mobileViewport.matches ||
        dialogElement.getClientRects().length === 0
      ) {
        return;
      }

      const activeElement = document.activeElement;
      const restoreFocusTarget =
        activeElement instanceof HTMLElement &&
        !dialogElement.contains(activeElement)
          ? activeElement
          : null;
      const previousBodyOverflow = document.body.style.overflow;
      const previousRootOverflow = document.documentElement.style.overflow;

      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";

      const initialFocusFrame = window.requestAnimationFrame(() => {
        (initialFocusRef.current ?? dialogElement).focus({ preventScroll: true });
      });

      function handleKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCloseRef.current();
          return;
        }

        if (event.key !== "Tab") {
          return;
        }

        const focusableElements = getFocusableElements(dialogElement);
        if (!focusableElements.length) {
          event.preventDefault();
          dialogElement.focus({ preventScroll: true });
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const focusedElement = document.activeElement;
        const focusIsOutside =
          !(focusedElement instanceof Node) ||
          !dialogElement.contains(focusedElement);

        if (event.shiftKey && (focusIsOutside || focusedElement === firstElement)) {
          event.preventDefault();
          lastElement.focus({ preventScroll: true });
        } else if (
          !event.shiftKey &&
          (focusIsOutside || focusedElement === lastElement)
        ) {
          event.preventDefault();
          firstElement.focus({ preventScroll: true });
        }
      }

      document.addEventListener("keydown", handleKeyDown);

      releaseDialog = () => {
        window.cancelAnimationFrame(initialFocusFrame);
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = previousBodyOverflow;
        document.documentElement.style.overflow = previousRootOverflow;

        window.requestAnimationFrame(() => {
          if (restoreFocusTarget?.isConnected) {
            restoreFocusTarget.focus({ preventScroll: true });
          }
        });
      };
    }

    activateDialog();
    mobileViewport.addEventListener("change", activateDialog);

    return () => {
      mobileViewport.removeEventListener("change", activateDialog);
      releaseDialog?.();
    };
  }, [dialogRef, initialFocusRef, open]);
}
