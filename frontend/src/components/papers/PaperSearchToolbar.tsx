import type { ReactNode, FormEvent } from "react";

export function PaperSearchToolbar({
  value,
  onChange,
  onSubmit,
  searchLabel = "Search papers",
  sort,
  sortOptions,
  onSortChange,
  onClear,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  searchLabel?: string;
  sort?: string;
  sortOptions?: readonly { value: string; label: string }[];
  onSortChange?: (value: string) => void;
  onClear?: () => void;
  children?: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} className="search-toolbar paper-search-toolbar" role="search">
      <label className="paper-keyword-field">
        <span className="visually-hidden">{searchLabel}</span>
        <input
          type="search"
          className="form-control search-input"
          value={value}
          maxLength={200}
          placeholder="Search titles and abstracts…"
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      {children}
      {sortOptions && onSortChange ? (
        <label className="paper-sort-field">
          Sort by
          <select
            className="form-control"
            value={sort}
            onChange={(event) => onSortChange(event.target.value)}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button type="submit" className="button button-accent">
        Search
      </button>
      {onClear ? (
        <button
          type="button"
          className="button button-secondary"
          disabled={!value}
          onClick={onClear}
        >
          Clear search
        </button>
      ) : null}
    </form>
  );
}
