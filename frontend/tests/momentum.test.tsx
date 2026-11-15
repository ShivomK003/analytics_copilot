import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ResearchMomentum, MomentumTooltip } from "../src/components/intelligence/ResearchMomentum";
import { momentumRows, momentumSelection } from "../src/utils/momentumData";
import { topicColor, TOPIC_COLORS } from "../src/utils/topicColors";
import type { MomentumData, MomentumPoint } from "../src/types/intelligence";

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

const point: MomentumPoint = {
  week_start: "2026-06-29",
  week_end_exclusive: "2026-07-06",
  effective_start: "2026-07-01T00:00:00Z",
  effective_end_exclusive: "2026-07-06T00:00:00Z",
  paper_count: 0,
  index_value: null,
  is_partial_week: true,
};
const data: MomentumData = {
  mode: "count",
  interval: { date_from: "2026-07-01", date_to: "2026-07-12" },
  topics: [
    {
      topic_id: 5,
      topic_name: "Dynamic topic",
      baseline_count: 4,
      baseline_week_start: "2026-07-06",
      points: [{ ...point, week_start: "2026-07-06", paper_count: 4, index_value: 100 }, point],
    },
    {
      topic_id: 9,
      topic_name: "Another topic",
      baseline_count: null,
      baseline_week_start: null,
      points: [point],
    },
  ],
};
const meta = { warnings: [] };
const props = {
  dates: { date_from: "2026-07-01", date_to: "2026-07-12" },
  topicIds: [5],
  topicsReady: true,
};
function setup() {
  const client = new QueryClient();
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
describe("momentum observations", () => {
  it("aligns topics chronologically, preserves zero counts and missing observations", () => {
    const rows = momentumRows(data);
    expect(rows.map((r) => r.week_start)).toEqual(["2026-06-29", "2026-07-06"]);
    expect(rows[0].values).toEqual({ 5: 0, 9: 0 });
    expect(rows[1].values[9]).toBeUndefined();
    expect(rows[0].points[5]).toEqual(point);
  });
  it("uses returned indices without recalculation or null coercion", () => {
    expect(momentumRows({ ...data, mode: "index" })[0].values[5]).toBeNull();
    expect(momentumRows({ ...data, mode: "index" })[1].values[5]).toBe(100);
    expect(momentumRows({ ...data, topics: [] })).toEqual([]);
  });
  it("converts exclusive UTC boundaries into inclusive evidence dates", () => {
    expect(momentumSelection(5, point, "index")).toEqual({
      topicId: 5,
      weekStart: "2026-06-29",
      effectiveStart: point.effective_start,
      effectiveEndExclusive: point.effective_end_exclusive,
      mode: "index",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-05",
    });
  });
  it("assigns stable colors with predictable palette wraparound", () => {
    expect(topicColor(5)).toBe(TOPIC_COLORS[4]);
    expect(topicColor(5 + TOPIC_COLORS.length)).toBe(topicColor(5));
    expect([9, 5].map(topicColor)).toEqual([topicColor(9), topicColor(5)]);
  });
  it("shows the included interval once and sorts actual counts with zero last", () => {
    const counts = momentumRows({
      ...data,
      topics: data.topics.map((topic) => ({
        ...topic,
        points: [{ ...point, paper_count: topic.topic_id === 5 ? 0 : 12 }],
      })),
    });
    render(<MomentumTooltip row={counts[0]} data={data} />);
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("Another topic")).toBeTruthy();
    expect(within(rows[1]).getByText("12")).toBeTruthy();
    expect(within(rows[2]).getByText("0")).toBeTruthy();
    expect(screen.getAllByText(/1 Jul 26 – 5 Jul 26/)).toHaveLength(1);
    expect(screen.queryByText(/Calendar week:/)).toBeNull();
  });
  it("explains nulls and partial calendar versus included dates", () => {
    const indexed = { ...data, mode: "index" as const };
    render(<MomentumTooltip row={momentumRows(indexed)[0]} data={indexed} />);
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.getAllByText(/Partial week/)).toHaveLength(1);
    expect(screen.getByText(/1 Jul 26 – 5 Jul 26 · UTC/)).toBeTruthy();
  });
});
describe("momentum integration", () => {
  it("loads, selects points, changes mode, topics and dates with complete query parameters", async () => {
    const fetch = vi.fn((url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            meta,
            data: { ...data, mode: new URL(url, "http://test").searchParams.get("mode") },
          }),
          { headers: { "content-type": "application/json" } },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const onSelectPoint = vi.fn();
    const view = render(<ResearchMomentum {...props} onSelectPoint={onSelectPoint} />, {
      wrapper: setup(),
    });
    expect(screen.getByText("Loading research momentum…")).toBeTruthy();
    await screen.findByText("Weekly values and point selection");
    const emphasis = screen.getByRole("button", { name: "Emphasize Dynamic topic" });
    fireEvent.click(emphasis);
    expect(emphasis.getAttribute("aria-pressed")).toBe("true");
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(emphasis);
    expect(emphasis.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Select Dynamic topic, 2026-06-29" }));
    expect(onSelectPoint).toHaveBeenCalledWith(momentumSelection(5, point, "count"));
    fireEvent.click(screen.getByLabelText("Momentum Index"));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(String(fetch.mock.calls[1][0])).toContain("mode=index");
    view.rerender(<ResearchMomentum {...props} topicIds={[9]} onSelectPoint={onSelectPoint} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(String(fetch.mock.calls[2][0])).toContain("topic_id=9");
    view.rerender(
      <ResearchMomentum
        {...props}
        topicIds={[9]}
        dates={{ date_from: "2026-08-01", date_to: "2026-08-10" }}
      />,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    expect(String(fetch.mock.calls[3][0])).toContain("date_from=2026-08-01");
  });
  it("emits exact topic/week evidence from rendered chart observations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ meta, data }), {
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const onSelectPoint = vi.fn();
    const { container } = render(<ResearchMomentum {...props} onSelectPoint={onSelectPoint} />, {
      wrapper: setup(),
    });
    await waitFor(() => expect(container.querySelector(".momentum-observation-dot")).toBeTruthy());
    fireEvent.click(container.querySelector(".momentum-observation-dot")!);
    expect(onSelectPoint).toHaveBeenCalledWith(momentumSelection(5, point, "count"));
  });
  it("shows request errors with retry and no automatic retry", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetch);
    render(<ResearchMomentum {...props} />, { wrapper: setup() });
    fireEvent.click(await screen.findByRole("button", { name: "Retry momentum" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });
  it("does not fetch invalid dates or unavailable topics", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const view = render(<ResearchMomentum {...props} dates={{ error: "Invalid range" }} />, {
      wrapper: setup(),
    });
    expect(screen.getByText("Choose a valid date range")).toBeTruthy();
    view.rerender(<ResearchMomentum {...props} topicsReady={false} />);
    expect(screen.getByText("Topics unavailable")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("cancels superseded requests without showing stale observations", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, options: { signal: AbortSignal }) => {
        signals.push(options.signal);
        if (signals.length === 1)
          return Promise.resolve(
            new Response(JSON.stringify({ meta, data }), {
              headers: { "content-type": "application/json" },
            }),
          );
        return new Promise<Response>((_resolve, reject) =>
          options.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        );
      }),
    );
    const view = render(<ResearchMomentum {...props} />, { wrapper: setup() });
    await screen.findByText("Weekly values");
    view.rerender(<ResearchMomentum {...props} topicIds={[9]} />);
    await waitFor(() => expect(signals).toHaveLength(2));
    expect(screen.queryByText("Weekly values")).toBeNull();
    expect(screen.getByText("Loading research momentum…")).toBeTruthy();
    view.rerender(<ResearchMomentum {...props} topicIds={[10]} />);
    await waitFor(() => expect(signals).toHaveLength(3));
    expect(signals[1].aborted).toBe(true);
    view.unmount();
    expect(signals[2].aborted).toBe(true);
  });
  it("blocks ranges exceeding 104 intersecting weeks", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(
      <ResearchMomentum {...props} dates={{ date_from: "2020-01-01", date_to: "2026-01-01" }} />,
      { wrapper: setup() },
    );
    expect(screen.getByText(/Choose a range intersecting no more than 104/)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("handles empty weekly datasets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            meta,
            data: { ...data, topics: data.topics.map((t) => ({ ...t, points: [] })) },
          }),
          { headers: { "content-type": "application/json" } },
        ),
      ),
    );
    render(<ResearchMomentum {...props} />, { wrapper: setup() });
    expect(await screen.findByText("No weekly observations")).toBeTruthy();
  });
});
