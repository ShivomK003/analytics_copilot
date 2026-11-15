import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, matchRoutes, Outlet, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "../src/components/layout/AppShell";
import { router as appRouter } from "../src/app/router";
import { navigationItems } from "../src/config/navigation";

function setup(path = "/overview") {
  vi.stubGlobal("scrollY", 0);
  vi.stubGlobal("scrollTo", vi.fn());
  const client = new QueryClient();
  const router = createMemoryRouter(
    [
      {
        element: (
          <AppShell>
            <Outlet />
          </AppShell>
        ),
        children: [
          { path: "/overview", element: <h1>Executive snapshot</h1> },
          { path: "/intelligence", element: <h1>Research workspace</h1> },
          { path: "/papers", element: <h1>Paper search</h1> },
          { path: "/papers/:paperId", element: <h1>Paper details</h1> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}
function scroll(y: number) {
  vi.stubGlobal("scrollY", y);
  fireEvent.scroll(window);
}

describe("Horizontal primary navigation", () => {
  it("shows three destinations and leaves legacy routes and profile functionality registered", () => {
    setup();
    const primary = screen.getByRole("navigation", { name: "Primary" });
    expect(
      within(primary)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Overview", "Research Intelligence", "Paper Explorer"]);
    expect(within(primary).getByRole("link", { name: "Paper Explorer" }).getAttribute("href")).toBe(
      "/papers",
    );
    expect(screen.queryByRole("complementary")).toBeNull();
    for (const route of [
      "/trends",
      "/topics",
      "/categories",
      "/authors",
      "/authors/5",
      "/papers/example",
    ])
      expect(matchRoutes(appRouter.routes, route)?.at(-1)?.route.path).not.toBe("*");
    expect(navigationItems).toHaveLength(3);
    expect(
      within(primary).getByRole("link", { name: "Overview" }).getAttribute("aria-current"),
    ).toBe("page");
  });
  it("hides on downward scroll, reveals a frosted surface on upward scroll, and integrates again at top", () => {
    setup("/intelligence");
    const header = screen.getByRole("banner");
    expect(header.getAttribute("data-scrolled")).toBe("false");
    scroll(120);
    expect(header.getAttribute("data-hidden")).toBe("true");
    expect(header.getAttribute("data-scrolled")).toBe("true");
    scroll(90);
    expect(header.getAttribute("data-hidden")).toBe("false");
    expect(header.getAttribute("data-scrolled")).toBe("true");
    scroll(0);
    expect(header.getAttribute("data-hidden")).toBe("false");
    expect(header.getAttribute("data-scrolled")).toBe("false");
  });
  it("reveals hidden navigation when keyboard focus enters and highlights nested Paper Explorer routes", () => {
    setup("/papers/example");
    scroll(120);
    const header = screen.getByRole("banner");
    expect(header.getAttribute("data-hidden")).toBe("true");
    const explorer = screen.getByRole("link", { name: "Paper Explorer" });
    act(() => explorer.focus());
    expect(header.getAttribute("data-hidden")).toBe("false");
    expect(explorer.getAttribute("aria-current")).toBe("page");
    expect(document.activeElement).toBe(explorer);
  });
  it("uses a modal mobile menu with focus containment, Escape dismissal and focus restoration", () => {
    setup();
    const menu = screen.getByRole("button", { name: "Open navigation menu" });
    fireEvent.click(menu);
    const dialog = screen.getByRole("dialog", { name: "Explore the workspace" });
    expect(menu.getAttribute("aria-expanded")).toBe("true");
    expect(menu.getAttribute("aria-controls")).toBe(dialog.id);
    expect(document.body.style.overflow).toBe("hidden");
    expect(
      within(dialog).getByText("Discover where AI research is heading.").closest("footer"),
    ).toBeTruthy();
    expect(within(dialog).getByRole("navigation", { name: "Mobile primary" })).toBeTruthy();
    const close = within(dialog).getByRole("button", { name: "Close navigation menu" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(
      within(dialog).getByRole("link", { name: /Paper Explorer/ }),
    );
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(menu);
    expect(document.body.style.overflow).toBe("");
  });
  it("closes only on the backdrop and preserves background inertness while the drawer is open", () => {
    setup("/intelligence");
    const trigger = screen.getByRole("button", { name: "Open navigation menu" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(document.getElementById("main-content")?.parentElement?.hasAttribute("inert")).toBe(
      true,
    );
    fireEvent.click(within(dialog).getByText("Explore the workspace"));
    expect(screen.getByRole("dialog")).toBe(dialog);
    fireEvent.click(dialog.parentElement!);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.getElementById("main-content")?.parentElement?.hasAttribute("inert")).toBe(
      false,
    );
    expect(document.activeElement).toBe(trigger);
  });
  it("navigates from the mobile menu without changing the existing paper route", async () => {
    const router = setup();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("link", { name: /Paper Explorer/ }),
    );
    expect(router.state.location.pathname).toBe("/papers");
    expect(await screen.findByRole("heading", { name: "Paper search" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });
});
