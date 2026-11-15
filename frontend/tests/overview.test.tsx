import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { router as appRouter } from "../src/app/router";
import { activityRows, executiveDate, executiveNumber } from "../src/utils/executiveData";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  const { cloneElement } = await import("react");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children as ReactElement<{ width: number; height: number }>, {
        width: 720,
        height: 320,
      }),
  };
});
const fixture = {
  kpis: {
    total_papers: 1234 as number | null,
    papers_published_this_week: 42,
    papers_published_this_month: 120,
    latest_etl_status: "FAILED",
  },
  daily_trend: [
    { publication_date: "2026-11-10", paper_count: 8 },
    { publication_date: "2026-11-12", paper_count: 13 },
  ],
  weekly_trend: [
    { week_start: "2026-11-02", paper_count: 110 },
    { week_start: "2026-11-09", paper_count: 42 },
  ],
  topic_distribution: [
    { topic_id: 5, topic_name: "Agents", paper_count: 100, percentage_of_tagged_papers: 80 },
    { topic_id: 8, topic_name: "Vision", paper_count: 90, percentage_of_tagged_papers: 75 },
  ],
  top_authors: [{ author_id: 1, author_name: "Example author", paper_count: 9 }],
  latest_papers: [
    {
      paper_id: "example",
      title: "Example publication",
      published_date: "2026-10-08T23:30:00Z",
      authors: ["Example author"],
      topics: ["Agents"],
      primary_category: "cs.AI",
    },
  ],
};
const coverage = {
  meta: { warnings: ["Historical completeness has not been verified."] },
  data: { total_topics: 8, latest_successful_etl_at: "2026-11-13T23:30:00Z" },
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
function setup(home = fixture) {
  vi.stubGlobal("scrollTo", vi.fn());
  const fetch = vi.fn((url: string) => {
    if (url.includes("/intelligence/coverage")) return Promise.resolve(json(coverage));
    if (url.includes("/authors/count")) return Promise.resolve(json({ total: 56 }));
    if (url.includes("/trends/monthly"))
      return Promise.resolve(
        json([
          { month_start: "2026-10-01", paper_count: 500 },
          { month_start: "2026-11-01", paper_count: 120 },
        ]),
      );
    return Promise.resolve(json(home));
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(appRouter.routes, { initialEntries: ["/overview"] });
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { fetch, router, client, ...view };
}
function metric(label: string) {
  return screen.getByText(label, { selector: "dt" }).closest("div")!;
}

describe("Executive snapshot", () => {
  it("uses live source metrics once in a connected strip and separates update/publication dates", async () => {
    setup();
    expect(await screen.findByText("1,234")).toBeTruthy();
    expect(within(metric("Published this week")).getByText("42")).toBeTruthy();
    expect(await within(metric("Topics tracked")).findByText("8")).toBeTruthy();
    expect(await within(metric("Researchers indexed")).findByText("56")).toBeTruthy();
    const hero = screen.getByLabelText("AI Research Intelligence");
    expect(hero.textContent).toContain("Discover where AI research is heading.");
    expect(hero.textContent).not.toContain("1,234");
    expect(
      within(hero)
        .getByRole("link", { name: /Explore Research Intelligence/ })
        .getAttribute("href"),
    ).toBe("/intelligence");
    expect(hero.querySelector("time")?.dateTime).toBe("2026-11-13T23:30:00Z");
    expect(screen.getByText("8 Oct 2026").getAttribute("datetime")).toBe("2026-10-08T23:30:00Z");
    expect(screen.getByRole("link", { name: "Example publication" }).getAttribute("href")).toBe(
      "/papers/example",
    );
    expect(screen.getByRole("link", { name: "Example author" }).getAttribute("href")).toBe(
      "/authors/1",
    );
    expect(screen.getByRole("link", { name: /View all papers/ }).getAttribute("href")).toBe(
      "/papers",
    );
    expect(screen.queryByText("KPI Summary")).toBeNull();
    expect(screen.queryByLabelText("Date range")).toBeNull();
  });
  it("changes only publication activity granularity and lazily fetches monthly data", async () => {
    const { fetch, container } = setup();
    await screen.findByText("1,234");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    const activity = screen.getByRole("region", { name: "Publication Activity" });
    fireEvent.click(within(activity).getByRole("button", { name: "Daily" }));
    fireEvent.click(within(activity).getByText("Publication activity values"));
    expect(within(activity).getByText("13")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(3);
    fireEvent.click(within(activity).getByRole("button", { name: "Monthly" }));
    await within(activity).findByText("500");
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(String(fetch.mock.calls[3][0])).toContain("/trends/monthly");
    expect(within(metric("Published this week")).getByText("42")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Example publication" })).toBeTruthy();
    fireEvent.click(within(activity).getByRole("button", { name: "Weekly" }));
    expect(within(activity).getByText("110")).toBeTruthy();
    fireEvent.click(within(activity).getByRole("button", { name: "Monthly" }));
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(container.querySelector(".recharts-pie")).toBeNull();
    expect(container.querySelectorAll(".recharts-bar-rectangle").length).toBeGreaterThan(0);
  });
  it("refreshes the executive sources while preserving panels and current granularity", async () => {
    const { fetch } = setup();
    await screen.findByText("1,234");
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Refresh data" }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(6));
    expect(screen.getByRole("region", { name: "Leading Researchers" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Recent Publications" })).toBeTruthy();
  });
  it("preserves zero KPIs and shows unknown values as unavailable", async () => {
    setup({
      ...fixture,
      kpis: {
        ...fixture.kpis,
        total_papers: null,
        papers_published_this_week: 0,
      },
    });
    await within(metric("Indexed papers")).findByText("Unavailable");
    expect(within(metric("Published this week")).getByText("0")).toBeTruthy();
  });
  it("isolates monthly failures from the rest of the dashboard", async () => {
    const { fetch } = setup();
    await screen.findByText("1,234");
    const original = fetch.getMockImplementation()!;
    fetch.mockImplementation((url: string) =>
      url.includes("/trends/monthly")
        ? Promise.resolve(json({ detail: "Unavailable" }, 503))
        : original(url),
    );
    fireEvent.click(screen.getByRole("button", { name: "Monthly" }));
    expect(await screen.findByText("Monthly activity unavailable")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Example publication" })).toBeTruthy();
    expect(within(metric("Indexed papers")).getByText("1,234")).toBeTruthy();
  });
  it("retains the hero during initial loading and permits snapshot retry", async () => {
    const { fetch } = setup();
    expect(
      screen.getByRole("heading", { level: 1, name: /Discover where AI research is heading/ }),
    ).toBeTruthy();
    expect(screen.getByText("Loading publication activity…")).toBeTruthy();
    await screen.findByText("1,234");
    const original = fetch.getMockImplementation()!;
    fetch.mockImplementation((url: string) =>
      url.includes("/dashboard/home")
        ? Promise.resolve(json({ detail: "Unavailable" }, 500))
        : original(url),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
    expect(await screen.findByText("Snapshot refresh interrupted")).toBeTruthy();
    expect(within(metric("Indexed papers")).getByText("1,234")).toBeTruthy();
  });
});

describe("Executive labels and analytical integrity", () => {
  it("keeps returned buckets, genuine zeros and null gaps without inserting periods", () => {
    const rows = activityRows(
      [
        { publication_date: "2026-07-03", paper_count: null },
        { publication_date: "2026-07-01", paper_count: 0 },
      ],
      "daily",
      new Date("2026-07-03T18:00:00Z"),
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.papers)).toEqual([0, null]);
    expect(rows.map((row) => row.start)).toEqual(["2026-07-01", "2026-07-03"]);
    expect(rows[1].ongoing).toBe(true);
    expect(executiveNumber(undefined)).toBe("Unavailable");
    expect(executiveNumber(0)).toBe("0");
  });
  it("formats UTC calendar dates and timestamps without confusing publication/update times", () => {
    expect(executiveDate("2026-11-13T23:30:00-02:00", true)).toBe("14 Nov 2026, 01:30");
    expect(activityRows([{ week_start: "2026-10-26", paper_count: 9 }], "weekly")[0].interval).toBe(
      "26 Oct 2026 – 1 Nov 2026 · UTC",
    );
    expect(
      activityRows([{ month_start: "2026-12-01", paper_count: 9 }], "monthly")[0].interval,
    ).toBe("1 Dec 2026 – 31 Dec 2026 · UTC");
    expect(executiveDate(null)).toBe("Unavailable");
  });
});
