import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ResearchRelationships } from "../src/components/intelligence/ResearchRelationships";
import type { RelationshipsData } from "../src/types/intelligence";
import {
  formatJaccard,
  layoutRelationshipNodes,
  relationshipNodeRadius,
  relationshipSelection,
  relationshipStrength,
} from "../src/utils/relationshipsData";
import { topicColor } from "../src/utils/topicColors";

const data: RelationshipsData = {
  date_from: "2026-08-01",
  date_to: "2026-10-01",
  min_shared_papers: 1,
  nodes: [
    { topic_id: 2, topic_name: "Vision", paper_count: 100 },
    { topic_id: 5, topic_name: "Agents", paper_count: 20 },
    { topic_id: 8, topic_name: "Robotics", paper_count: 0 },
  ],
  edges: [
    { topic_a_id: 2, topic_b_id: 5, shared_paper_count: 10, jaccard_similarity: 0.090909 },
    { topic_a_id: 5, topic_b_id: 8, shared_paper_count: 3, jaccard_similarity: null },
  ],
};
// Null similarities are defensive fixtures; positive edges normally have nonzero unions.
const props = {
  dates: { date_from: "2026-08-01", date_to: "2026-10-01" },
  topicIds: [],
  topicsReady: true,
};
const response = (value: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
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
function graphNode(name: string) {
  return screen.getByRole("button", { name: new RegExp(`^${name}:`) });
}
function graphEdge() {
  return screen.getByRole("button", { name: /Vision and Agents: 10 shared papers/ });
}

describe("Relationships data and selection contracts", () => {
  it("maps every topic, including isolated zero counts, into a deterministic layout", () => {
    const nodes = layoutRelationshipNodes(data.nodes);
    expect(nodes.map((n) => [n.topic_id, n.paper_count])).toEqual([
      [2, 100],
      [5, 20],
      [8, 0],
    ]);
    expect(layoutRelationshipNodes([...data.nodes].reverse())).toEqual(nodes);
    const changed = layoutRelationshipNodes(data.nodes.map((n) => ({ ...n, paper_count: 500 })));
    expect(changed.map((n) => [n.x, n.y])).toEqual(nodes.map((n) => [n.x, n.y]));
    expect(layoutRelationshipNodes([])).toEqual([]);
    expect(layoutRelationshipNodes([data.nodes[0]])[0]).toMatchObject({ x: 50, y: 50 });
  });
  it("uses shared-paper counts for visual strength and preserves exact values", () => {
    const weak = relationshipStrength(3, 10);
    const strong = relationshipStrength(10, 10);
    expect(strong.width).toBeGreaterThan(weak.width);
    expect(strong.opacity).toBeGreaterThan(weak.opacity);
    expect(relationshipStrength(0, 0)).toEqual({ width: 1, opacity: 0.14 });
    expect(relationshipNodeRadius(100, 100)).toBeGreaterThan(relationshipNodeRadius(20, 100));
    expect(relationshipNodeRadius(0, 100)).toBe(7);
    expect(relationshipNodeRadius(0, 0)).toBe(7);
    expect(formatJaccard(0.090909)).toBe("0.090909");
    expect(formatJaccard(0)).toBe("0");
    expect(formatJaccard(null)).toBe("Unavailable");
  });
  it("prepares single-topic and canonical pair payloads with unchanged inclusive dates", () => {
    expect(relationshipSelection(data, { kind: "topic", topicId: 5 })).toEqual({
      kind: "topic",
      topicIds: [5],
      dateFrom: "2026-08-01",
      dateTo: "2026-10-01",
    });
    expect(relationshipSelection(data, { kind: "relationship", topicAId: 5, topicBId: 2 })).toEqual(
      { kind: "relationship", topicIds: [2, 5], dateFrom: "2026-08-01", dateTo: "2026-10-01" },
    );
    expect(
      relationshipSelection(
        { ...data, date_from: null, date_to: null },
        { kind: "topic", topicId: 2 },
      ),
    ).toMatchObject({ dateFrom: null, dateTo: null });
  });
});

describe("Relationships exploration", () => {
  it("renders real counts, colored nodes, weighted links and a complete accessible list", async () => {
    mockData();
    const { container } = render(<ResearchRelationships {...props} />, {
      wrapper: setup().Wrapper,
    });
    expect(screen.getByRole("status").textContent).toContain("Loading research relationships");
    await screen.findByRole("region", { name: "Relationship list" });
    expect(graphNode("Robotics").textContent).toContain("Robotics");
    const rows = within(screen.getByRole("region", { name: "Relationship list" })).getAllByRole(
      "row",
    );
    expect(within(rows[1]).getByText("10")).toBeTruthy();
    expect(within(rows[1]).getByText("0.090909")).toBeTruthy();
    expect(within(rows[2]).getByText("Unavailable")).toBeTruthy();
    const links = container.querySelectorAll(".relationships-edge-line");
    expect(Number(links[0].getAttribute("stroke-width"))).toBeGreaterThan(
      Number(links[1].getAttribute("stroke-width")),
    );
    const dot = graphNode("Vision").querySelector<HTMLElement>(".relationships-node-dot")!;
    expect(dot.style.background).toBeTruthy();
    expect(dot.style.borderColor).toBe(dot.style.background);
    expect(topicColor(2)).toBe("#087f73");
    const disclosure = screen.getByText("How to read this network").closest("details")!;
    expect(disclosure.open).toBe(false);
    fireEvent.click(disclosure.querySelector("summary")!);
    expect(within(disclosure).getByText("Historical coverage is unknown.")).toBeTruthy();
  });
  it("previews on focus, selects nodes and keyboard-selects pairs without evidence requests", async () => {
    const fetch = mockData();
    const onSelectItem = vi.fn();
    render(<ResearchRelationships {...props} onSelectItem={onSelectItem} />, {
      wrapper: setup().Wrapper,
    });
    await screen.findByRole("region", { name: "Relationship list" });
    fireEvent.focus(graphNode("Vision"));
    expect(screen.getByRole("tooltip").textContent).toContain("100 indexed papers");
    expect(onSelectItem).not.toHaveBeenCalled();
    fireEvent.click(graphNode("Vision"));
    expect(graphNode("Vision").getAttribute("aria-pressed")).toBe("true");
    expect(onSelectItem).toHaveBeenLastCalledWith(
      relationshipSelection(data, { kind: "topic", topicId: 2 }),
    );
    fireEvent.focus(graphEdge());
    expect(screen.getByRole("tooltip").textContent).toContain("0.090909");
    fireEvent.keyDown(graphEdge(), { key: "Enter" });
    expect(graphEdge().getAttribute("aria-pressed")).toBe("true");
    expect(onSelectItem).toHaveBeenLastCalledWith(
      relationshipSelection(data, { kind: "relationship", topicAId: 2, topicBId: 5 }),
    );
    fireEvent.keyDown(graphEdge(), { key: " " });
    expect(onSelectItem).toHaveBeenCalledTimes(3);
    fireEvent.keyDown(graphEdge(), { key: "Escape" });
    expect(graphEdge().getAttribute("aria-pressed")).toBe("false");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("selects relationships from the list and clears without changing filters", async () => {
    const fetch = mockData();
    const onSelectItem = vi.fn();
    render(<ResearchRelationships {...props} onSelectItem={onSelectItem} />, {
      wrapper: setup().Wrapper,
    });
    const list = await screen.findByRole("region", { name: "Relationship list" });
    fireEvent.click(within(list).getByRole("button", { name: /Vision.*Agents/ }));
    expect(onSelectItem).toHaveBeenCalledWith(
      relationshipSelection(data, { kind: "relationship", topicAId: 2, topicBId: 5 }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear highlight" }));
    expect(graphEdge().getAttribute("aria-pressed")).toBe("false");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("starts with a useful strongest connection and synchronizes ranked, graph and detail selections", async () => {
    const fetch = mockData();
    const onSelectItem = vi.fn();
    render(<ResearchRelationships {...props} onSelectItem={onSelectItem} />, {
      wrapper: setup().Wrapper,
    });
    const panel = await screen.findByRole("region", { name: "Strongest research connections" });
    expect(graphEdge().getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("tooltip").textContent).toContain("Vision ↔ Agents");
    expect(onSelectItem).not.toHaveBeenCalled();
    const pair = within(panel).getByRole("button", {
      name: "Select Agents ↔ Robotics: 3 shared papers",
    });
    fireEvent.click(pair);
    expect(
      screen.getByRole("button", { name: /Agents and Robotics:/ }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("tooltip").textContent).toContain("Unavailable");
    expect(pair.getAttribute("aria-pressed")).toBe("true");
    expect(onSelectItem).toHaveBeenLastCalledWith({
      kind: "relationship",
      topicIds: [5, 8],
      dateFrom: data.date_from,
      dateTo: data.date_to,
    });
    fireEvent.keyDown(graphEdge(), { key: "Enter" });
    expect(pair.getAttribute("aria-pressed")).toBe("false");
    expect(
      within(panel)
        .getByRole("button", { name: "Select Vision ↔ Agents: 10 shared papers" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Clear highlight" }));
    expect(
      within(panel)
        .getAllByRole("button")
        .every((button) => button.getAttribute("aria-pressed") === "false"),
    ).toBe(true);
    expect(screen.getByRole("tooltip").textContent).toContain("Current topic network");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("applies only valid committed minimums and keeps node positions stable", async () => {
    const fetch = mockData();
    const { container } = render(<ResearchRelationships {...props} />, {
      wrapper: setup().Wrapper,
    });
    await screen.findByRole("region", { name: "Relationship list" });
    const before = Array.from(container.querySelectorAll<HTMLElement>(".relationships-node")).map(
      (n) => [n.style.left, n.style.top],
    );
    fireEvent.change(screen.getByLabelText("Minimum shared papers"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply minimum" }));
    expect(screen.getByRole("alert").textContent).toContain("positive whole number");
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Minimum shared papers"), { target: { value: "5" } });
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValue(
      response({
        meta: { warnings: [] },
        data: { ...data, min_shared_papers: 5, edges: [data.edges[0]] },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply minimum" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(String(fetch.mock.calls[1][0])).toContain("min_shared_papers=5");
    await waitFor(() =>
      expect(container.querySelectorAll(".relationships-edge-line")).toHaveLength(1),
    );
    expect(
      Array.from(container.querySelectorAll<HTMLElement>(".relationships-node")).map((n) => [
        n.style.left,
        n.style.top,
      ]),
    ).toEqual(before);
    expect(graphNode("Vision").getAttribute("aria-label")).toContain("100 indexed papers");
  });
  it("updates shared UTC date and topic query parameters", async () => {
    const fetch = mockData();
    const view = render(<ResearchRelationships {...props} />, { wrapper: setup().Wrapper });
    await screen.findByRole("region", { name: "Relationship list" });
    view.rerender(
      <ResearchRelationships
        {...props}
        topicIds={[2, 5]}
        dates={{ date_from: "2026-09-01", date_to: "2026-09-30" }}
      />,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const params = new URL(String(fetch.mock.calls[1][0]), "http://test").searchParams;
    expect(params.getAll("topic_id")).toEqual(["2", "5"]);
    expect(params.get("date_from")).toBe("2026-09-01");
    expect(params.get("date_to")).toBe("2026-09-30");
    expect(params.get("min_shared_papers")).toBe("1");
  });
  it("retains disconnected, zero-count and single-topic nodes", async () => {
    mockData({ ...data, nodes: [data.nodes[2]], edges: [] });
    render(<ResearchRelationships {...props} />, { wrapper: setup().Wrapper });
    expect(await screen.findByText(/No connections meet the threshold/)).toBeTruthy();
    expect(screen.getByText(/No matching indexed activity/)).toBeTruthy();
    expect(graphNode("Robotics").getAttribute("aria-label")).toContain("0 indexed papers");
    expect(screen.queryByRole("region", { name: "Relationship list" })).toBeNull();
  });
  it("handles an empty topic response", async () => {
    mockData({ ...data, nodes: [], edges: [] });
    render(<ResearchRelationships {...props} />, { wrapper: setup().Wrapper });
    expect(await screen.findByText("No topics available")).toBeTruthy();
  });
  it.each([422, 500, 503])(
    "supports HTTP %s errors and explicit retry without loops",
    async (status) => {
      const fetch = vi.fn().mockResolvedValue(response({ detail: "Request failed" }, status));
      vi.stubGlobal("fetch", fetch);
      render(<ResearchRelationships {...props} />, { wrapper: setup().Wrapper });
      const retry = await screen.findByRole("button", { name: "Retry relationships" });
      expect(fetch).toHaveBeenCalledTimes(1);
      fetch.mockResolvedValue(response({ meta: { warnings: [] }, data }));
      fireEvent.click(retry);
      await screen.findByRole("region", { name: "Relationship list" });
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );
  it("handles network failures and disables requests without valid shared filters", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetch);
    const view = render(
      <ResearchRelationships {...props} dates={{ error: "Invalid UTC dates" }} />,
      { wrapper: setup().Wrapper },
    );
    expect(screen.getByText("Choose a valid date range")).toBeTruthy();
    view.rerender(<ResearchRelationships {...props} topicsReady={false} />);
    expect(screen.getByText("Topics unavailable")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    view.rerender(<ResearchRelationships {...props} />);
    expect(await screen.findByRole("button", { name: "Retry relationships" })).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("announces same-filter background refresh while preserving the network", async () => {
    const fetch = mockData();
    const { client, Wrapper } = setup();
    render(<ResearchRelationships {...props} />, { wrapper: Wrapper });
    await screen.findByRole("region", { name: "Relationship list" });
    let resolve: (value: Response) => void = () => {};
    fetch.mockImplementation(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    await act(async () => {
      void client.invalidateQueries({ queryKey: ["intelligence", "relationships"] });
    });
    expect(await screen.findByText("Updating research relationships…")).toBeTruthy();
    expect(graphNode("Vision")).toBeTruthy();
    await act(async () => {
      resolve(response({ meta: { warnings: [] }, data }));
    });
    await waitFor(() => expect(screen.queryByText("Updating research relationships…")).toBeNull());
  });
  it("cancels superseded requests and never shows another filter's network", async () => {
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
    const view = render(<ResearchRelationships {...props} />, { wrapper: setup().Wrapper });
    await screen.findByRole("region", { name: "Relationship list" });
    view.rerender(<ResearchRelationships {...props} topicIds={[5]} />);
    await waitFor(() => expect(signals).toHaveLength(2));
    expect(screen.queryByRole("region", { name: "Relationship list" })).toBeNull();
    view.rerender(<ResearchRelationships {...props} topicIds={[8]} />);
    await waitFor(() => expect(signals).toHaveLength(3));
    expect(signals[1].aborted).toBe(true);
    view.unmount();
    expect(signals[2].aborted).toBe(true);
  });
});
