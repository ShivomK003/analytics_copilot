import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { ApiError, get, parseRetryAfter } from "../src/api/client";
import {
  getIntelligenceEvidence,
  getIntelligenceMomentum,
  intelligenceSearch,
} from "../src/api/intelligence";
import {
  intelligenceQueryOptions,
  useIntelligenceComposition,
  useIntelligenceEvidence,
  useIntelligenceHeatmap,
  useIntelligenceMatrix,
  useIntelligenceMomentum,
  useIntelligenceRelationships,
  useIntelligenceTopics,
} from "../src/hooks/useIntelligence";
import type { EvidenceData, IntelligenceResponse, MomentumData } from "../src/types/intelligence";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

describe("typed Intelligence requests", () => {
  it("preserves envelopes and typed endpoint payloads", async () => {
    const envelope = {
      meta: { coverage_status: "unknown" },
      data: { total: 0, records: [], limit: 20, offset: 0, has_more: false },
    };
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(envelope), { headers: { "content-type": "application/json" } }),
      );
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    const response = await getIntelligenceEvidence(
      { topic_ids: [5, 2], category: "cs.AI", category_scope: "primary", limit: 10, offset: 20 },
      signal,
    );
    expectTypeOf(response).toEqualTypeOf<IntelligenceResponse<EvidenceData>>();
    expectTypeOf<Awaited<ReturnType<typeof getIntelligenceMomentum>>>().toEqualTypeOf<
      IntelligenceResponse<MomentumData>
    >();
    expect(response).toEqual(envelope);
    const search = new URL(fetch.mock.calls[0][0], "http://test").searchParams;
    expect(search.getAll("topic_id")).toEqual(["2", "5"]);
    expect(search.get("offset")).toBe("20");
    expect(search.get("category_scope")).toBe("primary");
    expect(fetch.mock.calls[0][1].signal).toBe(signal);
  });
  it("normalizes chart IDs but preserves evidence duplicates for backend validation", () => {
    expect(
      new URLSearchParams(intelligenceSearch("momentum", { topic_ids: [2, 2] })).getAll("topic_id"),
    ).toEqual(["2"]);
    expect(
      new URLSearchParams(intelligenceSearch("evidence", { topic_ids: [2, 2] })).getAll("topic_id"),
    ).toEqual(["2", "2"]);
    expect(intelligenceSearch("momentum", {})).not.toContain("topic_id");
  });
  it("includes every endpoint-specific parameter in query identity", () => {
    const options = intelligenceQueryOptions("evidence", {
      topic_ids: [2, 5],
      date_from: "2026-07-01",
      date_to: "2026-07-31",
      category: "cs.AI",
      category_scope: "primary",
      limit: 10,
      offset: 20,
    });
    expect(options.retry).toBe(false);
    const key = String(options.queryKey[2]);
    for (const parameter of [
      "topic_id=2",
      "topic_id=5",
      "date_from=2026-07-01",
      "date_to=2026-07-31",
      "category=cs.AI",
      "category_scope=primary",
      "limit=10",
      "offset=20",
    ])
      expect(key).toContain(parameter);
    expect(
      intelligenceQueryOptions("momentum", { mode: "index", include_partial_weeks: false })
        .queryKey[2],
    ).toContain("include_partial_weeks=false");
    expect(intelligenceQueryOptions("momentum-matrix", { window_weeks: 2 }).queryKey[2]).toContain(
      "window_weeks=2",
    );
    expect(
      intelligenceQueryOptions("relationships", { min_shared_papers: 10 }).queryKey[2],
    ).toContain("min_shared_papers=10");
    expect(intelligenceQueryOptions("momentum", { topic_ids: [5, 2] }).queryKey).toEqual(
      intelligenceQueryOptions("momentum", { topic_ids: [2, 5] }).queryKey,
    );
  });
  it("parses FastAPI validation arrays and keeps legacy string errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ detail: [{ loc: ["query", "limit"], msg: "Must be at most 100" }] }),
            { status: 422, headers: { "content-type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ detail: "Legacy error" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          }),
        ),
    );
    await expect(get("/test")).rejects.toMatchObject({
      status: 422,
      message: "limit: Must be at most 100",
    });
    await expect(get("/test")).rejects.toMatchObject({ status: 500, message: "Legacy error" });
  });
  it("parses 503 Retry-After seconds and HTTP dates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Busy" }), {
          status: 503,
          headers: { "content-type": "application/json", "Retry-After": "3" },
        }),
      ),
    );
    await expect(get("/test")).rejects.toMatchObject({ status: 503, retryAfterMs: 3000 });
    expect(
      parseRetryAfter("Fri, 16 Oct 2026 00:00:05 GMT", Date.parse("2026-10-16T00:00:00Z")),
    ).toBe(5000);
    expect(parseRetryAfter("bad")).toBeNull();
    expect(parseRetryAfter("-1")).toBeNull();
    expect(new ApiError("old", 500, null).retryAfterMs).toBeNull();
  });
  it("cancels superseded topic requests on filter changes and on unmount", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, options) => {
        signals.push(options.signal);
        return new Promise((_resolve, reject) =>
          options.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        );
      }),
    );
    const { Wrapper } = wrapper();
    const hook = renderHook(({ from }) => useIntelligenceTopics({ date_from: from }), {
      wrapper: Wrapper,
      initialProps: { from: "2026-07-01" },
    });
    await waitFor(() => expect(signals.length).toBe(1));
    hook.rerender({ from: "2026-08-01" });
    await waitFor(() => expect(signals.length).toBe(2));
    expect(signals[0].aborted).toBe(true);
    hook.unmount();
    expect(signals[1].aborted).toBe(true);
  });
  it("does not start any future visualization or evidence hook by default", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { Wrapper } = wrapper();
    renderHook(
      () => {
        useIntelligenceMomentum();
        useIntelligenceMatrix();
        useIntelligenceRelationships();
        useIntelligenceHeatmap();
        useIntelligenceComposition();
        useIntelligenceEvidence();
      },
      { wrapper: Wrapper },
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
