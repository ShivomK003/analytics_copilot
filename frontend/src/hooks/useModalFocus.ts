import { useEffect } from "react";
import type { RefObject } from "react";

const focusableSelector =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function useModalFocus({
  isOpen,
  containerRef,
  returnFocusRef,
  onClose,
  isolateBackground = false,
}: {
  isOpen: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  returnFocusRef: RefObject<HTMLElement | SVGElement | null>;
  onClose: () => void;
  isolateBackground?: boolean;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    const returnTarget = returnFocusRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const backgrounds = isolateBackground
      ? [...document.body.children].filter((element) => !element.contains(container))
      : [];
    const previousInert = backgrounds.map((element) => element.getAttribute("inert"));
    backgrounds.forEach((element) => element.setAttribute("inert", ""));
    container?.querySelector<HTMLElement>(focusableSelector)?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "Tab") {
        const elements = container?.querySelectorAll<HTMLElement>(focusableSelector);
        if (!elements?.length) {
          event.preventDefault();
          container?.focus();
          return;
        }
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first || !container?.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || !container?.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      backgrounds.forEach((element, index) => {
        const value = previousInert[index];
        if (value === null) element.removeAttribute("inert");
        else element.setAttribute("inert", value);
      });
      document.removeEventListener("keydown", handleKeyDown);
      if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
      else document.getElementById("main-content")?.focus({ preventScroll: true });
    };
  }, [isOpen, containerRef, returnFocusRef, onClose, isolateBackground]);
}
