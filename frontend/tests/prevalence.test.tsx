import type { ReactElement } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { TopicPrevalenceChange } from "../src/components/intelligence/TopicPrevalenceChange";
import type {
  CompositionData,
  CompositionWeek,
  MomentumMatrixData,
} from "../src/types/intelligence";
import {
  formatPercentagePoints,
  formatPrevalenceTick,
  prevalenceAxisTicks,
  prevalenceChanges,
  prevalenceSelection,
} from "../src/utils/prevalenceData";
import { shiftUtcDay } from "../src/utils/intelligenceFilters";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  const { cloneElement } = await import("react");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children as ReactElement<{ width: number; height: number }>, {
        width: 720,
        height: 360,
      }),
  };
});
const matrix: MomentumMatrixData = {
  interval: { date_from: "2026-08-01", date_to: "2026-10-07" },
  window_weeks: 2,
  previous_window: { start: "2026-09-07T00:00:00Z", end_exclusive: "2026-09-21T00:00:00Z" },
  recent_window: { start: "2026-09-21T00:00:00Z", end_exclusive: "2026-10-05T00:00:00Z" },
  topics: [],
};
function week(start: string, total: number, counts: number[]): CompositionWeek {
  const end = shiftUtcDay(start, 7);
  return {
    week_start: start,
    week_end_exclusive: end,
    effective_start: `${start}T00:00:00Z`,
    effective_end_exclusive: `${end}T00:00:00Z`,
    is_partial_week: false,
    total_papers: total,
    topics: counts.map((count, index) => ({
      topic_id: index + 1,
      topic_papers: count,
      prevalence_pct: total ? (100 * count) / total : null,
    })),
  };
}
const data: CompositionData = {
  interval: { date_from: "2026-09-07", date_to: "2026-10-04" },
  topics: ["Growing", "Declining", "Unchanged"].map((topic_name, index) => ({
    topic_name,
    topic_id: index + 1,
  })),
  weeks: [
    week("2026-09-07", 10, [0, 10, 5]),
    week("2026-09-14", 90, [40, 80, 45]),
    week("2026-09-21", 50, [40, 10, 25]),
    week("2026-09-28", 50, [40, 10, 25]),
  ],
};
const props = {
  dates: { date_from: "2026-08-01", date_to: "2026-10-07" },
  topicIds: [] as number[],
  topicsReady: true,
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const envelope = (data: unknown) => ({
  meta: { warnings: ["Historical completeness is unknown."] },
  data,
});
function setup(matrixValue = matrix, compositionValue = data) {
  const fetch = vi.fn((url: string) =>
    Promise.resolve(
      response(envelope(url.includes("momentum-matrix") ? matrixValue : compositionValue)),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { fetch, client, Wrapper };
}

describe("Period-level prevalence", () => {
  it("formats signed axis ticks without floating-point noise at large and small scales", () => {
    expect(formatPrevalenceTick(-2.8905894272602635, 1)).toBe("−3 pp");
    expect(formatPrevalenceTick(1, 1)).toBe("+1 pp");
    expect(formatPrevalenceTick(-0, 1)).toBe("0");
    expect(formatPrevalenceTick(-0.30000000000000004, 0.1)).toBe("−0.3 pp");
    expect(formatPrevalenceTick(0.020000000000000004, 0.01)).toBe("+0.02 pp");
    expect(formatPrevalenceTick(0.00001, 0.00001)).toBe("+0.00001 pp");
    for (const extent of [2.8905894272602635, 0.29, 0.009, 40, 0, NaN]) {
      const ticks = prevalenceAxisTicks(extent);
      expect(ticks).toContain(0);
      expect(ticks[0]).toBe(-ticks[ticks.length - 1]);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(Number.isFinite(extent) ? extent : 0);
      expect(ticks.length).toBeLessThanOrEqual(7);
      expect(
        ticks.map((tick) => formatPrevalenceTick(tick, ticks[1] - ticks[0])).join(" "),
      ).not.toMatch(/\d{13}/);
    }
    expect(prevalenceChanges(data, matrix)[0].change).toBe(40);
  });

  it("sums disjoint topic/corpus counts before dividing, preserves overlap, and sorts signed changes", () => {
    const rows = prevalenceChanges(data, matrix);
    expect(rows.map((row) => [row.topicName, row.change])).toEqual([
      ["Growing", 40],
      ["Unchanged", 0],
      ["Declining", -70],
    ]);
    expect(rows[0].previous).toEqual({ topicPapers: 40, totalPapers: 100, prevalence: 40 });
    // Weekly average would be 22.22%, not the correct pooled 40%.
    expect(rows[0].previous.prevalence).not.toBe((0 + (100 * 40) / 90) / 2);
    expect(rows.reduce((sum, row) => sum + row.previous.prevalence!, 0)).toBe(180);
  });
  it("excludes observations outside returned complete windows, regardless of partial or current-week activity", () => {
    const outside = { ...week("2026-10-05", 1000, [1000, 0, 0]), is_partial_week: true };
    expect(prevalenceChanges({ ...data, weeks: [...data.weeks, outside] }, matrix)).toEqual(
      prevalenceChanges(data, matrix),
    );
    expect(prevalenceChanges(data, { ...matrix, recent_window: null })).toEqual([]);
    expect(prevalenceChanges(data, { ...matrix, window_weeks: 3 })).toEqual([]);
    expect(
      prevalenceChanges(data, {
        ...matrix,
        recent_window: { ...matrix.recent_window!, start: "2026-09-22T00:00:00Z" },
      }),
    ).toEqual([]);
  });
  it("does not fill missing/duplicate/partial weeks or absent topic observations with zero", () => {
    for (const weeks of [
      data.weeks.slice(1),
      [...data.weeks, data.weeks[0]],
      data.weeks.map((w, i) => (i ? w : { ...w, is_partial_week: true })),
      data.weeks.map((w, i) => (i ? w : { ...w, effective_start: "2026-09-08T00:00:00Z" })),
    ]) {
      expect(
        prevalenceChanges({ ...data, weeks }, matrix).every((row) => row.change === null),
      ).toBe(true);
    }
    const missing = {
      ...data,
      weeks: data.weeks.map((w, i) => (i ? w : { ...w, topics: w.topics.slice(1) })),
    };
    expect(prevalenceChanges(missing, matrix).find((row) => row.topicId === 1)?.change).toBeNull();
  });
  it("distinguishes empty corpus, zero topic activity, and zero weekly denominators within a valid pooled period", () => {
    const weeks = data.weeks.map((w) => week(w.week_start, 0, [0, 0, 0]));
    expect(prevalenceChanges({ ...data, weeks }, matrix)[0].previous).toEqual({
      topicPapers: 0,
      totalPapers: 0,
      prevalence: null,
    });
    expect(prevalenceChanges({ ...data, weeks }, matrix)[0].change).toBeNull();
    weeks[0] = week(weeks[0].week_start, 20, [0, 0, 0]);
    weeks[2] = week(weeks[2].week_start, 10, [0, 0, 0]);
    expect(prevalenceChanges({ ...data, weeks }, matrix).every((row) => row.change === 0)).toBe(
      true,
    );
    expect(formatPercentagePoints(null)).toBe("Unavailable");
    expect(formatPercentagePoints(0)).toBe("0 pp");
    expect(formatPercentagePoints(0.000001)).toBe("+<0.01 pp");
    expect(formatPercentagePoints(-2)).toBe("-2 pp");
  });
  it("uses existing matrix-window evidence semantics and inclusive UTC dates", () => {
    expect(prevalenceSelection(matrix, 1, "recent")).toEqual({
      kind: "prevalence-change",
      metric: "prevalence_pct",
      topicId: 1,
      window: "recent",
      windowWeeks: 2,
      start: matrix.recent_window!.start,
      endExclusive: matrix.recent_window!.end_exclusive,
      dateFrom: "2026-09-21",
      dateTo: "2026-10-04",
    });
    expect(prevalenceSelection({ ...matrix, previous_window: null }, 1, "previous")).toBeNull();
  });
});

describe("Prevalence comparison interaction", () => {
  it("renders signed bars, supports keyboard inspection and emits typed window payloads", async () => {
    const { Wrapper } = setup();
    const onSelectWindow = vi.fn();
    const view = render(<TopicPrevalenceChange {...props} onSelectWindow={onSelectWindow} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByText("Loading topic prevalence comparison…")).toBeTruthy();
    const button = await screen.findByRole("button", { name: "Growing +40 pp" });
    expect(button.tabIndex).toBe(0);
    act(() => button.focus());
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("40 topic / 100 corpus papers")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Inspect current window" }));
    expect(onSelectWindow).toHaveBeenCalledWith(prevalenceSelection(matrix, 1, "recent"));
    fireEvent.click(screen.getByRole("button", { name: "Inspect previous window" }));
    expect(onSelectWindow).toHaveBeenLastCalledWith(prevalenceSelection(matrix, 1, "previous"));
    expect(screen.getByRole("button", { name: "Declining -70 pp" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unchanged 0 pp" })).toBeTruthy();
    await waitFor(() =>
      expect(view.container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(2),
    );
    expect(
      view.container.querySelectorAll('[fill="var(--color-prevalence-negative)"]').length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("How to read prevalence change").closest("details")!.open).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Clear prevalence selection" }));
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(view.container.querySelectorAll(".recharts-bar-rectangle")[1]);
    expect(
      screen.getByRole("button", { name: "Declining -70 pp" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });
  it("uses global filters to resolve windows, requests only their full-week union and supports 2–12 weeks", async () => {
    const { Wrapper, fetch } = setup();
    const view = render(<TopicPrevalenceChange {...props} topicIds={[3, 1]} />, {
      wrapper: Wrapper,
    });
    await screen.findByRole("button", { name: "Growing +40 pp" });
    const params = fetch.mock.calls.map(([url]) => new URL(url, "http://test").searchParams);
    expect(params[0].get("date_from")).toBe(props.dates.date_from);
    expect(params[0].get("window_weeks")).toBe("4");
    expect(params[0].getAll("topic_id")).toEqual(["1", "3"]);
    expect(params[1].get("date_from")).toBe("2026-09-07");
    expect(params[1].get("date_to")).toBe("2026-10-04");
    expect(params[1].get("include_partial_weeks")).toBe("false");
    const selector = screen.getByLabelText("Prevalence weeks per window");
    expect(within(selector).getAllByRole("option")).toHaveLength(11);
    fireEvent.change(selector, { target: { value: "2" } });
    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => url.includes("window_weeks=2"))).toBe(true),
    );
    view.rerender(
      <TopicPrevalenceChange
        {...props}
        topicIds={[2]}
        dates={{ date_from: "2026-08-02", date_to: "2026-10-07" }}
      />,
    );
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([url]) => url.includes("date_from=2026-08-02") && url.includes("topic_id=2"),
        ),
      ).toBe(true),
    );
  });
  it("keeps unavailable values off the numeric axis and explains their denominators", async () => {
    const empty = { ...data, weeks: data.weeks.map((w) => week(w.week_start, 0, [0, 0, 0])) };
    const { Wrapper } = setup(matrix, empty);
    render(<TopicPrevalenceChange {...props} />, { wrapper: Wrapper });
    expect(await screen.findByText("Prevalence values unavailable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Growing Unavailable" }));
    expect(screen.getAllByText("0 topic / 0 corpus papers")).toHaveLength(2);
    expect(screen.queryByText("0%")).toBeNull();
  });
  it("reports short windows and empty results without fetching invalid comparisons", async () => {
    const { Wrapper, fetch } = setup({ ...matrix, previous_window: null, recent_window: null });
    render(<TopicPrevalenceChange {...props} />, { wrapper: Wrapper });
    expect(await screen.findByText("Prevalence comparison unavailable")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("shows request errors with explicit retries, and recognizes range containment errors", async () => {
    const { Wrapper, fetch } = setup();
    fetch.mockImplementation(() =>
      Promise.resolve(
        response(
          { detail: "The reporting interval must contain both complete comparison windows" },
          422,
        ),
      ),
    );
    render(<TopicPrevalenceChange {...props} />, { wrapper: Wrapper });
    expect(await screen.findByText("More complete weeks needed")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockImplementation(() => Promise.resolve(response({ detail: "Busy" }, 503)));
    fireEvent.change(screen.getByLabelText("Prevalence weeks per window"), {
      target: { value: "3" },
    });
    expect(await screen.findByRole("button", { name: "Retry prevalence comparison" })).toBeTruthy();
    fetch.mockImplementation((url) =>
      Promise.resolve(response(envelope(url.includes("momentum-matrix") ? matrix : data))),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry prevalence comparison" }));
    expect(await screen.findByRole("button", { name: "Growing +40 pp" })).toBeTruthy();
  });
  it("retries a failed denominator request without reissuing the successful window request", async () => {
    const { Wrapper, fetch } = setup();
    fetch.mockImplementation((url) =>
      Promise.resolve(
        url.includes("momentum-matrix")
          ? response(envelope(matrix))
          : response({ detail: "Busy" }, 503),
      ),
    );
    render(<TopicPrevalenceChange {...props} />, { wrapper: Wrapper });
    const retry = await screen.findByRole("button", { name: "Retry prevalence comparison" });
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockImplementation(() => Promise.resolve(response(envelope(data))));
    fireEvent.click(retry);
    expect(await screen.findByRole("button", { name: "Growing +40 pp" })).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls.filter(([url]) => url.includes("momentum-matrix"))).toHaveLength(1);
  });
  it("keeps current values during background refresh and cancels superseded comparison requests", async () => {
    const { Wrapper, fetch, client } = setup();
    const view = render(<TopicPrevalenceChange {...props} />, { wrapper: Wrapper });
    await screen.findByRole("button", { name: "Growing +40 pp" });
    const signals: AbortSignal[] = [];
    let complete: (value: Response) => void = () => {};
    fetch.mockImplementation((_url, ...args: unknown[]) => {
      const { signal } = args[0] as { signal: AbortSignal };
      signals.push(signal);
      return new Promise<Response>((resolve, reject) => {
        complete = resolve;
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });
    await act(async () => {
      void client.invalidateQueries({ queryKey: ["intelligence", "composition"] });
    });
    expect(await screen.findByText("Updating prevalence comparison…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Growing +40 pp" })).toBeTruthy();
    await act(async () => {
      complete(response(envelope(data)));
    });
    await waitFor(() => expect(screen.queryByText("Updating prevalence comparison…")).toBeNull());
    view.rerender(<TopicPrevalenceChange {...props} topicIds={[1]} />);
    await waitFor(() => expect(signals).toHaveLength(2));
    expect(screen.queryByRole("button", { name: "Growing +40 pp" })).toBeNull();
    view.rerender(<TopicPrevalenceChange {...props} topicIds={[2]} />);
    await waitFor(() => expect(signals).toHaveLength(3));
    expect(signals[1].aborted).toBe(true);
    view.unmount();
    expect(signals[2].aborted).toBe(true);
  });
  it("does not fetch invalid filters and lazily preserves the weekly chart", async () => {
    const { Wrapper, fetch } = setup();
    const view = render(
      <TopicPrevalenceChange {...props} dates={{ error: "Invalid date range" }} />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText("Choose a valid prevalence comparison")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    view.rerender(<TopicPrevalenceChange {...props} />);
    await screen.findByRole("button", { name: "Growing +40 pp" });
    expect(screen.queryByLabelText("Include partial boundary weeks")).toBeNull();
    const disclosure = screen.getByText("View weekly prevalence trends").closest("details")!;
    expect(disclosure.open).toBe(false);
    fireEvent.click(disclosure.querySelector("summary")!);
    expect(await screen.findByLabelText("Include partial boundary weeks")).toBeTruthy();
    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => url.includes("include_partial_weeks=true"))).toBe(
        true,
      ),
    );
  });
});
