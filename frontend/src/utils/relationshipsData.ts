import type { AssociationTopic, RelationshipEdge, RelationshipsData } from "../types/intelligence";

export type RelationshipTarget =
  { kind: "topic"; topicId: number } | { kind: "relationship"; topicAId: number; topicBId: number };

export type RelationshipSelection = {
  dateFrom: string | null;
  dateTo: string | null;
} & ({ kind: "topic"; topicIds: [number] } | { kind: "relationship"; topicIds: [number, number] });

export function relationshipSelection(
  data: RelationshipsData,
  target: RelationshipTarget,
): RelationshipSelection {
  const interval = { dateFrom: data.date_from, dateTo: data.date_to };
  if (target.kind === "topic") {
    return { ...interval, kind: "topic", topicIds: [target.topicId] };
  }
  const [first, second] = [target.topicAId, target.topicBId].sort((a, b) => a - b);
  // Association dates are already inclusive; unlike weekly windows, subtract no day.
  return { ...interval, kind: "relationship", topicIds: [first, second] };
}

export function relationshipKey(edge: RelationshipEdge): string {
  return `${edge.topic_a_id}:${edge.topic_b_id}`;
}

export function formatJaccard(value: number | null): string {
  return value === null
    ? "Unavailable"
    : value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function relationshipStrength(sharedCount: number, maximumCount: number) {
  const relative = maximumCount > 0 ? Math.min(1, sharedCount / maximumCount) : 0;
  return { width: 1 + 5 * relative, opacity: 0.14 + 0.66 * relative * relative };
}

export function relationshipNodeRadius(count: number, maximumCount: number): number {
  return maximumCount > 0 ? Math.max(7, 23 * Math.sqrt(count / maximumCount)) : 7;
}

// Stable ID ordering keeps positions independent of counts, edge thresholds and API ordering.
export function layoutRelationshipNodes(nodes: AssociationTopic[]) {
  const sorted = [...nodes].sort((a, b) => a.topic_id - b.topic_id);
  return sorted.map((node, index) => {
    const angle = (index / sorted.length) * Math.PI * 2 - Math.PI / 2;
    return {
      ...node,
      x: sorted.length === 1 ? 50 : 50 + 32 * Math.cos(angle),
      y: sorted.length === 1 ? 50 : 50 + 34 * Math.sin(angle),
    };
  });
}

export type RelationshipRanking = "shared" | "jaccard";

export function rankRelationships(
  edges: readonly RelationshipEdge[],
  ranking: RelationshipRanking,
) {
  return [...edges].sort((a, b) => {
    if (ranking === "jaccard") {
      if (a.jaccard_similarity === null && b.jaccard_similarity !== null) return 1;
      if (b.jaccard_similarity === null && a.jaccard_similarity !== null) return -1;
      const difference = (b.jaccard_similarity ?? 0) - (a.jaccard_similarity ?? 0);
      if (difference) return difference;
    }
    return (
      b.shared_paper_count - a.shared_paper_count ||
      a.topic_a_id - b.topic_a_id ||
      a.topic_b_id - b.topic_b_id
    );
  });
}
