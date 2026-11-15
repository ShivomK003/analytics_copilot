import { useState } from "react";
import type { TopicOption } from "../../types/intelligence";
import {
  rangeOptions,
  shiftUtcDay,
  toggleIntelligenceTopic,
  utcToday,
  validateCustomDates,
} from "../../utils/intelligenceFilters";
import type {
  IntelligenceFilters as Filters,
  RangePreset,
  ResolvedDates,
} from "../../utils/intelligenceFilters";

interface FilterProps {
  filters: Filters;
  dates: ResolvedDates;
  topics?: TopicOption[];
  onChange: (filters: Filters) => void;
}

/** Custom dates are committed together, so unfinished edits never issue requests. */
function CustomDates({
  from,
  to,
  onApply,
}: {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
}) {
  const [dateFrom, setDateFrom] = useState(from);
  const [dateTo, setDateTo] = useState(to);
  const [submitted, setSubmitted] = useState(false);
  const error = validateCustomDates(dateFrom, dateTo);
  return (
    <form
      className="intelligence-custom-dates"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
        if (!error) onApply(dateFrom, dateTo);
      }}
    >
      <label>
        Start date (UTC)
        <input
          aria-describedby={submitted && error ? "custom-date-error" : undefined}
          aria-invalid={submitted && !!error}
          type="date"
          required
          value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)}
        />
      </label>
      <label>
        End date (UTC)
        <input
          aria-describedby={submitted && error ? "custom-date-error" : undefined}
          aria-invalid={submitted && !!error}
          type="date"
          required
          value={dateTo}
          onChange={(event) => setDateTo(event.target.value)}
        />
      </label>
      <button type="submit" className="button button-accent">
        Apply dates
      </button>
      {submitted && error ? (
        <p id="custom-date-error" className="intelligence-filter-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function IntelligenceFilters({ filters, dates, topics, onChange }: FilterProps) {
  const allTopics = filters.topicIds.length === 0;
  return (
    <section
      className="card intelligence-filters"
      aria-label="Global Research Intelligence filters"
    >
      <div className="intelligence-filter-heading">
        <h2>Explore research</h2>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => onChange({ range: "12w", dateFrom: "", dateTo: "", topicIds: [] })}
        >
          Reset filters
        </button>
      </div>
      <label className="intelligence-range-label">
        Date range
        <select
          className="form-select"
          value={filters.range}
          onChange={(event) => {
            const range = event.target.value as RangePreset;
            // Enter custom mode with the currently valid resolved interval.
            onChange({
              ...filters,
              range,
              dateFrom: dates.date_from ?? shiftUtcDay(utcToday(), -83),
              dateTo: dates.date_to ?? utcToday(),
            });
          }}
        >
          {rangeOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {filters.range === "custom" ? (
        <CustomDates
          key={`${filters.dateFrom}/${filters.dateTo}`}
          from={filters.dateFrom}
          to={filters.dateTo}
          onApply={(dateFrom, dateTo) => onChange({ ...filters, dateFrom, dateTo })}
        />
      ) : null}
      <p className="intelligence-date-summary" role="status" aria-live="polite">
        {dates.date_from && dates.date_to
          ? `${dates.date_from} through ${dates.date_to} (inclusive UTC)`
          : "Date range unavailable"}
      </p>
      {dates.notice ? (
        <details className="intelligence-range-details">
          <summary>About this range</summary>
          <p className="intelligence-filter-note">{dates.notice}</p>
        </details>
      ) : null}
      {dates.error ? (
        <p role="alert" className="intelligence-filter-error">
          {dates.error}
        </p>
      ) : null}
      <details className="intelligence-topic-picker">
        <summary>
          Research topics{" "}
          <span className="filter-count">
            {allTopics ? "All topics" : `${filters.topicIds.length} selected`}
          </span>
        </summary>
        <fieldset className="intelligence-topics">
          <legend className="visually-hidden">Select research topics</legend>
          <div className="intelligence-topic-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={!topics?.length || allTopics}
              onClick={() => onChange({ ...filters, topicIds: [] })}
            >
              Select all topics
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={allTopics}
              onClick={() => onChange({ ...filters, topicIds: [] })}
            >
              Clear subset
            </button>
          </div>
          <p className="intelligence-filter-note">
            {allTopics ? "All topics selected." : `${filters.topicIds.length} topics selected.`}{" "}
            Clearing the subset restores all topics.
          </p>
          <div className="intelligence-topic-options">
            {topics?.map((topic) => (
              <label key={topic.topic_id} className="intelligence-topic-option">
                <input
                  type="checkbox"
                  checked={allTopics || filters.topicIds.includes(topic.topic_id)}
                  onChange={() =>
                    onChange({
                      ...filters,
                      topicIds: toggleIntelligenceTopic(filters.topicIds, topic.topic_id, topics),
                    })
                  }
                />
                <span>{topic.topic_name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </details>
    </section>
  );
}
