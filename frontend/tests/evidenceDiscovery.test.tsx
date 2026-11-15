import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { IntelligencePage } from "../src/pages/IntelligencePage";
import { PapersPage } from "../src/pages/PapersPage";
import { EvidenceResults } from "../src/components/papers/EvidenceResults";
import { evidenceExplorerUrl } from "../src/utils/evidenceContext";
import type { EvidenceContext } from "../src/utils/evidenceContext";
import type { MomentumSelection } from "../src/utils/momentumData";
import type { MatrixSelection } from "../src/utils/matrixData";
import type { PrevalenceSelection } from "../src/utils/prevalenceData";
import type { CompositionSelection } from "../src/utils/compositionData";
import type { RelationshipSelection } from "../src/utils/relationshipsData";
import type { HeatmapSelection } from "../src/utils/heatmapData";

// Existing chart suites verify emission; this suite verifies every page-level callback is connected.
const selections = vi.hoisted(() => ({
  momentum: {
    topicId: 1,
    weekStart: "2026-09-28",
    effectiveStart: "2026-09-30T00:00:00Z",
    effectiveEndExclusive: "2026-10-05T00:00:00Z",
    dateFrom: "2026-09-30",
    dateTo: "2026-10-04",
    mode: "index" as const,
  },
  matrix: {
    topicId: 1,
    window: "recent" as const,
    windowWeeks: 2,
    start: "2026-09-21T00:00:00Z",
    endExclusive: "2026-10-05T00:00:00Z",
    dateFrom: "2026-09-21",
    dateTo: "2026-10-04",
  },
  previous: {
    topicId: 1,
    window: "previous" as const,
    windowWeeks: 2,
    start: "2026-09-07T00:00:00Z",
    endExclusive: "2026-09-21T00:00:00Z",
    dateFrom: "2026-09-07",
    dateTo: "2026-09-20",
  },
  relationship: {
    kind: "relationship" as const,
    topicIds: [1, 2] as [number, number],
    dateFrom: "2026-09-01",
    dateTo: "2026-10-04",
  },
  heatmap: {
    kind: "topic-category" as const,
    topicIds: [1] as [number],
    category: "cs.CV",
    categoryId: 3,
    categoryScope: "primary" as const,
    dateFrom: "2026-09-01",
    dateTo: "2026-10-04",
    metric: "category_prevalence_pct" as const,
  },
}));
vi.mock("../src/components/intelligence/ResearchMomentum", () => ({
  ResearchMomentum: ({
    onSelectPoint,
  }: {
    onSelectPoint: (selection: MomentumSelection) => void;
  }) => <button onClick={() => onSelectPoint(selections.momentum)}>Inspect momentum</button>,
}));
vi.mock("../src/components/intelligence/MomentumMatrix", () => ({
  MomentumMatrix: ({
    onSelectWindow,
  }: {
    onSelectWindow: (selection: MatrixSelection) => void;
  }) => (
    <>
      <button onClick={() => onSelectWindow(selections.matrix)}>Inspect matrix current</button>
      <button onClick={() => onSelectWindow(selections.previous)}>Inspect matrix previous</button>
    </>
  ),
}));
vi.mock("../src/components/intelligence/TopicPrevalenceChange", () => ({
  TopicPrevalenceChange: ({
    onSelectWindow,
    onSelectPoint,
  }: {
    onSelectWindow: (selection: PrevalenceSelection) => void;
    onSelectPoint: (selection: CompositionSelection) => void;
  }) => (
    <>
      <button
        onClick={() =>
          onSelectWindow({
            ...selections.previous,
            kind: "prevalence-change",
            metric: "prevalence_pct",
          })
        }
      >
        Inspect prevalence previous
      </button>
      <button
        onClick={() =>
          onSelectPoint({
            kind: "composition",
            topicIds: [1],
            ...selections.momentum,
            metric: "prevalence_pct",
            isPartialWeek: true,
            includePartialWeeks: true,
          })
        }
      >
        Inspect weekly prevalence
      </button>
    </>
  ),
}));
vi.mock("../src/components/intelligence/ResearchRelationships", () => ({
  ResearchRelationships: ({
    onSelectItem,
  }: {
    onSelectItem: (selection: RelationshipSelection) => void;
  }) => <button onClick={() => onSelectItem(selections.relationship)}>Inspect relationship</button>,
}));
vi.mock("../src/components/intelligence/TopicCategoryHeatmap", () => ({
  TopicCategoryHeatmap: ({
    onSelectCell,
  }: {
    onSelectCell: (selection: HeatmapSelection) => void;
  }) => <button onClick={() => onSelectCell(selections.heatmap)}>Inspect heatmap</button>,
}));

const meta = { warnings: ["Historical completeness is unknown."] };
const topics = [1, 2].map((id) => ({
  topic_id: id,
  topic_name: id === 1 ? "Vision" : "Agents",
  period_paper_count: 10,
  total_indexed_paper_count: 50,
}));
const records = Array.from({ length: 11 }, (_, i) => ({
  paper_id: `2601.0000${i}v2`,
  title: `Indexed publication ${i}`,
  abstract: i === 0 ? "Observed paper abstract." : null,
  authors: i === 0 ? ["Alice", "Bob"] : [],
  published_date: "2026-10-01T23:00:00Z",
  primary_category: "cs.CV",
  arxiv_url: i === 0 ? "https://arxiv.org/abs/2601.00000v2" : null,
  pdf_url: null,
}));
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
function mockApi() {
  const fetch = vi.fn((url: string) => {
    const parsed = new URL(url, "http://test");
    if (parsed.pathname.endsWith("/evidence")) {
      const offset = Number(parsed.searchParams.get("offset"));
      return Promise.resolve(
        response({
          meta,
          data: {
            total: 11,
            offset,
            limit: 10,
            has_more: offset < 10,
            records: records.slice(offset, offset + 10),
          },
        }),
      );
    }
    if (url.includes("/coverage"))
      return Promise.resolve(
        response({
          meta,
          data: {
            total_indexed_papers: 11,
            total_topics: 2,
            observed_date_from: "2026-09-01",
            observed_date_to: "2026-10-04",
            latest_successful_etl_at: null,
          },
        }),
      );
    if (url.includes("/topics")) return Promise.resolve(response({ meta, data: topics }));
    if (url.includes("/count")) return Promise.resolve(response({ total: 0 }));
    return Promise.resolve(response([]));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
function page(entry = "/intelligence") {
  vi.stubGlobal("scrollTo", vi.fn());
  const router = createMemoryRouter(
    [
      { path: "/intelligence", element: <IntelligencePage /> },
      { path: "/papers", element: <PapersPage /> },
      { path: "/papers/:paperId", element: <h1>Individual publication</h1> },
    ],
    { initialEntries: [entry] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, client };
}
const evidenceCalls = (fetch: ReturnType<typeof mockApi>) =>
  fetch.mock.calls.filter(([url]) => url.includes("/evidence"));
const context: EvidenceContext = {
  source: "relationships",
  topicIds: [1, 2],
  dateFrom: "2026-09-01",
  dateTo: "2026-10-04",
  categoryScope: "all",
};

describe("Contextual evidence entry points", () => {
  it.each([
    ["Inspect momentum", ["1"], "2026-09-30", "2026-10-04", undefined],
    ["Inspect matrix current", ["1"], "2026-09-21", "2026-10-04", "Current comparison window"],
    ["Inspect matrix previous", ["1"], "2026-09-07", "2026-09-20", "Previous comparison window"],
    [
      "Inspect prevalence previous",
      ["1"],
      "2026-09-07",
      "2026-09-20",
      "Previous comparison window",
    ],
    ["Inspect weekly prevalence", ["1"], "2026-09-30", "2026-10-04", undefined],
    ["Inspect relationship", ["1", "2"], "2026-09-01", "2026-10-04", undefined],
    ["Inspect heatmap", ["1"], "2026-09-01", "2026-10-04", undefined],
  ] as const)(
    "opens exact supporting evidence from %s",
    async (buttonName, ids, from, to, windowLabel) => {
      const fetch = mockApi();
      page();
      await screen.findByText("Last successful ETL (UTC): Unavailable");
      expect(evidenceCalls(fetch)).toHaveLength(0);
      const trigger = screen.getByRole("button", { name: buttonName });
      act(() => trigger.focus());
      fireEvent.click(trigger);
      const drawer = screen.getByRole("dialog", { name: "Supporting indexed publications" });
      expect(
        await within(drawer).findByRole("heading", { name: "Indexed publication 0" }),
      ).toBeTruthy();
      const params = new URL(evidenceCalls(fetch)[0][0], "http://test").searchParams;
      expect(params.getAll("topic_id")).toEqual(ids);
      expect(params.get("date_from")).toBe(from);
      expect(params.get("date_to")).toBe(to);
      if (windowLabel) expect(within(drawer).getByText(windowLabel)).toBeTruthy();
      if (buttonName === "Inspect heatmap") {
        expect(params.get("category")).toBe("cs.CV");
        expect(params.get("category_scope")).toBe("primary");
        expect(within(drawer).getByText(/Primary category only/)).toBeTruthy();
      }
      if (buttonName === "Inspect prevalence previous")
        expect(within(drawer).getByText(/Individual papers do not prove a change/)).toBeTruthy();
      expect(within(drawer).getByText("Alice, Bob")).toBeTruthy();
      expect(within(drawer).getByText("Observed paper abstract.")).toBeTruthy();
      expect(within(drawer).getByRole("link", { name: /arXiv/ }).getAttribute("href")).toContain(
        "v2",
      );
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    },
  );
  it("traps focus, isolates background, restores scroll state, and dismisses via close or backdrop", async () => {
    mockApi();
    page();
    document.body.style.overflow = "scroll";
    const trigger = screen.getByRole("button", { name: "Inspect relationship" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    const close = within(dialog).getByRole("button", { name: "Close evidence" });
    expect(document.activeElement).toBe(close);
    expect(document.body.style.overflow).toBe("hidden");
    const root = dialog.parentElement!.previousElementSibling;
    expect(root?.hasAttribute("inert")).toBe(true);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.click(within(dialog).getByText(/Research Relationships/));
    expect(screen.getByRole("dialog")).toBe(dialog);
    fireEvent.click(dialog.parentElement!);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("scroll");
    expect(root?.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(trigger);
    document.body.style.overflow = "";
  });
  it("pages deterministically and opens Explorer with the same cached cohort and page", async () => {
    const fetch = mockApi();
    const { router } = page();
    fireEvent.click(screen.getByRole("button", { name: "Inspect relationship" }));
    const dialog = screen.getByRole("dialog");
    await within(dialog).findByRole("heading", { name: "Indexed publication 0" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    await within(dialog).findByRole("heading", { name: "Indexed publication 10" });
    expect(evidenceCalls(fetch)).toHaveLength(2);
    expect(new URL(evidenceCalls(fetch)[1][0], "http://test").searchParams.get("offset")).toBe(
      "10",
    );
    const link = within(dialog).getByRole("link", { name: "Open in Paper Explorer" });
    expect(link.getAttribute("href")).toBe(evidenceExplorerUrl(context, 2));
    fireEvent.click(link);
    expect(router.state.location.pathname).toBe("/papers");
    expect(await screen.findByRole("region", { name: "Imported analytical context" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Indexed publication 10" })).toBeTruthy();
    expect(evidenceCalls(fetch)).toHaveLength(2);
    const details = screen.getAllByRole("link", { name: "Paper details" })[0];
    expect(details.getAttribute("href")).toContain("return_to=");
    expect(details.getAttribute("href")).toContain("v2");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Imported Paper Explorer context", () => {
  it("restores exact intersection/scope after a fresh URL load and clears to independent search", async () => {
    const fetch = mockApi();
    const imported: EvidenceContext = {
      ...context,
      source: "heatmap",
      topicIds: [1],
      category: "cs.CV",
      categoryScope: "primary",
    };
    const { router } = page(evidenceExplorerUrl(imported, 2));
    await screen.findByRole("heading", { name: "Indexed publication 10" });
    expect(screen.getByText(/Opened from Research Intelligence/)).toBeTruthy();
    const params = new URL(evidenceCalls(fetch)[0][0], "http://test").searchParams;
    expect(params.get("category_scope")).toBe("primary");
    expect(params.get("category")).toBe("cs.CV");
    expect(params.get("offset")).toBe("10");
    expect(fetch.mock.calls.some(([url]) => url.includes("/papers/search"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByRole("heading", { name: "Indexed publication 0" });
    expect(new URLSearchParams(router.state.location.search).has("page")).toBe(false);
    await act(async () => {
      await router.navigate(-1);
    });
    expect(await screen.findByRole("heading", { name: "Indexed publication 10" })).toBeTruthy();
    expect(new URLSearchParams(router.state.location.search).get("page")).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "Clear imported context" }));
    expect(router.state.location.search).toBe("");
    expect(await screen.findByLabelText("Search papers")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search papers"), { target: { value: "independent" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([url]) => url.includes("/papers/search") && url.includes("query=independent"),
        ),
      ).toBe(true),
    );
  });
  it.each([
    "evidence=v1&source=relationships&topic_id=1&topic_id=2&query=keyword",
    "topic_id=1",
    "evidence=v1&source=heatmap&topic_id=1&category=cs.CV&category_scope=invalid",
  ])("blocks unsupported context instead of broadening: %s", async (query) => {
    const fetch = mockApi();
    page(`/papers?${query}`);
    expect(screen.getByRole("alert")).toBeTruthy();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(evidenceCalls(fetch)).toHaveLength(0);
    expect(fetch.mock.calls.some(([url]) => url.includes("/papers/search"))).toBe(false);
  });
});

describe("Evidence requests", () => {
  function results(fetch: ReturnType<typeof mockApi>) {
    vi.stubGlobal("fetch", fetch);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return render(<EvidenceResults context={context} page={1} onPageChange={vi.fn()} />, {
      wrapper: ({ children }) => (
        <Wrapper>
          <TestRouter>{children}</TestRouter>
        </Wrapper>
      ),
    });
  }
  function TestRouter({ children }: { children: React.ReactNode }) {
    const router = createMemoryRouter([{ path: "/", element: children }]);
    return <RouterProvider router={router} />;
  }
  it("shows loading, exact empty results and explicit error retry", async () => {
    const fetch = mockApi();
    fetch.mockImplementation(() => Promise.resolve(response({ detail: "Busy" }, 503)));
    results(fetch);
    expect(screen.getByText("Loading supporting publications…")).toBeTruthy();
    const retry = await screen.findByRole("button", { name: "Retry evidence" });
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockImplementation(() =>
      Promise.resolve(
        response({ meta, data: { total: 0, offset: 0, limit: 10, has_more: false, records: [] } }),
      ),
    );
    fireEvent.click(retry);
    expect(await screen.findByText("No supporting publications found")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/does not establish an absence of research/)).toBeTruthy();
  });
  it("cancels superseded evidence and never displays the previous cohort under new filters", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, options: { signal: AbortSignal }) => {
        signals.push(options.signal);
        return new Promise((_resolve, reject) =>
          options.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        );
      }),
    );
    const client = new QueryClient();
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const view = render(<EvidenceResults context={context} page={1} onPageChange={vi.fn()} />, {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(signals).toHaveLength(1));
    view.rerender(
      <EvidenceResults context={{ ...context, topicIds: [2] }} page={1} onPageChange={vi.fn()} />,
    );
    await waitFor(() => expect(signals).toHaveLength(2));
    expect(signals[0].aborted).toBe(true);
    expect(screen.queryByText("Indexed publication 0")).toBeNull();
    view.unmount();
    expect(signals[1].aborted).toBe(true);
  });
});
