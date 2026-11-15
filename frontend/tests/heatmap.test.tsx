import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { TopicCategoryHeatmap } from "../src/components/intelligence/TopicCategoryHeatmap";
import { CategoryTopicMatrix } from "../src/components/categories/CategoryTopicMatrix";
import type { TopicCategoryHeatmapData } from "../src/types/intelligence";
import {
  formatHeatmapValue,
  heatmapCells,
  heatmapMetricValue,
  heatmapSelection,
} from "../src/utils/heatmapData";

const data: TopicCategoryHeatmapData = {
  date_from: "2026-08-01",
  date_to: "2026-09-30",
  category_scope: "all",
  topics: [
    { topic_id: 5, topic_name: "Agents", paper_count: 20 },
    { topic_id: 9, topic_name: "Empty topic", paper_count: 0 },
  ],
  categories: [
    { category_id: 3, category_code: "cs.AI", paper_count: 100 },
    { category_id: 8, category_code: "cs.LG", paper_count: 40 },
  ],
  cells: [
    {
      topic_id: 5,
      category_id: 3,
      paper_count: 10,
      category_prevalence_pct: 10,
      topic_distribution_pct: 50,
    },
    {
      topic_id: 5,
      category_id: 8,
      paper_count: 5,
      category_prevalence_pct: 12.5,
      topic_distribution_pct: 25,
    },
    {
      topic_id: 9,
      category_id: 3,
      paper_count: 0,
      category_prevalence_pct: 0,
      topic_distribution_pct: null,
    },
    {
      topic_id: 9,
      category_id: 8,
      paper_count: 0,
      category_prevalence_pct: 0,
      topic_distribution_pct: null,
    },
  ],
};
const props = {
  dates: { date_from: "2026-08-01", date_to: "2026-09-30" },
  topicIds: [5, 9],
  topicsReady: true,
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}
function mockData(value = data) {
  const fetch = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(
        response({ meta: { warnings: ["Historical coverage is unknown."] }, data: value }),
      ),
    );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
function cell(category = "cs.AI", topic = "Agents") {
  return screen.getByRole("button", { name: new RegExp(`^${category} · ${topic}:`) });
}
function changeMetric(value: string) {
  fireEvent.change(screen.getByLabelText("Heatmap metric"), { target: { value } });
}

describe("Intelligence heatmap mapping", () => {
  it("preserves backend percentages and distinguishes zero, null and missing values", () => {
    const cells = heatmapCells(data);
    expect(cells.get("3:5")).toEqual(data.cells[0]);
    expect(heatmapMetricValue(cells.get("3:5"), "category_prevalence_pct")).toBe(10);
    expect(heatmapMetricValue(cells.get("8:5"), "topic_distribution_pct")).toBe(25);
    expect(heatmapMetricValue(cells.get("3:9"), "paper_count")).toBe(0);
    expect(heatmapMetricValue(cells.get("3:9"), "topic_distribution_pct")).toBeNull();
    expect(heatmapMetricValue(cells.get("999:9"), "paper_count")).toBeUndefined();
    expect(formatHeatmapValue(0, "topic_distribution_pct")).toBe("0%");
    expect(formatHeatmapValue(null, "topic_distribution_pct")).toBe("Unavailable");
    expect(formatHeatmapValue(33.333333, "category_prevalence_pct")).toBe("33.333333%");
  });
  it("prepares category-code evidence filters with exact inclusive dates and scope", () => {
    const coordinate = { categoryKey: "3", topicKey: "5" };
    expect(heatmapSelection(data, coordinate, "paper_count")).toEqual({
      kind: "topic-category",
      topicIds: [5],
      categoryId: 3,
      category: "cs.AI",
      categoryScope: "all",
      dateFrom: "2026-08-01",
      dateTo: "2026-09-30",
      metric: "paper_count",
    });
    expect(
      heatmapSelection(
        { ...data, category_scope: "primary", date_from: null, date_to: null },
        coordinate,
        "topic_distribution_pct",
      ),
    ).toMatchObject({ categoryScope: "primary", dateFrom: null, dateTo: null });
    expect(
      heatmapSelection(data, { categoryKey: "missing", topicKey: "5" }, "paper_count"),
    ).toBeNull();
  });
});

describe("Intelligence heatmap interaction", () => {
  it("loads all topic/category cells and uses the purple scale with zero distinct from unavailable", async () => {
    mockData();
    render(<TopicCategoryHeatmap {...props} />, { wrapper: setup().Wrapper });
    expect(screen.getByText("Loading topic–category heatmap…")).toBeTruthy();
    await screen.findByRole("button", { name: /^cs.AI · Agents:/ });
    expect(cell().textContent).toBe("10");
    expect(cell().getAttribute("data-intensity")).toBe("5");
    expect(cell("cs.AI", "Empty topic").textContent).toBe("0");
    expect(cell("cs.AI", "Empty topic").getAttribute("data-intensity")).toBe("zero");
    changeMetric("topic_distribution_pct");
    expect(cell("cs.AI", "Empty topic").textContent).toBe("—");
    expect(cell("cs.AI", "Empty topic").getAttribute("data-intensity")).toBe("unavailable");
    expect(cell().textContent).toBe("50%");
  });
  it("switches metrics locally and provides exact denominator context on hover and focus", async () => {
    const fetch = mockData();
    render(<TopicCategoryHeatmap {...props} />, { wrapper: setup().Wrapper });
    await screen.findByRole("button", { name: /^cs.AI · Agents:/ });
    changeMetric("category_prevalence_pct");
    expect(cell().textContent).toBe("10%");
    fireEvent.focus(cell());
    expect(screen.getByRole("tooltip").textContent).toContain(
      "Denominator: 100 indexed category papers",
    );
    expect(screen.getByRole("tooltip").textContent).toContain("including untagged papers");
    changeMetric("topic_distribution_pct");
    fireEvent.mouseEnter(cell("cs.LG"));
    expect(screen.getByRole("tooltip").textContent).toContain("Topic distribution (%): 25%");
    expect(screen.getByRole("tooltip").textContent).toContain(
      "Denominator: 20 dated indexed papers",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("selects a keyboard-focusable cell and emits a typed evidence payload without fetching evidence", async () => {
    const fetch = mockData();
    const onSelectCell = vi.fn();
    render(<TopicCategoryHeatmap {...props} onSelectCell={onSelectCell} />, {
      wrapper: setup().Wrapper,
    });
    await screen.findByRole("button", { name: /^cs.AI · Agents:/ });
    const button = cell() as HTMLButtonElement;
    expect(button.tabIndex).toBe(0);
    fireEvent.focus(button);
    expect(button.getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id);
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(onSelectCell).toHaveBeenLastCalledWith(
      heatmapSelection(data, { categoryKey: "3", topicKey: "5" }, "paper_count"),
    );
    changeMetric("category_prevalence_pct");
    fireEvent.click(button);
    expect(onSelectCell).toHaveBeenLastCalledWith(
      heatmapSelection(data, { categoryKey: "3", topicKey: "5" }, "category_prevalence_pct"),
    );
    fireEvent.keyDown(button, { key: "Escape" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("removes/adds categories without changing denominators or issuing requests", async () => {
    const fetch = mockData();
    render(<TopicCategoryHeatmap {...props} />, { wrapper: setup().Wrapper });
    await screen.findByRole("button", { name: /^cs.AI · Agents:/ });
    fireEvent.click(screen.getByText("Choose categories · 2 shown of 2"));
    fireEvent.click(screen.getByRole("button", { name: "Remove cs.LG" }));
    expect(screen.queryByRole("button", { name: /^cs.LG · Agents:/ })).toBeNull();
    changeMetric("category_prevalence_pct");
    expect(cell().textContent).toBe("10%");
    fireEvent.focus(screen.getByLabelText("Search categories for heatmap"));
    fireEvent.change(screen.getByLabelText("Search categories for heatmap"), {
      target: { value: "LG" },
    });
    fireEvent.click(
      within(screen.getByRole("group", { name: "Available categories" })).getByRole("button", {
        name: "cs.LG",
      }),
    );
    expect(cell("cs.LG").textContent).toBe("12.5%");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("resets grid scrolling on category changes while retaining the selected visible cell", async () => {
    const fetch = mockData();
    render(<TopicCategoryHeatmap {...props} />, { wrapper: setup().Wrapper });
    const selected = await screen.findByRole("button", { name: /^cs.AI · Agents:/ });
    fireEvent.click(selected);
    const initial = screen.getByRole("region", { name: "Shared paper count heatmap" });
    initial.scrollTop = 120;
    initial.scrollLeft = 80;
    fireEvent.click(screen.getByText("Choose categories · 2 shown of 2"));
    fireEvent.click(screen.getByRole("button", { name: "Remove cs.LG" }));
    const reset = screen.getByRole("region", { name: "Shared paper count heatmap" });
    expect(reset.scrollTop).toBe(0);
    expect(reset.scrollLeft).toBe(0);
    expect(
      screen.getByRole("button", { name: /^cs.AI · Agents:/ }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText("Choose categories · 1 shown of 2")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
    reset.scrollLeft = 30;
    changeMetric("category_prevalence_pct");
    expect(screen.getByRole("region", { name: "Category prevalence (%) heatmap" }).scrollLeft).toBe(
      30,
    );
  });
  it("updates scope/date/topic query keys and uses the response scope in evidence selection", async () => {
    const fetch = mockData();
    const onSelectCell = vi.fn();
    const view = render(<TopicCategoryHeatmap {...props} onSelectCell={onSelectCell} />, {
      wrapper: setup().Wrapper,
    });
    await screen.findByRole("button", { name: /^cs.AI · Agents:/ });
    fetch.mockResolvedValue(
      response({ meta: { warnings: [] }, data: { ...data, category_scope: "primary" } }),
    );
    fireEvent.change(screen.getByLabelText("Heatmap category scope"), {
      target: { value: "primary" },
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(String(fetch.mock.calls[1][0])).toContain("category_scope=primary");
    await screen.findByRole("button", { name: /^cs.AI · Agents:/ });
    fireEvent.click(cell());
    expect(onSelectCell.mock.calls[0][0].categoryScope).toBe("primary");
    view.rerender(
      <TopicCategoryHeatmap
        {...props}
        topicIds={[5]}
        dates={{ date_from: "2026-09-01", date_to: "2026-09-20" }}
      />,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    const params = new URL(String(fetch.mock.calls[2][0]), "http://test").searchParams;
    expect(params.getAll("topic_id")).toEqual(["5"]);
    expect(params.get("date_from")).toBe("2026-09-01");
    expect(params.get("date_to")).toBe("2026-09-20");
    expect(params.get("category_scope")).toBe("primary");
  });
  it("does not fabricate an omitted observation or allow evidence selection for it", async () => {
    mockData({ ...data, cells: data.cells.filter((c) => c.topic_id !== 5 || c.category_id !== 3) });
    const onSelectCell = vi.fn();
    render(<TopicCategoryHeatmap {...props} onSelectCell={onSelectCell} />, {
      wrapper: setup().Wrapper,
    });
    await screen.findByRole("button", { name: /^cs.AI · Agents:/ });
    expect(cell().textContent).toBe("—");
    fireEvent.click(cell());
    expect(onSelectCell).not.toHaveBeenCalled();
    expect(screen.getByRole("tooltip").textContent).toContain("Observation unavailable");
  });
  it.each<[TopicCategoryHeatmapData, string]>([
    [{ ...data, topics: [] }, "No topics available"],
    [{ ...data, categories: [], cells: [] }, "No active categories"],
  ])("handles empty dimensions", async (value, title) => {
    mockData(value);
    render(<TopicCategoryHeatmap {...props} />, { wrapper: setup().Wrapper });
    expect(await screen.findByText(title)).toBeTruthy();
  });
  it.each([422, 500, 503])("handles HTTP %s with explicit retry", async (status) => {
    const fetch = vi.fn().mockResolvedValue(response({ detail: "Request failed" }, status));
    vi.stubGlobal("fetch", fetch);
    render(<TopicCategoryHeatmap {...props} />, { wrapper: setup().Wrapper });
    const retry = await screen.findByRole("button", { name: "Retry heatmap" });
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValue(response({ meta: { warnings: [] }, data }));
    fireEvent.click(retry);
    await screen.findByRole("button", { name: /^cs.AI · Agents:/ });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not request invalid ranges or missing topics and exposes network errors", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetch);
    const view = render(<TopicCategoryHeatmap {...props} dates={{ error: "Invalid dates" }} />, {
      wrapper: setup().Wrapper,
    });
    expect(screen.getByText("Choose a valid heatmap range")).toBeTruthy();
    view.rerender(<TopicCategoryHeatmap {...props} topicsReady={false} />);
    expect(screen.getByText("Topics unavailable")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    view.rerender(<TopicCategoryHeatmap {...props} />);
    expect(await screen.findByRole("button", { name: "Retry heatmap" })).toBeTruthy();
  });
  it("preserves same-filter cells during refresh, announces it, and keeps warnings accessible", async () => {
    const fetch = mockData();
    const { client, Wrapper } = setup();
    render(<TopicCategoryHeatmap {...props} />, { wrapper: Wrapper });
    await screen.findByRole("button", { name: /^cs.AI · Agents:/ });
    const disclosure = screen.getByText("How to read this heatmap").closest("details")!;
    expect(disclosure.open).toBe(false);
    fireEvent.click(disclosure.querySelector("summary")!);
    expect(within(disclosure).getByText("Historical coverage is unknown.")).toBeTruthy();
    let resolve: (value: Response) => void = () => {};
    fetch.mockImplementation(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    await act(async () => {
      void client.invalidateQueries({ queryKey: ["intelligence", "topic-category-heatmap"] });
    });
    expect(await screen.findByText("Updating topic–category heatmap…")).toBeTruthy();
    expect(cell().textContent).toBe("10");
    await act(async () => {
      resolve(response({ meta: { warnings: [] }, data }));
    });
    await waitFor(() => expect(screen.queryByText("Updating topic–category heatmap…")).toBeNull());
  });
  it("cancels superseded requests and hides data for previous filters", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, options: { signal: AbortSignal }) => {
        signals.push(options.signal);
        if (signals.length === 1)
          return Promise.resolve(response({ meta: { warnings: [] }, data }));
        return new Promise<Response>((_resolve, reject) =>
          options.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        );
      }),
    );
    const view = render(<TopicCategoryHeatmap {...props} />, { wrapper: setup().Wrapper });
    await screen.findByRole("button", { name: /^cs.AI · Agents:/ });
    view.rerender(<TopicCategoryHeatmap {...props} topicIds={[5]} />);
    await waitFor(() => expect(signals).toHaveLength(2));
    expect(screen.queryByRole("button", { name: /^cs.AI · Agents:/ })).toBeNull();
    view.rerender(<TopicCategoryHeatmap {...props} topicIds={[9]} />);
    await waitFor(() => expect(signals).toHaveLength(3));
    expect(signals[1].aborted).toBe(true);
    view.unmount();
    expect(signals[2].aborted).toBe(true);
  });
});

describe("Categories heatmap presentation reuse", () => {
  it("preserves duplicate aggregation, overlap ranking, zero fill and empty handling", () => {
    const legacy = [
      {
        category_id: 1,
        category_code: "cs.AI",
        topic_id: 2,
        topic_name: "Vision",
        shared_paper_count: 4,
      },
      {
        category_id: 1,
        category_code: "cs.AI",
        topic_id: 2,
        topic_name: "Vision",
        shared_paper_count: 6,
      },
      {
        category_id: 2,
        category_code: "cs.LG",
        topic_id: 5,
        topic_name: "Agents",
        shared_paper_count: 1,
      },
    ];
    const view = render(<CategoryTopicMatrix data={legacy} />);
    expect(cell("cs.AI", "Vision").textContent).toBe("10");
    expect(cell("cs.LG", "Vision").textContent).toBe("0");
    expect(screen.getAllByRole("columnheader").map((n) => n.textContent)).toEqual([
      "Category",
      "Vision",
      "Agents",
    ]);
    view.rerender(<CategoryTopicMatrix data={[]} />);
    expect(screen.getByText("No category-topic relationships available")).toBeTruthy();
  });
  it("retains Top 10 selection, category search/removal and reset using the shared picker", () => {
    const legacy = Array.from({ length: 12 }, (_, i) => ({
      category_id: i + 1,
      category_code: `cat-${i + 1}`,
      topic_id: 2,
      topic_name: "Vision",
      shared_paper_count: 12 - i,
    }));
    render(<CategoryTopicMatrix data={legacy} />);
    expect(screen.getAllByRole("button", { name: /^Remove cat-/ })).toHaveLength(10);
    expect(
      (screen.getByLabelText("Search categories for heatmap") as HTMLInputElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove cat-1" }));
    fireEvent.focus(screen.getByLabelText("Search categories for heatmap"));
    fireEvent.change(screen.getByLabelText("Search categories for heatmap"), {
      target: { value: "cat-12" },
    });
    fireEvent.click(
      within(screen.getByRole("group", { name: "Available categories" })).getByRole("button", {
        name: "cat-12",
      }),
    );
    expect(screen.getByRole("button", { name: "Remove cat-12" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset to Top 10" }));
    expect(screen.getByRole("button", { name: "Remove cat-1" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove cat-12" })).toBeNull();
  });
});
