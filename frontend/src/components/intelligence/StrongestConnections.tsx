import { useState } from "react";
import type { RelationshipEdge, RelationshipsData } from "../../types/intelligence";
import { formatJaccard, rankRelationships, relationshipKey } from "../../utils/relationshipsData";
import type { RelationshipRanking, RelationshipTarget } from "../../utils/relationshipsData";

export function StrongestConnections({
  data,
  selected,
  onSelect,
  onPreview,
}: {
  data: RelationshipsData;
  selected: RelationshipTarget | null;
  onSelect: (target: RelationshipTarget) => void;
  onPreview: (target: RelationshipTarget | null) => void;
}) {
  const [ranking, setRanking] = useState<RelationshipRanking>("shared");
  const ranked = rankRelationships(data.edges, ranking).slice(0, 5);
  const selectedEdge =
    selected?.kind === "relationship"
      ? data.edges.find(
          (edge) => edge.topic_a_id === selected.topicAId && edge.topic_b_id === selected.topicBId,
        )
      : undefined;
  const outsideRanking =
    selectedEdge && !ranked.some((edge) => relationshipKey(edge) === relationshipKey(selectedEdge));
  const names = new Map(data.nodes.map((node) => [node.topic_id, node.topic_name]));
  function connectionButton(edge: RelationshipEdge) {
    const target: RelationshipTarget = {
      kind: "relationship",
      topicAId: edge.topic_a_id,
      topicBId: edge.topic_b_id,
    };
    const name = `${names.get(edge.topic_a_id) ?? `Topic ${edge.topic_a_id}`} ↔ ${names.get(edge.topic_b_id) ?? `Topic ${edge.topic_b_id}`}`;
    const value =
      ranking === "shared"
        ? `${edge.shared_paper_count.toLocaleString()} shared papers`
        : `Jaccard ${formatJaccard(edge.jaccard_similarity)}`;
    const pressed =
      selected?.kind === "relationship" &&
      selected.topicAId === edge.topic_a_id &&
      selected.topicBId === edge.topic_b_id;
    return (
      <button
        type="button"
        aria-label={`Select ${name}: ${value}`}
        aria-pressed={pressed}
        onClick={() => onSelect(target)}
        onFocus={() => onPreview(target)}
        onBlur={() => onPreview(null)}
        onMouseEnter={() => onPreview(target)}
        onMouseLeave={() => onPreview(null)}
      >
        <span>{name}</span>
        <strong>
          {ranking === "shared"
            ? edge.shared_paper_count.toLocaleString()
            : formatJaccard(edge.jaccard_similarity)}
        </strong>
      </button>
    );
  }
  return (
    <section className="strongest-connections" aria-label="Strongest research connections">
      <h3>Strongest research connections</h3>
      <label>
        Rank connections by
        <select
          className="form-control"
          value={ranking}
          onChange={(event) => setRanking(event.target.value as RelationshipRanking)}
        >
          <option value="shared">Shared papers</option>
          <option value="jaccard">Jaccard similarity</option>
        </select>
      </label>
      {ranked.length ? (
        <ol>
          {ranked.map((edge) => (
            <li key={relationshipKey(edge)}>{connectionButton(edge)}</li>
          ))}
        </ol>
      ) : (
        <p>No connections meet this threshold.</p>
      )}
      {ranking === "jaccard" && ranked.some((edge) => edge.jaccard_similarity === null) ? (
        <p className="chart-caption">Unavailable similarities appear last and carry no score.</p>
      ) : null}
      {outsideRanking ? (
        <div className="connection-outside-ranking">
          <p className="chart-caption">Selected connection · outside the top five</p>
          {connectionButton(selectedEdge)}
        </div>
      ) : null}
      <p className="chart-caption">
        {ranking === "shared" ? "Shared indexed papers" : "Jaccard similarity · 0–1"} · current
        network threshold
      </p>
    </section>
  );
}
