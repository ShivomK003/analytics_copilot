import type { RefObject } from "react";
import { Menu, RefreshCw } from "lucide-react";

type TopHeaderProps = {
  currentPageTitle: string;
  isRefreshing?: boolean;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  onOpenNavigation: () => void;
  onRefresh?: () => void;
};

export function TopHeader({
  currentPageTitle,
  isRefreshing = false,
  menuButtonRef,
  onOpenNavigation,
  onRefresh,
}: TopHeaderProps) {
  return (
    <header className="top-header">
      <div className="top-header-left">
        <button
          aria-label="Open navigation menu"
          className="icon-button top-header-menu-button"
          onClick={onOpenNavigation}
          ref={menuButtonRef}
          type="button"
        >
          <Menu aria-hidden="true" size={18} />
        </button>
        <div>
          <p className="top-header-label">Current page</p>
          <h2>{currentPageTitle}</h2>
        </div>
      </div>
      <div className="top-header-utility" aria-label="Future dashboard utility area">
        <span className="status-pill">Data actions added in Phase C</span>
        <button
          aria-label="Refresh data"
          className={`icon-button${isRefreshing ? " is-refreshing" : ""}${!onRefresh ? " is-disabled" : ""}`}
          disabled={!onRefresh || isRefreshing}
          onClick={onRefresh}
          title="Refresh data"
          type="button"
        >
          <RefreshCw aria-hidden="true" size={16} />
        </button>
      </div>
    </header>
  );
}
