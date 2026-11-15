import { StrongestConnections } from "./StrongestConnections";
import { IntelligenceChartHeader } from "./IntelligenceChartHeader";
import type { IntelligenceChartHeading } from "./IntelligenceChartHeader";
import { useId, useMemo, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { useIntelligenceRelationships } from "../../hooks/useIntelligence";
import type { RelationshipEdge, RelationshipsData } from "../../types/intelligence";
import type { ResolvedDates } from "../../utils/intelligenceFilters";
import {
  formatJaccard,
  rankRelationships,
  layoutRelationshipNodes,
  relationshipKey,
  relationshipNodeRadius,
  relationshipSelection,
  relationshipStrength,
} from "../../utils/relationshipsData";
import type { RelationshipSelection, RelationshipTarget } from "../../utils/relationshipsData";
import { topicColor } from "../../utils/topicColors";
import { IntelligenceEmpty, IntelligenceError, IntelligenceLoading } from "./IntelligenceState";

type SelectRelationship = (target: RelationshipTarget) => void;

function RelationshipDetails({
  data,
  target,
}: {
  data: RelationshipsData;
  target: RelationshipTarget | null;
}) {
  if (!target) {
    return (
      <>
        <strong>Current topic network</strong>
        <p>
          {data.nodes.length.toLocaleString()} topics · {data.edges.length.toLocaleString()}{" "}
          connections meet this threshold.
        </p>
        <p>Select a ranked pair, node or link to inspect it.</p>
      </>
    );
  }
  if (target.kind === "topic") {
    const node = data.nodes.find((item) => item.topic_id === target.topicId);
    if (!node) return null;
    const connections = data.edges.filter(
      (edge) => edge.topic_a_id === node.topic_id || edge.topic_b_id === node.topic_id,
    );
    return (
      <>
        <strong>{node.topic_name}</strong>
        <p>{node.paper_count.toLocaleString()} indexed papers</p>
        <p>{connections.length.toLocaleString()} connections meet this threshold.</p>
      </>
    );
  }
  const edge = data.edges.find(
    (item) => item.topic_a_id === target.topicAId && item.topic_b_id === target.topicBId,
  );
  if (!edge) return null;
  const first = data.nodes.find((node) => node.topic_id === edge.topic_a_id);
  const second = data.nodes.find((node) => node.topic_id === edge.topic_b_id);
  return (
    <>
      <strong>
        {first?.topic_name} ↔ {second?.topic_name}
      </strong>
      <dl>
        <div>
          <dt>Shared indexed papers</dt>
          <dd>{edge.shared_paper_count.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Jaccard (0–1)</dt>
          <dd>{formatJaccard(edge.jaccard_similarity)}</dd>
        </div>
      </dl>
      <p>Co-occurrence within indexed papers.</p>
    </>
  );
}

function edgeTarget(edge: RelationshipEdge): RelationshipTarget {
  return { kind: "relationship", topicAId: edge.topic_a_id, topicBId: edge.topic_b_id };
}

function matchesTarget(target: RelationshipTarget | null, edge: RelationshipEdge): boolean {
  if (!target) return false;
  if (target.kind === "topic")
    return edge.topic_a_id === target.topicId || edge.topic_b_id === target.topicId;
  return edge.topic_a_id === target.topicAId && edge.topic_b_id === target.topicBId;
}

type PositionedTopic = ReturnType<typeof layoutRelationshipNodes>[number];
interface NetworkInteractions {
  target: RelationshipTarget | null;
  selected: RelationshipTarget | null;
  detailId: string;
  onPreview: (target: RelationshipTarget | null) => void;
  onSelect: SelectRelationship;
}

function NetworkEdge({
  first,
  second,
  edge,
  maxShared,
  target,
  selected,
  detailId,
  onPreview,
  onSelect,
}: NetworkInteractions & {
  first?: PositionedTopic;
  second?: PositionedTopic;
  edge: RelationshipEdge;
  maxShared: number;
}) {
  if (!first || !second) return null;
  function activateEdge(event: KeyboardEvent<SVGGElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(edgeTarget(edge));
    }
  }
  const strength = relationshipStrength(edge.shared_paper_count, maxShared);
  const highlighted = matchesTarget(target, edge);
  const pressed = selected?.kind === "relationship" && matchesTarget(selected, edge);
  const label = `${first.topic_name} and ${second.topic_name}: ${edge.shared_paper_count.toLocaleString()} shared papers; Jaccard ${formatJaccard(edge.jaccard_similarity)}`;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={pressed}
      aria-describedby={detailId}
      className="relationships-edge"
      onMouseEnter={() => onPreview(edgeTarget(edge))}
      onMouseLeave={() => onPreview(null)}
      onFocus={() => onPreview(edgeTarget(edge))}
      onBlur={() => onPreview(null)}
      onClick={() => onSelect(edgeTarget(edge))}
      onKeyDown={activateEdge}
    >
      <line
        x1={first.x * 10}
        y1={first.y * 6}
        x2={second.x * 10}
        y2={second.y * 6}
        className="relationships-edge-line"
        vectorEffect="non-scaling-stroke"
        strokeWidth={strength.width + (highlighted ? 2 : 0)}
        opacity={target && !highlighted ? 0.12 : strength.opacity}
        data-highlighted={highlighted}
      />
      <line
        x1={first.x * 10}
        y1={first.y * 6}
        x2={second.x * 10}
        y2={second.y * 6}
        className="relationships-edge-hit"
        strokeWidth={18}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

function NetworkNode({
  node,
  maxCount,
  target,
  selected,
  detailId,
  onPreview,
  onSelect,
}: NetworkInteractions & { node: PositionedTopic; maxCount: number }) {
  const nodeTarget: RelationshipTarget = { kind: "topic", topicId: node.topic_id };
  const highlighted =
    target?.kind === "topic"
      ? target.topicId === node.topic_id
      : target?.kind === "relationship" &&
        (target.topicAId === node.topic_id || target.topicBId === node.topic_id);
  const radius = relationshipNodeRadius(node.paper_count, maxCount);
  return (
    <button
      className="relationships-node"
      type="button"
      style={{ left: `${node.x}%`, top: `${node.y}%` }}
      aria-label={`${node.topic_name}: ${node.paper_count.toLocaleString()} indexed papers`}
      aria-pressed={selected?.kind === "topic" && selected.topicId === node.topic_id}
      aria-describedby={detailId}
      data-highlighted={!!highlighted}
      onMouseEnter={() => onPreview(nodeTarget)}
      onMouseLeave={() => onPreview(null)}
      onFocus={() => onPreview(nodeTarget)}
      onBlur={() => onPreview(null)}
      onClick={() => onSelect(nodeTarget)}
    >
      <span
        className="relationships-node-dot"
        aria-hidden="true"
        style={{
          width: radius * 2,
          height: radius * 2,
          background: node.paper_count === 0 ? "var(--color-surface)" : topicColor(node.topic_id),
          borderColor: topicColor(node.topic_id),
        }}
      />
      <span className="relationships-node-label">{node.topic_name}</span>
    </button>
  );
}

function NetworkGraph({
  data,
  ...interactions
}: NetworkInteractions & { data: RelationshipsData }) {
  const nodes = useMemo(() => layoutRelationshipNodes(data.nodes), [data.nodes]);
  const positions = new Map(nodes.map((node) => [node.topic_id, node]));
  const maxCount = Math.max(0, ...nodes.map((node) => node.paper_count));
  const maxShared = Math.max(0, ...data.edges.map((edge) => edge.shared_paper_count));

  // Large topic sets scroll inside the plot so labels keep their readable size.
  const graphStyle = {
    "--network-min-width": `${Math.max(260, 260 + (nodes.length - 8) * 55)}px`,
    "--network-height": `${Math.max(400, nodes.length * 43)}px`,
  } as CSSProperties;
  return (
    <div
      className="relationships-graph-scroll"
      role="group"
      aria-label="Topic network"
      style={graphStyle}
      tabIndex={0}
    >
      <div className="relationships-graph" onMouseLeave={() => interactions.onPreview(null)}>
        <svg
          className="relationships-edges"
          viewBox="0 0 1000 600"
          preserveAspectRatio="none"
          aria-label="Topic co-occurrence links"
          role="group"
        >
          {data.edges.map((edge) => (
            <NetworkEdge
              key={relationshipKey(edge)}
              edge={edge}
              first={positions.get(edge.topic_a_id)}
              second={positions.get(edge.topic_b_id)}
              maxShared={maxShared}
              {...interactions}
            />
          ))}
        </svg>
        {nodes.map((node) => (
          <NetworkNode key={node.topic_id} node={node} maxCount={maxCount} {...interactions} />
        ))}
      </div>
    </div>
  );
}

function RelationshipList({
  data,
  selected,
  onPreview,
  onSelect,
}: {
  data: RelationshipsData;
  selected: RelationshipTarget | null;
  onPreview: (target: RelationshipTarget | null) => void;
  onSelect: SelectRelationship;
}) {
  const names = new Map(data.nodes.map((node) => [node.topic_id, node.topic_name]));
  const edges = [...data.edges].sort(
    (a, b) =>
      b.shared_paper_count - a.shared_paper_count ||
      a.topic_a_id - b.topic_a_id ||
      a.topic_b_id - b.topic_b_id,
  );
  return (
    <details className="">
      <summary>Topic connections ({edges.length})</summary>
      <div className="disclosure-content">
        <div className="relationships-list" role="region" aria-label="Relationship list">
          <table>
            <caption>Strongest shared-paper counts first</caption>
            <thead>
              <tr>
                <th>Topic pair</th>
                <th>Shared papers</th>
                <th>Jaccard (0–1)</th>
              </tr>
            </thead>
            <tbody>
              {edges.map((edge) => (
                <tr key={relationshipKey(edge)}>
                  <td>
                    <button
                      type="button"
                      className="relationships-pair-button"
                      aria-pressed={
                        selected?.kind === "relationship" && matchesTarget(selected, edge)
                      }
                      onFocus={() => onPreview(edgeTarget(edge))}
                      onBlur={() => onPreview(null)}
                      onMouseEnter={() => onPreview(edgeTarget(edge))}
                      onMouseLeave={() => onPreview(null)}
                      onClick={() => onSelect(edgeTarget(edge))}
                    >
                      <span
                        className="topic-swatch"
                        aria-hidden="true"
                        style={{ background: topicColor(edge.topic_a_id) }}
                      />
                      {names.get(edge.topic_a_id)}
                      <span aria-hidden="true"> ↔ </span>
                      <span
                        className="topic-swatch"
                        aria-hidden="true"
                        style={{ background: topicColor(edge.topic_b_id) }}
                      />
                      {names.get(edge.topic_b_id)}
                    </button>
                  </td>
                  <td>{edge.shared_paper_count.toLocaleString()}</td>
                  <td>{formatJaccard(edge.jaccard_similarity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

function RelationshipsVisualization({
  data,
  onSelectItem,
}: {
  data: RelationshipsData;
  onSelectItem?: (selection: RelationshipSelection) => void;
}) {
  const [selection, setSelected] = useState<RelationshipTarget | null>(() => {
    const strongest = rankRelationships(data.edges, "shared")[0];
    return strongest ? edgeTarget(strongest) : null;
  });
  const selected =
    selection &&
    (selection.kind === "topic"
      ? data.nodes.some((node) => node.topic_id === selection.topicId)
      : data.edges.some((edge) => matchesTarget(selection, edge)))
      ? selection
      : null;
  const [preview, setPreview] = useState<RelationshipTarget | null>(null);
  const detailId = useId();
  const active = preview ?? selected;
  function select(target: RelationshipTarget) {
    setSelected(target);
    setPreview(null);
    onSelectItem?.(relationshipSelection(data, target));
  }
  function clear() {
    setSelected(null);
    setPreview(null);
  }

  return (
    <div
      className="relationships-explorer"
      onKeyDown={(event) => {
        if (event.key === "Escape") clear();
      }}
    >
      {!data.nodes.some((node) => node.paper_count > 0) ? (
        <p role="status">
          No matching indexed activity. Returned topic counts are zero; this does not establish an
          absence of research.
        </p>
      ) : null}
      {!data.edges.length ? (
        <p role="status">
          No connections meet the threshold. Topics remain visible; try a lower minimum or a broader
          selection.
        </p>
      ) : null}
      <div className="relationships-explorer-grid">
        <NetworkGraph
          data={data}
          target={active}
          selected={selected}
          detailId={detailId}
          onPreview={setPreview}
          onSelect={select}
        />
        <aside className="relationships-inspector" aria-label="Network details">
          <StrongestConnections
            data={data}
            selected={selected}
            onSelect={select}
            onPreview={setPreview}
          />
          <div id={detailId} role="tooltip" className="relationships-detail-content">
            <RelationshipDetails data={data} target={active} />
          </div>
          <button
            className="button button-secondary"
            type="button"
            disabled={!active}
            onClick={clear}
          >
            Clear highlight
          </button>
        </aside>
      </div>
      <p className="relationships-legend">
        Node size: indexed topic papers · thicker links: more shared papers · hollow nodes: zero
        indexed papers
      </p>
      <p className="relationships-legend">
        Colors identify topics. Layout positions carry no analytical meaning.
      </p>
      {data.edges.length ? (
        <RelationshipList
          data={data}
          selected={selected}
          onPreview={setPreview}
          onSelect={select}
        />
      ) : null}
    </div>
  );
}

export function ResearchRelationships({
  heading,
  dates,
  topicIds,
  topicsReady,
  onSelectItem,
}: {
  heading?: IntelligenceChartHeading;
  dates: ResolvedDates;
  topicIds: readonly number[];
  topicsReady: boolean;
  onSelectItem?: (selection: RelationshipSelection) => void;
}) {
  const [minimum, setMinimum] = useState(1);
  const [draftMinimum, setDraftMinimum] = useState("1");
  const [submitted, setSubmitted] = useState(false);
  const controlId = useId();
  const validMinimum =
    /^[1-9]\d*$/.test(draftMinimum) && Number.isSafeInteger(Number(draftMinimum));
  const ready = topicsReady && !dates.error && !!dates.date_from && !!dates.date_to;
  const query = useIntelligenceRelationships(
    {
      date_from: dates.date_from,
      date_to: dates.date_to,
      topic_ids: topicIds,
      min_shared_papers: minimum,
    },
    ready,
  );
  const data = query.data?.data;
  let content;
  if (dates.error || !dates.date_from || !dates.date_to) {
    content = (
      <IntelligenceEmpty
        title="Choose a valid date range"
        description={dates.error ?? "Choose a resolved UTC date range."}
      />
    );
  } else if (!topicsReady) {
    content = (
      <IntelligenceEmpty
        title="Topics unavailable"
        description="Connections will load when research topics are available."
      />
    );
  } else if (query.error) {
    content = (
      <IntelligenceError
        key={query.errorUpdatedAt}
        error={query.error}
        label="relationships"
        onRetry={() => void query.refetch()}
      />
    );
  } else if (query.isPending) {
    content = <IntelligenceLoading label="Loading research relationships…" />;
  } else if (!data?.nodes.length) {
    content = (
      <IntelligenceEmpty
        title="No topics available"
        description="No research topics were returned for this selection."
      />
    );
  } else {
    content = (
      <RelationshipsVisualization
        key={`${dates.date_from}/${dates.date_to}/${topicIds.join(",")}/${minimum}`}
        data={data}
        onSelectItem={onSelectItem}
      />
    );
  }

  function applyMinimum(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (validMinimum) setMinimum(Number(draftMinimum));
  }

  return (
    <div className="research-relationships">
      <IntelligenceChartHeader heading={heading}>
        <div className="relationships-toolbar">
          <form onSubmit={applyMinimum} noValidate>
            <label htmlFor={controlId}>
              Minimum shared papers
              <input
                id={controlId}
                className="form-control"
                type="number"
                min="1"
                step="1"
                value={draftMinimum}
                aria-invalid={submitted && !validMinimum}
                aria-describedby={submitted && !validMinimum ? `${controlId}-error` : undefined}
                onChange={(event) => setDraftMinimum(event.target.value)}
              />
            </label>
            <button type="submit" className="button button-secondary">
              Apply minimum
            </button>
          </form>
        </div>
      </IntelligenceChartHeader>
      {submitted && !validMinimum ? (
        <p id={`${controlId}-error`} className="intelligence-filter-error" role="alert">
          Enter a positive whole number within the supported integer range.
        </p>
      ) : null}
      <p className="relationships-legend">
        Showing links with at least {minimum.toLocaleString()} shared indexed papers. Topic totals
        are unchanged by this threshold.
      </p>
      {query.isFetching && !query.isPending ? (
        <p role="status">Updating research relationships…</p>
      ) : null}
      {content}
      <details className="methodology-disclosure">
        <summary>How to read this network</summary>
        <div className="disclosure-content">
          <p>
            Links represent distinct indexed papers assigned to both topics. They do not represent
            citations, causality, or semantic similarity.
          </p>
          <p>
            Jaccard is the returned fraction of shared papers relative to the topics' union, on a
            0–1 scale. An unavailable value stays unavailable. Topic counts describe the entire
            selected inclusive UTC interval, even when no links meet the threshold.
          </p>
          <p>
            Node area reflects relative paper counts, with a minimum visible size for small or zero
            counts. Link width and opacity reflect relative shared-paper counts within this view.
            Positions follow topic IDs rather than similarity or time; changing highlights never
            moves nodes.
          </p>
          <p>
            Historical completeness is unknown. Topic assignments are automatic and can overlap or
            contain classification noise. Counts describe indexed activity, not research impact or
            statistical significance.
          </p>
          {query.data?.meta.warnings.length ? (
            <ul className="intelligence-warnings" aria-label="Relationship warnings">
              {query.data.meta.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </details>
    </div>
  );
}
