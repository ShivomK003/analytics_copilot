import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { MomentumMatrix, MatrixTopicDetails } from "../src/components/intelligence/MomentumMatrix";
import type { MomentumMatrixData, MomentumMatrixTopic } from "../src/types/intelligence";
import { formatMatrixChange, matrixPoints, matrixSelection } from "../src/utils/matrixData";

// Give real Recharts a fixed viewport; jsdom does not perform layout measurements.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  const { cloneElement } = await import("react");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children as ReactElement<{ width: number; height: number }>, {
        width: 720,
        height: 400,
      }),
  };
});

const topic: MomentumMatrixTopic = {
  topic_id: 5,
  topic_name: "Agents",
  previous_paper_count: 30,
  recent_paper_count: 45,
  absolute_change: 15,
  growth_percent: 50,
  growth_state: "growing",
  low_baseline: false,
  period_paper_count: 200,
  total_indexed_paper_count: 2000,
};
const data: MomentumMatrixData = {
  window_weeks: 4,
  interval: { date_from: "2026-07-01", date_to: "2026-10-08" },
  previous_window: { start: "2026-08-10T00:00:00Z", end_exclusive: "2026-09-07T00:00:00Z" },
  recent_window: { start: "2026-09-07T00:00:00Z", end_exclusive: "2026-10-05T00:00:00Z" },
  topics: [
    topic,
    {
      ...topic,
      topic_id: 8,
      topic_name: "Vision",
      recent_paper_count: 15,
      absolute_change: -15,
      growth_percent: -50,
      growth_state: "declining",
    },
    {
      ...topic,
      topic_id: 9,
      topic_name: "Stable",
      recent_paper_count: 30,
      absolute_change: 0,
      growth_percent: 0,
      growth_state: "stable",
    },
    {
      ...topic,
      topic_id: 10,
      topic_name: "Small",
      previous_paper_count: 2,
      recent_paper_count: 4,
      absolute_change: 2,
      growth_percent: 100,
      low_baseline: true,
    },
    {
      ...topic,
      topic_id: 11,
      topic_name: "New",
      previous_paper_count: 0,
      recent_paper_count: 7,
      absolute_change: 7,
      growth_percent: null,
      growth_state: "no_baseline",
      low_baseline: true,
    },
  ],
};
const props = {
  dates: { date_from: "2026-07-01", date_to: "2026-10-08" },
  topicIds: [5],
  topicsReady: true,
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
function mockData(value = data) {
  const fetch = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(response({ meta: { warnings: ["Coverage remains unknown."] }, data: value })),
    );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("Matrix measures and evidence contract", () => {
  it("uses current-window counts, not period or lifetime totals, and preserves returned change", () => {
    const points = matrixPoints(data.topics);
    expect(points[0]).toMatchObject({ activity: 45, change: 50, growth_state: "growing" });
    expect(points[1]).toMatchObject({ activity: 15, change: -50 });
    expect(points[2].change).toBe(0);
    expect(points[3].low_baseline).toBe(true);
    expect(points.some((p) => p.topic_id === 11)).toBe(false);
    expect(data.topics[4].growth_percent).toBeNull();
    expect(matrixPoints([])).toEqual([]);
  });
  it.each([
    [50, "+50%"],
    [-50, "-50%"],
    [0, "0%"],
    [null, "Unavailable"],
  ] as const)("formats %s without replacing unavailable baselines", (value, label) => {
    expect(formatMatrixChange(value)).toBe(label);
  });
  it("maps both half-open windows to inclusive UTC evidence dates without overlap", () => {
    expect(matrixSelection(data, 5, "recent")).toEqual({
      topicId: 5,
      window: "recent",
      windowWeeks: 4,
      start: data.recent_window!.start,
      endExclusive: data.recent_window!.end_exclusive,
      dateFrom: "2026-09-07",
      dateTo: "2026-10-04",
    });
    expect(matrixSelection(data, 5, "previous")).toMatchObject({
      dateFrom: "2026-08-10",
      dateTo: "2026-09-06",
      window: "previous",
    });
    expect(matrixSelection({ ...data, recent_window: null }, 5, "recent")).toBeNull();
  });
  it("exposes raw counts and the low-baseline caution in compact details", () => {
    render(<MatrixTopicDetails topic={data.topics[3]} />);
    expect(screen.getByText("100%", { exact: false })).toBeTruthy();
    expect(screen.getByText(/Previous count is below 10/)).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
  });
});

describe("Matrix interactions and shared query behavior", () => {
  it("loads, shows exact windows, highlights by keyboard focus, and emits topic/window payloads", async () => {
    const fetch = mockData();
    const onSelectWindow = vi.fn();
    render(<MomentumMatrix {...props} onSelectWindow={onSelectWindow} />, { wrapper: wrapper() });
    expect(screen.getByText("Loading momentum matrix…")).toBeTruthy();
    const button = await screen.findByRole("button", { name: /Agents \+50% Growing/ });
    expect(screen.getByText("2026-09-07 – 2026-10-04")).toBeTruthy();
    expect(screen.getByText("2026-08-10 – 2026-09-06")).toBeTruthy();
    fireEvent.focus(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Inspect previous window" }));
    expect(onSelectWindow).toHaveBeenLastCalledWith(matrixSelection(data, 5, "previous"));
    fireEvent.click(screen.getByRole("button", { name: "Inspect current window" }));
    expect(onSelectWindow).toHaveBeenLastCalledWith(matrixSelection(data, 5, "recent"));
    expect(fetch).toHaveBeenCalledTimes(1);
    const disclosure = screen.getByText("How to read the matrix").closest("details")!;
    expect(disclosure.open).toBe(false);
    fireEvent.click(disclosure.querySelector("summary")!);
    expect(within(disclosure).getByText("Coverage remains unknown.")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("renders actual scatter marks for signed and zero changes, excludes nulls, and distinguishes low baselines", async () => {
    mockData();
    const { container } = render(<MomentumMatrix {...props} />, { wrapper: wrapper() });
    await screen.findByText("Unavailable change");
    await waitFor(() => expect(container.querySelectorAll("[data-topic-id]")).toHaveLength(4));
    expect(container.querySelector('[data-topic-id="5"]')?.tagName.toLowerCase()).toBe("path");
    expect(container.querySelector('[data-topic-id="8"]')?.getAttribute("data-growth-state")).toBe(
      "declining",
    );
    expect(container.querySelector('[data-topic-id="9"]')?.tagName.toLowerCase()).toBe("circle");
    expect(container.querySelector('[data-topic-id="10"]')?.getAttribute("stroke-dasharray")).toBe(
      "3 2",
    );
    expect(container.querySelector('[data-topic-id="11"]')).toBeNull();
    const marker = container.querySelector('[data-topic-id="5"]')!;
    fireEvent.mouseEnter(marker);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Agents \+50% Growing/ }).getAttribute("aria-pressed"),
      ).toBe("true"),
    );
  });
  it("updates topic/date/window query parameters and offers every supported window", async () => {
    const fetch = mockData();
    const view = render(<MomentumMatrix {...props} />, { wrapper: wrapper() });
    await screen.findByText("Unavailable change");
    expect((screen.getByLabelText("Weeks per window") as HTMLSelectElement).value).toBe("4");
    expect(screen.getAllByRole("option")).toHaveLength(11);
    fireEvent.change(screen.getByLabelText("Weeks per window"), { target: { value: "2" } });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(String(fetch.mock.calls[1][0])).toContain("window_weeks=2");
    view.rerender(
      <MomentumMatrix
        {...props}
        topicIds={[8]}
        dates={{ date_from: "2026-08-01", date_to: "2026-11-01" }}
      />,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    const params = new URL(String(fetch.mock.calls[2][0]), "http://test").searchParams;
    expect(params.getAll("topic_id")).toEqual(["8"]);
    expect(params.get("date_from")).toBe("2026-08-01");
    expect(params.get("date_to")).toBe("2026-11-01");
  });
  it("keeps null-growth topics separate and labels low baselines", async () => {
    mockData();
    render(<MomentumMatrix {...props} />, { wrapper: wrapper() });
    expect(await screen.findByText(/New: 7 current \/ 0 previous/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /New Unavailable No baseline/ })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Small \+100% Growing · Low baseline/ }),
    ).toBeTruthy();
    expect(screen.getByText(/Hollow dashed markers/)).toBeTruthy();
  });
  it("shows an informative empty comparison for backend range containment errors", async () => {
    const fetch = vi.fn().mockResolvedValue(
      response(
        {
          detail:
            "The reporting interval must contain both complete comparison windows; choose an earlier date_from or fewer window_weeks.",
        },
        422,
      ),
    );
    vi.stubGlobal("fetch", fetch);
    render(<MomentumMatrix {...props} />, { wrapper: wrapper() });
    expect(await screen.findByText("More complete weeks needed")).toBeTruthy();
    expect(screen.getByLabelText("Weeks per window")).toBeTruthy();
    expect(screen.queryByText("Unavailable change")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([422, 500, 503])("handles HTTP %s without automatic retries", async (status) => {
    const fetch = vi.fn().mockResolvedValue(response({ detail: "Request failed" }, status));
    vi.stubGlobal("fetch", fetch);
    render(<MomentumMatrix {...props} />, { wrapper: wrapper() });
    const retry = await screen.findByRole("button", { name: "Retry momentum matrix" });
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });
  it.each([
    [{ ...data, topics: [] }, "No topics available"],
    [{ ...data, previous_window: null }, "Comparison windows unavailable"],
    [{ ...data, topics: [data.topics[4]] }, "Percentage comparison unavailable"],
  ] as const)("handles missing windows, topics and baselines", async (value, title) => {
    mockData(value as MomentumMatrixData);
    render(<MomentumMatrix {...props} />, { wrapper: wrapper() });
    expect(await screen.findByText(title)).toBeTruthy();
  });
  it("keeps zero/zero topics unavailable rather than marking them stable", async () => {
    mockData({
      ...data,
      topics: [{ ...data.topics[4], recent_paper_count: 0, absolute_change: 0 }],
    });
    render(<MomentumMatrix {...props} />, { wrapper: wrapper() });
    expect(await screen.findByText(/New: 0 current \/ 0 previous papers/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /New Unavailable No baseline/ })).toBeTruthy();
    expect(screen.getByText("Percentage comparison unavailable")).toBeTruthy();
  });
  it("allows manual recovery from network failures", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetch);
    render(<MomentumMatrix {...props} />, { wrapper: wrapper() });
    const retry = await screen.findByRole("button", { name: "Retry momentum matrix" });
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValue(response({ meta: { warnings: [] }, data }));
    fireEvent.click(retry);
    expect(await screen.findByText("Unavailable change")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not request invalid dates or unavailable topics", () => {
    const fetch = mockData();
    const view = render(<MomentumMatrix {...props} dates={{ error: "Invalid UTC range" }} />, {
      wrapper: wrapper(),
    });
    expect(screen.getByText("Choose a valid comparison range")).toBeTruthy();
    view.rerender(<MomentumMatrix {...props} topicsReady={false} />);
    expect(screen.getByText("Topics unavailable")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("cancels superseded requests and hides previous filter data while loading", async () => {
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
    const view = render(<MomentumMatrix {...props} />, { wrapper: wrapper() });
    await screen.findByText("Unavailable change");
    view.rerender(<MomentumMatrix {...props} topicIds={[8]} />);
    await waitFor(() => expect(signals).toHaveLength(2));
    expect(screen.queryByText("Unavailable change")).toBeNull();
    view.rerender(<MomentumMatrix {...props} topicIds={[9]} />);
    await waitFor(() => expect(signals).toHaveLength(3));
    expect(signals[1].aborted).toBe(true);
    view.unmount();
    expect(signals[2].aborted).toBe(true);
  });
});
