import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, matchRoutes, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { router as appRouter } from "../src/app/router";
import { IntelligencePage } from "../src/pages/IntelligencePage";
import { navigationItems } from "../src/config/navigation";
import { CoverageSummary } from "../src/components/intelligence/CoverageSummary";
import { IntelligenceError } from "../src/components/intelligence/IntelligenceState";
import { ApiError } from "../src/api/client";
import type {
  CoverageData,
  IntelligenceMetadata,
  IntelligenceResponse,
  TopicOption,
} from "../src/types/intelligence";

const meta: IntelligenceMetadata = {
  date_from: null,
  date_to: null,
  timezone: "UTC",
  observed_date_from: "2026-06-17",
  observed_date_to: "2026-10-08",
  coverage_status: "unknown",
  warnings: ["Historical ingestion completeness has not been verified."],
};
const coverage: IntelligenceResponse<CoverageData> = {
  meta,
  data: {
    total_indexed_papers: 100,
    dated_papers: 100,
    undated_papers: 0,
    tagged_papers: 80,
    untagged_papers: 20,
    total_topics: 3,
    observed_date_from: "2026-06-17",
    observed_date_to: "2026-10-08",
    latest_successful_etl_at: "2026-10-13T02:36:23Z",
  },
};
const topics: TopicOption[] = [2, 5, 8].map((id) => ({
  topic_id: id,
  topic_name: `Topic ${id}`,
  period_paper_count: 2,
  total_indexed_paper_count: 10,
}));
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
function mockRequests() {
  const fetch = vi.fn((url: string) =>
    Promise.resolve(
      response(
        url.includes("/composition")
          ? { meta, data: { interval: { date_from: null, date_to: null }, topics: [], weeks: [] } }
          : url.includes("/topic-category-heatmap")
            ? {
                meta,
                data: {
                  date_from: null,
                  date_to: null,
                  category_scope: "all",
                  topics: [],
                  categories: [],
                  cells: [],
                },
              }
            : url.includes("/relationships")
              ? {
                  meta,
                  data: {
                    date_from: null,
                    date_to: null,
                    min_shared_papers: 1,
                    nodes: [],
                    edges: [],
                  },
                }
              : url.includes("/coverage")
                ? coverage
                : url.includes("/momentum-matrix")
                  ? {
                      meta,
                      data: {
                        window_weeks: 4,
                        interval: { date_from: null, date_to: null },
                        previous_window: null,
                        recent_window: null,
                        topics: [],
                      },
                    }
                  : url.includes("/momentum")
                    ? {
                        meta,
                        data: {
                          mode: "count",
                          interval: { date_from: null, date_to: null },
                          topics: [],
                        },
                      }
                    : { meta, data: topics },
      ),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
function page(entry = "/intelligence") {
  const router = createMemoryRouter([{ path: "/intelligence", element: <IntelligencePage /> }], {
    initialEntries: [entry],
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, client };
}

describe("Intelligence route, filters and navigation", () => {
  beforeEach(() => {
    mockRequests();
  });

  it("links the five analytical stages to focusable sections without replacing filters or routes", async () => {
    const { router } = page("/intelligence?range=12w&topic_id=5");
    await screen.findByText(/13 Oct 2026/);
    const nav = screen.getByRole("navigation", { name: "Analytical journey" });
    const stages = [
      ["Activity", "research-momentum", "Research Momentum"],
      ["Growth", "momentum-matrix", "Momentum Matrix"],
      ["Prevalence", "topic-prevalence-change", "Topic Prevalence Change"],
      ["Connections", "research-relationships", "Research Relationships"],
      ["Categories", "topic-category-heatmap", "Topic–Category Heatmap"],
    ];
    expect(within(nav).getAllByRole("link")).toHaveLength(5);
    for (const [label, id, title] of stages) {
      const link = within(nav).getByRole("link", { name: label });
      expect(link.getAttribute("href")).toBe(`#${id}`);
      act(() => link.focus());
      expect(document.activeElement).toBe(link);
      const target = document.getElementById(id)!;
      expect(target.tabIndex).toBe(-1);
      expect(within(target).getByRole("heading", { name: title, level: 2 })).toBeTruthy();
    }
    expect(router.state.location.pathname).toBe("/intelligence");
    expect(router.state.location.search).toBe("?range=12w&topic_id=5");
    const growth = document.getElementById("momentum-matrix")!;
    const prevalence = document.getElementById("topic-prevalence-change")!;
    expect(within(growth.querySelector("header")!).getByLabelText("Weeks per window")).toBeTruthy();
    expect(
      within(prevalence.querySelector("header")!).getByLabelText("Prevalence weeks per window"),
    ).toBeTruthy();
    fireEvent.change(within(growth).getByLabelText("Weeks per window"), { target: { value: "2" } });
    expect(
      (within(prevalence).getByLabelText("Prevalence weeks per window") as HTMLSelectElement).value,
    ).toBe("4");
    fireEvent.change(within(prevalence).getByLabelText("Prevalence weeks per window"), {
      target: { value: "3" },
    });
    expect((within(growth).getByLabelText("Weeks per window") as HTMLSelectElement).value).toBe(
      "2",
    );
    expect(router.state.location.search).toBe("?range=12w&topic_id=5");
  });
  it("keeps filters and methodology collapsed without losing selected topics", async () => {
    page("/intelligence?range=12w&topic_id=5");
    await screen.findByText(/13 Oct 2026/);
    const picker = screen.getByText("Research topics").closest("details")!;
    const methodology = screen.getByText("Coverage & methodology").closest("details")!;
    expect(picker.open).toBe(false);
    expect(methodology.open).toBe(false);
    expect(screen.getByText("1 selected")).toBeTruthy();
    const requestCount = vi.mocked(fetch).mock.calls.length;
    fireEvent.click(picker.querySelector("summary")!);
    expect(picker.open).toBe(true);
    const selectedTopic = await screen.findByRole("checkbox", { name: "Topic 5" });
    expect((selectedTopic as HTMLInputElement).checked).toBe(true);
    fireEvent.click(picker.querySelector("summary")!);
    expect(picker.open).toBe(false);
    fireEvent.click(methodology.querySelector("summary")!);
    expect(methodology.open).toBe(true);
    expect(within(methodology).getByText(/Topics are assigned automatically/)).toBeTruthy();
    expect(vi.mocked(fetch).mock.calls.length).toBe(requestCount);
  });
  it("shows compact UTC coverage without duplicating executive KPIs", async () => {
    page();
    await screen.findByText(/13 Oct 2026/);
    const summary = screen.getByRole("region", { name: "Data coverage & freshness" });
    expect(summary.querySelectorAll("dt")).toHaveLength(0);
    expect(within(summary).queryByText("Indexed papers")).toBeNull();
    expect(within(summary).getByText(/2026-06-17.*2026-10-08/)).toBeTruthy();
    expect(summary.querySelector("time")?.dateTime).toBe("2026-10-13T02:36:23Z");
    expect(within(summary).getByText(/Historical completeness: unknown/)).toBeTruthy();
  });
  it("preserves every navigation destination and profile route", () => {
    for (const item of navigationItems) {
      expect(matchRoutes(appRouter.routes, item.path)?.at(-1)?.route.path).toBe(item.path.slice(1));
    }
    expect(matchRoutes(appRouter.routes, "/authors/42")?.at(-1)?.route.path).toBe(
      "authors/:authorId",
    );
    expect(matchRoutes(appRouter.routes, "/papers/id")?.at(-1)?.route.path).toBe("papers/:paperId");
  });
  it("registers the route and navigation without changing Explorer routes", () => {
    expect(matchRoutes(appRouter.routes, "/intelligence")?.at(-1)?.route.path).toBe("intelligence");
    expect(matchRoutes(appRouter.routes, "/papers/example")?.at(-1)?.route.path).toBe(
      "papers/:paperId",
    );
    expect(navigationItems.find((item) => item.path === "/intelligence")?.label).toBe(
      "Research Intelligence",
    );
  });
  it("renders the shared navigation and keyboard-focusable filters", async () => {
    const router = createMemoryRouter(appRouter.routes, { initialEntries: ["/intelligence"] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByText("Research topics"));
    const link = screen.getByRole("link", { name: "Research Intelligence" });
    expect(link.getAttribute("href")).toBe("/intelligence");
    expect(link.getAttribute("aria-current")).toBe("page");
    const dateSelect = screen.getByLabelText("Date range");
    dateSelect.focus();
    expect(document.activeElement).toBe(dateSelect);
    const checkbox = await screen.findByRole("checkbox", { name: "Topic 2" });
    checkbox.focus();
    expect(document.activeElement).toBe(checkbox);
  });
  it("renders all five Intelligence visualizations and requests only implemented datasets", async () => {
    page();
    fireEvent.click(screen.getByText("Research topics"));
    expect(screen.getByRole("heading", { name: "Research Intelligence", level: 1 })).toBeTruthy();
    expect(
      screen.getByText("Explore research momentum, emerging topics, and connections."),
    ).toBeTruthy();
    expect((screen.getByLabelText("Date range") as HTMLSelectElement).value).toBe("12w");
    await screen.findByRole("checkbox", { name: "Topic 2" });
    expect(screen.queryByText("Coming soon")).toBeNull();
    const paths = vi
      .mocked(fetch)
      .mock.calls.map(([url]) => new URL(String(url), "http://test").pathname);
    expect(paths.sort()).toEqual([
      "/intelligence/coverage",
      "/intelligence/momentum",
      "/intelligence/momentum-matrix",
      "/intelligence/relationships",
      "/intelligence/topic-category-heatmap",
      "/intelligence/topics",
    ]);
  });
  it("serializes subsets, clears to all, and restores dates/topics on back and forward", async () => {
    const { router } = page();
    fireEvent.click(screen.getByText("Research topics"));
    await screen.findByRole("checkbox", { name: "Topic 2" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Topic 2" }));
    expect(new URLSearchParams(router.state.location.search).getAll("topic_id")).toEqual([
      "5",
      "8",
    ]);
    fireEvent.change(screen.getByLabelText("Date range"), { target: { value: "4w" } });
    await waitFor(() =>
      expect(new URLSearchParams(router.state.location.search).get("range")).toBe("4w"),
    );
    await act(async () => {
      await router.navigate(-1);
    });
    expect((screen.getByLabelText("Date range") as HTMLSelectElement).value).toBe("12w");
    expect((screen.getByRole("checkbox", { name: "Topic 2" }) as HTMLInputElement).checked).toBe(
      false,
    );
    await act(async () => {
      await router.navigate(1);
    });
    expect((screen.getByLabelText("Date range") as HTMLSelectElement).value).toBe("4w");
    fireEvent.click(screen.getByRole("button", { name: "Clear subset" }));
    expect(new URLSearchParams(router.state.location.search).getAll("topic_id")).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(router.state.location.search).toBe("?range=12w");
  });
  it("applies valid custom dates together and does not fetch while dates are being edited", async () => {
    const { router } = page();
    fireEvent.click(screen.getByText("Research topics"));
    await screen.findByRole("checkbox", { name: "Topic 2" });
    fireEvent.change(screen.getByLabelText("Date range"), { target: { value: "custom" } });
    await waitFor(() => expect(screen.getByLabelText("Start date (UTC)")).toBeTruthy());
    const committed = router.state.location.search;
    fireEvent.change(screen.getByLabelText("Start date (UTC)"), {
      target: { value: "2026-08-31" },
    });
    fireEvent.change(screen.getByLabelText("End date (UTC)"), { target: { value: "2026-08-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply dates" }));
    expect(screen.getByRole("alert").textContent).toMatch(/start date/);
    expect(router.state.location.search).toBe(committed);
    fireEvent.change(screen.getByLabelText("Start date (UTC)"), {
      target: { value: "2026-08-01" },
    });
    fireEvent.change(screen.getByLabelText("End date (UTC)"), { target: { value: "2026-08-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply dates" }));
    expect(new URLSearchParams(router.state.location.search).get("date_from")).toBe("2026-08-01");
    expect(new URLSearchParams(router.state.location.search).get("date_to")).toBe("2026-08-31");
  });
  it("recovers malformed URL filters and removes unavailable topic IDs", async () => {
    page("/intelligence?range=bad&topic_id=999&topic_id=5");
    fireEvent.click(screen.getByText("Research topics"));
    await screen.findByRole("checkbox", { name: "Topic 5" });
    expect((screen.getByLabelText("Date range") as HTMLSelectElement).value).toBe("12w");
    expect(screen.getByText(/Invalid date preset/)).toBeTruthy();
    expect(screen.getByText(/unavailable topic selections/)).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Topic 5" }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByRole("checkbox", { name: "Topic 2" }) as HTMLInputElement).checked).toBe(
      false,
    );
  });
  it("uses actual observed bounds for all observed data", async () => {
    const { router } = page();
    fireEvent.click(screen.getByText("Research topics"));
    await screen.findByText(/13 Oct 2026/);
    fireEvent.change(screen.getByLabelText("Date range"), { target: { value: "all" } });
    expect(router.state.location.search).toBe("?range=all");
    expect(screen.getByText("2026-06-17 through 2026-10-08 (inclusive UTC)")).toBeTruthy();
  });
  it("offers manual retry after a network failure without automatic requests", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetch);
    page();
    fireEvent.click(screen.getByText("Research topics"));
    await screen.findByRole("button", { name: "Retry coverage" });
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockImplementation((url: string) =>
      Promise.resolve(
        response(
          url.includes("/composition")
            ? {
                meta,
                data: { interval: { date_from: null, date_to: null }, topics: [], weeks: [] },
              }
            : url.includes("/topic-category-heatmap")
              ? {
                  meta,
                  data: {
                    date_from: null,
                    date_to: null,
                    category_scope: "all",
                    topics: [],
                    categories: [],
                    cells: [],
                  },
                }
              : url.includes("/relationships")
                ? {
                    meta,
                    data: {
                      date_from: null,
                      date_to: null,
                      min_shared_papers: 1,
                      nodes: [],
                      edges: [],
                    },
                  }
                : url.includes("/coverage")
                  ? coverage
                  : url.includes("/momentum-matrix")
                    ? {
                        meta,
                        data: {
                          window_weeks: 4,
                          interval: { date_from: null, date_to: null },
                          previous_window: null,
                          recent_window: null,
                          topics: [],
                        },
                      }
                    : url.includes("/momentum")
                      ? {
                          meta,
                          data: {
                            mode: "count",
                            interval: { date_from: null, date_to: null },
                            topics: [],
                          },
                        }
                      : { meta, data: topics },
        ),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry coverage" }));
    await screen.findByText(/13 Oct 2026/);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

describe("coverage and reusable request states", () => {
  const base = { error: null, isPending: false, isFetching: false, onRetry: vi.fn() };
  it("announces loading and displays supported warehouse values and warnings", () => {
    const view = render(<CoverageSummary {...base} isPending />);
    expect(screen.getByRole("status").textContent).toMatch(/Loading warehouse coverage/);
    view.rerender(<CoverageSummary {...base} data={coverage} />);
    expect(screen.queryByText("Indexed papers")).toBeNull();
    expect(screen.getByText("Historical completeness: unknown")).toBeTruthy();
    expect(screen.getByLabelText("Coverage warnings").textContent).toMatch(/not been verified/);
    expect(screen.getByText(/13 Oct 2026/)).toBeTruthy();
  });
  it("distinguishes an empty warehouse, missing metadata, and request errors", () => {
    const empty = {
      ...coverage,
      data: {
        ...coverage.data,
        total_indexed_papers: 0,
        observed_date_from: null,
        observed_date_to: null,
        latest_successful_etl_at: null,
      },
    };
    const view = render(<CoverageSummary {...base} data={empty} />);
    expect(screen.getByText("No indexed papers yet")).toBeTruthy();
    expect(screen.getByText(/Last successful ETL.*Unavailable/)).toBeTruthy();
    expect(screen.getByText(/Observed publication dates.*Unavailable/)).toBeTruthy();
    view.rerender(<CoverageSummary {...base} />);
    expect(screen.getByText("Coverage unavailable")).toBeTruthy();
    view.rerender(
      <CoverageSummary
        {...base}
        error={new ApiError("Private server detail is not sent", 500, null)}
      />,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/Server error/);
    expect(screen.queryByText("No indexed papers yet")).toBeNull();
  });
  it.each([
    [422, "Check the request filters"],
    [500, "Server error"],
    [503, "Database temporarily busy"],
  ])("labels HTTP %s errors distinctly", (status, heading) => {
    render(
      <IntelligenceError error={new ApiError("Request issue", status, null)} onRetry={() => {}} />,
    );
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
  });
  it("honors Retry-After before enabling manual retry", () => {
    vi.useFakeTimers();
    const retry = vi.fn();
    render(<IntelligenceError error={new ApiError("Busy", 503, null, 2000)} onRetry={retry} />);
    expect(
      (screen.getByRole("button", { name: "Retry in 2s" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry data" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
