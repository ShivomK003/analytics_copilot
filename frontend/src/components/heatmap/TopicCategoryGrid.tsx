import { useId, useState } from "react";
import { RotateCcw, Search, X } from "lucide-react";
import "../../styles/heatmap.css";

export interface HeatmapDimension {
  key: string;
  label: string;
}
export interface HeatmapValue {
  value: number | null | undefined;
  label: string;
  description: string;
}
export interface HeatmapCoordinate {
  categoryKey: string;
  topicKey: string;
}

export function HeatmapCategoryPicker({
  categories,
  selected,
  onChange,
  onReset,
  maximum = 10,
}: {
  categories: HeatmapDimension[];
  selected: string[];
  onChange: (selected: string[]) => void;
  onReset: () => void;
  maximum?: number;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const resultsId = useId();
  const available = categories.filter(
    (category) =>
      !selected.includes(category.key) &&
      category.label.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const atLimit = selected.length >= maximum;
  function addCategory(key: string) {
    onChange([...selected, key]);
    setSearch("");
    setOpen(false);
  }
  function reset() {
    onReset();
    setSearch("");
    setOpen(false);
  }
  return (
    <div className="heatmap-category-picker">
      <div className="heatmap-picker-heading">
        <span>
          Selected categories ({selected.length}/{maximum})
        </span>
        <button type="button" className="button button-secondary" onClick={reset}>
          <RotateCcw size={14} aria-hidden="true" />
          Reset to Top {maximum}
        </button>
      </div>
      <div className="heatmap-category-chips">
        {selected.map((key) => {
          const category = categories.find((item) => item.key === key);
          return (
            <button
              key={key}
              type="button"
              className="heatmap-category-chip"
              aria-label={`Remove ${category?.label ?? key}`}
              onClick={() => onChange(selected.filter((item) => item !== key))}
            >
              {category?.label ?? key}
              <X size={14} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div className="heatmap-category-search">
        <Search size={17} aria-hidden="true" />
        <input
          className="form-control"
          type="search"
          aria-label="Search categories for heatmap"
          aria-expanded={open && !atLimit}
          aria-controls={resultsId}
          disabled={atLimit}
          placeholder={
            atLimit ? "Remove a category to add another" : "Search and add a category..."
          }
          value={search}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setSearch(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        />
      </div>
      {open && !atLimit ? (
        <div
          id={resultsId}
          className="heatmap-category-results"
          role="group"
          aria-label="Available categories"
        >
          {available.length ? (
            available.slice(0, 30).map((category) => (
              <button key={category.key} type="button" onClick={() => addCategory(category.key)}>
                {category.label}
              </button>
            ))
          ) : (
            <p>No matching categories.</p>
          )}
        </div>
      ) : null}
      <p className="chart-caption">
        Compare up to {maximum} categories. Remove a selected category to make room for another.
      </p>
    </div>
  );
}

function intensity(value: number | null | undefined, maximum: number): string {
  if (value == null) return "unavailable";
  if (value === 0) return "zero";
  return String(Math.max(1, Math.min(5, Math.ceil((value / (maximum || value)) * 5))));
}

export function TopicCategoryGrid({
  categories,
  topics,
  maximum,
  getCell,
  onSelect,
  metricLabel,
  scrollKey,
}: {
  categories: HeatmapDimension[];
  topics: HeatmapDimension[];
  maximum: number;
  metricLabel: string;
  scrollKey?: string;
  getCell: (coordinate: HeatmapCoordinate) => HeatmapValue;
  onSelect?: (coordinate: HeatmapCoordinate) => void;
}) {
  const [preview, setPreview] = useState<HeatmapCoordinate | null>(null);
  const [selected, setSelected] = useState<HeatmapCoordinate | null>(null);
  const tooltipId = useId();
  const active = preview ?? selected;
  const activeCategory = categories.find((category) => category.key === active?.categoryKey);
  const activeTopic = topics.find((topic) => topic.key === active?.topicKey);
  const activeCell = active && activeCategory && activeTopic ? getCell(active) : null;

  function select(coordinate: HeatmapCoordinate) {
    setSelected(coordinate);
    setPreview(null);
    onSelect?.(coordinate);
  }
  function clearHighlight() {
    setPreview(null);
    setSelected(null);
  }

  return (
    <div
      className="topic-category-grid"
      onKeyDown={(event) => {
        if (event.key === "Escape") clearHighlight();
      }}
    >
      <div
        key={scrollKey}
        className="heatmap-table-scroll"
        role="region"
        aria-label={`${metricLabel} heatmap`}
        tabIndex={0}
      >
        <table className="heatmap-table">
          <caption>{metricLabel} by category and topic</caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              {topics.map((topic) => (
                <th key={topic.key} scope="col">
                  {topic.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!categories.length ? (
              <tr>
                <td colSpan={topics.length + 1}>
                  Select at least one category to display the heatmap.
                </td>
              </tr>
            ) : null}
            {categories.map((category) => (
              <tr key={category.key}>
                <th scope="row">{category.label}</th>
                {topics.map((topic) => {
                  const coordinate = { categoryKey: category.key, topicKey: topic.key };
                  const cell = getCell(coordinate);
                  const pressed =
                    selected?.categoryKey === category.key && selected.topicKey === topic.key;
                  return (
                    <td key={topic.key}>
                      <button
                        className="heatmap-cell"
                        type="button"
                        data-intensity={intensity(cell.value, maximum)}
                        aria-label={`${category.label} · ${topic.label}: ${cell.description}`}
                        aria-pressed={pressed}
                        aria-describedby={tooltipId}
                        onMouseEnter={() => setPreview(coordinate)}
                        onMouseLeave={() => setPreview(null)}
                        onFocus={() => setPreview(coordinate)}
                        onBlur={() => setPreview(null)}
                        onClick={() => select(coordinate)}
                      >
                        {cell.label}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="heatmap-scale" aria-label="Heatmap intensity legend">
        <span>0</span>
        {[1, 2, 3, 4, 5].map((level) => (
          <span key={level} data-intensity={level} aria-hidden="true" />
        ))}
        <span>
          {maximum.toLocaleString(undefined, { maximumFractionDigits: 6 })}
          {metricLabel.includes("(%)") ? "%" : ""}
        </span>
        <span className="heatmap-unavailable-key">— Unavailable</span>
      </div>
      <div className="heatmap-detail" role="tooltip" id={tooltipId}>
        {activeCell ? (
          <>
            <strong>
              {activeCategory?.label} · {activeTopic?.label}
            </strong>
            <p>{activeCell.description}</p>
          </>
        ) : (
          <p>
            Hover or focus a cell for its metric and context. Select it to keep details visible.
          </p>
        )}
      </div>
      <button
        type="button"
        className="button button-secondary heatmap-clear"
        disabled={!activeCell}
        onClick={clearHighlight}
      >
        Clear cell selection
      </button>
    </div>
  );
}
