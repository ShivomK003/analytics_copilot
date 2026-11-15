import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StrongestConnections } from "../src/components/intelligence/StrongestConnections";
import { rankRelationships } from "../src/utils/relationshipsData";
import type { RelationshipEdge, RelationshipsData } from "../src/types/intelligence";

const edges: RelationshipEdge[] = [
  { topic_a_id: 1, topic_b_id: 2, shared_paper_count: 100, jaccard_similarity: 0.1 },
  { topic_a_id: 1, topic_b_id: 3, shared_paper_count: 80, jaccard_similarity: 0.8 },
  { topic_a_id: 1, topic_b_id: 4, shared_paper_count: 50, jaccard_similarity: null },
  { topic_a_id: 1, topic_b_id: 5, shared_paper_count: 40, jaccard_similarity: 0 },
  { topic_a_id: 1, topic_b_id: 6, shared_paper_count: 30, jaccard_similarity: 0.2 },
  { topic_a_id: 1, topic_b_id: 7, shared_paper_count: 20, jaccard_similarity: 0.2 },
];
const data: RelationshipsData = {
  date_from: "2026-08-01",
  date_to: "2026-10-01",
  min_shared_papers: 1,
  edges,
  nodes: Array.from({ length: 7 }, (_, i) => ({
    topic_id: i + 1,
    topic_name: `Topic ${i + 1}`,
    paper_count: 200,
  })),
};
const interactions = () => ({ selected: null, onSelect: vi.fn(), onPreview: vi.fn() });

describe("Strongest connections", () => {
  it("orders returned counts and Jaccard fractions deterministically, keeps zero above null, and never mutates API rows", () => {
    expect(rankRelationships(edges, "shared").map((edge) => edge.topic_b_id)).toEqual([
      2, 3, 4, 5, 6, 7,
    ]);
    expect(rankRelationships(edges, "jaccard").map((edge) => edge.topic_b_id)).toEqual([
      3, 6, 7, 2, 5, 4,
    ]);
    expect(edges.map((edge) => edge.topic_b_id)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(rankRelationships([], "shared")).toEqual([]);
    const ties = [
      { ...edges[0], topic_a_id: 2, topic_b_id: 4 },
      { ...edges[0], topic_b_id: 3 },
      edges[0],
    ];
    expect(
      rankRelationships(ties, "jaccard").map((edge) => [edge.topic_a_id, edge.topic_b_id]),
    ).toEqual([
      [1, 2],
      [1, 3],
      [2, 4],
    ]);
  });
  it("limits the ranked list to five, supports keyboard previews, selection, ranking and outside-list selections", () => {
    const props = interactions();
    const view = render(<StrongestConnections data={data} {...props} />);
    const panel = screen.getByRole("region", { name: "Strongest research connections" });
    expect(within(panel).getAllByRole("listitem")).toHaveLength(5);
    const first = within(panel).getAllByRole("button")[0];
    expect(first.textContent).toContain("Topic 1 ↔ Topic 2");
    expect(first.tabIndex).toBe(0);
    fireEvent.focus(first);
    expect(props.onPreview).toHaveBeenCalledWith({
      kind: "relationship",
      topicAId: 1,
      topicBId: 2,
    });
    fireEvent.blur(first);
    expect(props.onPreview).toHaveBeenLastCalledWith(null);
    fireEvent.click(first);
    expect(props.onSelect).toHaveBeenCalledWith({ kind: "relationship", topicAId: 1, topicBId: 2 });
    view.rerender(
      <StrongestConnections
        data={data}
        {...props}
        selected={{ kind: "relationship", topicAId: 1, topicBId: 7 }}
      />,
    );
    expect(screen.getByText("Selected connection · outside the top five")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Select Topic 1 ↔ Topic 7: 20 shared papers" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.change(screen.getByLabelText("Rank connections by"), {
      target: { value: "jaccard" },
    });
    expect(within(panel).getAllByRole("button")[0].textContent).toContain("Topic 1 ↔ Topic 3");
    expect(screen.queryByText("Selected connection · outside the top five")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Select Topic 1 ↔ Topic 7: Jaccard 0.2" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Select Topic 1 ↔ Topic 5: Jaccard 0" }),
    ).toBeTruthy();
  });
  it("handles empty and unavailable similarities without fabricating zero scores", () => {
    const props = interactions();
    const view = render(<StrongestConnections data={{ ...data, edges: [] }} {...props} />);
    expect(screen.getByText("No connections meet this threshold.")).toBeTruthy();
    const missing = { ...data, edges: [{ ...edges[0], jaccard_similarity: null }] };
    view.rerender(<StrongestConnections data={missing} {...props} />);
    fireEvent.change(screen.getByLabelText("Rank connections by"), {
      target: { value: "jaccard" },
    });
    expect(
      screen.getByRole("button", { name: "Select Topic 1 ↔ Topic 2: Jaccard Unavailable" }),
    ).toBeTruthy();
    expect(screen.getByText(/Unavailable similarities appear last/)).toBeTruthy();
  });
});
