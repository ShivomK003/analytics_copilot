import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Layers3, Menu, RefreshCw } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { navigationItems } from "../../config/navigation";

type TopHeaderProps = {
  isRefreshing?: boolean;
  isMenuOpen: boolean;
  mobileMenuId: string;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  onOpenNavigation: () => void;
  onRefresh?: () => void;
};

export function TopHeader({
  isRefreshing = false,
  isMenuOpen,
  mobileMenuId,
  menuButtonRef,
  onOpenNavigation,
  onRefresh,
}: TopHeaderProps) {
  const headerRef = useRef<HTMLElement>(null);
  const [scrollState, setScrollState] = useState(() => ({
    scrolled: window.scrollY > 16,
    hidden: false,
  }));

  useEffect(() => {
    let anchorY = Math.max(0, window.scrollY);
    function onScroll() {
      const y = Math.max(0, window.scrollY);
      const difference = y - anchorY;
      if (y > 16 && Math.abs(difference) < 8) return;
      const focused =
        headerRef.current?.contains(document.activeElement) &&
        document.activeElement?.matches(":focus-visible");
      const next = { scrolled: y > 16, hidden: y > 80 && difference > 0 && !focused };
      setScrollState((previous) =>
        previous.hidden === next.hidden && previous.scrolled === next.scrolled ? previous : next,
      );
      anchorY = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function reveal() {
    setScrollState((previous) => ({ ...previous, hidden: false }));
  }
  function navigate() {
    reveal();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  return (
    <header
      className="app-navigation"
      ref={headerRef}
      data-scrolled={scrollState.scrolled}
      data-hidden={scrollState.hidden && !isMenuOpen}
      onFocusCapture={reveal}
    >
      <div className="app-navigation-inner">
        <Link className="app-brand" to="/overview" onClick={navigate}>
          <Layers3 size={27} aria-hidden="true" />
          <span>Analytics Copilot</span>
        </Link>
        <nav className="desktop-primary-navigation" aria-label="Primary">
          <ul>
            {navigationItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === "/overview"}
                  className={({ isActive }) => `app-nav-link${isActive ? " is-active" : ""}`}
                  onClick={navigate}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="app-navigation-actions">
          {onRefresh ? (
            <button
              type="button"
              className={`icon-button${isRefreshing ? " is-refreshing" : ""}`}
              onClick={onRefresh}
              disabled={isRefreshing}
              aria-label="Refresh data"
              title="Refresh executive snapshot"
            >
              <RefreshCw size={18} aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            className="icon-button app-nav-menu-button"
            ref={menuButtonRef}
            aria-label="Open navigation menu"
            aria-expanded={isMenuOpen}
            aria-controls={mobileMenuId}
            onClick={onOpenNavigation}
          >
            <Menu size={21} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
