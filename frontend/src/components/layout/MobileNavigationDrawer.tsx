import { useEffect, useId, useRef } from "react";
import { NavLink } from "react-router-dom";
import { X } from "lucide-react";
import { navigationItems } from "../../config/navigation";

type MobileNavigationDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function MobileNavigationDrawer({
  isOpen,
  onClose,
  returnFocusRef,
}: MobileNavigationDrawerProps) {
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const headingId = useId();

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const returnFocusTarget = returnFocusRef.current;
    document.body.style.overflow = "hidden";

    const drawer = drawerRef.current;
    const focusableElements = drawer?.querySelectorAll<HTMLElement>(
      FOCUSABLE_SELECTOR,
    );
    focusableElements?.[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !focusableElements || focusableElements.length === 0) {
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      returnFocusTarget?.focus();
    };
  }, [isOpen, onClose, returnFocusRef]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      aria-hidden={!isOpen}
      className="mobile-nav-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        aria-labelledby={headingId}
        aria-modal="true"
        className="mobile-nav-drawer"
        onClick={(event) => event.stopPropagation()}
        ref={drawerRef}
        role="dialog"
      >
        <div className="mobile-nav-header">
          <div>
            <p className="brand-kicker">Navigation</p>
            <h2 id={headingId}>Browse dashboard pages</h2>
          </div>
          <button
            aria-label="Close navigation menu"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <nav aria-label="Mobile primary">
          <ul className="nav-list mobile-nav-list">
            {navigationItems.map(({ description, icon: Icon, label, path }) => (
              <li key={path}>
                <NavLink
                  className={({ isActive }) =>
                    `nav-link mobile-nav-link${isActive ? " is-active" : ""}`
                  }
                  onClick={onClose}
                  to={path}
                >
                  <Icon aria-hidden="true" size={18} />
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
