import { useModalFocus } from "../../hooks/useModalFocus";
import { useId, useRef } from "react";
import { NavLink } from "react-router-dom";
import { X } from "lucide-react";
import { navigationItems } from "../../config/navigation";

type MobileNavigationDrawerProps = {
  id?: string;
  isOpen: boolean;
  onClose: () => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
};

export function MobileNavigationDrawer({
  id,
  isOpen,
  onClose,
  returnFocusRef,
}: MobileNavigationDrawerProps) {
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const headingId = useId();

  useModalFocus({ isOpen, containerRef: drawerRef, returnFocusRef, onClose });

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
        id={id}
        aria-labelledby={headingId}
        aria-modal="true"
        className="mobile-nav-drawer"
        onClick={(event) => event.stopPropagation()}
        ref={drawerRef}
        role="dialog"
      >
        <div className="mobile-nav-header">
          <div>
            <p className="page-eyebrow">Analytics Copilot</p>
            <h2 id={headingId}>Explore the workspace</h2>
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
            {navigationItems.map(({ description, label, path }) => (
              <li key={path}>
                <NavLink
                  className={({ isActive }) =>
                    `app-nav-link mobile-nav-link${isActive ? " is-active" : ""}`
                  }
                  onClick={() => {
                    onClose();
                    window.scrollTo({ top: 0, behavior: "auto" });
                  }}
                  to={path}
                >
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <footer className="mobile-nav-footer">Discover where AI research is heading.</footer>
      </div>
    </div>
  );
}
