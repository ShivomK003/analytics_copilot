import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PapersPage } from "../src/pages/PapersPage";
import {
  evidenceExplorerUrl,
  evidenceFilters,
  parseEvidenceContext,
} from "../src/utils/evidenceContext";
import type { EvidenceContext } from "../src/utils/evidenceContext";

const context: EvidenceContext = {
  source: "heatmap",
  topicIds: [1],
  dateFrom: "2026-09-01",
  dateTo: "2026-10-04",
  category: "cs.CV",
  categoryScope: "primary",
};
const records = Array.from({ length: 10 }, (_, index) => ({
  paper_id: `2601.0000${index}v2`,
  title: `Indexed publication ${index}`,
  authors: [],
  abstract: "Transformer architectures",
  published_date: "2026-10-01T00:00:00Z",
  primary_category: "cs.CV",
  arxiv_url: null,
  pdf_url: null,
}));
const json = (data: unknown) =>
  new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
function evidence(total = 1033, supporting = 1033, rows = records) {
  return {
    meta: { warnings: [] },
    data: {
      total,
      supporting_total: supporting,
      limit: 10,
      offset: 0,
      has_more: total > 10,
      records: rows,
    },
  };
}
function setup(entry = evidenceExplorerUrl(context, 3)) {
  vi.stubGlobal("scrollTo", vi.fn());
  const fetch = vi.fn((url: string) => {
    const params = new URL(url, "http://test").searchParams;
    if (url.includes("/evidence"))
      return Promise.resolve(json(params.get("q") ? evidence(42, 1033) : evidence()));
    if (url.includes("/intelligence/topics"))
      return Promise.resolve(
        json({ meta: { warnings: [] }, data: [{ topic_id: 1, topic_name: "Vision" }] }),
      );
    if (url.includes("/papers/count")) return Promise.resolve(json({ total: 0 }));
    return Promise.resolve(json([]));
  });
  vi.stubGlobal("fetch", fetch);
  const router = createMemoryRouter([{ path: "/papers", element: <PapersPage /> }], {
    initialEntries: [entry],
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, fetch };
}
const calls = (fetch: ReturnType<typeof setup>["fetch"]) =>
  fetch.mock.calls.filter(([url]) => url.includes("/evidence"));
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
}
afterEach(() => vi.useRealTimers());

describe("Searchable imported evidence", () => {
  it("debounces search once and resets pagination while preserving every analytical constraint", async () => {
    const { router, fetch } = setup();
    await screen.findByText("1,033 supporting indexed publications");
    vi.useFakeTimers();
    const input = screen.getByLabelText("Search supporting publications");
    fireEvent.change(input, { target: { value: "trans" } });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.change(input, { target: { value: "transformer" } });
    await act(async () => {
      vi.advanceTimersByTime(349);
    });
    expect(calls(fetch)).toHaveLength(1);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await settle();
    expect(calls(fetch)).toHaveLength(2);
    const params = new URL(calls(fetch)[1][0], "http://test").searchParams;
    expect(params.get("q")).toBe("transformer");
    expect(params.get("offset")).toBe("0");
    expect(params.getAll("topic_id")).toEqual(["1"]);
    expect(params.get("date_from")).toBe(context.dateFrom);
    expect(params.get("date_to")).toBe(context.dateTo);
    expect(params.get("category")).toBe("cs.CV");
    expect(params.get("category_scope")).toBe("primary");
    expect(new URLSearchParams(router.state.location.search).has("page")).toBe(false);
    expect(
      screen.getByText("42 matching publications out of 1,033 supporting indexed publications"),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Indexed publication 0" }).getAttribute("href"),
    ).toContain("q%3Dtransformer");
  });
  it("restores keyword, sorting and page from the URL; clearing search retains context and sort", async () => {
    const { router, fetch } = setup(
      evidenceExplorerUrl(context, 3, { q: "transformer", sort: "title_asc" }),
    );
    await screen.findByText(
      "42 matching publications out of 1,033 supporting indexed publications",
    );
    expect(
      (screen.getByLabelText("Search supporting publications") as HTMLInputElement).value,
    ).toBe("transformer");
    expect((screen.getByLabelText("Sort by") as HTMLSelectElement).value).toBe("title_asc");
    let params = new URL(calls(fetch)[0][0], "http://test").searchParams;
    expect(params.get("sort")).toBe("title_asc");
    expect(params.get("offset")).toBe("20");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    await screen.findByText("1,033 supporting indexed publications");
    const url = new URLSearchParams(router.state.location.search);
    expect(url.get("sort")).toBe("title_asc");
    expect(url.has("q")).toBe(false);
    expect(url.has("page")).toBe(false);
    expect(url.get("evidence")).toBe("v1");
    expect(url.get("category_scope")).toBe("primary");
    params = new URL(calls(fetch)[1][0], "http://test").searchParams;
    expect(params.get("sort")).toBe("title_asc");
    expect(params.has("q")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Clear imported context" }));
    expect(router.state.location.search).toBe("");
    expect(await screen.findByLabelText("Search papers")).toBeTruthy();
  });
  it("sorts immediately before paging and preserves the keyword and context across browser history", async () => {
    const { router, fetch } = setup(evidenceExplorerUrl(context, 2, { q: "transformer" }));
    await screen.findByText(
      "42 matching publications out of 1,033 supporting indexed publications",
    );
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "published_asc" } });
    await waitFor(() => expect(calls(fetch)).toHaveLength(2));
    let params = new URL(calls(fetch)[1][0], "http://test").searchParams;
    expect(params.get("sort")).toBe("published_asc");
    expect(params.get("offset")).toBe("0");
    await screen.findByRole("link", { name: "Indexed publication 0" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(calls(fetch)).toHaveLength(3));
    params = new URL(calls(fetch)[2][0], "http://test").searchParams;
    expect(params.get("offset")).toBe("10");
    expect(params.get("q")).toBe("transformer");
    expect(params.get("sort")).toBe("published_asc");
    await act(async () => {
      await router.navigate(-1);
    });
    expect(new URLSearchParams(router.state.location.search).has("page")).toBe(false);
    expect((screen.getByLabelText("Sort by") as HTMLSelectElement).value).toBe("published_asc");
    expect(calls(fetch)).toHaveLength(3);
  });
  it("submits without waiting, clears a pending debounce, and reports an empty refinement without losing the cohort count", async () => {
    const { router, fetch } = setup();
    await screen.findByText("1,033 supporting indexed publications");
    fetch.mockImplementation((url) =>
      Promise.resolve(json(url.includes("/evidence") ? evidence(0, 1033, []) : [])),
    );
    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText("Search supporting publications"), {
      target: { value: "unmatched" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await settle();
    expect(screen.getByText("No matching publications")).toBeTruthy();
    expect(
      screen.getByText("0 matching publications out of 1,033 supporting indexed publications"),
    ).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(calls(fetch)).toHaveLength(2);
    expect(new URLSearchParams(router.state.location.search).get("topic_id")).toBe("1");
  });
  it("cancels superseded searches and never lets an older response replace the newer refinement", async () => {
    const { fetch } = setup();
    await screen.findByText("1,033 supporting indexed publications");
    const requests: { signal: AbortSignal; resolve: (value: Response) => void }[] = [];
    fetch.mockImplementation(
      (_url: string, ...args: unknown[]) =>
        new Promise<Response>((resolve) => {
          requests.push({ signal: (args[0] as { signal: AbortSignal }).signal, resolve });
        }),
    );
    fireEvent.change(screen.getByLabelText("Search supporting publications"), {
      target: { value: "first" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    fireEvent.change(screen.getByLabelText("Search supporting publications"), {
      target: { value: "second" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0].signal.aborted).toBe(true);
    await act(async () =>
      requests[1].resolve(
        json(evidence(1, 1033, [{ ...records[0], title: "Newer search result" }])),
      ),
    );
    expect(await screen.findByRole("link", { name: "Newer search result" })).toBeTruthy();
    await act(async () =>
      requests[0].resolve(
        json(evidence(1, 1033, [{ ...records[0], title: "Stale search result" }])),
      ),
    );
    expect(screen.queryByRole("link", { name: "Stale search result" })).toBeNull();
    expect(screen.getByRole("link", { name: "Newer search result" })).toBeTruthy();
  });
  it("does not present unrefined responses from an older evidence service as matching results", async () => {
    const { fetch } = setup();
    await screen.findByText("1,033 supporting indexed publications");
    const older = evidence();
    const { supporting_total: omitted, ...oldData } = older.data;
    expect(omitted).toBe(1033);
    fetch.mockImplementation(() => Promise.resolve(json({ ...older, data: oldData })));
    fireEvent.change(screen.getByLabelText("Search supporting publications"), {
      target: { value: "new query" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("Evidence refinement unavailable")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Indexed publication 0" })).toBeNull();
  });
  it("rejects invalid sort orders without fetching a broader evidence set", async () => {
    const { fetch } = setup(`${evidenceExplorerUrl(context)}&sort=unsupported`);
    expect(screen.getByRole("alert").textContent).toContain("sort order");
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(calls(fetch)).toHaveLength(0);
  });
  it("round-trips refinement state and passes only supported wire parameters", () => {
    const refinement = { q: " transformer ", sort: "title_asc" as const };
    const url = evidenceExplorerUrl(context, 4, refinement);
    expect(parseEvidenceContext(new URL(url, "http://test").searchParams)).toEqual({
      context,
      page: 4,
      refinement: { q: "transformer", sort: "title_asc" },
    });
    expect(
      evidenceFilters(
        {
          ...context,
          source: "relationships",
          topicIds: [1, 2],
          category: undefined,
          categoryScope: "all",
        },
        2,
        refinement,
      ),
    ).toMatchObject({ topic_ids: [1, 2], q: "transformer", sort: "title_asc", offset: 10 });
    expect(
      parseEvidenceContext(
        new URLSearchParams(`evidence=v1&source=relationships&topic_id=1&q=${"x".repeat(201)}`),
      ).error,
    ).toBeTruthy();
  });
});
