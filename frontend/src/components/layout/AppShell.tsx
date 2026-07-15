import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { navigationItems } from "../../config/navigation";
import { MobileNavigationDrawer } from "./MobileNavigationDrawer";
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const location = useLocation();
  const queryClient = useQueryClient();

  const currentItem = useMemo(
    () =>
      navigationItems.find((item) =>
        location.pathname === item.path
          ? true
          : item.path !== "/overview" && location.pathname.startsWith(item.path),
      ),
    [location.pathname],
  );
  const isOverviewPage = currentItem?.path === "/overview";
  const isDashboardHomeFetching =
    useIsFetching({ queryKey: ["dashboard-home"] }) > 0;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <Sidebar />
      <div className="app-shell-main">
        <TopHeader
          currentPageTitle={currentItem?.label ?? "Dashboard"}
          isRefreshing={isDashboardHomeFetching}
          menuButtonRef={menuButtonRef}
          onOpenNavigation={() => setIsMobileNavOpen(true)}
          onRefresh={
            isOverviewPage
              ? () =>
                  queryClient.refetchQueries({
                    queryKey: ["dashboard-home"],
                    type: "active",
                  })
              : undefined
          }
        />
        <main className="app-shell-content" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
      <MobileNavigationDrawer
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
        returnFocusRef={menuButtonRef}
      />
    </div>
  );
}
