import type { ReactElement } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  ResearchComposition,
  CompositionTooltip,
} from "../src/components/intelligence/ResearchComposition";
import type { CompositionData, CompositionWeek } from "../src/types/intelligence";
import {
  compositionDates,
  compositionRows,
  compositionSelection,
  formatPrevalence,
} from "../src/utils/compositionData";
import { topicColor } from "../src/utils/topicColors";

// Render real Recharts in a fixed viewport because jsdom does not measure layout.
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
const partialWeek: CompositionWeek = {
  week_start: "2026-06-29",
  week_end_exclusive: "2026-07-06",
  effective_start: "2026-07-01T00:00:00Z",
  effective_end_exclusive: "2026-07-06T00:00:00Z",
  is_partial_week: true,
  total_papers: 10,
  topics: [
    { topic_id: 5, topic_papers: 8, prevalence_pct: 80 },
    { topic_id: 8, topic_papers: 7, prevalence_pct: 70 },
  ],
};
const emptyWeek: CompositionWeek = {
  week_start: "2026-07-06",
  week_end_exclusive: "2026-07-13",
  effective_start: "2026-07-06T00:00:00Z",
  effective_end_exclusive: "2026-07-13T00:00:00Z",
  is_partial_week: false,
  total_papers: 0,
  topics: [
    { topic_id: 5, topic_papers: 0, prevalence_pct: null },
    { topic_id: 8, topic_papers: 0, prevalence_pct: null },
  ],
};
const fullWeek: CompositionWeek = {
  week_start: "2026-07-13",
  week_end_exclusive: "2026-07-20",
  effective_start: "2026-07-13T00:00:00Z",
  effective_end_exclusive: "2026-07-20T00:00:00Z",
  is_partial_week: false,
  total_papers: 20,
  topics: [
    { topic_id: 5, topic_papers: 1, prevalence_pct: 5 },
    { topic_id: 8, topic_papers: 0, prevalence_pct: 0 },
  ],
};
const data: CompositionData = {
  interval: { date_from: "2026-07-01", date_to: "2026-07-19" },
  topics: [
    { topic_id: 5, topic_name: "Agents" },
    { topic_id: 8, topic_name: "Vision" },
  ],
  weeks: [fullWeek, partialWeek, emptyWeek],
};
const props = {
  dates: { date_from: "2026-07-01", date_to: "2026-07-19" },
  topicIds: [5, 8],
  topicsReady: true,
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
function mockData(value = data) {
  const fetch = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(
        response({ meta: { warnings: ["Historical completeness remains unknown."] }, data: value }),
      ),
    );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}
async function openValues() {
  fireEvent.click(await screen.findByText("Weekly composition values and point selection"));
}

describe("Composition mapping and evidence dates", () => {
  it("preserves overlapping backend percentages without normalizing or recomputing denominators", () => {
    const rows = compositionRows(data);
    expect(rows[0].values).toEqual({ 5: 80, 8: 70 });
    expect(rows[0].week.total_papers).toBe(10);
    expect(rows[0].observations[5]?.topic_papers).toBe(8);
    const returned = {
      ...data,
      weeks: [
        { ...partialWeek, topics: [{ topic_id: 5, topic_papers: 8, prevalence_pct: 79.999999 }] },
      ],
    };
    expect(compositionRows(returned)[0].values[5]).toBe(79.999999);
  });
  it("preserves zero, null, missing observations, chronological order and original UTC metadata", () => {
    const rows = compositionRows(data);
    expect(rows.map((r) => r.week_start)).toEqual(["2026-06-29", "2026-07-06", "2026-07-13"]);
    expect(data.weeks[0]).toBe(fullWeek);
    expect(rows[0].week).toBe(partialWeek);
    expect(rows[1].values[5]).toBeNull();
    expect(rows[2].values[8]).toBe(0);
    const missing = compositionRows({
      ...data,
      weeks: [{ ...partialWeek, topics: [partialWeek.topics[0]] }],
    });
    expect(missing[0].values[8]).toBeUndefined();
    expect(compositionRows({ ...data, weeks: [] })).toEqual([]);
    expect(formatPrevalence(0)).toBe("0%");
    expect(formatPrevalence(null)).toBe("Unavailable");
    expect(formatPrevalence(undefined)).toBe("Unavailable");
    expect(formatPrevalence(33.333333)).toBe("33.333333%");
  });
  it("uses clipped half-open UTC intervals for inclusive evidence filters", () => {
    expect(compositionDates(partialWeek)).toEqual({ dateFrom: "2026-07-01", dateTo: "2026-07-05" });
    expect(compositionSelection(5, partialWeek, true)).toEqual({
      kind: "composition",
      topicIds: [5],
      weekStart: "2026-06-29",
      effectiveStart: partialWeek.effective_start,
      effectiveEndExclusive: partialWeek.effective_end_exclusive,
      dateFrom: "2026-07-01",
      dateTo: "2026-07-05",
      metric: "prevalence_pct",
      isPartialWeek: true,
      includePartialWeeks: true,
    });
    expect(compositionSelection(5, fullWeek, false)).toMatchObject({
      dateFrom: "2026-07-13",
      dateTo: "2026-07-19",
      includePartialWeeks: false,
    });
    expect(compositionSelection(999, fullWeek, true)).toBeNull();
  });
  it("shows one corpus denominator, returned counts/percentages, and partial-week status in tooltips", () => {
    render(<CompositionTooltip row={compositionRows(data)[0]} topics={data.topics} />);
    expect(screen.getAllByText("Corpus denominator: 10 indexed papers")).toHaveLength(1);
    expect(screen.getByText("80%")).toBeTruthy();
    expect(screen.getByText("70%")).toBeTruthy();
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("1 Jul 26 – 5 Jul 26 · UTC")).toBeTruthy();
    expect(screen.getByText(/Partial week/)).toBeTruthy();
  });
});

describe("Composition chart and interaction", () => {
  it("renders independent colored lines with null gaps and a percentage axis", async () => {
    mockData();
    const { container } = render(<ResearchComposition {...props} />, { wrapper: setup().Wrapper });
    expect(screen.getByText("Loading research composition…")).toBeTruthy();
    await screen.findByText("Weekly composition values and point selection");
    await waitFor(() => expect(container.querySelectorAll(".recharts-line-curve")).toHaveLength(2));
    const lines = container.querySelectorAll(".recharts-line-curve");
    expect(lines[0].getAttribute("stroke")).toBe(topicColor(5));
    expect(lines[1].getAttribute("stroke")).toBe(topicColor(8));
    expect(lines[0].getAttribute("d")?.match(/M/g)).toHaveLength(2);
    expect(container.querySelector(".recharts-area")).toBeNull();
    expect(screen.getByText("100%")).toBeTruthy();
    const legend = screen.getByRole("list", { name: "Composition topic legend" });
    expect(within(legend).getByText("Agents")).toBeTruthy();
    expect(within(legend).getByText("Vision")).toBeTruthy();
  });
  it("inspects observations using keyboard-focusable buttons and prepares evidence payloads", async () => {
    const fetch = mockData();
    const onSelectPoint = vi.fn();
    render(<ResearchComposition {...props} onSelectPoint={onSelectPoint} />, {
      wrapper: setup().Wrapper,
    });
    await openValues();
    const button = screen.getByRole("button", {
      name: "Inspect Agents, 2026-06-29",
    }) as HTMLButtonElement;
    expect(button.tabIndex).toBe(0);
    act(() => button.focus());
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(onSelectPoint).toHaveBeenCalledWith(compositionSelection(5, partialWeek, true));
    expect(screen.getByRole("button", { name: "Clear composition selection" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear composition selection" }));
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("also supports point inspection directly from chart dots", async () => {
    mockData();
    const onSelectPoint = vi.fn();
    const { container } = render(<ResearchComposition {...props} onSelectPoint={onSelectPoint} />, {
      wrapper: setup().Wrapper,
    });
    await screen.findByText("Weekly composition values and point selection");
    await waitFor(() =>
      expect(container.querySelectorAll("circle.composition-point").length).toBeGreaterThan(0),
    );
    fireEvent.click(container.querySelector("circle.composition-point")!);
    expect(onSelectPoint).toHaveBeenCalledWith(compositionSelection(5, partialWeek, true));
  });
  it("requests partial-week exclusion from the backend and retains complete-week denominators", async () => {
    const fetch = mockData();
    render(<ResearchComposition {...props} />, { wrapper: setup().Wrapper });
    await openValues();
    expect(screen.getByRole("button", { name: "Inspect Agents, 2026-06-29" })).toBeTruthy();
    fetch.mockResolvedValue(
      response({ meta: { warnings: [] }, data: { ...data, weeks: [emptyWeek, fullWeek] } }),
    );
    fireEvent.click(screen.getByLabelText("Include partial boundary weeks"));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(String(fetch.mock.calls[1][0])).toContain("include_partial_weeks=false");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Inspect Agents, 2026-06-29" })).toBeNull(),
    );
    await openValues();
    const row = screen.getByRole("button", { name: "Inspect Vision, 2026-07-13" }).closest("tr")!;
    expect(within(row).getByText("0%")).toBeTruthy();
    expect(within(row).getByText("20")).toBeTruthy();
  });
  it("uses shared date/topic filters without changing the returned corpus denominator or topic color", async () => {
    const fetch = mockData();
    const view = render(<ResearchComposition {...props} />, { wrapper: setup().Wrapper });
    await screen.findByText("Weekly composition values and point selection");
    fetch.mockResolvedValue(
      response({
        meta: { warnings: [] },
        data: {
          ...data,
          topics: [data.topics[0]],
          weeks: [{ ...partialWeek, topics: [partialWeek.topics[0]] }],
        },
      }),
    );
    view.rerender(
      <ResearchComposition
        {...props}
        topicIds={[5]}
        dates={{ date_from: "2026-07-01", date_to: "2026-07-05" }}
      />,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const params = new URL(String(fetch.mock.calls[1][0]), "http://test").searchParams;
    expect(params.getAll("topic_id")).toEqual(["5"]);
    expect(params.get("date_from")).toBe("2026-07-01");
    expect(params.get("date_to")).toBe("2026-07-05");
    await openValues();
    expect(screen.getByText("80%")).toBeTruthy();
    expect(screen.getByText("10")).toBeTruthy();
    expect(
      within(screen.getByRole("list", { name: "Composition topic legend" })).queryByText("Vision"),
    ).toBeNull();
    await waitFor(() =>
      expect(view.container.querySelector("circle.composition-point")?.getAttribute("fill")).toBe(
        topicColor(5),
      ),
    );
  });
  it("keeps null prevalence unavailable when the corpus denominator is zero", async () => {
    mockData({ ...data, weeks: [emptyWeek] });
    render(<ResearchComposition {...props} />, { wrapper: setup().Wrapper });
    expect(await screen.findByText(/No indexed corpus papers in these weeks/)).toBeTruthy();
    await openValues();
    const row = screen.getByRole("button", { name: "Inspect Agents, 2026-07-06" }).closest("tr")!;
    expect(within(row).getByText("Unavailable")).toBeTruthy();
    expect(within(row).queryByText("0%")).toBeNull();
  });
  it("disables selection for missing observations without inventing a zero", async () => {
    mockData({ ...data, weeks: [{ ...partialWeek, topics: [partialWeek.topics[0]] }] });
    const onSelectPoint = vi.fn();
    render(<ResearchComposition {...props} onSelectPoint={onSelectPoint} />, {
      wrapper: setup().Wrapper,
    });
    await openValues();
    const button = screen.getByRole("button", {
      name: "Inspect Vision, 2026-06-29",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(within(button.closest("tr")!).getAllByText("Unavailable")).toHaveLength(2);
    expect(onSelectPoint).not.toHaveBeenCalled();
  });
  it.each<[CompositionData, string]>([
    [{ ...data, topics: [] }, "No topics available"],
    [{ ...data, weeks: [] }, "No weekly composition observations"],
  ])("handles empty topics and weeks", async (value, title) => {
    mockData(value);
    render(<ResearchComposition {...props} />, { wrapper: setup().Wrapper });
    expect(await screen.findByText(title)).toBeTruthy();
  });
  it("explains an empty result after partial weeks are excluded", async () => {
    const fetch = mockData();
    render(<ResearchComposition {...props} />, { wrapper: setup().Wrapper });
    await screen.findByText("Weekly composition values and point selection");
    fetch.mockResolvedValue(response({ meta: { warnings: [] }, data: { ...data, weeks: [] } }));
    fireEvent.click(screen.getByLabelText("Include partial boundary weeks"));
    expect(await screen.findByText(/No complete weeks were returned/)).toBeTruthy();
  });
  it.each([422, 500, 503])("handles HTTP %s without automatic retries", async (status) => {
    const fetch = vi.fn().mockResolvedValue(response({ detail: "Request failed" }, status));
    vi.stubGlobal("fetch", fetch);
    render(<ResearchComposition {...props} />, { wrapper: setup().Wrapper });
    const retry = await screen.findByRole("button", { name: "Retry composition" });
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValue(response({ meta: { warnings: [] }, data }));
    fireEvent.click(retry);
    expect(await screen.findByText("Weekly composition values and point selection")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not fetch invalid, excessive or unavailable filters and reports network failures", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetch);
    const view = render(
      <ResearchComposition {...props} dates={{ date_from: "2020-01-01", date_to: "2026-07-01" }} />,
      { wrapper: setup().Wrapper },
    );
    expect(screen.getByText("Choose a valid composition range")).toBeTruthy();
    view.rerender(<ResearchComposition {...props} topicsReady={false} />);
    expect(screen.getByText("Topics unavailable")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    view.rerender(<ResearchComposition {...props} />);
    expect(await screen.findByRole("button", { name: "Retry composition" })).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("preserves same-filter data during background refresh and keeps warnings in a disclosure", async () => {
    const fetch = mockData();
    const { client, Wrapper } = setup();
    render(<ResearchComposition {...props} />, { wrapper: Wrapper });
    await screen.findByText("Weekly composition values and point selection");
    const disclosure = screen.getByText("How to read research composition").closest("details")!;
    expect(disclosure.open).toBe(false);
    fireEvent.click(disclosure.querySelector("summary")!);
    expect(within(disclosure).getByText("Historical completeness remains unknown.")).toBeTruthy();
    let resolve: (value: Response) => void = () => {};
    fetch.mockImplementation(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    await act(async () => {
      void client.invalidateQueries({ queryKey: ["intelligence", "composition"] });
    });
    expect(await screen.findByText("Updating research composition…")).toBeTruthy();
    expect(screen.getByText("Weekly composition values and point selection")).toBeTruthy();
    await act(async () => {
      resolve(response({ meta: { warnings: [] }, data }));
    });
    await waitFor(() => expect(screen.queryByText("Updating research composition…")).toBeNull());
  });
  it("cancels superseded requests and never shows observations for new filters prematurely", async () => {
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
    const view = render(<ResearchComposition {...props} />, { wrapper: setup().Wrapper });
    await screen.findByText("Weekly composition values and point selection");
    view.rerender(<ResearchComposition {...props} topicIds={[5]} />);
    await waitFor(() => expect(signals).toHaveLength(2));
    expect(screen.queryByText("Weekly composition values and point selection")).toBeNull();
    view.rerender(<ResearchComposition {...props} topicIds={[8]} />);
    await waitFor(() => expect(signals).toHaveLength(3));
    expect(signals[1].aborted).toBe(true);
    view.unmount();
    expect(signals[2].aborted).toBe(true);
  });
});
