import { useCallback, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { MobileNavigationDrawer } from "./MobileNavigationDrawer";
import { TopHeader } from "./TopHeader";
import "../../styles/navigation.css";

export function AppShell({ children }: { children: ReactNode }) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileMenuId = useId();
  const location = useLocation();
  const queryClient = useQueryClient();
  const isOverview = location.pathname === "/overview";
  const fetchingHome = useIsFetching({ queryKey: ["dashboard-home"] });
  const fetchingCoverage = useIsFetching({ queryKey: ["intelligence", "coverage"] });
  const fetchingAuthors = useIsFetching({ queryKey: ["authors", "count"] });
  const fetchingMonthly = useIsFetching({ queryKey: ["trends", "monthly"] });
  const closeNavigation = useCallback(() => setIsMobileNavOpen(false), []);

  function refreshSnapshot() {
    return Promise.all([
      queryClient.refetchQueries({ queryKey: ["dashboard-home"], type: "active" }),
      queryClient.refetchQueries({ queryKey: ["intelligence", "coverage"], type: "active" }),
      queryClient.refetchQueries({ queryKey: ["authors", "count"], type: "active" }),
      queryClient.refetchQueries({ queryKey: ["trends", "monthly"], type: "active" }),
    ]);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="app-shell-main" inert={isMobileNavOpen}>
        <TopHeader
          isRefreshing={fetchingHome + fetchingCoverage + fetchingAuthors + fetchingMonthly > 0}
          isMenuOpen={isMobileNavOpen}
          mobileMenuId={mobileMenuId}
          menuButtonRef={menuButtonRef}
          onOpenNavigation={() => setIsMobileNavOpen(true)}
          onRefresh={isOverview ? refreshSnapshot : undefined}
        />
        <main className="app-shell-content" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
      <MobileNavigationDrawer
        id={mobileMenuId}
        isOpen={isMobileNavOpen}
        onClose={closeNavigation}
        returnFocusRef={menuButtonRef}
      />
    </div>
  );
}
